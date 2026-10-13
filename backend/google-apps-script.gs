/**
 * LISTA DE BOTANIC → GOOGLE SHEETS
 * ------------------------------------------------------------
 * Guarda cada inscripción de la web en una hoja de cálculo.
 * Cada noche se guarda en su propia pestaña (ej: "2026-10-17").
 *
 * INSTALACIÓN (5 minutos):
 *  1. Crea una hoja nueva en https://sheets.google.com
 *  2. Menú Extensiones → Apps Script.
 *  3. Borra lo que haya y pega TODO este archivo. Guarda.
 *  4. Botón "Implementar" → "Nueva implementación" → tipo "Aplicación web".
 *       - Ejecutar como: Yo
 *       - Quién tiene acceso: Cualquier usuario
 *  5. Autoriza los permisos y copia la URL que termina en /exec
 *  6. Pégala en data/config.js → lista.endpoint
 *
 * Para ver la lista de una noche, abre la pestaña con esa fecha.
 */

const CABECERA = ["Enviado", "Nombre", "Teléfono", "Email", "Acompañantes", "Total personas", "Noche"];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = (e && e.parameter) || {};
    const fecha = String(p.fecha || "").match(/^\d{4}-\d{2}-\d{2}$/) ? p.fecha : "sin-fecha";
    const libro = SpreadsheetApp.getActiveSpreadsheet();
    let hoja = libro.getSheetByName(fecha);
    if (!hoja) {
      hoja = libro.insertSheet(fecha);
      hoja.appendRow(CABECERA);
      hoja.getRange(1, 1, 1, CABECERA.length).setFontWeight("bold");
      hoja.setFrozenRows(1);
    }
    const acomp = Math.max(0, Math.min(50, parseInt(p.acompanantes, 10) || 0));
    hoja.appendRow([
      new Date(),
      limpiar(p.nombre, 80),
      texto(limpiar(p.telefono, 20)),  // como texto, para que Sheets no lo convierta en número
      limpiar(p.email, 120),
      acomp,
      acomp + 1,
      limpiar(p.noche, 80)
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/* Evita fórmulas inyectadas (=, +, -, @) y recorta la longitud */
function limpiar(v, max) {
  let s = String(v || "").trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function texto(s) {
  return s.charAt(0) === "'" ? s : "'" + s;
}
