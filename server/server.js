/* =========================================================
   SERVIDOR DE BOTANIC
   Sirve la web y la API de la lista y del panel de administración.
   Guarda los datos en Supabase si .env lo configura; si no, en data/db (JSON).
   Uso: npm start   (variables en .env, ver .env.example)
   ========================================================= */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const crearCalendario = require("../js/compartido/calendario.js");
const { crearAlmacen } = require("./almacen.js");
const { crearAlmacenSupabase } = require("./almacen-supabase.js");
const { crearLista } = require("./lista.js");
const { crearAdmin } = require("./admin.js");

const RAIZ = path.resolve(__dirname, "..");
const MAX_CUERPO = 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon"
};

/* Rutas que nunca se sirven como archivos */
const PRIVADO = /^\/(server|test|node_modules|supabase|data\/db)(\/|$)|^\/(package(-lock)?\.json|README\.md|actualizar-galeria\.ps1)$|(^|\/)\./;

const CABECERAS_SEGURIDAD = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "frame-src https://www.google.com",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY"
};

/* Hora actual en Chipiona, sea cual sea la zona horaria del servidor */
function ahoraMadrid() {
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return new Date(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute, +partes.second);
}

/* data/config.js es un script de navegador: se ejecuta con un window falso */
function leerConfig() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "data", "config.js"), "utf8"), ctx);
  return ctx.window.BOTANIC_CONFIG;
}

/* Variables de entorno desde .env (KEY=VALUE por línea), sin pisar las existentes */
function cargarEnv() {
  let texto;
  try { texto = fs.readFileSync(path.join(RAIZ, ".env"), "utf8"); } catch (e) { return; }
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function crearServidor(opciones = {}) {
  const cfg = leerConfig();
  const cal = crearCalendario(cfg, opciones.ahora || ahoraMadrid);
  const almacen = opciones.supabase
    ? crearAlmacenSupabase(opciones.supabase)
    : crearAlmacen(opciones.datos || path.join(RAIZ, "data", "db"));
  const lista = crearLista({ almacen, cal, cfg, secreto: opciones.secreto || crypto.randomBytes(32), ...opciones.lista });
  const admin = crearAdmin({ almacen, cal, claveAdmin: opciones.claveAdmin });
  const trustProxy = !!opciones.trustProxy;

  const ipDe = (req) => (trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
  const esHttps = (req) => req.socket.encrypted || (trustProxy && req.headers["x-forwarded-proto"] === "https");

  function enviar(res, status, cuerpo, cabeceras = {}) {
    res.writeHead(status, { ...CABECERAS_SEGURIDAD, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cabeceras });
    res.end(JSON.stringify(cuerpo));
  }
  const responder = (res, r) => enviar(res, r.status, r.cuerpo, r.cabeceras);

  /* Lee un cuerpo JSON pequeño. Devuelve null y responde si algo falla. */
  function leerJSON(req, res) {
    return new Promise((resolve) => {
      if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) {
        enviar(res, 415, { ok: false, error: "Se esperaba JSON." });
        return resolve(null);
      }
      const trozos = [];
      let tam = 0;
      let cortado = false;
      req.on("data", (c) => {
        if (cortado) return;
        tam += c.length;
        if (tam > MAX_CUERPO) {
          cortado = true;
          enviar(res, 413, { ok: false, error: "Petición demasiado grande." });
          req.destroy();
          resolve(null);
          return;
        }
        trozos.push(c);
      });
      req.on("end", () => {
        if (cortado) return;
        try { resolve(JSON.parse(Buffer.concat(trozos).toString("utf8"))); } catch (e) {
          enviar(res, 400, { ok: false, error: "JSON no válido." });
          resolve(null);
        }
      });
      req.on("error", () => resolve(null));
    });
  }

  /* Página 404 del sitio (las rutas /api/ siguen respondiendo JSON) */
  function noEncontrado(req, res) {
    fs.readFile(path.join(RAIZ, "404.html"), (err, html) => {
      if (err) return enviar(res, 404, { ok: false, error: "No encontrado." });
      res.writeHead(404, { ...CABECERAS_SEGURIDAD, "Content-Type": MIME[".html"], "Content-Length": html.length, "Cache-Control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : html);
    });
  }

  function servirArchivo(req, res, ruta) {
    let rel;
    try { rel = decodeURIComponent(ruta); } catch (e) { rel = null; }
    if (rel === "/") rel = "/index.html";
    const archivo = rel && path.resolve(RAIZ, "." + path.posix.normalize(rel));
    if (!rel || rel.includes("\0") || PRIVADO.test(rel) || !archivo.startsWith(RAIZ + path.sep)) {
      return noEncontrado(req, res);
    }
    fs.stat(archivo, (err, st) => {
      if (err || !st.isFile()) return noEncontrado(req, res);
      res.writeHead(200, {
        ...CABECERAS_SEGURIDAD,
        "Content-Type": MIME[path.extname(archivo).toLowerCase()] || "application/octet-stream",
        "Content-Length": st.size,
        "Cache-Control": "no-cache"
      });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(archivo).pipe(res);
    });
  }

  async function api(req, res, ruta, url) {
    const m = req.method;

    if (m === "GET" && ruta === "/api/form-token") return enviar(res, 200, { ok: true, token: lista.crearToken() });

    const rppMatch = ruta.match(/^\/api\/rpp\/([a-z0-9]{4,32})$/);
    if (m === "GET" && rppMatch) {
      const r = await almacen.rppActivo(rppMatch[1]);
      return r ? enviar(res, 200, { ok: true, codigo: r.codigo, nombre: r.nombre }) : enviar(res, 404, { ok: false, error: "RPP no encontrado." });
    }

    if (m === "POST" && ruta === "/api/lista") {
      const datos = await leerJSON(req, res);
      if (datos === null) return;
      return responder(res, await lista.inscribir(datos, ipDe(req)));
    }

    if (m === "POST" && ruta === "/api/admin/login") {
      const datos = await leerJSON(req, res);
      if (datos === null) return;
      return responder(res, admin.login(datos, ipDe(req), esHttps(req)));
    }

    if (ruta.startsWith("/api/admin/")) {
      if (!admin.autorizado(req)) return enviar(res, 401, { ok: false, error: "Sesión no iniciada." });
      if (m === "POST" && ruta === "/api/admin/logout") return responder(res, admin.logout(req));
      if (m === "GET" && ruta === "/api/admin/noches") return enviar(res, 200, { ok: true, ...(await admin.noches()) });
      if (m === "GET" && ruta === "/api/admin/resumen") return responder(res, await admin.resumen(url.searchParams.get("fecha")));
      if (m === "GET" && ruta === "/api/admin/rpps") return responder(res, await admin.rpps());
      if (m === "GET" && ruta === "/api/admin/export.csv") {
        const fecha = url.searchParams.get("fecha");
        const texto = await admin.csv(fecha);
        if (texto === null) return enviar(res, 400, { ok: false, error: "Fecha no válida." });
        res.writeHead(200, {
          ...CABECERAS_SEGURIDAD,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="lista-${fecha}.csv"`,
          "Cache-Control": "no-store"
        });
        return res.end(texto);
      }
      const borrarMatch = ruta.match(/^\/api\/admin\/inscripcion\/([^/]+)$/);
      if (m === "DELETE" && borrarMatch) return responder(res, await admin.borrar(borrarMatch[1]));
    }

    return enviar(res, 404, { ok: false, error: "No encontrado." });
  }

  const servidor = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const ruta = url.pathname;
      if (ruta.startsWith("/api/")) return await api(req, res, ruta, url);
      if (req.method !== "GET" && req.method !== "HEAD") return enviar(res, 405, { ok: false, error: "Método no permitido." });
      servirArchivo(req, res, ruta);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) enviar(res, 500, { ok: false, error: "Error interno." });
    }
  });

  servidor.on("close", () => { lista.cerrar(); admin.cerrar(); });
  servidor.almacen = almacen;
  return servidor;
}

module.exports = { crearServidor, cargarEnv };

if (require.main === module) {
  cargarEnv();
  let claveAdmin = process.env.ADMIN_KEY;
  if (!claveAdmin) {
    claveAdmin = crypto.randomBytes(9).toString("base64url");
    console.warn(`\n  ADMIN_KEY no definida (ver .env.example). Clave temporal del panel: ${claveAdmin}\n`);
  }
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL !== !SUPABASE_SECRET_KEY) {
    console.error("\n  Falta SUPABASE_URL o SUPABASE_SECRET_KEY en .env: hacen falta las dos (o ninguna, para usar JSON).\n");
    process.exit(1);
  }
  const supabase = SUPABASE_URL ? { url: SUPABASE_URL, clave: SUPABASE_SECRET_KEY } : null;
  const puerto = Number(process.env.PORT) || 3000;
  crearServidor({
    claveAdmin,
    supabase,
    secreto: process.env.FORM_SECRET || undefined,
    trustProxy: process.env.TRUST_PROXY === "1"
  }).listen(puerto, () => {
    console.log(`  Botanic en http://localhost:${puerto}  ·  panel: http://localhost:${puerto}/admin.html`);
    console.log(supabase ? "  Datos: Supabase" : "  Datos: data/db (JSON). Para usar Supabase, define SUPABASE_URL y SUPABASE_SECRET_KEY.");
  });
}
