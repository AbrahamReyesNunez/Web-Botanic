/* =========================================================
   RESERVADOS — precios y buscador de bebidas
   Funciones puras sobre el catálogo de data/reservados.js,
   compartidas entre la web y los tests.
   ========================================================= */
(function (root, modulo) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = modulo();
  else root.BotanicReservas = modulo();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const GRUPOS = ["botellas", "chupitos", "champan", "refrescos"];
  const DIA_POR_DEFECTO = 6; // noches especiales fuera de miércoles-sábado: precio de sábado

  /* Minúsculas, sin tildes ni apóstrofos y solo letras/números separados por un espacio */
  function normalizar(texto) {
    return String(texto ?? "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  /* Lo bien que encaja una búsqueda en un texto: 0 empieza igual, 1 empieza una palabra, 2 lo contiene, -1 no */
  function encaje(q, texto) {
    const t = normalizar(texto);
    if (t.startsWith(q)) return 0;
    if ((" " + t).includes(" " + q)) return 1;
    if (t.includes(q) || t.replace(/ /g, "").includes(q.replace(/ /g, ""))) return 2;
    return -1;
  }

  /* Mejor encaje entre varios textos (-1 si ninguno) */
  const mejorEncaje = (q, textos) => textos.reduce((m, t) => {
    const e = t ? encaje(q, t) : -1;
    return e >= 0 && (m < 0 || e < m) ? e : m;
  }, -1);

  /* Sugerencias para lo que se lleva escrito. Encaja con el nombre, la categoría (Ron, Ginebra…) o un alias;
     si solo encaja un alias (pepsi → Coca-Cola), lo indica en "alias" */
  function buscar(items, consulta) {
    const q = normalizar(consulta);
    if (!q) return items.map((item) => ({ item, alias: null }));
    const res = [];
    items.forEach((item, orden) => {
      const enNombre = mejorEncaje(q, [item.nombre, item.categoria]);
      let mejor = enNombre;
      let alias = null;
      (item.alias || []).forEach((a) => {
        const e = encaje(q, a);
        if (e >= 0 && (mejor < 0 || e < mejor)) { mejor = e; alias = a; }
      });
      if (mejor < 0) return;
      res.push({ item, alias: enNombre >= 0 ? null : alias, puntos: mejor, orden });
    });
    return res
      .sort((a, b) => a.puntos - b.puntos || a.orden - b.orden)
      .map(({ item, alias }) => ({ item, alias }));
  }

  /* Precio por unidad. null = a consultar (champán sin precio); 0 = incluido (refrescos) */
  function precioDe(cat, grupo, item, dia) {
    const p = cat.precios || {};
    if (grupo === "botellas") {
      const base = (p.botella || {})[dia] ?? (p.botella || {})[DIA_POR_DEFECTO] ?? 0;
      return base + (item.premium ? p.premium || 0 : 0);
    }
    if (grupo === "chupitos") return p.chupito ?? null;
    if (grupo === "champan") return item.precio ?? null;
    return 0;
  }

  const itemDe = (cat, grupo, nombre) => (cat[grupo] || []).find((i) => i.nombre === nombre);

  /* Desglose del carrito ([{ grupo, nombre, cantidad }]) para una noche (getDay) y un tipo de mesa */
  function calcular(cat, carrito, dia, tipo) {
    const lineas = [];
    const suplementos = [];
    let total = 0;
    let botellas = 0;
    let refrescos = 0;
    let aConsultar = false;

    GRUPOS.forEach((grupo) => {
      carrito.filter((x) => x.grupo === grupo && x.cantidad > 0).forEach((x) => {
        const item = itemDe(cat, grupo, x.nombre);
        if (!item) return;
        const precio = precioDe(cat, grupo, item, dia);
        const subtotal = precio === null ? null : precio * x.cantidad;
        lineas.push({ grupo, nombre: item.nombre, cantidad: x.cantidad, precio, subtotal, premium: !!item.premium });
        if (subtotal === null) aConsultar = true;
        else total += subtotal;
        if (grupo === "botellas") botellas += x.cantidad;
        if (grupo === "refrescos") refrescos += x.cantidad;
        if (item.suplemento) {
          suplementos.push({ nombre: item.nombre, importe: item.suplemento });
          total += item.suplemento;
        }
      });
    });

    const refrescosMax = botellas * ((cat.precios || {}).refrescosPorBotella || 0);
    const minBotellas = ((cat.tipos || {})[tipo] || {}).minBotellas || 0;
    const errores = [];
    if (botellas < minBotellas) {
      const nombreMesa = ((cat.tipos || {})[tipo] || {}).nombre || "Esta mesa";
      errores.push(`${nombreMesa} necesita al menos ${minBotellas} ${minBotellas === 1 ? "botella" : "botellas"}.`);
    }
    // Los refrescos incluidos se eligen todos: ni más ni menos
    if (botellas && refrescos !== refrescosMax) {
      const faltan = refrescosMax - refrescos;
      errores.push(faltan > 0
        ? `Te ${faltan === 1 ? "falta 1 refresco" : `faltan ${faltan} refrescos`}: con ${botellas} ${botellas === 1 ? "botella" : "botellas"} van ${refrescosMax} incluidos.`
        : `Con ${botellas} ${botellas === 1 ? "botella" : "botellas"} van ${refrescosMax} refrescos incluidos y has elegido ${refrescos}.`);
    }

    return { lineas, suplementos, total, aConsultar, botellas, refrescos, refrescosMax, minBotellas, errores };
  }

  return { GRUPOS, normalizar, buscar, precioDe, calcular };
});
