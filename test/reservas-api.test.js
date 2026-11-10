"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { crearServidor } = require("../server/server.js");

// Miércoles 14/10/2026 a las 12:00: botella normal a 50 €
const AHORA = () => new Date(2026, 9, 14, 12, 0, 0);
const NOCHE = "2026-10-14";
const RPPS = [{ codigo: "aaaa1111", nombre: "Prueba 1", activo: true }];

async function arrancar({ mesas } = {}) {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), "botanic-"));
  fs.writeFileSync(path.join(datos, "rpps.json"), JSON.stringify(RPPS));
  if (mesas) fs.writeFileSync(path.join(datos, "mesas.json"), JSON.stringify(mesas));
  const servidor = crearServidor({ datos, claveAdmin: "clave-de-prueba", ahora: AHORA, tokens: { minMs: 0 } });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return {
    base: `http://127.0.0.1:${servidor.address().port}`,
    almacen: servidor.almacen,
    cerrar: async () => {
      await servidor.almacen.esperar();
      servidor.closeAllConnections();
      await new Promise((r) => servidor.close(r));
      fs.rmSync(datos, { recursive: true, force: true });
    }
  };
}

const token = async (base) => (await (await fetch(`${base}/api/form-token`)).json()).token;

// Mesa en pista con 1 botella y sus 10 refrescos
const PEDIDO = [
  { grupo: "botellas", nombre: "Ron Barceló", cantidad: 1 },
  { grupo: "refrescos", nombre: "Coca-Cola", cantidad: 10 }
];

async function reservar(base, cambios = {}, { conToken = true } = {}) {
  const body = { tipo: "pista", fecha: NOCHE, nombre: "María López", telefono: "600 123 123", personas: 4, carrito: PEDIDO, ...cambios };
  if (conToken && !("token" in cambios)) body.token = await token(base);
  const r = await fetch(`${base}/api/reservas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json() };
}

const disponibilidad = async (base) => (await fetch(`${base}/api/reservas/disponibilidad`)).json();

test("reserva correcta: el servidor calcula el total y guarda las líneas con su precio", async () => {
  const s = await arrancar();
  try {
    const r = await reservar(s.base, {
      rpp: "aaaa1111",
      notas: "  Cumpleaños\u0007 de Ana\r\n\r\n\r\n\r\nLlegamos a las 1  ",
      carrito: [
        { grupo: "botellas", nombre: "Ciroc Apple", cantidad: 1 },
        { grupo: "chupitos", nombre: "Tequila mango", cantidad: 1 },
        { grupo: "champan", nombre: "Moët blanco", cantidad: 1 },
        { grupo: "refrescos", nombre: "Power King", cantidad: 3 },
        { grupo: "refrescos", nombre: "Sprite", cantidad: 7 }
      ]
    });
    assert.equal(r.status, 201, JSON.stringify(r.j));
    assert.match(r.j.referencia, /^[0-9A-F]{8}$/);
    assert.equal(r.j.total, 70 + 50 + 5); // premium del miércoles + chupito + Power King (champán a consultar)
    assert.equal(r.j.telefono, "+34600123123");

    const [g] = await s.almacen.reservas();
    assert.equal(g.estado, "pendiente");
    assert.equal(g.rpp, "aaaa1111");
    assert.equal(g.total, 125);
    assert.equal(g.a_consultar, true);
    assert.equal(g.notas, "Cumpleaños de Ana\n\nLlegamos a las 1");
    assert.deepEqual(g.lineas.map((l) => [l.grupo, l.producto, l.cantidad, l.precio]), [
      ["botellas", "Ciroc Apple", 1, 70],
      ["chupitos", "Tequila mango", 1, 50],
      ["champan", "Moët blanco", 1, null],
      ["refrescos", "Power King", 3, 0],
      ["refrescos", "Sprite", 7, 0],
      ["suplementos", "Power King", 1, 5]
    ]);
  } finally { await s.cerrar(); }
});

test("no se aceptan precios ni pedidos manipulados", async () => {
  const malos = [
    { total: 1 },                                                                        // campo que no existe
    { tipo: "__proto__" },
    { tipo: "terraza" },
    { carrito: [] },
    { carrito: "Ron Barceló" },
    { carrito: [{ grupo: "botellas", nombre: "Ron Inventado", cantidad: 1 }, PEDIDO[1]] },
    { carrito: [{ grupo: "botellas", nombre: "Ron Barceló", cantidad: 0 }, PEDIDO[1]] },
    { carrito: [{ grupo: "botellas", nombre: "Ron Barceló", cantidad: 1.5 }, PEDIDO[1]] },
    { carrito: [{ grupo: "botellas", nombre: "Ron Barceló", cantidad: 11 }, PEDIDO[1]] },
    { carrito: [{ ...PEDIDO[0], precio: 0 }, PEDIDO[1]] },                               // precio colado en la línea
    { carrito: [{ grupo: "constructor", nombre: "Ron Barceló", cantidad: 1 }, PEDIDO[1]] },
    { carrito: [PEDIDO[0], PEDIDO[0], PEDIDO[1]] },                                     // línea repetida
    { carrito: [PEDIDO[0], { ...PEDIDO[1], cantidad: 9 }] },                            // faltan refrescos
    { tipo: "vip" },                                                                     // VIP pide 2 botellas
    { personas: 6 },                                                                     // 1 botella: hasta 5
    { personas: "4" },
    { telefono: "12345" },
    { telefono: "+34 600 123 123 <script>" },
    { nombre: "a" },
    { notas: "x".repeat(501) },
    { rpp: "zzzz9999" },
    { fecha: "2026-10-12" },                                                             // lunes: cerrado
    { fecha: "2026-10-10" },                                                             // ya pasó
    { fecha: "2026-31-02" }
  ];
  // De 12 en 12: más de 20 intentos seguidos desde la misma IP ya dan 429
  for (let i = 0; i < malos.length; i += 12) {
    const s = await arrancar();
    try {
      for (const m of malos.slice(i, i + 12)) {
        const r = await reservar(s.base, m);
        assert.equal(r.status, 400, `${JSON.stringify(m)} → ${r.status} ${r.j.error}`);
      }
      assert.equal((await s.almacen.reservas()).length, 0);
    } finally { await s.cerrar(); }
  }
});

test("una petición activa por teléfono y noche", async () => {
  const s = await arrancar();
  try {
    const a = await reservar(s.base);
    assert.equal(a.status, 201);
    // Mismo teléfono escrito de otra forma
    const b = await reservar(s.base, { telefono: "+34600123123", nombre: "Pedro Gómez" });
    assert.equal(b.status, 409);
    assert.equal(b.j.motivo, "duplicado");
    // Si se rechaza, puede volver a pedir
    const [x] = await s.almacen.reservas();
    assert.deepEqual(await s.almacen.decidirReserva(x.id, "rechazada"), { ok: true });
    assert.equal((await reservar(s.base, { telefono: "0034 600-123-123" })).status, 201);
  } finally { await s.cerrar(); }
});

test("aforo: con todas las mesas confirmadas se bloquea ese tipo, el otro sigue abierto", async () => {
  const s = await arrancar({ mesas: { pista: 1, vip: 1 } });
  try {
    // Las pendientes no bloquean: entran dos peticiones de pista
    assert.equal((await reservar(s.base)).status, 201);
    assert.equal((await reservar(s.base, { telefono: "611111111" })).status, 201);
    const [a, b] = await s.almacen.reservas();

    assert.deepEqual(await s.almacen.decidirReserva(a.id, "confirmada"), { ok: true });
    // No se puede confirmar una mesa más que las que hay
    assert.deepEqual(await s.almacen.decidirReserva(b.id, "confirmada"), { ok: false, motivo: "completo" });

    const d = await disponibilidad(s.base);
    assert.deepEqual(d.completas, { [NOCHE]: ["pista"] });

    const lleno = await reservar(s.base, { telefono: "622222222" });
    assert.equal(lleno.status, 409);
    assert.equal(lleno.j.motivo, "completo");

    const vip = await reservar(s.base, {
      tipo: "vip", telefono: "633333333", personas: 10,
      carrito: [{ grupo: "botellas", nombre: "Ron Barceló", cantidad: 2 }, { grupo: "refrescos", nombre: "Coca-Cola", cantidad: 20 }]
    });
    assert.equal(vip.status, 201, vip.j.error);
  } finally { await s.cerrar(); }
});

test("tipo sin mesas: completo todas las noches", async () => {
  const s = await arrancar({ mesas: { pista: 0, vip: 7 } });
  try {
    assert.deepEqual((await disponibilidad(s.base)).sinMesas, ["pista"]);
    assert.equal((await reservar(s.base)).j.motivo, "completo");
  } finally { await s.cerrar(); }
});

test("reserva: token, campo trampa, tamaño y límite por IP", async () => {
  const s = await arrancar();
  try {
    assert.equal((await reservar(s.base, {}, { conToken: false })).status, 400);
    assert.equal((await reservar(s.base, { token: "123.abc" })).status, 400);

    const bot = await reservar(s.base, { web: "http://spam.example" });
    assert.equal(bot.status, 201);
    assert.equal((await s.almacen.reservas()).length, 0);

    const grande = await fetch(`${s.base}/api/reservas`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notas: "x".repeat(9000) })
    });
    assert.equal(grande.status, 413);

    // 3 reservas por hora y IP
    for (const tel of ["611111111", "622222222", "633333333"]) assert.equal((await reservar(s.base, { telefono: tel })).status, 201);
    const r = await reservar(s.base, { telefono: "644444444" });
    assert.equal(r.status, 429);
  } finally { await s.cerrar(); }
});

test("detrás de un proxy, la IP inventada en X-Forwarded-For no salta el límite", async () => {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), "botanic-"));
  fs.writeFileSync(path.join(datos, "rpps.json"), JSON.stringify(RPPS));
  const servidor = crearServidor({ datos, claveAdmin: "clave-de-prueba", ahora: AHORA, tokens: { minMs: 0 }, trustProxy: true });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    // El visitante escribe una IP distinta cada vez; el proxy añade al final la real (siempre la misma)
    const enviar = async (i) => {
      const body = { tipo: "pista", fecha: NOCHE, nombre: "María López", telefono: `6000000${String(i).padStart(2, "0")}`, personas: 2, carrito: PEDIDO, token: await token(base) };
      return (await fetch(`${base}/api/reservas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.0.0.${i}, 203.0.113.7` },
        body: JSON.stringify(body)
      })).status;
    };
    assert.deepEqual([await enviar(1), await enviar(2), await enviar(3), await enviar(4)], [201, 201, 201, 429]);
  } finally {
    await servidor.almacen.esperar();
    servidor.closeAllConnections();
    await new Promise((r) => servidor.close(r));
    fs.rmSync(datos, { recursive: true, force: true });
  }
});
