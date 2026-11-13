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
const zlib = require("node:zlib");
const { pipeline } = require("node:stream");
const { promisify } = require("node:util");

const crearCalendario = require("../public/js/compartido/calendario.js");
const { crearAlmacen } = require("./almacen.js");
const { crearAlmacenSupabase } = require("./almacen-supabase.js");
const { crearLista } = require("./lista.js");
const { crearAdmin } = require("./admin.js");
const { crearTokens } = require("./formulario.js");
const { crearReservas } = require("./reservas.js");
const { crearContenido } = require("./contenido.js");
const { crearDrive } = require("./drive.js");
const { crearGaleria } = require("./galeria.js");

const RAIZ = path.resolve(__dirname, "..");
/* Lo único que se sirve como archivos: la web. .env, data/db, el código y la documentación quedan fuera */
const PUBLICA = path.join(RAIZ, "public");
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

/* ---------- Caché del navegador y compresión de los archivos de la web ---------- */
const COMPRIMIBLE = new Set([".html", ".css", ".js", ".json", ".svg"]);
const IMAGEN = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".ico"]);
const MAX_COMPRIMIR = 2 * 1024 * 1024;   // más grande que esto se envía tal cual
const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

/* Brotli si el navegador lo acepta (≈ 75 % menos), si no gzip */
function formatoAceptado(req) {
  const acepta = String(req.headers["accept-encoding"] || "");
  if (/\bbr\b(?!;q=0(\.0*)?\b)/.test(acepta)) return "br";
  if (/\bgzip\b(?!;q=0(\.0*)?\b)/.test(acepta)) return "gzip";
  return null;
}

/* CSS y JS llevan ?v= en el HTML: con la versión en la URL se pueden guardar un año sin preguntar.
   Las imágenes, una semana (para cambiar una, cambiadle el nombre o añadid ?v=).
   Lo demás (HTML, data/*.js…) se guarda pero se pregunta cada vez con el ETag: si no ha cambiado, 304 sin cuerpo */
function cacheDe(ext, url) {
  if (url && url.searchParams.has("v")) return "public, max-age=31536000, immutable";
  if (IMAGEN.has(ext)) return "public, max-age=604800";
  return "no-cache";
}

/* ¿El navegador ya tiene esta versión? (If-None-Match puede traer varias, con o sin W/) */
function coincideEtag(req, etag) {
  const pedido = req.headers["if-none-match"];
  if (!pedido) return false;
  return pedido.trim() === "*" || pedido.split(",").some((e) => e.trim().replace(/^W\//, "") === etag);
}

/* Archivo de public/ que corresponde a una ruta, o null si la ruta no es válida.
   Se decide sobre la ruta ya decodificada y resuelta, no sobre lo que escribe el visitante:
   - nada de \ (Windows la toma como separador: /%5C.env salía de la carpeta), \0 ni : (flujos de NTFS)
   - ningún segmento vacío (//), oculto (.env, .git, ..) ni que acabe en punto o espacio
     (Windows los ignora: "a.html." abre "a.html")
   - el resultado tiene que quedar dentro de public/ */
function archivoPublico(ruta) {
  let rel;
  try { rel = decodeURIComponent(ruta); } catch (e) { return null; }
  if (rel === "/") rel = "/index.html";
  if (!rel.startsWith("/") || /[\\\0:]/.test(rel)) return null;
  const segmentos = rel.slice(1).split("/");
  if (segmentos.some((s) => !s || s.startsWith(".") || /[. ]$/.test(s))) return null;
  const archivo = path.resolve(PUBLICA, ...segmentos);
  const dentro = path.relative(PUBLICA, archivo);
  if (!dentro || dentro.startsWith("..") || path.isAbsolute(dentro)) return null;
  return archivo;
}

const CABECERAS_SEGURIDAD = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    // Galería: miniaturas de Google Drive y álbumes desde el Google Apps Script (public/data/config.js)
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

/* public/data/config.js y public/data/reservados.js son scripts de navegador: se ejecutan con un window falso */
function leerDatosWeb(archivo, variable) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(PUBLICA, "data", archivo), "utf8"), ctx);
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
  // Los días cerrados o abiertos desde el panel mandan sobre public/data/config.js
  const cal = crearCalendario(cfg, opciones.ahora || ahoraMadrid, () => (contenido ? contenido.dias() : {}));
  const almacen = opciones.supabase
    ? crearAlmacenSupabase(opciones.supabase)
    : crearAlmacen(opciones.datos || path.join(RAIZ, "data", "db"));
  const secreto = opciones.secreto || crypto.randomBytes(32);
  const tokens = crearTokens({ secreto, ...opciones.tokens });
  // Huella de la IP para cada alta de la lista: con FORM_SECRET fijo, la misma IP da la misma huella
  // entre reinicios; sin la clave no se puede volver a la IP
  const huella = (ip) => crypto.createHmac("sha256", secreto).update(`origen:${ip}`).digest("base64url").slice(0, 22);
  const lista = crearLista({ almacen, cal, cfg, tokens, huella });
  const reservas = crearReservas({ almacen, cal, cat: leerDatosWeb("reservados.js", "BOTANIC_RESERVADOS"), tokens });
  const admin = crearAdmin({ almacen, cal, claveAdmin: opciones.claveAdmin });
  const drive = opciones.drive || crearDrive({ url: (cfg.galeria || {}).scriptUrl, clave: opciones.driveClave });
  contenido = crearContenido({ almacen, cal, drive });
  const galeria = opciones.galeria || crearGaleria({ url: (cfg.galeria || {}).scriptUrl });
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
        let datos;
        try { datos = JSON.parse(Buffer.concat(trozos).toString("utf8")); } catch (e) { datos = undefined; }
        // Solo objetos: null es JSON válido, pero aquí null significa "ya he respondido con un error",
        // y la petición se quedaba sin respuesta
        if (datos === null || typeof datos !== "object" || Array.isArray(datos)) {
          enviar(res, 400, { ok: false, error: datos === undefined ? "JSON no válido." : "Se esperaba un objeto JSON." });
          return resolve(null);
        }
        resolve(datos);
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

  /* Página 404 del sitio (las rutas /api/ siguen respondiendo JSON). Se lee del disco una sola vez */
  let pagina404 = null;
  function noEncontrado(req, res) {
    if (!pagina404) {
      pagina404 = fs.promises.readFile(path.join(PUBLICA, "404.html"));
      pagina404.catch(() => { pagina404 = null; });   // si falla, se reintenta en el siguiente 404
    }
    pagina404.then((html) => {
      res.writeHead(404, { ...CABECERAS_SEGURIDAD, "Content-Type": MIME[".html"], "Content-Length": html.length, "Cache-Control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : html);
    }, () => enviar(res, 404, { ok: false, error: "No encontrado." }));
  }

  /* Archivos de texto comprimidos en memoria: { archivo → { version, br?, gzip? } } (Promise<Buffer> por formato).
     Se rehacen solo si cambia el archivo (tamaño o fecha) */
  const comprimidos = new Map();
  function comprimido(archivo, st, formato) {
    const version = `${st.size}-${st.mtimeMs}`;
    let e = comprimidos.get(archivo);
    if (!e || e.version !== version) comprimidos.set(archivo, e = { version });
    if (!e[formato]) {
      e[formato] = fs.promises.readFile(archivo).then((buf) => formato === "br"
        ? brotli(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } })
        : gzip(buf, { level: 9 }));
      e[formato].catch(() => { if (comprimidos.get(archivo) === e) delete e[formato]; });
    }
    return e[formato];
  }

  function servirArchivo(req, res, ruta, url) {
    const archivo = archivoPublico(ruta);
    if (!archivo) return noEncontrado(req, res);
    fs.stat(archivo, async (err, st) => {
      if (err || !st.isFile()) return noEncontrado(req, res);
      const ext = path.extname(archivo).toLowerCase();
      const formato = COMPRIMIBLE.has(ext) && st.size <= MAX_COMPRIMIR ? formatoAceptado(req) : null;
      // El ETag cambia si cambia el archivo; cada formato (br, gzip, sin comprimir) tiene el suyo
      const etag = `"${st.size.toString(36)}-${Math.trunc(st.mtimeMs).toString(36)}${formato ? `-${formato}` : ""}"`;
      const cabeceras = {
        ...CABECERAS_SEGURIDAD,
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": cacheDe(ext, url),
        ETag: etag,
        ...(COMPRIMIBLE.has(ext) ? { Vary: "Accept-Encoding" } : {})
      };
      if (coincideEtag(req, etag)) {
        res.writeHead(304, cabeceras);
        return res.end();
      }
      if (formato) {
        let cuerpo;
        try { cuerpo = await comprimido(archivo, st, formato); } catch (e) { return noEncontrado(req, res); }
        res.writeHead(200, { ...cabeceras, "Content-Encoding": formato, "Content-Length": cuerpo.length });
        return res.end(req.method === "HEAD" ? undefined : cuerpo);
      }
      res.writeHead(200, { ...cabeceras, "Content-Length": st.size });
      if (req.method === "HEAD") return res.end();
      // pipeline cierra el archivo aunque el visitante corte la descarga, y recoge los errores de lectura
      pipeline(fs.createReadStream(archivo), res, () => {});
    });
  }

  async function api(req, res, ruta, url) {
    const m = req.method;

    // Contenido editable de la web (eventos, días y galería) como script: se carga antes que app.js
    if (m === "GET" && ruta === "/api/web.js") {
      const { texto, etag } = contenido.publico();
      const cabeceras = { ...CABECERAS_SEGURIDAD, "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", ETag: etag };
      if (coincideEtag(req, etag)) {
        res.writeHead(304, cabeceras);
        return res.end();
      }
      res.writeHead(200, cabeceras);
      return res.end(texto);
    }

    // Álbumes de la galería: copia del Google Apps Script que el servidor renueva cada 10 min
    if (m === "GET" && ruta === "/api/galeria") {
      if (!galeria.configurada) return enviar(res, 503, { ok: false, error: "Falta galeria.scriptUrl en public/data/config.js." });
      let copia;
      try { copia = await galeria.obtener(); } catch (e) {
        return enviar(res, 502, { ok: false, error: "No se ha podido leer la galería de Google Drive." });
      }
      const cabeceras = { ...CABECERAS_SEGURIDAD, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", ETag: copia.etag };
      if (coincideEtag(req, copia.etag)) {
        res.writeHead(304, cabeceras);
        return res.end();
      }
      res.writeHead(200, cabeceras);
      return res.end(copia.texto);
    }

    if (m === "GET" && ruta === "/api/form-token") return enviar(res, 200, { ok: true, token: tokens.crear() });

    const rppMatch = ruta.match(/^\/api\/rpp\/([a-z0-9]{4,32})$/);
    if (m === "GET" && rppMatch) {
      const r = await almacen.rppActivo(rppMatch[1]);
      return r ? enviar(res, 200, { ok: true, codigo: r.codigo, nombre: r.nombre }) : enviar(res, 404, { ok: false, error: "RPP no encontrado." });
    }

    // Sin el contenido del panel no se sabe qué noches están cerradas: no se apunta ni se reserva nada
    if (m === "POST" && (ruta === "/api/lista" || ruta === "/api/reservas") && !contenido.cargado()) {
      return enviar(res, 503, { ok: false, error: "Ahora mismo no podemos guardar tu petición. Inténtalo de nuevo en un momento." }, { "Retry-After": "30" });
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

      // ---------- Lista, RPPs y reservados: API para la futura app (sin panel en la web) ----------
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
      servirArchivo(req, res, ruta, url);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) enviar(res, 500, { ok: false, error: "Error interno." });
    }
  });

  // Ninguna conexión se queda abierta sin límite: cabeceras en 20 s; la petición entera (fotos de 6 MB
  // del panel incluidas) en 2 min; y una conexión sin movimiento se cierra a los 2 min
  servidor.headersTimeout = 20_000;
  servidor.requestTimeout = 120_000;
  servidor.setTimeout(120_000);

  servidor.on("close", () => { lista.cerrar(); reservas.cerrar(); admin.cerrar(); });
  servidor.almacen = almacen;
  servidor.galeria = galeria;
  servidor.listo = contenido.listo;
  return servidor;
}

module.exports = { crearServidor, cargarEnv, archivoPublico };

if (require.main === module) {
  // Un error que nadie recoge deja el servidor en un estado desconocido: se registra y se sale,
  // y el supervisor (pm2, servicio de Windows, systemd…) lo vuelve a arrancar limpio
  process.on("uncaughtException", (e) => { console.error("Error no controlado:", e); process.exit(1); });
  process.on("unhandledRejection", (e) => { console.error("Promesa rechazada sin controlar:", e); process.exit(1); });
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
    // La primera visita ya encuentra la galería en memoria
    if (servidor.galeria.configurada) servidor.galeria.refrescar().catch(() => {});
    // Supabase gratuito pausa el proyecto tras 7 días sin actividad: una consulta cada 12 h lo evita
    // mientras el servidor esté encendido. Si falla, se avisa (puede que ya esté pausado)
    if (supabase) {
      setInterval(() => servidor.almacen.latido().catch((e) => console.error(
        `\n  ✘ Supabase no responde (${e.message}). Si el proyecto está pausado, reactívalo en supabase.com → tu proyecto → Restore.\n`
      )), 12 * 60 * 60 * 1000).unref();
    }
  }));
}
