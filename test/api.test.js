"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { crearServidor } = require("../server/server.js");

// Miércoles 14/10/2026 a las 12:00: hay lista para esa noche
const AHORA = () => new Date(2026, 9, 14, 12, 0, 0);
const NOCHE = "2026-10-14";
const RPPS = [
  { codigo: "aaaa1111", nombre: "Prueba 1", activo: true },
  { codigo: "bbbb2222", nombre: "Prueba 2", activo: true },
  { codigo: "cccc3333", nombre: "Inactivo", activo: false }
];

async function arrancar(opciones = {}) {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), "botanic-"));
  fs.writeFileSync(path.join(datos, "rpps.json"), JSON.stringify(RPPS));
  const servidor = crearServidor({ datos, claveAdmin: "clave-de-prueba", ahora: AHORA, lista: { tokenMinMs: 0 }, ...opciones });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  return {
    base,
    datos,
    servidor,
    cerrar: async () => {
      await servidor.almacen.esperar();
      servidor.closeAllConnections();
      await new Promise((r) => servidor.close(r));
      fs.rmSync(datos, { recursive: true, force: true });
    }
  };
}

const token = async (base) => (await (await fetch(`${base}/api/form-token`)).json()).token;

async function inscribir(base, cuerpo, { conToken = true } = {}) {
  const body = { fecha: NOCHE, ...cuerpo };
  if (conToken && !("token" in cuerpo)) body.token = await token(base);
  const r = await fetch(`${base}/api/lista`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json() };
}

const guardadas = (s) => {
  const f = path.join(s.datos, "inscripciones.json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
};

test("inscripción sin RPP y con RPP del link", async () => {
  const s = await arrancar();
  try {
    let r = await inscribir(s.base, { nombre: "  maría   lópez " });
    assert.equal(r.status, 201);
    assert.equal(r.j.nombre, "María López");
    assert.equal(r.j.rpp, null);

    r = await inscribir(s.base, { nombre: "Pedro Gómez", rpp: "aaaa1111" });
    assert.equal(r.status, 201);
    assert.equal(r.j.rpp, "Prueba 1");

    await s.servidor.almacen.esperar();
    const g = guardadas(s);
    assert.equal(g.length, 2);
    assert.deepEqual(g.map((x) => x.rpp), [null, "aaaa1111"]);
  } finally { await s.cerrar(); }
});

test("RPP: link público válido, inválido e inactivo", async () => {
  const s = await arrancar();
  try {
    assert.equal((await fetch(`${s.base}/api/rpp/aaaa1111`)).status, 200);
    assert.equal((await fetch(`${s.base}/api/rpp/cccc3333`)).status, 404);
    assert.equal((await inscribir(s.base, { nombre: "Pedro Gómez", rpp: "zzzz9999" })).status, 400);
    assert.equal((await inscribir(s.base, { nombre: "Pedro Gómez", rpp: "cccc3333" })).status, 400);
    assert.equal((await inscribir(s.base, { nombre: "Pedro Gómez", rpp: "<script>" })).status, 400);
  } finally { await s.cerrar(); }
});

test("duplicados en la misma noche (sin importar tildes ni mayúsculas)", async () => {
  const s = await arrancar();
  try {
    assert.equal((await inscribir(s.base, { nombre: "José Pérez" })).status, 201);
    assert.equal((await inscribir(s.base, { nombre: "JOSE perez", rpp: "bbbb2222" })).status, 409);
  } finally { await s.cerrar(); }
});

test("campo trampa: responde bien pero no guarda", async () => {
  const s = await arrancar();
  try {
    const r = await inscribir(s.base, { nombre: "Bot Malvado", web: "http://spam" });
    assert.equal(r.status, 201);
    await s.servidor.almacen.esperar();
    assert.equal(guardadas(s).length, 0);
  } finally { await s.cerrar(); }
});

test("token: falso, ausente o demasiado rápido", async () => {
  const s = await arrancar();
  try {
    assert.equal((await inscribir(s.base, { nombre: "Ana Ruiz", token: "123.abc" })).status, 400);
    assert.equal((await inscribir(s.base, { nombre: "Ana Ruiz" }, { conToken: false })).status, 400);
  } finally { await s.cerrar(); }

  const lento = await arrancar({ lista: {} }); // mínimo real de 3 s
  try {
    assert.equal((await inscribir(lento.base, { nombre: "Ana Ruiz" })).status, 400);
  } finally { await lento.cerrar(); }
});

test("peticiones malformadas o enormes", async () => {
  const s = await arrancar();
  try {
    const post = (body, tipo = "application/json") => fetch(`${s.base}/api/lista`, { method: "POST", headers: { "Content-Type": tipo }, body });
    assert.equal((await post("x".repeat(5000))).status, 413);
    assert.equal((await post("{no es json")).status, 400);
    assert.equal((await post("nombre=Juan", "application/x-www-form-urlencoded")).status, 415);
    assert.equal((await inscribir(s.base, { nombre: "Ana Ruiz", telefono: "600000000" })).status, 400);
    assert.equal((await inscribir(s.base, { nombre: "a".repeat(500) })).status, 400);
    assert.equal((await inscribir(s.base, { nombre: "asdfgh qwerty" })).status, 400);
  } finally { await s.cerrar(); }
});

test("fechas: noche cerrada, pasada, inexistente o muy lejana", async () => {
  const s = await arrancar();
  try {
    for (const fecha of ["2026-10-13", "2026-10-10", "2026-02-30", "2027-12-01", "hoy"]) {
      assert.equal((await inscribir(s.base, { nombre: "Ana Ruiz", fecha })).status, 400, fecha);
    }
  } finally { await s.cerrar(); }
});

test("límite de altas por IP", async () => {
  const s = await arrancar();
  try {
    const nombres = ["Ana Ruiz", "Luis Mora", "Eva Sanz", "Raúl Díaz", "Inés Vega"];
    for (const nombre of nombres) assert.equal((await inscribir(s.base, { nombre })).status, 201, nombre);
    const r = await inscribir(s.base, { nombre: "Otro Nombre" });
    assert.equal(r.status, 429);
  } finally { await s.cerrar(); }
});

test("panel admin: acceso, recuento, CSV y borrado", async () => {
  const s = await arrancar();
  try {
    await inscribir(s.base, { nombre: "Ana Ruiz", rpp: "aaaa1111" });
    await inscribir(s.base, { nombre: "Luis Mora", rpp: "aaaa1111" });
    await inscribir(s.base, { nombre: "Eva Sanz" });

    assert.equal((await fetch(`${s.base}/api/admin/resumen?fecha=${NOCHE}`)).status, 401);
    const login = (clave) => fetch(`${s.base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave }) });
    assert.equal((await login("mala")).status, 401);
    const ok = await login("clave-de-prueba");
    assert.equal(ok.status, 200);
    const cookie = ok.headers.get("set-cookie").split(";")[0];
    assert.match(ok.headers.get("set-cookie"), /HttpOnly/);
    const h = { headers: { Cookie: cookie } };

    const res = await (await fetch(`${s.base}/api/admin/resumen?fecha=${NOCHE}`, h)).json();
    assert.equal(res.total, 3);
    const porNombre = Object.fromEntries(res.porRpp.map((g) => [g.nombre, g.total]));
    assert.deepEqual(porNombre, { "Prueba 1": 2, "Prueba 2": 0, "Inactivo": 0, "Sin RPP": 1 });

    const csv = await (await fetch(`${s.base}/api/admin/export.csv?fecha=${NOCHE}`, h)).text();
    assert.match(csv, /Ana Ruiz;Prueba 1/);

    const id = res.inscripciones[0].id;
    assert.equal((await fetch(`${s.base}/api/admin/inscripcion/${id}`, { method: "DELETE", ...h })).status, 200);
    const res2 = await (await fetch(`${s.base}/api/admin/resumen?fecha=${NOCHE}`, h)).json();
    assert.equal(res2.total, 2);
  } finally { await s.cerrar(); }
});

test("login admin limitado a 5 intentos", async () => {
  const s = await arrancar();
  try {
    const login = () => fetch(`${s.base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave: "mala" }) });
    for (let i = 0; i < 5; i++) assert.equal((await login()).status, 401);
    assert.equal((await login()).status, 429);
  } finally { await s.cerrar(); }
});

test("archivos privados y rutas con ../ no se sirven", async () => {
  const s = await arrancar();
  try {
    for (const ruta of ["/server/server.js", "/data/db/rpps.json", "/.env", "/.gitignore", "/package.json", "/test/api.test.js", "/supabase/schema.sql", "/node_modules/@supabase/supabase-js/package.json","/..%2f..%2fWindows/win.ini", "/%2e%2e/%2e%2e/etc/passwd"]) {
      assert.equal((await fetch(s.base + ruta)).status, 404, ruta);
    }
    const index = await fetch(`${s.base}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal((await fetch(`${s.base}/js/compartido/nombre.js`)).status, 200);
  } finally { await s.cerrar(); }
});
