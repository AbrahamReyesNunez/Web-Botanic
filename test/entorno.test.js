"use strict";
/* Secretos al arrancar (server/entorno.js): en producción, ausentes o débiles = no arranca */
const test = require("node:test");
const assert = require("node:assert/strict");
const { revisarEntorno, esProduccion } = require("../server/entorno.js");

const BUENA = "Zq3vL8wPm2Xr7KtN4bYc9HdJ";                       // 24 caracteres, variados
const SECRETO = "aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0eF3hJ6";          // 36
const PROD = { TRUST_PROXY: "1", ADMIN_KEY: BUENA, FORM_SECRET: SECRETO };

test("qué es producción: NODE_ENV=production o detrás de un proxy", () => {
  assert.equal(esProduccion({ NODE_ENV: "production" }), true);
  assert.equal(esProduccion({ TRUST_PROXY: "1" }), true);
  assert.equal(esProduccion({ TRUST_PROXY: "remoto" }), true);
  assert.equal(esProduccion({ TRUST_PROXY: "0" }), false);
  assert.equal(esProduccion({}), false);
});

test("producción con claves buenas: arranca sin errores ni avisos", () => {
  const r = revisarEntorno(PROD);
  assert.equal(r.produccion, true);
  assert.deepEqual(r.errores, []);
  assert.deepEqual(r.avisos, []);
  assert.equal(r.claveAdmin, BUENA);
});

test("la clave de ejemplo de .env.example nunca arranca, tampoco en local", () => {
  assert.equal(revisarEntorno({ ADMIN_KEY: "cambia-esta-clave" }).errores.length, 1);
  assert.equal(revisarEntorno({ ...PROD, ADMIN_KEY: "cambia-esta-clave" }).errores.length, 1);
});

test("producción sin ADMIN_KEY: no arranca y no se inventa una clave (acabaría en el log)", () => {
  const r = revisarEntorno({ ...PROD, ADMIN_KEY: "" });
  assert.equal(r.errores.length, 1);
  assert.match(r.errores[0], /Falta ADMIN_KEY/);
  assert.equal(r.claveAdmin, "");
  assert.ok(!r.avisos.some((a) => /temporal/.test(a)));
});

test("local sin ADMIN_KEY: genera una temporal y avisa", () => {
  const r = revisarEntorno({});
  assert.deepEqual(r.errores, []);
  assert.ok(r.claveAdmin.length >= 20);
  assert.ok(r.avisos.some((a) => a.includes(r.claveAdmin)));
});

test("ADMIN_KEY corta o repetitiva: error en producción, aviso en local", () => {
  for (const mala of ["corta-de-19-caracte", "aaaaaaaaaaaaaaaaaaaaaaaa", "abababababababababababab"]) {
    assert.equal(revisarEntorno({ ...PROD, ADMIN_KEY: mala }).errores.length, 1, mala);
    const local = revisarEntorno({ ADMIN_KEY: mala });
    assert.deepEqual(local.errores, [], mala);
    assert.equal(local.avisos.length, 1, mala);
  }
});

test("FORM_SECRET: corto o igual que ADMIN_KEY no arranca en producción; ausente solo avisa", () => {
  assert.match(revisarEntorno({ ...PROD, FORM_SECRET: "corto" }).errores[0], /FORM_SECRET tiene 5/);
  const igual = "Zq3vL8wPm2Xr7KtN4bYc9HdJaB3dE6gH9jK2";
  assert.match(revisarEntorno({ ...PROD, ADMIN_KEY: igual, FORM_SECRET: igual }).errores[0], /iguales/);
  const sin = revisarEntorno({ ...PROD, FORM_SECRET: "" });
  assert.deepEqual(sin.errores, []);
  assert.match(sin.avisos[0], /Sin FORM_SECRET/);
  assert.deepEqual(revisarEntorno({ ADMIN_KEY: BUENA }).avisos, [], "en local, sin FORM_SECRET no molesta");
});

test("Supabase: hacen falta las dos variables o ninguna", () => {
  assert.equal(revisarEntorno({ ...PROD, SUPABASE_URL: "https://x.supabase.co" }).errores.length, 1);
  assert.equal(revisarEntorno({ ...PROD, SUPABASE_SECRET_KEY: "sb_secret_x" }).errores.length, 1);
  assert.deepEqual(revisarEntorno({ ...PROD, SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_x" }).errores, []);
});

test("los mensajes nunca repiten la clave que se ha puesto", () => {
  const mala = "MiClaveSecreta12";
  const r = revisarEntorno({ ...PROD, ADMIN_KEY: mala, FORM_SECRET: "otroSecretoCorto" });
  for (const m of [...r.errores, ...r.avisos]) {
    assert.ok(!m.includes(mala) && !m.includes("otroSecretoCorto"), m);
  }
});
