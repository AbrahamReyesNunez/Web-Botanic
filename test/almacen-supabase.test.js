"use strict";

/* Almacén de Supabase contra un cliente falso: comprueba lo que se envía a la base de datos
   (tablas y funciones de supabase/migrations) sin conectarse a ningún sitio */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { crearAlmacenSupabase } = require("../server/almacen-supabase.js");
const { telefonoInternacional } = require("../server/reservas.js");
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

const RESERVA = {
  fecha: "2026-10-14", tipo: "pista", nombre: "Ana Ruiz", telefono: "+34671434657", personas: 4, rpp: null,
  botellas: [{ nombre: "Ron Barceló", cantidad: 1, precio: 50 }],
  refrescos: [{ nombre: "Coca-Cola", cantidad: 10, precio: 0 }],
  chupitos: [], champan: [{ nombre: "Moët blanco", cantidad: 1, precio: null }],
  total: 50, aConsultar: true, notas: ""
};

test("crear_reserva recibe la cabecera y una línea por bebida con su precio", async () => {
  const cliente = clienteFalso({ rpc: () => ({ data: "6f1c2b9e-0000-4000-8000-000000000001", error: null }) });
  const a = crearAlmacenSupabase({ cliente });
  const r = await a.crearReserva(RESERVA);
  assert.equal(r.ok, true);
  assert.equal(r.reserva.id, "6f1c2b9e-0000-4000-8000-000000000001");
  assert.equal(r.reserva.estado, "pendiente");
  const { rpc, params } = cliente.llamadas[0];
  assert.equal(rpc, "crear_reserva");
  assert.deepEqual(params, {
    p_fecha: "2026-10-14", p_tipo: "pista", p_nombre: "Ana Ruiz", p_telefono: "+34671434657", p_personas: 4,
    p_rpp: null, p_notas: "", p_total: 50, p_a_consultar: true,
    p_lineas: [
      { grupo: "botellas", producto: "Ron Barceló", cantidad: 1, precio: 50 },
      { grupo: "refrescos", producto: "Coca-Cola", cantidad: 10, precio: 0 },
      { grupo: "champan", producto: "Moët blanco", cantidad: 1, precio: null }
    ]
  });
});

test("crear_reserva: acepta el id suelto o dentro de un objeto, y pasa los rechazos como motivo", async () => {
  const con = (data, error = null) => crearAlmacenSupabase({ cliente: clienteFalso({ rpc: () => ({ data, error }) }) });
  assert.equal((await con({ ok: true, id: "id-1" }).crearReserva(RESERVA)).reserva.id, "id-1");
  assert.equal((await con({ ok: true, reserva: { id: "id-2" } }).crearReserva(RESERVA)).reserva.id, "id-2");
  assert.deepEqual(await con({ ok: false, motivo: "tipo" }).crearReserva(RESERVA), { ok: false, motivo: "tipo" });

  // Una regla (check) de la tabla que no se cumple: no es un error interno, son datos que no valen
  const errorOriginal = console.error;
  console.error = () => {};
  try {
    const r = await con(null, { code: "23514", message: 'new row for relation "reservas" violates check constraint "reservas_telefono_check"' }).crearReserva(RESERVA);
    assert.deepEqual(r, { ok: false, motivo: "datos" });
  } finally { console.error = errorOriginal; }

  await assert.rejects(con(null, { code: "XX000", message: "caída" }).crearReserva(RESERVA), /guardar reserva/);
});

test("reservas de una noche: junta reserva_lineas en botellas, refrescos, chupitos y champán", async () => {
  const fila = {
    id: "r1", fecha: "2026-10-14", tipo: "vip", estado: "confirmada", nombre: "Luis Mora", telefono: "+34600000000",
    personas: 6, rpp: "aaaa1111", total: 140, a_consultar: false, notas: null, creado: "2026-10-10T10:00:00Z", decidido: "2026-10-11T10:00:00Z",
    reserva_lineas: [
      { grupo: "refrescos", producto: "Sprite", cantidad: 20, precio: 0 },
      { grupo: "botellas", producto: "Ron Brugal", cantidad: 2, precio: 70 }
    ]
  };
  const cliente = clienteFalso({ tablas: { reservas: [fila] } });
  const [r] = await crearAlmacenSupabase({ cliente }).reservasDeNoche("2026-10-14");
  assert.equal(r.estado, "confirmada");
  assert.equal(r.aConsultar, false);
  assert.equal(r.notas, "");
  assert.deepEqual(r.botellas, [{ nombre: "Ron Brugal", cantidad: 2, precio: 70 }]);
  assert.deepEqual(r.refrescos, [{ nombre: "Sprite", cantidad: 20, precio: 0 }]);
  assert.deepEqual(r.chupitos, []);
  assert.equal("reserva_lineas" in r, false);
  // Se piden las líneas junto con la reserva, en la misma consulta
  assert.match(cliente.llamadas[0].pasos[0][1], /reserva_lineas\(grupo, producto, cantidad, precio\)/);
});

test("RPP nuevo: sin código, lo genera la base de datos", async () => {
  const cliente = clienteFalso({ tablas: { rpps: () => ({ data: { codigo: "930d3053", nombre: "Nuevo", activo: true }, error: null }) } });
  const rpp = await crearAlmacenSupabase({ cliente }).crearRpp({ nombre: "Nuevo" });
  assert.equal(rpp.codigo, "930d3053");
  assert.deepEqual(cliente.llamadas[0].pasos[0], ["insert", { nombre: "Nuevo" }]);
});

test("teléfono: formato internacional para la base de datos y WhatsApp", () => {
  assert.equal(telefonoInternacional("671 434 657"), "+34671434657");
  assert.equal(telefonoInternacional("671.434.657"), "+34671434657");
  assert.equal(telefonoInternacional("+34 671 434 657"), "+34671434657");
  assert.equal(telefonoInternacional("0034671434657"), "+34671434657");
  assert.equal(telefonoInternacional("34671434657"), "+34671434657");
  assert.equal(telefonoInternacional("+44 7700 900123"), "+447700900123");
  assert.equal(telefonoInternacional("12345"), null);
  assert.equal(telefonoInternacional("+0034671434657"), null);
  assert.equal(telefonoInternacional(671434657), null);
});

test("API de reservas con Supabase: si la base de datos rechaza la reserva, el cliente recibe un mensaje claro", async () => {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), "botanic-"));
  let respuesta = { data: { ok: false, motivo: "completo" }, error: null };
  const cliente = clienteFalso({
    tablas: { rpps: [], web_contenido: [] },
    rpc: (nombre) => (nombre === "crear_reserva" ? respuesta : { data: null, error: null })
  });
  const servidor = crearServidor({
    datos, claveAdmin: "x", ahora: () => new Date(2026, 9, 14, 12, 0, 0), lista: { tokenMinMs: 0 },
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
        fecha: "2026-10-14", tipo: "pista", nombre: "Ana Ruiz", telefono: "671 434 657", personas: 4, rpp: null,
        botellas: [{ nombre: "Ron Barceló", cantidad: 1 }], refrescos: [{ nombre: "Coca-Cola", cantidad: 10 }],
        chupitos: [], champan: [], notas: "", token
      })
    });
    return { status: r.status, j: await r.json() };
  };
  try {
    let r = await reservar();
    assert.equal(r.status, 409);
    assert.match(r.j.error, /no quedan mesas/);

    respuesta = { data: { ok: false, motivo: "algo_nuevo" }, error: null };
    r = await reservar();
    assert.equal(r.status, 400);
    assert.match(r.j.error, /No se ha podido registrar la reserva/);

    respuesta = { data: "6f1c2b9e-0000-4000-8000-000000000002", error: null };
    r = await reservar();
    assert.equal(r.status, 201);
    assert.equal(r.j.id, "6f1c2b9e-0000-4000-8000-000000000002");
    const enviada = cliente.llamadas.filter((x) => x.rpc === "crear_reserva").pop().params;
    assert.equal(enviada.p_telefono, "+34671434657");
    assert.equal(enviada.p_total, 50);
  } finally {
    servidor.closeAllConnections();
    await new Promise((r) => servidor.close(r));
    fs.rmSync(datos, { recursive: true, force: true });
  }
});
