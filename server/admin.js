/* =========================================================
   PANEL DE ADMINISTRACIÓN: sesión con cookie y recuento por RPP
   ========================================================= */
"use strict";

const crypto = require("node:crypto");
const { crearLimitador } = require("./limites.js");

const COOKIE = "botanic_admin";
const DURACION_SESION = 12 * 60 * 60 * 1000;

const hash = (s) => crypto.createHash("sha256").update(String(s)).digest();

/* Evita que Excel interprete un nombre como fórmula */
const celdaCSV = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function crearAdmin({ almacen, cal, claveAdmin }) {
  const sesiones = new Map(); // token -> caducidad
  const intentosLogin = crearLimitador([{ ms: 15 * 60 * 1000, max: 5 }]);
  const claveHash = hash(claveAdmin);

  function leerCookie(req) {
    const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{20,100})`));
    return m ? m[1] : null;
  }

  function autorizado(req) {
    const token = leerCookie(req);
    const caduca = token && sesiones.get(token);
    if (!caduca) return false;
    if (caduca < Date.now()) { sesiones.delete(token); return false; }
    return true;
  }

  function login(datos, ip, seguro) {
    const lim = intentosLogin.comprobar(ip);
    if (!lim.ok) return { status: 429, cuerpo: { ok: false, error: "Demasiados intentos. Espera unos minutos." }, cabeceras: { "Retry-After": String(lim.esperar) } };
    intentosLogin.anotar(ip);
    const clave = datos && typeof datos.clave === "string" ? datos.clave : "";
    if (!clave || clave.length > 200 || !crypto.timingSafeEqual(hash(clave), claveHash)) {
      return { status: 401, cuerpo: { ok: false, error: "Clave incorrecta." } };
    }
    const token = crypto.randomBytes(32).toString("base64url");
    sesiones.set(token, Date.now() + DURACION_SESION);
    const cookie = `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DURACION_SESION / 1000}${seguro ? "; Secure" : ""}`;
    return { status: 200, cuerpo: { ok: true }, cabeceras: { "Set-Cookie": cookie } };
  }

  function logout(req) {
    const token = leerCookie(req);
    if (token) sesiones.delete(token);
    return { status: 200, cuerpo: { ok: true }, cabeceras: { "Set-Cookie": `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` } };
  }

  /* Traduce códigos de RPP a nombres con una sola lectura de la tabla de RPPs */
  async function nombresRpp() {
    const lista = await almacen.rpps();
    const porCodigo = new Map(lista.map((r) => [r.codigo, r.nombre]));
    const nombre = (codigo) => {
      if (!codigo) return "Sin RPP";
      return porCodigo.get(codigo) ?? `RPP eliminado (${codigo})`;
    };
    return { lista, nombre };
  }

  /* Noches con inscripciones más las próximas abiertas, de más reciente a más antigua */
  async function noches() {
    const [listas, solicitudes] = await Promise.all([almacen.recuentoNoches(), almacen.recuentoReservas()]);
    const cuenta = new Map(listas.map((x) => [x.fecha, { fecha: x.fecha, total: x.total, reservas: 0 }]));
    for (const x of solicitudes) {
      if (!cuenta.has(x.fecha)) cuenta.set(x.fecha, { fecha: x.fecha, total: 0, reservas: 0 });
      cuenta.get(x.fecha).reservas = x.total;
    }
    for (const d of cal.proximasNoches(8)) {
      const k = cal.keyOf(d);
      if (!cuenta.has(k)) cuenta.set(k, { fecha: k, total: 0, reservas: 0 });
    }
    const proxima = cal.proximasNoches(1)[0];
    return {
      porDefecto: proxima ? cal.keyOf(proxima) : null,
      noches: [...cuenta.values()].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    };
  }

  async function resumen(fecha) {
    if (!cal.esClaveValida(fecha)) return { status: 400, cuerpo: { ok: false, error: "Fecha no válida." } };
    const [lista, rpps] = await Promise.all([almacen.deNoche(fecha), nombresRpp()]);
    lista.sort((a, b) => Date.parse(a.creado) - Date.parse(b.creado));
    const grupos = new Map(rpps.lista.map((r) => [r.codigo, 0]));
    grupos.set(null, 0);
    for (const x of lista) grupos.set(x.rpp, (grupos.get(x.rpp) || 0) + 1);
    return {
      status: 200,
      cuerpo: {
        ok: true,
        fecha,
        total: lista.length,
        porRpp: [...grupos].map(([codigo, total]) => ({ codigo, nombre: rpps.nombre(codigo), total })),
        inscripciones: lista.map((x) => ({ id: x.id, nombre: x.nombre, rpp: rpps.nombre(x.rpp), rppCodigo: x.rpp, creado: x.creado }))
      }
    };
  }

  async function reservas(fecha) {
    if (!cal.esClaveValida(fecha)) return { status: 400, cuerpo: { ok: false, error: "Fecha no válida." } };
    const [lista, rpps] = await Promise.all([almacen.reservasDeNoche(fecha), nombresRpp()]);
    const vip = lista.filter((x) => x.tipo === "vip").length;
    const pista = lista.filter((x) => x.tipo === "pista").length;
    return {
      status: 200,
      cuerpo: {
        ok: true,
        fecha,
        total: lista.length,
        vip,
        pista,
        reservas: lista.map((x) => ({
          id: x.id,
          tipo: x.tipo,
          estado: x.estado || "pendiente",
          nombre: x.nombre,
          botellas: x.botellas,
          refrescos: x.refrescos,
          chupitos: x.chupitos,
          champan: x.champan,
          rpp: rpps.nombre(x.rpp),
          creado: x.creado
        }))
      }
    };
  }

  async function rpps() {
    const lista = await almacen.rpps();
    return { status: 200, cuerpo: { ok: true, rpps: lista.map(({ codigo, nombre, activo }) => ({ codigo, nombre, activo: activo !== false })) } };
  }

  function validarNombreRpp(nombre) {
    return typeof nombre === "string" && nombre.trim().length > 0 && nombre.trim().length <= 60 && !/[\u0000-\u001f\u007f]/.test(nombre);
  }

  /* El almacén avisa de un nombre ya usado (en Supabase, el índice rpps_nombre_unico); otros errores siguen su curso */
  function nombreRepetido(e) {
    if (e && e.motivo === "nombre_repetido") return { status: 409, cuerpo: { ok: false, error: e.message } };
    throw e;
  }

  async function crearRpp(datos) {
    if (!datos || !validarNombreRpp(datos.nombre)) {
      return { status: 400, cuerpo: { ok: false, error: "El nombre del RPP debe tener entre 1 y 60 caracteres." } };
    }
    // El código (el de los links) lo genera el almacén; en Supabase, la propia base de datos
    try {
      const rpp = await almacen.crearRpp({ nombre: datos.nombre.trim() });
      return { status: 201, cuerpo: { ok: true, rpp } };
    } catch (e) {
      return nombreRepetido(e);
    }
  }

  async function actualizarRpp(codigo, datos = {}) {
    if (!/^[a-z0-9]{4,32}$/.test(codigo)) return { status: 400, cuerpo: { ok: false, error: "Código de RPP no válido." } };
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
      return { status: 400, cuerpo: { ok: false, error: "Los cambios del RPP no son válidos." } };
    }
    const cambios = {};
    if (Object.hasOwn(datos, "nombre")) {
      if (!validarNombreRpp(datos.nombre)) return { status: 400, cuerpo: { ok: false, error: "El nombre del RPP debe tener entre 1 y 60 caracteres." } };
      cambios.nombre = datos.nombre.trim();
    }
    if (Object.hasOwn(datos, "activo")) {
      if (typeof datos.activo !== "boolean") return { status: 400, cuerpo: { ok: false, error: "El estado del RPP no es válido." } };
      cambios.activo = datos.activo;
    }
    if (!Object.keys(cambios).length) return { status: 400, cuerpo: { ok: false, error: "No hay cambios válidos." } };
    let rpp;
    try { rpp = await almacen.actualizarRpp(codigo, cambios); } catch (e) { return nombreRepetido(e); }
    return rpp
      ? { status: 200, cuerpo: { ok: true, rpp } }
      : { status: 404, cuerpo: { ok: false, error: "RPP no encontrado." } };
  }

  async function eliminarRpp(codigo) {
    if (!/^[a-z0-9]{4,32}$/.test(codigo)) return { status: 400, cuerpo: { ok: false, error: "Código de RPP no válido." } };
    const rpp = await almacen.actualizarRpp(codigo, { activo: false });
    return rpp
      ? { status: 200, cuerpo: { ok: true } }
      : { status: 404, cuerpo: { ok: false, error: "RPP no encontrado." } };
  }

  async function csv(fecha) {
    if (!cal.esClaveValida(fecha)) return null;
    const [lista, rpps] = await Promise.all([almacen.deNoche(fecha), nombresRpp()]);
    const filas = [["Nombre", "RPP", "Inscrito"]];
    for (const x of lista) filas.push([x.nombre, rpps.nombre(x.rpp), x.creado]);
    return "﻿" + filas.map((f) => f.map(celdaCSV).join(";")).join("\r\n");
  }

  async function borrar(id) {
    if (!/^[0-9a-f-]{36}$/.test(id)) return { status: 400, cuerpo: { ok: false, error: "Id no válido." } };
    const ok = await almacen.borrar(id);
    return ok ? { status: 200, cuerpo: { ok: true } } : { status: 404, cuerpo: { ok: false, error: "No existe." } };
  }

  return { autorizado, login, logout, noches, resumen, reservas, rpps, crearRpp, actualizarRpp, eliminarRpp, csv, borrar, cerrar: () => intentosLogin.cerrar() };
}

module.exports = { crearAdmin };
