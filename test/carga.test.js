"use strict";
/* Aforo del servidor, tiempos máximos con servicios externos (Supabase, Drive) y Permissions-Policy */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { crearServidor } = require("../server/server.js");
const { crearGaleria } = require("../server/galeria.js");
const { crearDrive } = require("../server/drive.js");
const { crearAlmacenSupabase } = require("../server/almacen-supabase.js");

async function arrancar(opciones = {}) {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), "botanic-"));
  fs.writeFileSync(path.join(datos, "rpps.json"), "[]");
  const servidor = crearServidor({ datos, claveAdmin: "clave-de-prueba", galeria: crearGaleria({ url: null }), ...opciones });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return {
    servidor,
    puerto: servidor.address().port,
    base: `http://127.0.0.1:${servidor.address().port}`,
    cerrar: async () => {
      await servidor.almacen.esperar();
      servidor.closeAllConnections();
      await new Promise((r) => servidor.close(r));
      fs.rmSync(datos, { recursive: true, force: true });
    }
  };
}

/* fetch falso que no responde nunca: solo termina cuando se aborta su señal */
const fetchColgado = (_url, init) => new Promise((_, rechazar) => {
  init.signal.addEventListener("abort", () => rechazar(init.signal.reason));
});

test("Permissions-Policy bloquea cámara, micrófono y ubicación en la web y en la API", async () => {
  const s = await arrancar();
  try {
    for (const ruta of ["/", "/api/form-token", "/no-existe"]) {
      const pp = (await fetch(`${s.base}${ruta}`)).headers.get("permissions-policy");
      assert.ok(pp, ruta);
      for (const f of ["camera=()", "microphone=()", "geolocation=()", "payment=()"]) assert.ok(pp.includes(f), `${ruta}: ${f}`);
    }
  } finally { await s.cerrar(); }
});

test("lleno de peticiones: 503 con Retry-After al momento, y se recupera al terminar", async () => {
  const s = await arrancar({ maxEnCurso: 1 });
  // Una petición que ocupa el único hueco: cuerpo JSON que no termina de llegar
  const ocupada = http.request({ host: "127.0.0.1", port: s.puerto, path: "/api/lista", method: "POST", headers: { "Content-Type": "application/json" } });
  ocupada.on("error", () => {});
  const respuestaOcupada = new Promise((r) => ocupada.on("response", r));
  try {
    ocupada.write("{");
    await new Promise((r) => setTimeout(r, 50));   // que el servidor la haya empezado a atender

    const r = await fetch(`${s.base}/`);
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("retry-after"), "10");
    assert.ok(r.headers.get("content-security-policy"), "el 503 también lleva las cabeceras de seguridad");
    assert.equal((await r.json()).ok, false);

    ocupada.end("}");                              // termina: el hueco queda libre
    (await respuestaOcupada).resume();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await fetch(`${s.base}/`)).status, 200);
  } finally {
    ocupada.destroy();
    await s.cerrar();
  }
});

test("un visitante que corta la conexión también libera su hueco", async () => {
  const s = await arrancar({ maxEnCurso: 1 });
  try {
    const cortada = http.request({ host: "127.0.0.1", port: s.puerto, path: "/api/lista", method: "POST", headers: { "Content-Type": "application/json" } });
    cortada.on("error", () => {});
    cortada.write("{");
    await new Promise((r) => setTimeout(r, 50));
    cortada.destroy();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await fetch(`${s.base}/`)).status, 200);
  } finally { await s.cerrar(); }
});

test("servidor con tope de conexiones", async () => {
  const s = await arrancar();
  try {
    assert.equal(s.servidor.maxConnections, 1024);
  } finally { await s.cerrar(); }
});

test("Drive que no responde: error 504 claro tras el tiempo máximo", async () => {
  const drive = crearDrive({ url: "https://script.google.com/x", clave: "c", fetch: fetchColgado, tiempoMaximoMs: 30 });
  await assert.rejects(drive.subir("a.jpg", "image/jpeg", Buffer.from("x")), (e) => e.status === 504 && /a tiempo/.test(e.message));
});

test("Drive sin red: error 502 sin detalles internos de la conexión", async () => {
  const sinRed = () => Promise.reject(new TypeError("fetch failed: getaddrinfo ENOTFOUND script.google.com"));
  const drive = crearDrive({ url: "https://script.google.com/x", clave: "c", fetch: sinRed });
  await assert.rejects(drive.borrar("abcdefghij"), (e) => e.status === 502 && !/ENOTFOUND|getaddrinfo/.test(e.message));
});

test("Supabase que no responde: lecturas y escrituras fallan tras el tiempo máximo, sin reintentos", async () => {
  let llamadas = 0;
  const contando = (url, init) => { llamadas++; return fetchColgado(url, init); };
  const almacen = crearAlmacenSupabase({ url: "https://ejemplo.supabase.co", clave: "sb_secret_prueba", fetch: contando, tiempoMaximoMs: 30 });

  const inicio = Date.now();
  await assert.rejects(almacen.latido(), /Supabase \(latido\)/);              // GET
  assert.equal(llamadas, 1, "una lectura cortada por tiempo no se reintenta");
  await assert.rejects(almacen.crearReserva({ fecha: "2026-10-17" }, []), /Supabase \(crear reserva\)/);   // POST (rpc)
  assert.equal(llamadas, 2);
  assert.ok(Date.now() - inicio < 1000, "no espera los reintentos de la librería");
});
