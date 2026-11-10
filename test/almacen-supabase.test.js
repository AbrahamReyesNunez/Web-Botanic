"use strict";

/* Almacén de Supabase contra un cliente falso: comprueba lo que se envía a la base de datos
   (tablas y funciones de supabase/migrations) sin conectarse a ningún sitio */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { crearAlmacenSupabase } = require("../server/almacen-supabase.js");
const { crearServidor } = require("../server/server.js");

/* Imita lo justo del cliente de supabase-js: from(tabla).select().eq()… (se puede esperar) y rpc() */
function clienteFalso({ tablas = {}, rpc = () => ({ data: null, error: null }) } = {}) {
  const llamadas = [];
  const from = (tabla) => {
    const consulta = { tabla, pasos: [] };
    llamadas.push(consulta);
    const cadena = new Proxy({}, {
      get(_, metodo) {
        if (metodo === "then") {
          const r = typeof tablas[tabla] === "function" ? tablas[tabla](consulta) : { data: tablas[tabla] ?? [], error: null };
          return (ok, ko) => Promise.resolve(r).then(ok, ko);
        }
        return (...args) => { consulta.pasos.push([metodo, ...args]); return cadena; };
      }
    });
    return cadena;
  };
  return {
    llamadas,
    from,
    rpc: async (nombre, params) => { llamadas.push({ rpc: nombre, params }); return rpc(nombre, params); }
  };
}

test("crear_reserva recibe la cabecera y las líneas tal cual (003_reservas.sql)", async () => {
  const cliente = clienteFalso({ rpc: () => ({ data: { ok: true, id: "6f1c2b9e-0000-4000-8000-000000000001" }, error: null }) });
  const a = crearAlmacenSupabase({ cliente });
  const lineas = [
    { grupo: "botellas", producto: "Ron Barceló", cantidad: 1, precio: 50 },
    { grupo: "suplementos", producto: "Power King", cantidad: 1, precio: 5 }
  ];
  const r = await a.crearReserva({
    fecha: "2026-10-14", tipo: "pista", nombre: "Ana Ruiz", telefono: "+34671434657", personas: 4,
    rpp: null, notas: "", total: 55, aConsultar: false
  }, lineas);
  assert.deepEqual(r, { ok: true, id: "6f1c2b9e-0000-4000-8000-000000000001" });
  const { rpc, params } = cliente.llamadas[0];
  assert.equal(rpc, "crear_reserva");
  assert.deepEqual(params, {
    p_fecha: "2026-10-14", p_tipo: "pista", p_nombre: "Ana Ruiz", p_telefono: "+34671434657", p_personas: 4,
    p_rpp: null, p_notas: null, p_total: 55, p_a_consultar: false, p_lineas: lineas
  });
});

test("reservas de una noche: junta reserva_lineas por grupos para la API de la app", async () => {
  const fila = {
    id: "r1", fecha: "2026-10-14", tipo: "vip", estado: "confirmada", nombre: "Luis Mora", telefono: "+34600000000",
    personas: 6, rpp: "aaaa1111", total: 145, a_consultar: false, notas: null, creado: "2026-10-10T10:00:00Z", decidido: "2026-10-11T10:00:00Z",
    reserva_lineas: [
      { grupo: "refrescos", producto: "Sprite", cantidad: 20, precio: 0 },
      { grupo: "botellas", producto: "Ron Brugal", cantidad: 2, precio: 70 },
      { grupo: "suplementos", producto: "Power King", cantidad: 1, precio: 5 }
    ]
  };
  const cliente = clienteFalso({ tablas: { reservas: [fila] } });
  const [r] = await crearAlmacenSupabase({ cliente }).reservasDeNoche("2026-10-14");
  assert.equal(r.estado, "confirmada");
  assert.equal(r.aConsultar, false);
  assert.equal(r.notas, "");
  assert.deepEqual(r.botellas, [{ nombre: "Ron Brugal", cantidad: 2, precio: 70 }]);
  assert.deepEqual(r.refrescos, [{ nombre: "Sprite", cantidad: 20, precio: 0 }]);
  assert.deepEqual(r.suplementos, [{ nombre: "Power King", cantidad: 1, precio: 5 }]);
  assert.deepEqual(r.chupitos, []);
  assert.equal("reserva_lineas" in r, false);
  // Se piden las líneas junto con la reserva, en la misma consulta
  assert.match(cliente.llamadas[0].pasos[0][1], /reserva_lineas\(grupo, producto, cantidad, precio\)/);
});

test("RPP nuevo: sin código, lo genera la base de datos (002_mejoras_rpps.sql)", async () => {
  const cliente = clienteFalso({ tablas: { rpps: () => ({ data: { codigo: "930d3053", nombre: "Nuevo", activo: true }, error: null }) } });
  const rpp = await crearAlmacenSupabase({ cliente }).crearRpp({ nombre: "Nuevo" });
  assert.equal(rpp.codigo, "930d3053");
  assert.deepEqual(cliente.llamadas[0].pasos[0], ["insert", { nombre: "Nuevo" }]);
});

test("API de reservas con Supabase: aforo completo, duplicado y alta", async () => {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), "botanic-"));
  let respuesta = { data: { ok: false, motivo: "completo" }, error: null };
  const cliente = clienteFalso({
    tablas: { rpps: [], web_contenido: [] },
    rpc: (nombre) => {
      if (nombre === "crear_reserva") return respuesta;
      if (nombre === "disponibilidad_reservas") return { data: [{ tipo: "pista", mesas: 30, fecha: null, confirmadas: 0 }], error: null };
      return { data: null, error: null };
    }
  });
  const servidor = crearServidor({
    datos, claveAdmin: "x", ahora: () => new Date(2026, 9, 14, 12, 0, 0), tokens: { minMs: 0 },
    supabase: { cliente }
  });
  await servidor.listo;
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const reservar = async () => {
    const { token } = await (await fetch(`${base}/api/form-token`)).json();
    const r = await fetch(`${base}/api/reservas`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha: "2026-10-14", tipo: "pista", nombre: "Ana Ruiz", telefono: "671 434 657", personas: 4, rpp: null, notas: "",
        carrito: [{ grupo: "botellas", nombre: "Ron Barceló", cantidad: 1 }, { grupo: "refrescos", nombre: "Coca-Cola", cantidad: 10 }],
        token
      })
    });
    return { status: r.status, j: await r.json() };
  };
  try {
    let r = await reservar();
    assert.equal(r.status, 409);
    assert.equal(r.j.motivo, "completo");

    respuesta = { data: { ok: false, motivo: "duplicado" }, error: null };
    r = await reservar();
    assert.equal(r.status, 409);
    assert.match(r.j.error, /teléfono/);

    respuesta = { data: { ok: true, id: "6f1c2b9e-0000-4000-8000-000000000002" }, error: null };
    r = await reservar();
    assert.equal(r.status, 201);
    assert.equal(r.j.referencia, "6F1C2B9E");
    const enviada = cliente.llamadas.filter((x) => x.rpc === "crear_reserva").pop().params;
    assert.equal(enviada.p_telefono, "+34671434657");
    assert.equal(enviada.p_total, 50);
    assert.deepEqual(enviada.p_lineas.map((l) => l.grupo), ["botellas", "refrescos"]);

    const dispo = await (await fetch(`${base}/api/reservas/disponibilidad`)).json();
    assert.equal(dispo.ok, true);
  } finally {
    servidor.closeAllConnections();
    await new Promise((r) => servidor.close(r));
    fs.rmSync(datos, { recursive: true, force: true });
  }
});
