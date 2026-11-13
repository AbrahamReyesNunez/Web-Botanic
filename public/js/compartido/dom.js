/* =========================================================
   AYUDANTES DE PÁGINA — compartidos por la web (app.js) y el panel (admin.js)
   ========================================================= */
(function (root, modulo) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = modulo();
  else root.BotanicDom = modulo();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ENTIDADES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  /* Primer elemento que encaja con el selector (dentro de ctx, o en toda la página) */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  /* Escapa un texto para meterlo en HTML (contenido o atributo entre comillas) */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ENTIDADES[c]);

  return { $, esc };
});
