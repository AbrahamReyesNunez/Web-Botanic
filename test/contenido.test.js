"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { crearServidor } = require("../server/server.js");

// Miércoles 14/10/2026 a las 12:00
const AHORA = () => new Date(2026, 9, 14, 12, 0, 0);
const NOCHE = "2026-10-14";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

/* Drive falso: guarda lo que se sube y lo que se borra */
function driveFalso() {
  const d = { configurado: true, subidas: [], borradas: [], n: 0 };
  d.subir = async (nombre, tipo, datos) => { d.subidas.push({ nombre, tipo, tam: datos.length }); return `fotoDrive${String(++d.n).padStart(6, "0")}`; };
  d.borrar = async (id) => { d.borradas.push(id); return { ok: true }; };
  return d;
}

async function arrancar() {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), "botanic-"));
  const drive = driveFalso();
  const servidor = crearServidor({ datos, claveAdmin: "clave-de-prueba", ahora: AHORA, tokens: { minMs: 0 }, drive });
  await servidor.listo;
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const login = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave: "clave-de-prueba" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const enviar = (ruta, method, body, tipo = "application/json") => fetch(`${base}${ruta}`, {
    method,
    headers: { Cookie: cookie, ...(body ? { "Content-Type": tipo } : {}) },
    ...(body ? { body: tipo === "application/json" ? JSON.stringify(body) : body } : {})
  });
  return {
    base, datos, drive, enviar,
    web: async () => {
      const ctx = { window: {} };
      require("node:vm").runInNewContext(await (await fetch(`${base}/api/web.js`)).text(), ctx);
      return JSON.parse(JSON.stringify(ctx.window.BOTANIC_WEB));   // fuera del contexto de vm, para comparar
    },
    cerrar: async () => {
      await servidor.almacen.esperar();
      servidor.closeAllConnections();
      await new Promise((r) => servidor.close(r));
      fs.rmSync(datos, { recursive: true, force: true });
    }
  };
}

test("contenido: sin sesión no se puede editar y /api/web.js es público", async () => {
  const s = await arrancar();
  try {
    assert.equal((await fetch(`${s.base}/api/admin/contenido`)).status, 401);
    assert.equal((await fetch(`${s.base}/api/admin/evento/${NOCHE}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
    const r = await fetch(`${s.base}/api/web.js`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /javascript/);
    assert.deepEqual(await s.web(), { eventos: {}, dias: {}, galeria: {}, ajustes: {} });
  } finally { await s.cerrar(); }
});

test("eventos: crear, validar, cambiar la foto y quitar", async () => {
  const s = await arrancar();
  try {
    assert.equal((await s.enviar(`/api/admin/evento/${NOCHE}`, "PUT", { titulo: "  " })).status, 400);
    assert.equal((await s.enviar(`/api/admin/evento/${NOCHE}`, "PUT", { titulo: "Ok", instagram: "https://evil.com/x" })).status, 400);
    assert.equal((await s.enviar("/api/admin/evento/2026-02-30", "PUT", { titulo: "Ok" })).status, 400);

    // Foto: se comprueba que de verdad sea una imagen
    assert.equal((await s.enviar("/api/admin/foto", "POST", Buffer.from("<svg/>"), "image/jpeg")).status, 415);
    assert.equal((await s.enviar("/api/admin/foto", "POST", Buffer.from("hola"), "text/plain")).status, 415);
    const subida = await s.enviar("/api/admin/foto", "POST", JPEG, "image/jpeg");
    assert.equal(subida.status, 201);
    const { id: foto1 } = await subida.json();

    const alta = await s.enviar(`/api/admin/evento/${NOCHE}`, "PUT", { titulo: " Noche Tropical ", dj: "DJ X", instagram: "https://www.instagram.com/p/abc/", foto: foto1 });
    assert.equal(alta.status, 200);
    assert.deepEqual((await s.web()).eventos[NOCHE], { titulo: "Noche Tropical", dj: "DJ X", instagram: "https://www.instagram.com/p/abc/", foto: foto1 });

    // Cambiar la foto manda la anterior a la papelera de Drive
    const { id: foto2 } = await (await s.enviar("/api/admin/foto", "POST", JPEG, "image/jpeg")).json();
    await s.enviar(`/api/admin/evento/${NOCHE}`, "PUT", { titulo: "Noche Tropical", foto: foto2 });
    assert.deepEqual(s.drive.borradas, [foto1]);

    const quitado = await s.enviar(`/api/admin/evento/${NOCHE}`, "DELETE");
    assert.equal(quitado.status, 200);
    assert.equal((await quitado.json()).dia, "cerrado");
    assert.equal((await s.web()).eventos[NOCHE], undefined);
    // Quitar el evento deja el día cerrado (era miércoles, abierto por defecto)
    assert.equal((await s.web()).dias[NOCHE], "cerrado");
    assert.deepEqual(s.drive.borradas, [foto1, foto2]);
    assert.equal((await s.enviar(`/api/admin/evento/${NOCHE}`, "DELETE")).status, 404);

    // Se guarda en el almacén: sobrevive a un reinicio
    assert.ok(fs.existsSync(path.join(s.datos, "contenido.json")));
  } finally { await s.cerrar(); }
});

test("días: cerrar un miércoles bloquea la lista y abrir un lunes la permite", async () => {
  const s = await arrancar();
  try {
    const token = async () => (await (await fetch(`${s.base}/api/form-token`)).json()).token;
    const inscribir = async (fecha, nombre) => (await fetch(`${s.base}/api/lista`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha, nombre, token: await token() })
    })).status;

    assert.equal((await s.enviar(`/api/admin/dia/${NOCHE}`, "PUT", { estado: "raro" })).status, 400);
    assert.equal((await s.enviar(`/api/admin/dia/${NOCHE}`, "PUT", { estado: "cerrado" })).status, 200);
    assert.equal(await inscribir(NOCHE, "Ana Pérez"), 400);
    assert.deepEqual((await s.web()).dias, { [NOCHE]: "cerrado" });

    const lunes = "2026-10-19";
    assert.equal(await inscribir(lunes, "Ana Pérez"), 400);
    await s.enviar(`/api/admin/dia/${lunes}`, "PUT", { estado: "abierto" });
    assert.equal(await inscribir(lunes, "Ana Pérez"), 201);

    // null vuelve a lo normal
    await s.enviar(`/api/admin/dia/${NOCHE}`, "PUT", { estado: null });
    assert.equal(await inscribir(NOCHE, "Ana Pérez"), 201);
  } finally { await s.cerrar(); }
});

test("galería: nombre, portada y anclados; sin ajustes el álbum desaparece", async () => {
  const s = await arrancar();
  try {
    const carpeta = "1AbCdEfGhIjKlMnOp";
    assert.equal((await s.enviar("/api/admin/album/corto", "PUT", {})).status, 404);
    assert.equal((await s.enviar(`/api/admin/album/${carpeta}`, "PUT", { fotosAncladas: ["<script>"] })).status, 400);
    assert.equal((await s.enviar(`/api/admin/album/${carpeta}`, "PUT", { anclado: "si" })).status, 400);

    const r = await s.enviar(`/api/admin/album/${carpeta}`, "PUT", { nombre: " Halloween ", portada: "foto0000002", anclado: true, fotosAncladas: ["foto0000003", "foto0000001", "foto0000003"] });
    assert.equal(r.status, 200);
    assert.deepEqual((await s.web()).galeria[carpeta], { nombre: "Halloween", portada: "foto0000002", anclado: true, fotosAncladas: ["foto0000003", "foto0000001"] });

    await s.enviar(`/api/admin/album/${carpeta}`, "PUT", { nombre: "", portada: "", anclado: false, fotosAncladas: [] });
    assert.deepEqual((await s.web()).galeria, {});
  } finally { await s.cerrar(); }
});

test("si falta la tabla en Supabase, el panel recibe un mensaje claro (no 'Error interno')", async () => {
  const { crearContenido } = require("../server/contenido.js");
  const crearCalendario = require("../public/js/compartido/calendario.js");
  const sinTabla = () => Promise.reject(new Error("Supabase (guardar contenido de la web): Could not find the table 'public.web_contenido' in the schema cache"));
  const errorOriginal = console.error;
  console.error = () => {};
  try {
    const c = crearContenido({ almacen: { leerContenido: sinTabla, guardarContenido: sinTabla }, cal: crearCalendario({}), drive: { configurado: false } });
    await c.listo;
    const r = await c.guardarDia("2026-10-14", { estado: "cerrado" });
    assert.equal(r.status, 503);
    assert.match(r.cuerpo.error, /supabase\/migrations\/005_web_contenido\.sql/);
    // La cola sigue funcionando después del fallo
    assert.equal((await c.guardarAlbum("1AbCdEfGhIjKlMnOp", {})).status, 503);
  } finally {
    console.error = errorOriginal;
  }
});

test("quitar el evento de un día que normalmente está cerrado no deja ningún cambio guardado", async () => {
  const s = await arrancar();
  try {
    const lunes = "2026-10-19";
    await s.enviar(`/api/admin/dia/${lunes}`, "PUT", { estado: "abierto" });
    await s.enviar(`/api/admin/evento/${lunes}`, "PUT", { titulo: "Fiesta especial" });
    const r = await (await s.enviar(`/api/admin/evento/${lunes}`, "DELETE")).json();
    assert.equal(r.dia, null);
    assert.equal((await s.web()).dias[lunes], undefined);   // vuelve a lo normal: cerrado
  } finally { await s.cerrar(); }
});

test("estilo de la web: solo los cuatro de la lista, y la web lo recibe en /api/web.js", async () => {
  const s = await arrancar();
  try {
    assert.deepEqual((await s.web()).ajustes, {});
    assert.equal((await fetch(`${s.base}/api/admin/tema`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tema: "navidad" }) })).status, 401);
    assert.equal((await s.enviar("/api/admin/tema", "PUT", { tema: "pascua" })).status, 400);
    assert.equal((await s.enviar("/api/admin/tema", "PUT", {})).status, 400);
    for (const tema of ["navidad", "halloween", "carnaval", "verano"]) {
      const r = await s.enviar("/api/admin/tema", "PUT", { tema });
      assert.equal(r.status, 200);
      assert.equal((await s.web()).ajustes.tema, tema);
    }
    assert.ok(fs.readFileSync(path.join(s.datos, "contenido.json"), "utf8").includes('"tema": "verano"'));
  } finally { await s.cerrar(); }
});

test("si falta la migración 006, guardar el estilo da un mensaje claro", async () => {
  const { crearContenido } = require("../server/contenido.js");
  const crearCalendario = require("../public/js/compartido/calendario.js");
  const sinAjustes = (seccion) => seccion === "ajustes"
    ? Promise.reject(new Error('Supabase (guardar contenido de la web): new row for relation "web_contenido" violates check constraint "web_contenido_seccion_check"'))
    : Promise.resolve();
  const errorOriginal = console.error;
  console.error = () => {};
  try {
    const c = crearContenido({ almacen: { leerContenido: async () => ({}), guardarContenido: sinAjustes }, cal: crearCalendario({}), drive: { configurado: false } });
    await c.listo;
    const r = await c.guardarTema({ tema: "navidad" });
    assert.equal(r.status, 503);
    assert.match(r.cuerpo.error, /006_tema_web\.sql/);
  } finally { console.error = errorOriginal; }
});
