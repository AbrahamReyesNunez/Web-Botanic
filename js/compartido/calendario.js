/* =========================================================
   CALENDARIO DE APERTURA — compartido entre la web y el servidor
   En el navegador crea window.BotanicCalendario con la configuración
   de data/config.js. En Node exporta la función crearCalendario(cfg, ahora).
   ========================================================= */
(function (root, crearCalendario) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = crearCalendario;
  else root.BotanicCalendario = crearCalendario(root.BOTANIC_CONFIG || {});
})(typeof self !== "undefined" ? self : this, function crearCalendario(cfg, ahora) {
  "use strict";
  // ahora(): Date cuyos campos locales son la hora de la discoteca (en el servidor, Europe/Madrid)
  ahora = ahora || (() => new Date());

  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const today = () => startOfDay(ahora());

  /* "AAAA-MM-DD" que corresponde a una fecha real */
  function esClaveValida(k) {
    if (typeof k !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
    return keyOf(fromKey(k)) === k;
  }

  function isOpen(d) {
    const k = keyOf(d);
    if ((cfg.aperturasExtra || []).includes(k)) return true;
    if ((cfg.cerrado || []).includes(k)) return false;
    return (cfg.diasAbierto || [3, 4, 5, 6]).includes(d.getDay());
  }

  function horarioDe(d) {
    const h = cfg.horarios || {};
    return h[d.getDay()] || h[6] || "23:30";
  }

  /* ¿Se puede apuntar todavía a la lista de ese día? */
  function listaAbierta(d) {
    const t = today();
    if (d < t) return false;
    if (d.getTime() === t.getTime()) return ahora().getHours() < (cfg.cierreListaHora ?? 23);
    return true;
  }

  function proximasNoches(n, soloConLista = false) {
    const out = [];
    let d = today();
    for (let i = 0; i < 120 && out.length < n; i++, d = addDays(d, 1)) {
      if (isOpen(d) && (!soloConLista || listaAbierta(d))) out.push(d);
    }
    return out;
  }

  return { pad, keyOf, fromKey, startOfDay, addDays, today, esClaveValida, isOpen, horarioDe, listaAbierta, proximasNoches };
});
