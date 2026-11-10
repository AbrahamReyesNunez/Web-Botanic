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
const { crearTokens } = require("./formulario.js");
const { crearReservas } = require("./reservas.js");
const { crearContenido } = require("./contenido.js");
const { crearDrive } = require("./drive.js");

const RAIZ = path.resolve(__dirname, "..");
const MAX_CUERPO = 1024;
const MAX_CUERPO_RESERVA = 8 * 1024; // pedido de hasta 40 líneas y comentario de 500 caracteres
const MAX_CUERPO_PANEL = 16 * 1024;  // evento o ajustes de un álbum (hasta 200 fotos ancladas)
const MAX_FOTO = 6 * 1024 * 1024;    // fotos de eventos (el panel ya las reduce antes de subirlas)

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon"
};

/* Rutas que nunca se sirven como archivos */
const PRIVADO = /^\/(server|test|node_modules|supabase|documentacion|google-apps-script|data\/db)(\/|$)|^\/(package(-lock)?\.json|README\.md)$|(^|\/)\./;

const CABECERAS_SEGURIDAD = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    // Galería: miniaturas de Google Drive y álbumes desde el Google Apps Script (data/config.js)
    "img-src 'self' data: https://drive.google.com https://lh3.googleusercontent.com",
    "frame-src https://www.google.com",
    "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
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

/* data/config.js y data/reservados.js son scripts de navegador: se ejecutan con un window falso */
function leerDatosWeb(archivo, variable) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "data", archivo), "utf8"), ctx);
  return ctx.window[variable];
}
const leerConfig = () => leerDatosWeb("config.js", "BOTANIC_CONFIG");

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
  let contenido = null;
  // Los días cerrados o abiertos desde el panel mandan sobre data/config.js
  const cal = crearCalendario(cfg, opciones.ahora || ahoraMadrid, () => (contenido ? contenido.dias() : {}));
  const almacen = opciones.supabase
    ? crearAlmacenSupabase(opciones.supabase)
    : crearAlmacen(opciones.datos || path.join(RAIZ, "data", "db"));
  const tokens = crearTokens({ secreto: opciones.secreto || crypto.randomBytes(32), ...opciones.tokens });
  const lista = crearLista({ almacen, cal, cfg, tokens });
  const reservas = crearReservas({ almacen, cal, cat: leerDatosWeb("reservados.js", "BOTANIC_RESERVADOS"), tokens });
  const admin = crearAdmin({ almacen, cal, claveAdmin: opciones.claveAdmin });
  const drive = opciones.drive || crearDrive({ url: (cfg.galeria || {}).scriptUrl, clave: opciones.driveClave });
  contenido = crearContenido({ almacen, cal, drive });
  const trustProxy = !!opciones.trustProxy;

  // Detrás de un proxy, la IP real es la ÚLTIMA de X-Forwarded-For: la añade el proxy.
  // Las anteriores las puede escribir el propio visitante para saltarse los límites por IP.
  const ipDe = (req) => (trustProxy && String(req.headers["x-forwarded-for"] || "").split(",").pop().trim()) || req.socket.remoteAddress || "?";
  const esHttps = (req) => req.socket.encrypted || (trustProxy && req.headers["x-forwarded-proto"] === "https");

  function enviar(res, status, cuerpo, cabeceras = {}) {
    res.writeHead(status, { ...CABECERAS_SEGURIDAD, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cabeceras });
    res.end(JSON.stringify(cuerpo));
  }
  const responder = (res, r) => enviar(res, r.status, r.cuerpo, r.cabeceras);

  /* Lee un cuerpo JSON pequeño. Devuelve null y responde si algo falla. */
  function leerJSON(req, res, max = MAX_CUERPO) {
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
        if (tam > max) {
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

  /* Lee el cuerpo binario de una foto. Devuelve null y responde si algo falla. */
  function leerFoto(req, res) {
    return new Promise((resolve) => {
      if (!/^image\/(jpeg|png|webp)\b/i.test(req.headers["content-type"] || "")) {
        enviar(res, 415, { ok: false, error: "La foto debe ser JPG, PNG o WebP." });
        return resolve(null);
      }
      const trozos = [];
      let tam = 0;
      let cortado = false;
      req.on("data", (c) => {
        if (cortado) return;
        tam += c.length;
        if (tam > MAX_FOTO) {
          cortado = true;
          enviar(res, 413, { ok: false, error: "La foto es demasiado grande (máximo 6 MB)." });
          req.destroy();
          resolve(null);
          return;
        }
        trozos.push(c);
      });
      req.on("end", () => { if (!cortado) resolve(Buffer.concat(trozos)); });
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

    // Contenido editable de la web (eventos, días y galería) como script: se carga antes que app.js
    if (m === "GET" && ruta === "/api/web.js") {
      res.writeHead(200, { ...CABECERAS_SEGURIDAD, "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
      return res.end(contenido.script());
    }

    if (m === "GET" && ruta === "/api/form-token") return enviar(res, 200, { ok: true, token: tokens.crear() });

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
    if (m === "GET" && ruta === "/api/reservas/disponibilidad") return responder(res, await reservas.disponibilidad());

    if (m === "POST" && ruta === "/api/reservas") {
      const datos = await leerJSON(req, res, MAX_CUERPO_RESERVA);
      if (datos === null) return;
      return responder(res, await reservas.crear(datos, ipDe(req)));
    }

    if (m === "POST" && ruta === "/api/admin/login") {
      const datos = await leerJSON(req, res);
      if (datos === null) return;
      return responder(res, admin.login(datos, ipDe(req), esHttps(req)));
    }

    if (ruta.startsWith("/api/admin/")) {
      if (!admin.autorizado(req)) return enviar(res, 401, { ok: false, error: "Sesión no iniciada." });
      if (m === "POST" && ruta === "/api/admin/logout") return responder(res, admin.logout(req));
      // ---------- Contenido de la web ----------
      if (m === "GET" && ruta === "/api/admin/contenido") return enviar(res, 200, { ok: true, ...contenido.todo(), driveConfigurado: drive.configurado });
      if (m === "POST" && ruta === "/api/admin/foto") {
        const foto = await leerFoto(req, res);
        if (foto === null) return;
        return responder(res, await contenido.subirFoto(foto));
      }
      const eventoMatch = ruta.match(/^\/api\/admin\/evento\/(\d{4}-\d{2}-\d{2})$/);
      if (eventoMatch && m === "PUT") {
        const datos = await leerJSON(req, res, MAX_CUERPO_PANEL);
        if (datos === null) return;
        return responder(res, await contenido.guardarEvento(eventoMatch[1], datos));
      }
      if (eventoMatch && m === "DELETE") return responder(res, await contenido.borrarEvento(eventoMatch[1]));
      const diaMatch = ruta.match(/^\/api\/admin\/dia\/(\d{4}-\d{2}-\d{2})$/);
      if (diaMatch && m === "PUT") {
        const datos = await leerJSON(req, res, MAX_CUERPO_PANEL);
        if (datos === null) return;
        return responder(res, await contenido.guardarDia(diaMatch[1], datos));
      }
      const albumMatch = ruta.match(/^\/api\/admin\/album\/([A-Za-z0-9_-]{10,100})$/);
      if (albumMatch && m === "PUT") {
        const datos = await leerJSON(req, res, MAX_CUERPO_PANEL);
        if (datos === null) return;
        return responder(res, await contenido.guardarAlbum(albumMatch[1], datos));
      }
      if (m === "PUT" && ruta === "/api/admin/tema") {
        const datos = await leerJSON(req, res);
        if (datos === null) return;
        return responder(res, await contenido.guardarTema(datos));
      }

      // ---------- Lista, RPPs y reservados (sin panel por ahora; la API se mantiene para la app) ----------
      if (m === "GET" && ruta === "/api/admin/noches") return enviar(res, 200, { ok: true, ...(await admin.noches()) });
      if (m === "GET" && ruta === "/api/admin/resumen") return responder(res, await admin.resumen(url.searchParams.get("fecha")));
      if (m === "GET" && ruta === "/api/admin/reservas") return responder(res, await admin.reservas(url.searchParams.get("fecha")));
      if (m === "GET" && ruta === "/api/admin/rpps") return responder(res, await admin.rpps());
      if (m === "POST" && ruta === "/api/admin/rpps") {
        const datos = await leerJSON(req, res);
        if (datos === null) return;
        return responder(res, await admin.crearRpp(datos));
      }
      const rppAdminMatch = ruta.match(/^\/api\/admin\/rpp\/([a-z0-9]{4,32})$/);
      if (m === "PATCH" && rppAdminMatch) {
        const datos = await leerJSON(req, res);
        if (datos === null) return;
        return responder(res, await admin.actualizarRpp(rppAdminMatch[1], datos));
      }
      if (m === "DELETE" && rppAdminMatch) return responder(res, await admin.eliminarRpp(rppAdminMatch[1]));
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

  servidor.on("close", () => { lista.cerrar(); reservas.cerrar(); admin.cerrar(); });
  servidor.almacen = almacen;
  servidor.listo = contenido.listo;
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
  const servidor = crearServidor({
    claveAdmin,
    supabase,
    secreto: process.env.FORM_SECRET || undefined,
    driveClave: process.env.DRIVE_SCRIPT_CLAVE || undefined,
    trustProxy: process.env.TRUST_PROXY === "1"
  });
  servidor.listo.then(() => servidor.listen(puerto, () => {
    console.log(`  Botanic en http://localhost:${puerto}  ·  panel: http://localhost:${puerto}/admin.html`);
    console.log(supabase ? "  Datos: Supabase" : "  Datos: data/db (JSON). Para usar Supabase, define SUPABASE_URL y SUPABASE_SECRET_KEY.");
    if (!process.env.DRIVE_SCRIPT_CLAVE) console.log("  Sin DRIVE_SCRIPT_CLAVE: el panel no podrá subir fotos de eventos a Drive (ver .env.example).");
  }));
}
