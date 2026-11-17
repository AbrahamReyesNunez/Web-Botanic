"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const zlib = require("node:zlib");
const { crearServidor } = require("../server/server.js");
const { crearGaleria } = require("../server/galeria.js");

const RAIZ = path.resolve(__dirname, "..");

async function arrancar(opciones = {}) {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), "botanic-"));
  fs.writeFileSync(path.join(datos, "rpps.json"), "[]");
  const servidor = crearServidor({ datos, claveAdmin: "clave-de-prueba", galeria: crearGaleria({ url: null }), ...opciones });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  return {
    base,
    cerrar: async () => {
      await servidor.almacen.esperar();
      servidor.closeAllConnections();
      await new Promise((r) => servidor.close(r));
      fs.rmSync(datos, { recursive: true, force: true });
    }
  };
}

/* fetch descomprime solo: para ver los bytes que viajan se usa http.get */
function pedir(url, cabeceras = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers: cabeceras }, (res) => {
      const trozos = [];
      res.on("data", (c) => trozos.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, cuerpo: Buffer.concat(trozos) }));
    }).on("error", reject);
  });
}

/* La ruta tal cual, sin que el cliente la normalice (new URL convierte /a/../b en /b) */
function pedirCruda(base, ruta) {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    http.request({ hostname, port, path: ruta }, (res) => {
      const trozos = [];
      res.on("data", (c) => trozos.push(c));
      res.on("end", () => resolve({ status: res.statusCode, cuerpo: Buffer.concat(trozos) }));
    }).on("error", reject).end();
  });
}

test("los archivos de texto se comprimen con brotli o gzip según lo que acepte el navegador", async () => {
  const s = await arrancar();
  try {
    const original = fs.readFileSync(path.join(RAIZ, "public", "css", "styles.css"));

    const br = await pedir(`${s.base}/css/styles.css`, { "Accept-Encoding": "gzip, deflate, br" });
    assert.equal(br.status, 200);
    assert.equal(br.headers["content-encoding"], "br");
    assert.equal(br.headers.vary, "Accept-Encoding");
    assert.ok(br.cuerpo.length < original.length / 2, "brotli debe reducir el CSS a menos de la mitad");
    assert.deepEqual(zlib.brotliDecompressSync(br.cuerpo), original);

    const gz = await pedir(`${s.base}/css/styles.css`, { "Accept-Encoding": "gzip" });
    assert.equal(gz.headers["content-encoding"], "gzip");
    assert.deepEqual(zlib.gunzipSync(gz.cuerpo), original);

    const plano = await pedir(`${s.base}/css/styles.css`);
    assert.equal(plano.headers["content-encoding"], undefined);
    assert.deepEqual(plano.cuerpo, original);
    assert.notEqual(plano.headers.etag, br.headers.etag, "cada formato tiene su ETag");

    // Las imágenes ya están comprimidas: van tal cual
    const img = await pedir(`${s.base}/img/brand/icono-48.png`, { "Accept-Encoding": "br" });
    assert.equal(img.headers["content-encoding"], undefined);
    assert.equal(img.headers["cache-control"], "public, max-age=604800");
  } finally { await s.cerrar(); }
});

test("ETag y 304: la visita repetida no vuelve a descargar lo que no ha cambiado", async () => {
  const s = await arrancar();
  try {
    const primera = await pedir(`${s.base}/`, { "Accept-Encoding": "br" });
    assert.equal(primera.status, 200);
    assert.equal(primera.headers["cache-control"], "no-cache");
    assert.ok(primera.headers.etag);

    const repetida = await pedir(`${s.base}/`, { "Accept-Encoding": "br", "If-None-Match": primera.headers.etag });
    assert.equal(repetida.status, 304);
    assert.equal(repetida.cuerpo.length, 0);

    // Con otro ETag (archivo cambiado) se descarga de nuevo
    assert.equal((await pedir(`${s.base}/`, { "Accept-Encoding": "br", "If-None-Match": '"otro"' })).status, 200);

    // Con ?v= en la URL se guarda un año sin preguntar
    const versionado = await pedir(`${s.base}/js/app.js?v=19`);
    assert.equal(versionado.headers["cache-control"], "public, max-age=31536000, immutable");
  } finally { await s.cerrar(); }
});

test("/api/web.js lleva ETag y responde 304 si no ha cambiado", async () => {
  const s = await arrancar();
  try {
    const r = await fetch(`${s.base}/api/web.js`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /^window\.BOTANIC_WEB = /);
    const etag = r.headers.get("etag");
    assert.ok(etag);
    assert.equal((await fetch(`${s.base}/api/web.js`, { headers: { "If-None-Match": etag } })).status, 304);
  } finally { await s.cerrar(); }
});

test("una descarga cortada a medias no deja el archivo abierto ni tumba el servidor", async () => {
  const s = await arrancar();
  try {
    await new Promise((resolve) => {
      const req = http.get(`${s.base}/img/brand/hojas-arriba-2560.webp`, (res) => {
        res.once("data", () => { req.destroy(); resolve(); });
      });
      req.on("error", () => {});
    });
    assert.equal((await fetch(`${s.base}/`)).status, 200);
  } finally { await s.cerrar(); }
});

test("la página 404 se sirve en HTML", async () => {
  const s = await arrancar();
  try {
    for (let i = 0; i < 2; i++) {
      const r = await fetch(`${s.base}/no/existe.html`);
      assert.equal(r.status, 404);
      assert.match(await r.text(), /<html/i);
    }
  } finally { await s.cerrar(); }
});

test("E1/E3: rutas raras no salen de public/ (barras invertidas, //, %2F, mayúsculas, puntos y espacios finales)", async () => {
  const s = await arrancar();
  try {
    const rutas = [
      "/%5C.env", "/%5c.env", "/..%5C.env", "/%5C..%5C.env", "/%2e%2e%5c.env", "/js/..%5C..%5C.env",
      "/.env", "/.git/config", "/%2E%65nv",
      "/data/db/rpps.json", "/data//db/rpps.json", "/%2Fdata/db/rpps.json", "//data/db/rpps.json",
      "/server/server.js", "/SERVER/server.js", "/README.md", "/README.md/", "/package.json",
      "/documentacion/", "/supabase/migrations/001_inicial.sql", "/public/index.html",
      "/js/../../.env", "/js/%2e%2e/%2e%2e/.env", "/..%2f..%2fWindows/win.ini",
      "/index.html.", "/index.html%20", "/index.html::$DATA", "/index.html%3A%3A$DATA",
      "/js/", "/js/compartido", "/%00index.html", "/%E0%A4%A"
    ];
    for (const ruta of rutas) {
      const r = await pedirCruda(s.base, ruta);
      assert.equal(r.status, 404, ruta);
      assert.doesNotMatch(r.cuerpo.toString("utf8"), /SUPABASE|ADMIN_KEY|"codigo"|crearServidor/, ruta);
    }
    // Lo público sigue funcionando
    for (const ruta of ["/", "/index.html", "/admin.html", "/data/config.js", "/js/compartido/dom.js", "/img/brand/icono-48.png"]) {
      assert.equal((await pedir(s.base + ruta)).status, 200, ruta);
    }
  } finally { await s.cerrar(); }
});
