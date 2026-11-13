/* =========================================================
   PETICIONES DE RESERVA
   Capas: campos permitidos → campo trampa → token de formulario →
   límite por IP → tipo de mesa → fecha → nombre, teléfono, personas,
   RPP y comentarios → pedido (contra el catálogo) → aforo y teléfono
   repetido (en el almacén, en la misma transacción que el alta).
   El total lo calcula el servidor con public/data/reservados.js: lo que mande el
   navegador como precio no se usa.
   ========================================================= */
"use strict";

const BotanicNombre = require("../public/js/compartido/nombre.js");
const Reservas = require("../public/js/compartido/reservas.js");
const { crearLimitador } = require("./limites.js");

const CAMPOS = new Set(["tipo", "fecha", "nombre", "telefono", "personas", "rpp", "notas", "carrito", "token", "web"]);
const CAMPOS_LINEA = ["cantidad", "grupo", "nombre"];
const RECHAZOS = {
  completo: "Ya no quedan mesas de este tipo para esa noche. Prueba otra noche u otro tipo de mesa.",
  duplicado: "Ya hay una petición de reserva para esa noche con este teléfono. Si quieres cambiarla, escríbenos por WhatsApp.",
  tipo: "Ese tipo de mesa no está disponible."
};
const DIAS_VISTA_MAX = 60;       // hasta cuándo se puede pedir mesa
const MAX_LINEAS = 40;
const MAX_REFRESCOS_LINEA = 300;
const MAX_NOTAS = 500;
const CACHE_DISPONIBILIDAD_MS = 30_000;
const MIN = 60_000;

const esObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const tiene = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

/* Comentario de texto plano: sin caracteres de control (salvo saltos de línea) ni espacios sobrantes */
function limpiarNotas(texto) {
  return texto.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function crearReservas({ almacen, cal, cat, tokens }) {
  const intentos = crearLimitador([{ ms: 10 * MIN, max: 20 }]);
  const altas = crearLimitador([{ ms: 60 * MIN, max: 3 }, { ms: 24 * 60 * MIN, max: 6 }]);

  const error = (status, mensaje, extra) => ({ status, cuerpo: { ok: false, error: mensaje }, ...extra });
  const demasiados = (esperar) => error(429, "Demasiados intentos. Prueba de nuevo más tarde.", { cabeceras: { "Retry-After": String(esperar) } });

  /* ---------- Disponibilidad: qué tipos de mesa están completos cada noche ----------
     Solo dice completo / no completo (no cuántas mesas quedan). Se guarda 30 s:
     las confirmaciones las hace el equipo, no cambian a cada visita. */
  let cache = null;
  let cacheHasta = 0;
  let pendiente = null;

  async function leerDisponibilidad() {
    const hoy = cal.today();
    const desde = cal.keyOf(hoy);
    const hasta = cal.keyOf(cal.addDays(hoy, DIAS_VISTA_MAX));
    const { mesas, confirmadas } = await almacen.disponibilidad(desde, hasta);
    const completas = {};
    for (const { fecha, tipo, total } of confirmadas) {
      if (tiene(mesas, tipo) && total >= mesas[tipo]) (completas[fecha] ||= []).push(tipo);
    }
    // Un tipo sin mesas (0) está completo todas las noches
    const sinMesas = Object.keys(mesas).filter((t) => mesas[t] <= 0);
    return { tipos: Object.keys(mesas), sinMesas, completas };
  }

  function disponibilidad() {
    if (cache && Date.now() < cacheHasta) return Promise.resolve(cache);
    pendiente ??= leerDisponibilidad()
      .then((d) => { cache = d; cacheHasta = Date.now() + CACHE_DISPONIBILIDAD_MS; return d; })
      .catch((e) => { if (!cache) throw e; console.error(e.message); return cache; })
      .finally(() => { pendiente = null; });
    return pendiente;
  }
  const olvidarDisponibilidad = () => { cacheHasta = 0; };

  async function respuestaDisponibilidad() {
    const d = await disponibilidad();
    return { status: 200, cuerpo: { ok: true, sinMesas: d.sinMesas, completas: d.completas } };
  }

  /* ---------- Pedido: valida el carrito contra el catálogo ---------- */
  function leerCarrito(carrito) {
    if (!Array.isArray(carrito) || carrito.length === 0 || carrito.length > MAX_LINEAS) return null;
    const vistos = new Set();
    const out = [];
    for (const x of carrito) {
      if (!esObjeto(x) || Object.keys(x).sort().join() !== CAMPOS_LINEA.join()) return null;
      const { grupo, nombre, cantidad } = x;
      if (!Reservas.GRUPOS.includes(grupo) || typeof nombre !== "string" || nombre.length > 60) return null;
      if (!(cat[grupo] || []).some((i) => i.nombre === nombre)) return null;
      const max = grupo === "refrescos" ? MAX_REFRESCOS_LINEA : Reservas.MAX_POR_LINEA;
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > max) return null;
      const k = `${grupo}|${nombre}`;
      if (vistos.has(k)) return null;
      vistos.add(k);
      out.push({ grupo, nombre, cantidad });
    }
    return out;
  }

  async function crear(datos, ip) {
    const lim = intentos.comprobar(ip);
    if (!lim.ok) return demasiados(lim.esperar);
    intentos.anotar(ip);

    if (!esObjeto(datos) || Object.keys(datos).some((k) => !CAMPOS.has(k))) return error(400, "Petición no válida.");

    // Campo trampa relleno: es un bot. Se le responde como si todo fuera bien y no se guarda nada.
    if (datos.web) return { status: 201, cuerpo: { ok: true, referencia: Math.random().toString(16).slice(2, 10).toUpperCase() } };

    if (!tokens.valido(datos.token)) return error(400, "El formulario ha caducado. Recarga la página e inténtalo de nuevo.");

    const limAlta = altas.comprobar(ip);
    if (!limAlta.ok) return demasiados(limAlta.esperar);

    const { tipo, fecha } = datos;
    if (typeof tipo !== "string" || !tiene(cat.tipos || {}, tipo)) return error(400, "Tipo de mesa no válido.");

    if (!cal.esClaveValida(fecha)) return error(400, "Fecha no válida.");
    const d = cal.fromKey(fecha);
    if (!cal.isOpen(d)) return error(400, "Esa noche no abrimos.");
    if (!cal.listaAbierta(d)) return error(400, "Ya no se puede reservar para esa noche.");
    if (d > cal.addDays(cal.today(), DIAS_VISTA_MAX)) return error(400, "Aún no se puede reservar para esa noche.");

    const v = BotanicNombre.validar(datos.nombre);
    if (!v.ok) return error(400, v.error);

    const telefono = typeof datos.telefono === "string" && datos.telefono.length <= 30 ? Reservas.normalizarTelefono(datos.telefono) : null;
    if (!telefono) return error(400, "Escribe un teléfono válido.");

    const { personas } = datos;
    if (!Number.isInteger(personas) || personas < 1 || personas > 30) return error(400, "Indica cuántas personas venís (1 a 30).");

    let rpp = null;
    if (datos.rpp !== undefined && datos.rpp !== null && datos.rpp !== "") {
      if (typeof datos.rpp !== "string" || !/^[a-z0-9]{4,32}$/.test(datos.rpp)) return error(400, "RPP no válido.");
      rpp = await almacen.rppActivo(datos.rpp);
      if (!rpp) return error(400, "El link de RPP ya no es válido.");
    }

    let notas = "";
    if (datos.notas !== undefined && datos.notas !== null) {
      if (typeof datos.notas !== "string" || datos.notas.length > MAX_NOTAS * 2) return error(400, "Comentario no válido.");
      notas = limpiarNotas(datos.notas);
      if (notas.length > MAX_NOTAS) return error(400, `El comentario puede tener hasta ${MAX_NOTAS} caracteres.`);
    }

    const carrito = leerCarrito(datos.carrito);
    if (!carrito) return error(400, "El pedido no es válido. Recarga la página e inténtalo de nuevo.");
    const r = Reservas.calcular(cat, carrito, d.getDay(), tipo, { personas });
    if (r.errores.length) return error(400, r.errores[0]);

    const lineas = r.lineas.map((l) => ({ grupo: l.grupo, producto: l.nombre, cantidad: l.cantidad, precio: l.precio }))
      .concat(r.suplementos.map((s) => ({ grupo: "suplementos", producto: s.nombre, cantidad: 1, precio: s.importe })));

    const res = await almacen.crearReserva({
      fecha, tipo, nombre: v.nombre, telefono, personas, rpp: rpp ? rpp.codigo : null,
      notas, total: r.total, aConsultar: r.aConsultar
    }, lineas);
    if (!res.ok) {
      if (res.motivo === "completo") olvidarDisponibilidad();
      // "motivo" permite a la web reaccionar (p. ej. volver a elegir noche si se ha completado)
      return { status: 409, cuerpo: { ok: false, error: RECHAZOS[res.motivo] || "No se ha podido enviar la reserva.", motivo: res.motivo } };
    }

    altas.anotar(ip);
    return { status: 201, cuerpo: { ok: true, referencia: res.id.slice(0, 8).toUpperCase(), total: r.total, telefono } };
  }

  return { crear, disponibilidad: respuestaDisponibilidad, cerrar: () => { intentos.cerrar(); altas.cerrar(); } };
}

module.exports = { crearReservas };
