"use strict";
/* Log interno de seguridad (server/registro.js) y mensajes de error genéricos hacia fuera */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { crearServidor } = require("../server/server.js");
const { crearGaleria } = require("../server/galeria.js");
const { crearRegistro, eventoDe } = require("../server/registro.js");

const CLAVE = "clave-de-prueba-larga-de-verdad";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

/* Registro que guarda las líneas en memoria en vez de escribirlas */
function registroEnMemoria() {
  const lineas = [];
  const registro = crearRegistro({ escribir: (l) => lineas.push(l), escribirError: (l) => lineas.push(l) });
  return { registro, lineas, eventos: () => lineas.map((l) => JSON.parse(l)) };
}

async function arrancar(opciones = {}) {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), "botanic-"));
  fs.writeFileSync(path.join(datos, "rpps.json"), "[]");
  const log = registroEnMemoria();
  const servidor = crearServidor({ datos, claveAdmin: CLAVE, galeria: crearGaleria({ url: null }), registro: log.registro, ...opciones });
  await servidor.listo;
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return {
    ...log,
    base: `http://127.0.0.1:${servidor.address().port}`,
    cerrar: async () => {
      await servidor.almacen.esperar();
      servidor.closeAllConnections();
      await new Promise((r) => servidor.close(r));
      fs.rmSync(datos, { recursive: true, force: true });
    }
  };
}

const login = (base, clave) => fetch(`${base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave }) });
/* El log se escribe al terminar la respuesta: se le da un momento */
const pausa = () => new Promise((r) => setTimeout(r, 20));

test("login: fallos, bloqueo y entrada quedan en el log, sin la clave", async () => {
  const s = await arrancar();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await login(s.base, "clave-equivocada-123")).status, 401);
    assert.equal((await login(s.base, "clave-equivocada-123")).status, 429);
    assert.equal((await login(s.base, CLAVE)).status, 200);   // la clave larga entra aunque la IP esté bloqueada
    await pausa();
    const ev = s.eventos().map((e) => e.evento);
    assert.equal(ev.filter((e) => e === "login_fallido").length, 5);
    assert.ok(ev.includes("login_bloqueado"));
    assert.ok(ev.includes("login_ok"));
    const todo = s.lineas.join("\n");
    assert.ok(!todo.includes("clave-equivocada-123") && !todo.includes(CLAVE), "ninguna clave en el log");
    assert.ok(!todo.includes("127.0.0.1"), "la IP no se guarda: va su huella");
    assert.ok(s.eventos().every((e) => typeof e.origen === "string" && e.origen.length === 22));
  } finally { await s.cerrar(); }
});

test("panel sin sesión: acceso denegado en el log, sin la parte ?… de la URL", async () => {
  const s = await arrancar();
  try {
    assert.equal((await fetch(`${s.base}/api/admin/resumen?fecha=2026-10-17`)).status, 401);
    await pausa();
    const [e] = s.eventos();
    assert.equal(e.evento, "acceso_denegado");
    assert.equal(e.ruta, "/api/admin/resumen");
    assert.equal(e.status, 401);
  } finally { await s.cerrar(); }
});

test("los errores normales del visitante (400) y las visitas no se apuntan", async () => {
  const s = await arrancar();
  try {
    await fetch(`${s.base}/`);
    await fetch(`${s.base}/api/lista`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: "Ana Ruiz" }) });
    await pausa();
    assert.deepEqual(s.eventos(), []);
  } finally { await s.cerrar(); }
});

test("error interno: el visitante ve un mensaje genérico; el detalle y la pila van al log", async () => {
  // Base de datos que falla con un mensaje interno
  const roto = () => { throw new Error("relation \"rpps\" en /srv/botanic/db: permiso denegado"); };
  const cliente = { from: roto, rpc: roto };
  const s = await arrancar({ supabase: { cliente } });
  try {
    const r = await fetch(`${s.base}/api/rpp/aaaa1111`);
    assert.equal(r.status, 500);
    const texto = await r.text();
    assert.deepEqual(JSON.parse(texto), { ok: false, error: "Error interno." });
    assert.ok(!/rpps|srv|permiso/.test(texto), "nada del error interno en la respuesta");
    await pausa();
    const err = s.eventos().find((e) => e.evento === "error_interno");
    assert.ok(err, "el error está en el log");
    assert.equal(err.nivel, "error");
    assert.match(err.mensaje, /permiso denegado/);
    assert.ok(err.pila && err.pila.includes("registro.test.js"));
  } finally { await s.cerrar(); }
});

test("foto: lo que conteste Google no llega al panel; los avisos escritos para el panel sí", async () => {
  let fallo;
  const drive = { configurado: true, subir: async () => { throw fallo; }, borrar: async () => {} };
  const s = await arrancar({ drive });
  try {
    const cookie = (await login(s.base, CLAVE)).headers.get("set-cookie").split(";")[0];
    const subir = async () => (await fetch(`${s.base}/api/admin/foto`, { method: "POST", headers: { "Content-Type": "image/jpeg", Cookie: cookie }, body: JPEG })).json();

    fallo = Object.assign(new Error("Google Drive: Exception: Service error: Drive (línea 74, Codigo.gs)"), { status: 502 });
    const interno = await subir();
    assert.equal(interno.ok, false);
    assert.ok(!/Exception|Codigo\.gs/.test(interno.error), interno.error);

    fallo = Object.assign(new Error("Google Drive no ha respondido a tiempo. Inténtalo de nuevo."), { status: 504, publico: true });
    assert.match((await subir()).error, /no ha respondido a tiempo/);
  } finally { await s.cerrar(); }
});

test("galería sin configurar: el mensaje público no enseña rutas de archivos", async () => {
  const s = await arrancar();
  try {
    const r = await fetch(`${s.base}/api/galeria`);
    assert.equal(r.status, 503);
    assert.ok(!/config\.js|public\//.test((await r.json()).error));
  } finally { await s.cerrar(); }
});

test("una ruta con saltos de línea no rompe el log (una línea JSON por evento)", () => {
  const { registro, lineas } = registroEnMemoria();
  registro.aviso("acceso_denegado", { origen: "x", metodo: "GET", ruta: "/api/admin/a\n{\"evento\":\"login_ok\"}", status: 401 });
  registro.cerrar();
  assert.equal(lineas.length, 1);
  assert.equal(lineas[0].split("\n").length, 1);
  assert.equal(JSON.parse(lineas[0]).evento, "acceso_denegado");
});

test("un mismo evento desde un mismo origen se apunta como mucho 10 veces por minuto", () => {
  const { registro, lineas } = registroEnMemoria();
  for (let i = 0; i < 50; i++) registro.aviso("limite_superado", { origen: "a", ruta: "/api/lista", status: 429 });
  registro.aviso("limite_superado", { origen: "b", ruta: "/api/lista", status: 429 });   // otro origen: cuenta aparte
  registro.cerrar();
  assert.equal(lineas.length, 11);
});

test("qué respuestas son eventos de seguridad", () => {
  assert.equal(eventoDe("POST", "/api/admin/login", 401), "login_fallido");
  assert.equal(eventoDe("POST", "/api/admin/login", 429), "login_bloqueado");
  assert.equal(eventoDe("GET", "/api/admin/rpps", 401), "acceso_denegado");
  assert.equal(eventoDe("POST", "/api/lista", 429), "limite_superado");
  assert.equal(eventoDe("POST", "/api/reservas", 413), "peticion_demasiado_grande");
  assert.equal(eventoDe("GET", "/api/galeria", 502), "error_respuesta");
  assert.equal(eventoDe("POST", "/api/lista", 400), null);
  assert.equal(eventoDe("GET", "/", 200), null);
  assert.equal(eventoDe("GET", "/x", 404), null);
});
