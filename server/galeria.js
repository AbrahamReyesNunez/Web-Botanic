/* =========================================================
   GALERÍA: lista de álbumes de Google Drive, cacheada en el servidor
   El Google Apps Script (data/config.js → galeria.scriptUrl) recorre todas
   las carpetas de Drive en cada llamada y tarda 2-3 s. El servidor lo llama
   como mucho cada `ttlMs` y sirve la copia a todos los visitantes en
   /api/galeria. Si Google falla, se sigue sirviendo la última copia.
   ========================================================= */
"use strict";

const crypto = require("node:crypto");

const ID = /^[A-Za-z0-9_-]{10,100}$/;
const MAX_ALBUMES = 500;
const MAX_FOTOS = 2000;

const textoCorto = (v, max) => (typeof v === "string" && v.length <= max ? v : "");

/* Solo los campos que usa la web, con tipos y tamaños comprobados */
function limpiar(datos) {
  return datos.slice(0, MAX_ALBUMES)
    .filter((a) => a && typeof a === "object" && textoCorto(a.nombre, 200))
    .map((a) => ({
      id: ID.test(a.id) ? a.id : undefined,
      nombre: a.nombre,
      creado: Number.isFinite(a.creado) ? a.creado : 0,
      fotos: (Array.isArray(a.fotos) ? a.fotos : []).slice(0, MAX_FOTOS)
        .filter((f) => f && ID.test(f.id))
        .map((f) => ({ id: f.id, nombre: textoCorto(f.nombre, 200) }))
    }));
}

function crearGaleria({ url, fetch = globalThis.fetch, ttlMs = 10 * 60 * 1000, reintentoMs = 60 * 1000, tiempoMaximoMs = 45 * 1000, ahora = Date.now }) {
  let copia = null;      // { texto, etag, hasta }
  let enCurso = null;    // petición a Google en marcha (la comparten todas las visitas)

  async function pedir() {
    const r = await fetch(url, { signal: AbortSignal.timeout(tiempoMaximoMs) });
    if (!r.ok) throw new Error(`el Apps Script respondió ${r.status}`);
    const datos = await r.json();
    if (!Array.isArray(datos)) throw new Error("la respuesta del Apps Script no tiene el formato esperado");
    const texto = JSON.stringify({ ok: true, albumes: limpiar(datos) });
    const etag = `"${crypto.createHash("sha256").update(texto).digest("base64url").slice(0, 27)}"`;
    copia = { texto, etag, hasta: ahora() + ttlMs };
  }

  function refrescar() {
    if (!enCurso) {
      enCurso = pedir()
        .catch((e) => {
          console.error(`Galería: ${e.message}`);
          if (!copia) throw e;
          copia.hasta = ahora() + reintentoMs;   // se sigue sirviendo la copia y se reintenta en un rato
        })
        .finally(() => { enCurso = null; });
    }
    return enCurso;
  }

  /* Devuelve { texto, etag }. Con una copia caducada responde con ella y la renueva por detrás */
  async function obtener() {
    if (copia && ahora() < copia.hasta) return copia;
    const p = refrescar();
    if (copia) return copia;
    await p;
    return copia;
  }

  return { configurada: !!url, obtener, refrescar };
}

module.exports = { crearGaleria, limpiar };
