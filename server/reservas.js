/* =========================================================
   SOLICITUDES DE RESERVADOS: validación, límites y persistencia
   ========================================================= */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const BotanicNombre = require("../js/compartido/nombre.js");
const BotanicReservas = require("../js/compartido/reservas.js");
const { crearLimitador } = require("./limites.js");

const archivoCatalogo = path.join(__dirname, "..", "data", "reservados.js");
const contexto = { window: {} };
vm.runInNewContext(fs.readFileSync(archivoCatalogo, "utf8"), contexto);
const CATALOGO = contexto.window.BOTANIC_RESERVADOS;

const GRUPOS = ["botellas", "refrescos", "chupitos", "champan"];
const CAMPOS = new Set([
  "fecha", "tipo", "nombre", "telefono", "personas", "rpp",
  ...GRUPOS, "notas", "token"
]);
const DIAS_VISTA_MAX = 180;
const MIN = 60_000;

/* Teléfono en formato internacional (+34600000000): así lo guarda la base de datos y sirve para WhatsApp.
   Un número español sin prefijo (9 cifras que empiezan por 6, 7, 8 o 9) se toma como +34. */
function telefonoInternacional(texto) {
  if (typeof texto !== "string") return null;
  let t = texto.replace(/[\s.()-]/g, "");
  if (t.startsWith("00")) t = "+" + t.slice(2);
  if (/^[6-9]\d{8}$/.test(t)) t = "+34" + t;
  else if (/^\d{10,15}$/.test(t)) t = "+" + t;
  return /^\+[1-9]\d{8,14}$/.test(t) ? t : null;
}

/* Motivos con los que la base de datos (crear_reserva) puede rechazar una reserva */
const MOTIVOS = {
  tipo: "Tipo de mesa no válido.",
  fecha: "Esa noche no está disponible para reservar.",
  rpp: "El link de RPP ya no es válido.",
  telefono: "Teléfono no válido.",
  personas: "El número de personas debe estar entre 1 y 30.",
  completo: "Ya no quedan mesas de ese tipo para esa noche.",
  lleno: "Ya no quedan mesas de ese tipo para esa noche.",
  aforo: "Ya no quedan mesas de ese tipo para esa noche."
};

function crearReservas({ almacen, cal, validarToken }) {
  const intentos = crearLimitador([{ ms: 10 * MIN, max: 20 }]);
  const altas = crearLimitador([{ ms: 10 * MIN, max: 5 }, { ms: 24 * 60 * MIN, max: 15 }]);
  const error = (status, mensaje, esperar) => ({
    status,
    cuerpo: { ok: false, error: mensaje },
    ...(esperar ? { cabeceras: { "Retry-After": String(esperar) } } : {})
  });

  function normalizarGrupo(grupo, valor) {
    if (!Array.isArray(valor) || valor.length > (CATALOGO[grupo] || []).length) return null;
    const permitidos = new Set((CATALOGO[grupo] || []).map((item) => item.nombre));
    const usados = new Set();
    const items = [];
    for (const linea of valor) {
      if (!linea || typeof linea !== "object" || !permitidos.has(linea.nombre)
        || !Number.isInteger(linea.cantidad) || linea.cantidad < 1 || linea.cantidad > 30
        || usados.has(linea.nombre)) return null;
      usados.add(linea.nombre);
      items.push({ grupo, nombre: linea.nombre, cantidad: linea.cantidad });
    }
    return items;
  }

  async function crear(datos, ip) {
    const limite = intentos.comprobar(ip);
    if (!limite.ok) return error(429, "Demasiados intentos. Prueba de nuevo más tarde.", limite.esperar);
    intentos.anotar(ip);

    if (!datos || typeof datos !== "object" || Array.isArray(datos)
      || Object.keys(datos).some((campo) => !CAMPOS.has(campo))) {
      return error(400, "Petición de reserva no válida.");
    }
    if (!validarToken(datos.token)) return error(400, "El formulario ha caducado. Recarga la página e inténtalo de nuevo.");

    const limiteAlta = altas.comprobar(ip);
    if (!limiteAlta.ok) return error(429, "Demasiadas solicitudes. Prueba de nuevo más tarde.", limiteAlta.esperar);

    const { fecha, tipo } = datos;
    if (!cal.esClaveValida(fecha)) return error(400, "Fecha no válida.");
    const noche = cal.fromKey(fecha);
    if (!cal.isOpen(noche) || noche < cal.today()
      || noche > cal.addDays(cal.today(), DIAS_VISTA_MAX)) return error(400, "Esa noche no está disponible para reservar.");
    if (!Object.hasOwn(CATALOGO.tipos, tipo)) return error(400, "Tipo de mesa no válido.");

    const nombre = BotanicNombre.validar(datos.nombre);
    if (!nombre.ok) return error(400, nombre.error);
    const telefono = telefonoInternacional(datos.telefono);
    if (!telefono) return error(400, "Teléfono no válido.");
    if (!Number.isInteger(datos.personas) || datos.personas < 1 || datos.personas > 30) {
      return error(400, "El número de personas debe estar entre 1 y 30.");
    }
    if (typeof datos.notas !== "string" || datos.notas.length > 500) return error(400, "Los comentarios superan el límite permitido.");

    let rpp = null;
    if (datos.rpp !== null && datos.rpp !== undefined && datos.rpp !== "") {
      if (typeof datos.rpp !== "string" || !/^[a-z0-9]{4,32}$/.test(datos.rpp)) return error(400, "RPP no válido.");
      rpp = await almacen.rppActivo(datos.rpp);
      if (!rpp) return error(400, "El link de RPP ya no es válido.");
    }

    const lineas = [];
    for (const grupo of GRUPOS) {
      const items = normalizarGrupo(grupo, datos[grupo]);
      if (!items) return error(400, "La selección de bebidas no es válida.");
      lineas.push(...items);
    }
    const calculo = BotanicReservas.calcular(CATALOGO, lineas, noche.getDay(), tipo);
    if (calculo.errores.length) return error(400, calculo.errores[0]);

    // Cada bebida con su precio por unidad de esa noche (null = a consultar, 0 = incluido)
    const deGrupo = (grupo) => calculo.lineas.filter((x) => x.grupo === grupo)
      .map(({ nombre, cantidad, precio }) => ({ nombre, cantidad, precio }));
    const r = await almacen.crearReserva({
      fecha,
      tipo,
      nombre: nombre.nombre,
      telefono,
      personas: datos.personas,
      rpp: rpp ? rpp.codigo : null,
      botellas: deGrupo("botellas"),
      refrescos: deGrupo("refrescos"),
      chupitos: deGrupo("chupitos"),
      champan: deGrupo("champan"),
      total: Math.round(calculo.total),
      aConsultar: calculo.aConsultar,
      notas: datos.notas.trim()
    });
    if (!r.ok) {
      const lleno = ["completo", "lleno", "aforo"].includes(r.motivo);
      return error(lleno ? 409 : 400, MOTIVOS[r.motivo] || "No se ha podido registrar la reserva. Revisa los datos e inténtalo de nuevo.");
    }
    altas.anotar(ip);
    return { status: 201, cuerpo: { ok: true, id: r.reserva.id } };
  }

  return { crear, cerrar: () => { intentos.cerrar(); altas.cerrar(); } };
}

module.exports = { crearReservas, telefonoInternacional };
