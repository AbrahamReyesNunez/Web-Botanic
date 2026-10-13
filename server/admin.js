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

  const nombreRpp = (codigo) => {
    if (!codigo) return "Sin RPP";
    const r = almacen.rpps().find((x) => x.codigo === codigo);
    return r ? r.nombre : `RPP eliminado (${codigo})`;
  };

  /* Noches con inscripciones más las próximas abiertas, de más reciente a más antigua */
  function noches() {
    const cuenta = new Map();
    for (const x of almacen.todas()) cuenta.set(x.fecha, (cuenta.get(x.fecha) || 0) + 1);
    for (const d of cal.proximasNoches(8)) { const k = cal.keyOf(d); if (!cuenta.has(k)) cuenta.set(k, 0); }
    const proxima = cal.proximasNoches(1)[0];
    return {
      porDefecto: proxima ? cal.keyOf(proxima) : null,
      noches: [...cuenta].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([fecha, total]) => ({ fecha, total }))
    };
  }

  function resumen(fecha) {
    if (!cal.esClaveValida(fecha)) return { status: 400, cuerpo: { ok: false, error: "Fecha no válida." } };
    const lista = almacen.deNoche(fecha).slice().sort((a, b) => (a.creado < b.creado ? -1 : 1));
    const grupos = new Map(almacen.rpps().map((r) => [r.codigo, 0]));
    grupos.set(null, 0);
    for (const x of lista) grupos.set(x.rpp, (grupos.get(x.rpp) || 0) + 1);
    return {
      status: 200,
      cuerpo: {
        ok: true,
        fecha,
        total: lista.length,
        porRpp: [...grupos].map(([codigo, total]) => ({ codigo, nombre: nombreRpp(codigo), total })),
        inscripciones: lista.map((x) => ({ id: x.id, nombre: x.nombre, rpp: nombreRpp(x.rpp), creado: x.creado }))
      }
    };
  }

  function rpps() {
    return { status: 200, cuerpo: { ok: true, rpps: almacen.rpps().map(({ codigo, nombre, activo }) => ({ codigo, nombre, activo: activo !== false })) } };
  }

  function csv(fecha) {
    if (!cal.esClaveValida(fecha)) return null;
    const filas = [["Nombre", "RPP", "Inscrito"]];
    for (const x of almacen.deNoche(fecha)) filas.push([x.nombre, nombreRpp(x.rpp), x.creado]);
    return "﻿" + filas.map((f) => f.map(celdaCSV).join(";")).join("\r\n");
  }

  async function borrar(id) {
    if (!/^[0-9a-f-]{36}$/.test(id)) return { status: 400, cuerpo: { ok: false, error: "Id no válido." } };
    const ok = await almacen.borrar(id);
    return ok ? { status: 200, cuerpo: { ok: true } } : { status: 404, cuerpo: { ok: false, error: "No existe." } };
  }

  return { autorizado, login, logout, noches, resumen, rpps, csv, borrar, cerrar: () => intentosLogin.cerrar() };
}

module.exports = { crearAdmin };
