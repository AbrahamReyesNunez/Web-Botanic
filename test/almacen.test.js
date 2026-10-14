"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { crearAlmacen } = require("../server/almacen.js");

async function conAlmacen(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "botanic-almacen-"));
  const almacen = crearAlmacen(dir);
  try { await fn(almacen); } finally {
    await almacen.esperar();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const alta = (fecha, clave, rpp = null) => ({ fecha, nombre: clave, clave, rpp });

test("anadir: duplicados y topes por noche y por RPP", async () => {
  await conAlmacen(async (a) => {
    const topes = { maxPorNoche: 3, maxPorRppNoche: 2 };
    assert.equal((await a.anadir(alta("2026-10-14", "ana ruiz", "aaaa1111"), topes)).ok, true);
    assert.deepEqual(await a.anadir(alta("2026-10-14", "ana ruiz"), topes), { ok: false, motivo: "duplicado" });
    assert.equal((await a.anadir(alta("2026-10-14", "luis mora", "aaaa1111"), topes)).ok, true);
    assert.deepEqual(await a.anadir(alta("2026-10-14", "eva sanz", "aaaa1111"), topes), { ok: false, motivo: "rpp_lleno" });
    assert.equal((await a.anadir(alta("2026-10-14", "eva sanz"), topes)).ok, true);
    assert.deepEqual(await a.anadir(alta("2026-10-14", "ines vega"), topes), { ok: false, motivo: "noche_llena" });

    // Otra noche empieza de cero, y el mismo nombre vale
    assert.equal((await a.anadir(alta("2026-10-15", "ana ruiz", "aaaa1111"), topes)).ok, true);
  });
});

test("recuento por noche y borrado", async () => {
  await conAlmacen(async (a) => {
    const { inscripcion } = await a.anadir(alta("2026-10-14", "ana ruiz"));
    await a.anadir(alta("2026-10-14", "luis mora"));
    await a.anadir(alta("2026-10-15", "eva sanz"));

    const recuento = Object.fromEntries((await a.recuentoNoches()).map((x) => [x.fecha, x.total]));
    assert.deepEqual(recuento, { "2026-10-14": 2, "2026-10-15": 1 });

    assert.equal(await a.borrar(inscripcion.id), true);
    assert.equal(await a.borrar(inscripcion.id), false);
    assert.equal((await a.deNoche("2026-10-14")).length, 1);
  });
});
