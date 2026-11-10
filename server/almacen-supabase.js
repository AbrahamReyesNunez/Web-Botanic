/* =========================================================
   ALMACÉN EN SUPABASE (producción)
   Misma interfaz que almacen.js. Las tablas y funciones están en
   supabase/schema.sql. Se usa la clave secreta, que solo vive en el
   servidor: el navegador nunca habla con Supabase.
   ========================================================= */
"use strict";

const { createClient } = require("@supabase/supabase-js");

const CACHE_RPPS_MS = 30_000;
const PAGINA = 1000; // Supabase devuelve como mucho 1000 filas por consulta

function crearAlmacenSupabase({ url, clave }) {
  // Vale tanto la URL del proyecto como la de la API (…/rest/v1/)
  const base = String(url).trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const db = createClient(base, clave, {
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

  return {
    tipo: "supabase", rpps, rppActivo, deNoche, recuentoNoches, anadir, borrar,
    crearReserva, decidirReserva, borrarReserva, disponibilidad,
    esperar: () => Promise.resolve()
  };
}

module.exports = { crearAlmacenSupabase };
