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

  return { tipo: "supabase", rpps, rppActivo, deNoche, recuentoNoches, anadir, borrar, esperar: () => Promise.resolve() };
}

module.exports = { crearAlmacenSupabase };
