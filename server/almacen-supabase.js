/* =========================================================
   ALMACÉN EN SUPABASE (producción)
   Misma interfaz que almacen.js. Las tablas y funciones se crean con
   las migraciones de supabase/migrations. Se usa la clave secreta, que
   solo vive en el servidor: el navegador nunca habla con Supabase.

   Reservas: la cabecera va en "reservas" y cada bebida en "reserva_lineas"
   (grupo, producto, cantidad, precio por unidad). Se crean juntas con la
   función crear_reserva, en una sola transacción.
   ========================================================= */
"use strict";

const { createClient } = require("@supabase/supabase-js");

const CACHE_RPPS_MS = 30_000;
const PAGINA = 1000; // Supabase devuelve como mucho 1000 filas por consulta
const GRUPOS = ["botellas", "refrescos", "chupitos", "champan"];
const CAMPOS_RESERVA = "id, fecha, tipo, estado, nombre, telefono, personas, rpp, total, a_consultar, notas, creado, decidido, "
  + "reserva_lineas(grupo, producto, cantidad, precio)";

/* Fila de la base de datos → reserva con las bebidas agrupadas como las usa el servidor */
function reservaDeFila({ a_consultar, reserva_lineas: lineas, notas, ...fila }) {
  const reserva = { ...fila, notas: notas || "", aConsultar: a_consultar };
  for (const grupo of GRUPOS) {
    reserva[grupo] = (lineas || []).filter((l) => l.grupo === grupo)
      .sort((a, b) => a.producto.localeCompare(b.producto, "es"))
      .map((l) => ({ nombre: l.producto, cantidad: l.cantidad, precio: l.precio }));
  }
  return reserva;
}

function crearAlmacenSupabase({ url, clave, cliente }) {
  // Vale tanto la URL del proyecto como la de la API (…/rest/v1/). "cliente" solo se usa en las pruebas
  const db = cliente || createClient(String(url).trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, ""), clave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const datosDe = ({ data, error }, que) => {
    if (error) throw new Error(`Supabase (${que}): ${error.message}`);
    return data;
  };

  /* Los RPPs cambian poco: se guardan 30 s para no consultar en cada visita.
     Si Supabase falla y hay copia, se sigue usando la copia. */
  let rppsCache = null;
  let rppsHasta = 0;
  let rppsPendiente = null;
  const invalidarRpps = () => { rppsCache = null; rppsHasta = 0; };

  function rpps() {
    if (rppsCache && Date.now() < rppsHasta) return Promise.resolve(rppsCache);
    rppsPendiente ??= db.from("rpps").select("codigo, nombre, activo").order("creado").order("codigo")
      .then((r) => {
        rppsCache = datosDe(r, "leer RPPs");
        rppsHasta = Date.now() + CACHE_RPPS_MS;
        return rppsCache;
      })
      .catch((e) => {
        if (!rppsCache) throw e;
        console.error(e.message);
        return rppsCache;
      })
      .finally(() => { rppsPendiente = null; });
    return rppsPendiente;
  }

  const rppActivo = async (codigo) => (await rpps()).find((r) => r.codigo === codigo && r.activo) || null;

  async function deNoche(fecha) {
    const filas = [];
    for (let desde = 0; ; desde += PAGINA) {
      const pagina = datosDe(
        await db.from("inscripciones").select("id, fecha, nombre, clave, rpp, creado")
          .eq("fecha", fecha).order("creado").order("id").range(desde, desde + PAGINA - 1),
        "leer la lista"
      );
      filas.push(...pagina);
      if (pagina.length < PAGINA) return filas;
    }
  }

  async function recuentoNoches() {
    const filas = datosDe(await db.rpc("recuento_noches"), "recuento por noche");
    return filas.map((x) => ({ fecha: x.fecha, total: Number(x.total) }));
  }

  async function reservasDeNoche(fecha) {
    const filas = [];
    for (let desde = 0; ; desde += PAGINA) {
      const pagina = datosDe(
        await db.from("reservas").select(CAMPOS_RESERVA)
          .eq("fecha", fecha).order("creado").order("id").range(desde, desde + PAGINA - 1),
        "leer reservados"
      );
      filas.push(...pagina);
      if (pagina.length < PAGINA) break;
    }
    return filas.map(reservaDeFila);
  }

  async function recuentoReservas() {
    const filas = [];
    for (let desde = 0; ; desde += PAGINA) {
      const pagina = datosDe(
        await db.from("reservas").select("fecha").order("fecha").range(desde, desde + PAGINA - 1),
        "recuento de reservados"
      );
      filas.push(...pagina);
      if (pagina.length < PAGINA) break;
    }
    const cuenta = new Map();
    for (const x of filas) cuenta.set(x.fecha, (cuenta.get(x.fecha) || 0) + 1);
    return [...cuenta].map(([fecha, total]) => ({ fecha, total }));
  }

  /* Duplicados y topes se comprueban dentro de la base de datos, en la misma transacción */
  async function anadir({ fecha, nombre, clave, rpp }, topes = {}) {
    return datosDe(await db.rpc("inscribir", {
      p_fecha: fecha,
      p_nombre: nombre,
      p_clave: clave,
      p_rpp: rpp,
      p_max_noche: topes.maxPorNoche || 0,
      p_max_rpp: topes.maxPorRppNoche || 0
    }), "inscribir");
  }

  async function borrar(id) {
    const filas = datosDe(await db.from("inscripciones").delete().eq("id", id).select("id"), "borrar");
    return filas.length > 0;
  }

  /* Sin código, lo genera la base de datos (nuevo_codigo_rpp) */
  async function crearRpp({ codigo, nombre }) {
    const fila = datosDe(await db.from("rpps").insert(codigo ? { codigo, nombre } : { nombre }).select("codigo, nombre, activo").single(), "crear RPP");
    invalidarRpps();
    return fila;
  }

  /* Guarda la reserva y sus bebidas a la vez (función crear_reserva).
     Devuelve { ok: true, reserva } o { ok: false, motivo } si la base de datos la rechaza */
  async function crearReserva(reserva) {
    const lineas = [];
    for (const grupo of GRUPOS) {
      for (const l of reserva[grupo] || []) lineas.push({ grupo, producto: l.nombre, cantidad: l.cantidad, precio: l.precio ?? null });
    }
    const r = await db.rpc("crear_reserva", {
      p_fecha: reserva.fecha,
      p_tipo: reserva.tipo,
      p_nombre: reserva.nombre,
      p_telefono: reserva.telefono,
      p_personas: reserva.personas,
      p_rpp: reserva.rpp,
      p_notas: reserva.notas,
      p_total: reserva.total,
      p_a_consultar: reserva.aConsultar,
      p_lineas: lineas
    });
    // Una regla de la tabla (check) que no se cumple: datos que la base de datos no acepta
    if (r.error && r.error.code === "23514") {
      console.error(`Supabase (guardar reserva): ${r.error.message}`);
      return { ok: false, motivo: "datos" };
    }
    const res = datosDe(r, "guardar reserva");
    if (res && res.ok === false) return { ok: false, motivo: res.motivo || "datos" };
    // La función devuelve el id (o un objeto con él); se acepta cualquiera de las dos formas
    const id = typeof res === "string" ? res : res && (res.id || (res.reserva && (res.reserva.id || res.reserva)));
    if (!id) throw new Error(`Supabase (guardar reserva): respuesta inesperada ${JSON.stringify(res)}`);
    return { ok: true, reserva: { id: String(id), estado: "pendiente", ...reserva } };
  }

  async function actualizarRpp(codigo, cambios) {
    const filas = datosDe(await db.from("rpps").update(cambios).eq("codigo", codigo).select("codigo, nombre, activo"), "actualizar RPP");
    invalidarRpps();
    return filas[0] || null;
  }

  /* Contenido de la web que se edita desde el panel: una fila por sección (eventos, dias, galeria) */
  async function leerContenido() {
    const filas = datosDe(await db.from("web_contenido").select("seccion, valor"), "leer contenido de la web");
    const contenido = { eventos: {}, dias: {}, galeria: {} };
    for (const f of filas) contenido[f.seccion] = f.valor || {};
    return contenido;
  }

  async function guardarContenido(seccion, valor) {
    datosDe(await db.from("web_contenido").upsert({ seccion, valor, actualizado: new Date().toISOString() }).select("seccion"), "guardar contenido de la web");
  }

  return {
    tipo: "supabase", rpps, rppActivo, deNoche, recuentoNoches, reservasDeNoche,
    recuentoReservas, crearReserva, anadir, borrar, crearRpp, actualizarRpp, leerContenido, guardarContenido,
    esperar: () => Promise.resolve()
  };
}

module.exports = { crearAlmacenSupabase, reservaDeFila };
