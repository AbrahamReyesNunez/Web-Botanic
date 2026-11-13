"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { crearServidor } = require("../server/server.js");
const { crearGaleria, limpiar } = require("../server/galeria.js");

const ID1 = "1AbCdEfGhIjKlMnOp";
const ID2 = "1ZyXwVuTsRqPoNmLk";
const ALBUMES = [{ id: ID1, nombre: "Halloween", creado: 1700000000000, fotos: [{ id: ID2, nombre: "portada.jpg" }] }];

/* Apps Script falso: cuenta las llamadas y responde lo que se le diga */
function scriptFalso() {
  const f = async () => {
    f.llamadas++;
    if (f.falla) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => f.respuesta };
  };
  f.llamadas = 0;
  f.falla = false;
  f.respuesta = ALBUMES;
  return f;
}

test("la galería llama a Google una vez y reparte la copia mientras no caduque", async () => {
  let t = 0;
  const fetch = scriptFalso();
  const g = crearGaleria({ url: "https://script.google.com/x", fetch, ttlMs: 1000, ahora: () => t });
  const [a, b] = await Promise.all([g.obtener(), g.obtener()]);
  assert.equal(fetch.llamadas, 1, "dos visitas a la vez comparten la misma llamada");
  assert.equal(a, b);
  assert.deepEqual(JSON.parse(a.texto).albumes, ALBUMES);

  t = 500;
  await g.obtener();
  assert.equal(fetch.llamadas, 1);

  // Caducada: responde con la copia al momento y la renueva por detrás
  t = 2000;
  fetch.respuesta = [];
  const vieja = await g.obtener();
  assert.deepEqual(JSON.parse(vieja.texto).albumes, ALBUMES);
  await g.refrescar();
  assert.deepEqual(JSON.parse((await g.obtener()).texto).albumes, []);
});

test("si Google falla se sigue sirviendo la última copia", async () => {
  let t = 0;
  const fetch = scriptFalso();
  const g = crearGaleria({ url: "https://script.google.com/x", fetch, ttlMs: 1000, ahora: () => t });
  await g.obtener();
  t = 5000;
  fetch.falla = true;
  const original = console.error;
  console.error = () => {};
  try {
    await g.refrescar();
    assert.deepEqual(JSON.parse((await g.obtener()).texto).albumes, ALBUMES);
  } finally { console.error = original; }
});

test("la galería solo pasa los campos que usa la web, con tipos válidos", () => {
  const limpio = limpiar([
    { id: ID1, nombre: "Bien", creado: 1, fotos: [{ id: ID2, nombre: "a.jpg", extra: "x" }, { id: "<script>", nombre: "mal" }], extra: 1 },
    { nombre: 42 },
    null
  ]);
  assert.deepEqual(limpio, [{ id: ID1, nombre: "Bien", creado: 1, fotos: [{ id: ID2, nombre: "a.jpg" }] }]);
});

test("/api/galeria sirve la copia del servidor con ETag", async () => {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), "botanic-"));
  fs.writeFileSync(path.join(datos, "rpps.json"), "[]");
  const fetchFalso = scriptFalso();
  const servidor = crearServidor({ datos, claveAdmin: "clave-de-prueba", galeria: crearGaleria({ url: "https://script.google.com/x", fetch: fetchFalso }) });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const r = await fetch(`${base}/api/galeria`);
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).albumes, ALBUMES);
    assert.equal((await fetch(`${base}/api/galeria`, { headers: { "If-None-Match": r.headers.get("etag") } })).status, 304);
    assert.equal(fetchFalso.llamadas, 1);
  } finally {
    await servidor.almacen.esperar();
    servidor.closeAllConnections();
    await new Promise((r) => servidor.close(r));
    fs.rmSync(datos, { recursive: true, force: true });
  }
});

test("/api/galeria responde 503 sin script configurado", async () => {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), "botanic-"));
  fs.writeFileSync(path.join(datos, "rpps.json"), "[]");
  const servidor = crearServidor({ datos, claveAdmin: "clave-de-prueba", galeria: crearGaleria({ url: null }) });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  try {
    assert.equal((await fetch(`http://127.0.0.1:${servidor.address().port}/api/galeria`)).status, 503);
  } finally {
    await servidor.almacen.esperar();
    servidor.closeAllConnections();
    await new Promise((r) => servidor.close(r));
    fs.rmSync(datos, { recursive: true, force: true });
  }
});
