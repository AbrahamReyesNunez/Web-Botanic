/* =========================================================
   GOOGLE DRIVE (vía el Google Apps Script de la galería)
   Sube y borra las fotos de los eventos. El script comprueba
   la clave DRIVE_SCRIPT_CLAVE, que solo vive en el servidor.
   Código del script: google-apps-script/Codigo.gs
   ========================================================= */
"use strict";

function crearDrive({ url, clave, fetch = globalThis.fetch }) {
  const configurado = !!(url && clave);

  async function llamar(cuerpo) {
    if (!configurado) {
      const e = new Error("Falta DRIVE_SCRIPT_CLAVE en .env: sin ella no se pueden subir fotos a Drive.");
      e.status = 503;
      throw e;
    }
    // Apps Script responde con una redirección a script.googleusercontent.com, que fetch sigue sola
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ clave, ...cuerpo }) });
    let j;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok || !j || !j.ok) {
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
