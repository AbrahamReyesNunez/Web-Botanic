/* =========================================================
   INSCRIPCIÓN EN LA LISTA
   Capas: campos permitidos → campo trampa → token de formulario →
   límite por IP → fecha y antelación → límite por IP y noche → RPP → nombre →
   topes por noche y duplicados (en el almacén).
   ========================================================= */
"use strict";

const BotanicNombre = require("../public/js/compartido/nombre.js");
const { crearLimitador } = require("./limites.js");

const CAMPOS = new Set(["fecha", "nombre", "rpp", "token", "web"]);
const RECHAZOS = {
  noche_llena: "La lista de esta noche está completa.",
  rpp_lleno: "La lista de este RPP para esta noche está completa."
};
const MIN = 60_000;
const DIA = 24 * 60 * MIN;

/* tokens: el de server/formulario.js, compartido con las reservas
   huella(ip): texto que identifica la IP sin guardarla (HMAC con la clave del servidor) */
function crearLista({ almacen, cal, cfg, tokens, huella = () => null }) {
  // Todos los intentos (también los fallidos) y, aparte, las altas
  const intentos = crearLimitador([{ ms: 10 * MIN, max: 20 }]);
  const altas = crearLimitador([{ ms: 10 * MIN, max: 5 }, { ms: DIA, max: 15 }]);
  // Por IP y noche: nadie puede ir llenando una noche poco a poco (la lista se abre unos días antes)
  const porNoche = crearLimitador([{ ms: 10 * DIA, max: 5 }]);
  const topes = cfg.lista || {};

  const error = (status, mensaje, extra) => ({ status, cuerpo: { ok: false, error: mensaje }, ...extra });
  const demasiados = (esperar) => error(429, "Demasiados intentos. Prueba de nuevo más tarde.", { cabeceras: { "Retry-After": String(esperar) } });
  const apuntado = (nombre, rpp) => ({ status: 201, cuerpo: { ok: true, nombre, rpp: rpp ? rpp.nombre : null } });

  async function inscribir(datos, ip) {
    const lim = intentos.comprobar(ip);
    if (!lim.ok) return demasiados(lim.esperar);
    intentos.anotar(ip);

    if (!datos || typeof datos !== "object" || Array.isArray(datos)) return error(400, "Petición no válida.");
    if (Object.keys(datos).some((k) => !CAMPOS.has(k))) return error(400, "Petición no válida.");

    // Campo trampa relleno: es un bot. Se le responde como si todo fuera bien y no se guarda nada.
    if (datos.web) return { status: 201, cuerpo: { ok: true, nombre: BotanicNombre.normalizar(String(datos.nombre || "")).slice(0, 40), rpp: null } };

    if (!tokens.valido(datos.token)) return error(400, "El formulario ha caducado. Recarga la página e inténtalo de nuevo.");

    // Los huecos de los límites se cogen ya, antes de esperar a la base de datos: si no, varias
    // peticiones a la vez pasarían todas la comprobación. Si el alta no sale, se devuelven
    const cogidos = [];
    const coger = (limitador, clave) => {
      const r = limitador.reservar(clave);
      if (r.ok) cogidos.push(() => limitador.liberar(clave, r.marca));
      return r;
    };
    let hecho = false;
    try {
      const limAlta = coger(altas, ip);
      if (!limAlta.ok) return demasiados(limAlta.esperar);

      const { fecha } = datos;
      if (!cal.esClaveValida(fecha)) return error(400, "Fecha no válida.");
      const d = cal.fromKey(fecha);
      if (!cal.isOpen(d)) return error(400, "Esa noche no abrimos.");
      if (!cal.listaAbierta(d)) return error(400, "La lista de esa noche ya está cerrada.");
      if (!cal.listaDisponible(d)) return error(400, "La lista de esa noche aún no está abierta.");

      const limNoche = coger(porNoche, `${ip}|${fecha}`);
      if (!limNoche.ok) return demasiados(limNoche.esperar);

      let rpp = null;
      if (datos.rpp !== undefined && datos.rpp !== null && datos.rpp !== "") {
        if (typeof datos.rpp !== "string" || !/^[a-z0-9]{4,32}$/.test(datos.rpp)) return error(400, "RPP no válido.");
        rpp = await almacen.rppActivo(datos.rpp);
        if (!rpp) return error(400, "El link de RPP ya no es válido.");
      }

      const v = BotanicNombre.validar(datos.nombre);
      if (!v.ok) return error(400, v.error);
      const clave = BotanicNombre.clave(v.nombre);

      // Topes y duplicados los comprueba el almacén al insertar (los topes primero), para que dos altas
      // a la vez no se los salten. Si el nombre ya estaba, se responde igual que a un alta nueva:
      // así la lista no sirve para averiguar quién va. Cuenta para los límites igualmente
      const r = await almacen.anadir({ fecha, nombre: v.nombre, clave, rpp: rpp ? rpp.codigo : null, origen: huella(ip) }, topes);
      if (!r.ok && r.motivo !== "duplicado") return error(409, RECHAZOS[r.motivo] || "No se ha podido completar la inscripción.");

      hecho = true;
      return apuntado(v.nombre, rpp);
    } finally {
      if (!hecho) cogidos.forEach((devolver) => devolver());
    }
  }

  return { inscribir, cerrar: () => { intentos.cerrar(); altas.cerrar(); porNoche.cerrar(); } };
}

module.exports = { crearLista };
