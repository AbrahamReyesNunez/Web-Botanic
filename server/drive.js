/* =========================================================
   GOOGLE DRIVE (vía el Google Apps Script de la galería)
   Sube y borra las fotos de los eventos. El script comprueba
   la clave DRIVE_SCRIPT_CLAVE, que solo vive en el servidor.
   Código del script: google-apps-script/Codigo.gs
   ========================================================= */
"use strict";

/* Subir una foto de 6 MB (8 MB en base64) a Apps Script puede tardar; más de esto es que Google no responde */
const TIEMPO_MAX_MS = 60_000;

function crearDrive({ url, clave, fetch = globalThis.fetch, tiempoMaximoMs = TIEMPO_MAX_MS }) {
  const configurado = !!(url && clave);

  async function llamar(cuerpo) {
    if (!configurado) {
      const e = new Error("Falta DRIVE_SCRIPT_CLAVE en .env: sin ella no se pueden subir fotos a Drive.");
      e.status = 503;
      e.publico = true;   // mensaje escrito para el panel: se le puede enseñar tal cual
      throw e;
    }
    // Apps Script responde con una redirección a script.googleusercontent.com, que fetch sigue sola.
    // La señal corta también la lectura de la respuesta: nada se queda esperando a Google sin límite
    let r;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ clave, ...cuerpo }),
        signal: AbortSignal.timeout(tiempoMaximoMs)
      });
    } catch (causa) {
      // Sin red o sin respuesta a tiempo: mensaje claro para el panel, sin detalles internos de la conexión
      const tiempo = causa && causa.name === "TimeoutError";
      // La causa (p. ej. ENOTFOUND) viaja en e.cause para el log, no en el mensaje
      const e = new Error(tiempo ? "Google Drive no ha respondido a tiempo. Inténtalo de nuevo." : "No se ha podido conectar con Google Drive.", { cause: causa });
      e.status = tiempo ? 504 : 502;
      e.publico = true;
      throw e;
    }
    let j;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok || !j || !j.ok) {
      // Respuesta de Google o del Apps Script (puede traer el texto de una excepción): sin "publico", solo va al log
      const e = new Error(`Google Drive: ${(j && j.error) || `respuesta ${r.status}`}`);
      e.status = 502;
      throw e;
    }
    return j;
  }

  return {
    configurado,
    /* Devuelve el id de Drive del archivo nuevo (compartido como "cualquiera con el enlace") */
    subir: async (nombre, tipo, datos) => (await llamar({ accion: "subir", nombre, tipo, datos: datos.toString("base64") })).id,
    /* Manda a la papelera una foto de eventos (el script solo borra dentro de su carpeta) */
    borrar: (id) => llamar({ accion: "borrar", id })
  };
}

module.exports = { crearDrive };
