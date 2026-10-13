/* =========================================================
   INSCRIPCIÓN EN LA LISTA
   Capas: campos permitidos → campo trampa → token de formulario →
   límite por IP → fecha → RPP → nombre → duplicados → topes por noche.
   ========================================================= */
"use strict";

const crypto = require("node:crypto");
const BotanicNombre = require("../js/compartido/nombre.js");
const { crearLimitador } = require("./limites.js");

const CAMPOS = new Set(["fecha", "nombre", "rpp", "token", "web"]);
const DIAS_VISTA_MAX = 180;
const MIN = 60_000;

function crearLista({ almacen, cal, cfg, secreto, tokenMinMs = 3000, tokenMaxMs = 2 * 60 * MIN }) {
  // Todos los intentos (también los fallidos) y, aparte, las altas correctas
  const intentos = crearLimitador([{ ms: 10 * MIN, max: 20 }]);
  const altas = crearLimitador([{ ms: 10 * MIN, max: 5 }, { ms: 24 * 60 * MIN, max: 15 }]);
  const topes = cfg.lista || {};

  const firmar = (ts) => crypto.createHmac("sha256", secreto).update(String(ts)).digest("base64url");

  function crearToken() {
    const ts = Date.now();
    return `${ts}.${firmar(ts)}`;
  }

  function tokenValido(token) {
    if (typeof token !== "string" || token.length > 100) return false;
    const [ts, firma] = token.split(".");
    if (!/^\d{10,16}$/.test(ts || "") || !firma) return false;
    const esperada = Buffer.from(firmar(ts));
    const recibida = Buffer.from(firma);
    if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return false;
    const edad = Date.now() - Number(ts);
    return edad >= tokenMinMs && edad <= tokenMaxMs;
  }

  const error = (status, mensaje, extra) => ({ status, cuerpo: { ok: false, error: mensaje }, ...extra });
  const demasiados = (esperar) => error(429, "Demasiados intentos. Prueba de nuevo más tarde.", { cabeceras: { "Retry-After": String(esperar) } });

  async function inscribir(datos, ip) {
    const lim = intentos.comprobar(ip);
    if (!lim.ok) return demasiados(lim.esperar);
    intentos.anotar(ip);

    if (!datos || typeof datos !== "object" || Array.isArray(datos)) return error(400, "Petición no válida.");
    if (Object.keys(datos).some((k) => !CAMPOS.has(k))) return error(400, "Petición no válida.");

    // Campo trampa relleno: es un bot. Se le responde como si todo fuera bien y no se guarda nada.
    if (datos.web) return { status: 201, cuerpo: { ok: true, nombre: BotanicNombre.normalizar(String(datos.nombre || "")).slice(0, 40), rpp: null } };

    if (!tokenValido(datos.token)) return error(400, "El formulario ha caducado. Recarga la página e inténtalo de nuevo.");

    const limAlta = altas.comprobar(ip);
    if (!limAlta.ok) return demasiados(limAlta.esperar);

    const { fecha } = datos;
    if (!cal.esClaveValida(fecha)) return error(400, "Fecha no válida.");
    const d = cal.fromKey(fecha);
    if (!cal.isOpen(d)) return error(400, "Esa noche no abrimos.");
    if (!cal.listaAbierta(d)) return error(400, "La lista de esa noche ya está cerrada.");
    if (d > cal.addDays(cal.today(), DIAS_VISTA_MAX)) return error(400, "Esa fecha aún no tiene lista.");

    let rpp = null;
    if (datos.rpp !== undefined && datos.rpp !== null && datos.rpp !== "") {
      if (typeof datos.rpp !== "string" || !/^[a-z0-9]{4,32}$/.test(datos.rpp)) return error(400, "RPP no válido.");
      rpp = almacen.rppActivo(datos.rpp);
      if (!rpp) return error(400, "El link de RPP ya no es válido.");
    }

    const v = BotanicNombre.validar(datos.nombre);
    if (!v.ok) return error(400, v.error);
    const clave = BotanicNombre.clave(v.nombre);

    const noche = almacen.deNoche(fecha);
    if (noche.some((x) => x.clave === clave)) return error(409, "Ese nombre ya está en la lista de esta noche.");
    if (topes.maxPorNoche && noche.length >= topes.maxPorNoche) return error(409, "La lista de esta noche está completa.");
    const codigo = rpp ? rpp.codigo : null;
    if (rpp && topes.maxPorRppNoche && noche.filter((x) => x.rpp === codigo).length >= topes.maxPorRppNoche) {
      return error(409, "La lista de este RPP para esta noche está completa.");
    }

    altas.anotar(ip);
    await almacen.anadir({ fecha, nombre: v.nombre, clave, rpp: codigo });
    return { status: 201, cuerpo: { ok: true, nombre: v.nombre, rpp: rpp ? rpp.nombre : null } };
  }

  return { crearToken, inscribir, cerrar: () => { intentos.cerrar(); altas.cerrar(); } };
}

module.exports = { crearLista };
