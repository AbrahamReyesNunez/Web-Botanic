"use strict";
/* RGPD: fuentes propias (Google no recibe la IP de cada visita) y aviso de privacidad enlazado */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { crearServidor } = require("../server/server.js");
const { crearGaleria } = require("../server/galeria.js");

const PUBLICA = path.resolve(__dirname, "..", "public");
const leer = (rel) => fs.readFileSync(path.join(PUBLICA, rel), "utf8");
const PAGINAS = ["index.html", "admin.html", "404.html", "privacidad.html"];

async function arrancar() {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), "botanic-"));
  fs.writeFileSync(path.join(datos, "rpps.json"), "[]");
  const servidor = crearServidor({ datos, claveAdmin: "clave-de-prueba", galeria: crearGaleria({ url: null }), registro: { aviso() {}, error() {}, cerrar() {} } });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return {
    base: `http://127.0.0.1:${servidor.address().port}`,
    cerrar: async () => {
      await servidor.almacen.esperar();
      servidor.closeAllConnections();
      await new Promise((r) => servidor.close(r));
      fs.rmSync(datos, { recursive: true, force: true });
    }
  };
}

test("ninguna página carga nada de Google Fonts", () => {
  for (const p of PAGINAS) {
    assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(leer(p)), p);
    assert.match(leer(p), /css\/fuentes\.css\?v=\d+/, `${p} usa las fuentes propias`);
  }
  for (const css of fs.readdirSync(path.join(PUBLICA, "css"))) {
    assert.ok(!/googleapis|gstatic/.test(leer(`css/${css}`)), css);
  }
});

test("la CSP solo permite fuentes y estilos propios", async () => {
  const s = await arrancar();
  try {
    const csp = (await fetch(`${s.base}/`)).headers.get("content-security-policy");
    assert.match(csp, /font-src 'self'(;|$)/);
    assert.ok(!/googleapis|gstatic/.test(csp), csp);
  } finally { await s.cerrar(); }
});

test("cada fuente de fuentes.css existe, es woff2, lleva su licencia y se sirve con caché larga", async () => {
  const urls = [...leer("css/fuentes.css").matchAll(/url\("\.\.\/fonts\/([^"?]+)\?v=\d+"\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 6);
  for (const archivo of urls) {
    const buf = fs.readFileSync(path.join(PUBLICA, "fonts", archivo));
    assert.equal(buf.subarray(0, 4).toString("ascii"), "wOF2", archivo);
  }
  for (const licencia of ["OFL-poiretone.txt", "OFL-spacegrotesk.txt", "OFL-unbounded.txt"]) {
    assert.match(fs.readFileSync(path.join(PUBLICA, "fonts", licencia), "utf8"), /SIL OPEN FONT LICENSE/i, licencia);
  }
  const s = await arrancar();
  try {
    const r = await fetch(`${s.base}/fonts/${urls[0]}?v=1`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "font/woff2");
    assert.match(r.headers.get("cache-control"), /immutable/);
  } finally { await s.cerrar(); }
});

test("el aviso de privacidad se sirve y está enlazado desde el pie y desde los dos formularios", async () => {
  assert.match(leer("index.html"), /<footer[\s\S]*href="privacidad\.html"[\s\S]*<\/footer>/);
  const app = leer("js/app.js");
  const notas = [...app.matchAll(/<p class="list-legal">([^]*?)<\/p>/g)].map((m) => m[1]);
  assert.equal(notas.length, 2, "lista y reservas");
  for (const n of notas) {
    assert.match(n, /href="privacidad\.html"/);
    assert.match(n, /30 días/);
  }
  const s = await arrancar();
  try {
    const r = await fetch(`${s.base}/privacidad.html`);
    assert.equal(r.status, 200);
    const html = await r.text();
    for (const apartado of ["Quién es el responsable", "Qué datos tratamos", "base legal", "Cuánto tiempo", "Con quién se comparten", "Tus derechos", "aepd.es"]) {
      assert.ok(html.includes(apartado), apartado);
    }
    assert.ok(!/COMPLETAR/i.test(html), "no queda nada por rellenar");
  } finally { await s.cerrar(); }
});

test("el contacto del aviso coincide con el WhatsApp de la web (public/data/config.js)", async () => {
  const s = await arrancar();
  try {
    const wa = /whatsapp:\s*"(\d+)"/.exec(leer("data/config.js"))[1];
    assert.ok((await (await fetch(`${s.base}/privacidad.html`)).text()).includes(`https://wa.me/${wa}`));
  } finally { await s.cerrar(); }
});
