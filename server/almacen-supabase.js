/* =========================================================
   ALMACÉN EN SUPABASE (producción)
   Misma interfaz que almacen.js. Las tablas y funciones se crean con
   las migraciones de supabase/migrations. Se usa la clave secreta, que
   solo vive en el servidor: el navegador nunca habla con Supabase.

   Reservas (003_reservas.sql): la cabecera va en "reservas" y cada bebida en
   "reserva_lineas" (grupo, producto, cantidad, precio por unidad). Se crean
   juntas con la función crear_reserva, en una sola transacción.
   ========================================================= */
"use strict";

const { createClient } = require("@supabase/supabase-js");

const CACHE_RPPS_MS = 30_000;
const PAGINA = 1000; // Supabase devuelve como mucho 1000 filas por consulta
const GRUPOS = ["botellas", "refrescos", "chupitos", "champan", "suplementos"];
const CAMPOS_RESERVA = "id, fecha, tipo, estado, nombre, telefono, personas, rpp, total, a_consultar, notas, creado, decidido, "
  + "reserva_lineas(grupo, producto, cantidad, precio)";

/* Dos RPPs no pueden llamarse igual (sin distinguir mayúsculas): el panel lo muestra como 409 */
function errorNombreRepetido() {
  const e = new Error("Ya hay un RPP con ese nombre.");
  e.motivo = "nombre_repetido";
  return e;
}

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

  /* Recuentos por noche entre dos fechas (AAAA-MM-DD). Los hace la base de datos con la migración 008;
     sin ella se usan las versiones anteriores, que cuentan todo el histórico, y se filtra aquí */
  const faltaFuncion = (error, nombre) => new RegExp(nombre).test(error.message) && /schema cache|does not exist|Could not find/i.test(error.message);
  const entre = (filas, desde, hasta) => filas
    .filter((x) => x.fecha >= desde && x.fecha <= hasta)
    .map((x) => ({ fecha: x.fecha, total: Number(x.total) }));
  const avisos = new Set();
  const avisar = (texto) => { if (!avisos.has(texto)) { avisos.add(texto); console.warn(`  ${texto}`); } };

  async function recuentoNoches(desde, hasta) {
    const { data, error } = await db.rpc("recuento_noches", { p_desde: desde, p_hasta: hasta });
    if (!error) return entre(data, desde, hasta);
    if (!faltaFuncion(error, "recuento_noches")) throw new Error(`Supabase (recuento por noche): ${error.message}`);
    avisar("Falta la migración 008_recuento_por_fechas.sql en Supabase: el panel cuenta todo el histórico (más lento).");
    return entre(datosDe(await db.rpc("recuento_noches"), "recuento por noche"), desde, hasta);
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

  /* Reservas por noche entre dos fechas: con la migración 008, solo ese rango; con la 007, todo el
     histórico y se filtra aquí; sin ninguna, se cuentan aquí como antes para que el panel siga funcionando */
  async function recuentoReservas(desde, hasta) {
    let r = await db.rpc("recuento_reservas", { p_desde: desde, p_hasta: hasta });
    if (!r.error) return entre(r.data, desde, hasta);
    if (!faltaFuncion(r.error, "recuento_reservas")) throw new Error(`Supabase (recuento de reservados): ${r.error.message}`);
    r = await db.rpc("recuento_reservas");
    if (!r.error) {
      avisar("Falta la migración 008_recuento_por_fechas.sql en Supabase: el panel cuenta todo el histórico (más lento).");
      return entre(r.data, desde, hasta);
    }
    if (!faltaFuncion(r.error, "recuento_reservas")) throw new Error(`Supabase (recuento de reservados): ${r.error.message}`);
    avisar("Faltan las migraciones 007 y 008 en Supabase: las reservas se cuentan en el servidor (más lento).");
    const filas = [];
    for (let inicio = 0; ; inicio += PAGINA) {
      const pagina = datosDe(
        await db.from("reservas").select("fecha").gte("fecha", desde).lte("fecha", hasta)
          .order("fecha").range(inicio, inicio + PAGINA - 1),
        "recuento de reservados"
      );
      filas.push(...pagina);
      if (pagina.length < PAGINA) break;
    }
    const cuenta = new Map();
    for (const x of filas) cuenta.set(x.fecha, (cuenta.get(x.fecha) || 0) + 1);
    return [...cuenta].map(([fecha, total]) => ({ fecha, total }));
  }

  /* Duplicados y topes se comprueban dentro de la base de datos, en la misma transacción.
     origen: huella de la IP (columna de la migración 009); sin la 009 se inscribe sin ella */
  async function anadir({ fecha, nombre, clave, rpp, origen = null }, topes = {}) {
    const params = {
      p_fecha: fecha,
      p_nombre: nombre,
      p_clave: clave,
      p_rpp: rpp,
      p_max_noche: topes.maxPorNoche || 0,
      p_max_rpp: topes.maxPorRppNoche || 0
    };
    const r = await db.rpc("inscribir", { ...params, p_origen: origen });
    if (!r.error || !faltaFuncion(r.error, "inscribir")) return datosDe(r, "inscribir");
    avisar("Falta la migración 009_lista_origen.sql en Supabase: las altas se guardan sin la huella del origen.");
    return datosDe(await db.rpc("inscribir", params), "inscribir");
  }

  async function borrar(id) {
    const filas = datosDe(await db.from("inscripciones").delete().eq("id", id).select("id"), "borrar");
    return filas.length > 0;
  }

  /* Nombre repetido (índice rpps_nombre_unico de 002_mejoras_rpps.sql): error con motivo para el panel */
  const datosRpp = (r, que) => {
    if (r.error && r.error.code === "23505" && /rpps_nombre_unico/.test(r.error.message)) throw errorNombreRepetido();
    return datosDe(r, que);
  };

  /* Sin código, lo genera la base de datos (nuevo_codigo_rpp) */
  async function crearRpp({ codigo, nombre }) {
    const fila = datosRpp(await db.from("rpps").insert(codigo ? { codigo, nombre } : { nombre }).select("codigo, nombre, activo").single(), "crear RPP");
    invalidarRpps();
    return fila;
  }

  /* ---------- Reservas (supabase/migrations/003_reservas.sql) ---------- */

  /* Aforo y teléfono repetido se comprueban dentro de la base de datos, en la misma transacción */
  async function crearReserva(r, lineas) {
    return datosDe(await db.rpc("crear_reserva", {
      p_fecha: r.fecha,
      p_tipo: r.tipo,
      p_nombre: r.nombre,
      p_telefono: r.telefono,
      p_personas: r.personas,
      p_rpp: r.rpp,
      p_notas: r.notas || null,
      p_total: r.total,
      p_a_consultar: !!r.aConsultar,
      p_lineas: lineas
    }), "crear reserva");
  }

  /* decidirReserva y borrarReserva no tienen ruta HTTP todavía: son la API prevista para la futura app.
     Hoy solo las usan los tests y server/comprobar-supabase.js. */

  /* El trigger de la base de datos rechaza confirmar por encima del aforo */
  async function decidirReserva(id, estado) {
    const { data, error } = await db.from("reservas").update({ estado }).eq("id", id).select("id");
    if (error) {
      if (/Aforo completo/.test(error.message)) return { ok: false, motivo: "completo" };
      throw new Error(`Supabase (decidir reserva): ${error.message}`);
    }
    return data.length ? { ok: true } : { ok: false, motivo: "no_existe" };
  }

  async function borrarReserva(id) {
    const filas = datosDe(await db.from("reservas").delete().eq("id", id).select("id"), "borrar reserva");
    return filas.length > 0;
  }

  async function disponibilidad(desde, hasta) {
    const filas = datosDe(await db.rpc("disponibilidad_reservas", { p_desde: desde, p_hasta: hasta }), "disponibilidad");
    const mesas = {};
    const confirmadas = [];
    for (const f of filas) {
      mesas[f.tipo] = f.mesas;
      if (f.fecha) confirmadas.push({ fecha: f.fecha, tipo: f.tipo, total: Number(f.confirmadas) });
    }
    return { mesas, confirmadas };
  }

  async function actualizarRpp(codigo, cambios) {
    const filas = datosRpp(await db.from("rpps").update(cambios).eq("codigo", codigo).select("codigo, nombre, activo"), "actualizar RPP");
    invalidarRpps();
    return filas[0] || null;
  }

  /* Consulta mínima para que Supabase vea actividad: el plan gratuito pausa el proyecto
     tras 7 días sin ninguna (en temporada baja puede pasar sin visitas) */
  async function latido() {
    datosDe(await db.from("migraciones").select("nombre").limit(1), "latido");
  }

  /* Contenido de la web que se edita desde el panel: una fila por sección (eventos, dias, galeria) */
  async function leerContenido() {
    const filas = datosDe(await db.from("web_contenido").select("seccion, valor"), "leer contenido de la web");
    const contenido = { eventos: {}, dias: {}, galeria: {}, ajustes: {} };
    for (const f of filas) contenido[f.seccion] = f.valor || {};
    return contenido;
  }

  async function guardarContenido(seccion, valor) {
    datosDe(await db.from("web_contenido").upsert({ seccion, valor, actualizado: new Date().toISOString() }).select("seccion"), "guardar contenido de la web");
  }

  return {
    tipo: "supabase", rpps, rppActivo, deNoche, recuentoNoches, anadir, borrar,
    crearRpp, actualizarRpp, reservasDeNoche, recuentoReservas, latido,
    crearReserva, decidirReserva, borrarReserva, disponibilidad,
    leerContenido, guardarContenido,
    esperar: () => Promise.resolve()
  };
}

module.exports = { crearAlmacenSupabase, reservaDeFila, errorNombreRepetido };
