"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buscar, precioDe, calcular } = require("../js/compartido/reservas.js");

// El catálogo real, tal y como lo carga la web
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "data", "reservados.js"), "utf8"), ctx);
const CAT = ctx.window.BOTANIC_RESERVADOS;

const MIE = 3, JUE = 4, VIE = 5, SAB = 6, DOM = 0;
const item = (grupo, nombre) => CAT[grupo].find((i) => i.nombre === nombre);
const nombres = (grupo, q) => buscar(CAT[grupo], q).map((r) => r.item.nombre);

test("botellas: precio según el día y +20 € las premium", () => {
  const normal = item("botellas", "Ron Barceló");
  const premium = item("botellas", "Ciroc Apple");
  assert.deepEqual([MIE, JUE, VIE, SAB].map((d) => precioDe(CAT, "botellas", normal, d)), [50, 60, 70, 80]);
  assert.deepEqual([MIE, JUE, VIE, SAB].map((d) => precioDe(CAT, "botellas", premium, d)), [70, 80, 90, 100]);
  assert.equal(precioDe(CAT, "botellas", normal, DOM), 80, "noche especial: precio de sábado");
  for (const n of ["Ginebra Seagram's", "Whisky Black Label", "Ciroc Vodka", "Ciroc Peach"]) assert.ok(item("botellas", n).premium, n);
  assert.ok(!item("botellas", "Whisky Red Label").premium);
});

test("chupitos a 50 € todos los días y champán a consultar", () => {
  for (const d of [MIE, SAB]) assert.equal(precioDe(CAT, "chupitos", item("chupitos", "Tequila mango"), d), 50);
  const r = calcular(CAT, [
    { grupo: "botellas", nombre: "Ron Brugal", cantidad: 1 },
    { grupo: "champan", nombre: "Moët blanco", cantidad: 1 }
  ], VIE, "pista");
  assert.equal(r.total, 70);
  assert.ok(r.aConsultar);
});

test("Power King suma 5 € una sola vez, sea 1 lata o 10", () => {
  const con = (n) => calcular(CAT, [
    { grupo: "botellas", nombre: "Absolut Vodka", cantidad: 1 },
    { grupo: "refrescos", nombre: "Power King", cantidad: n }
  ], MIE, "pista");
  assert.equal(con(1).total, 55);
  assert.equal(con(10).total, 55);
  assert.equal(con(0).total, 50);
});

test("máximo 10 refrescos por botella (los chupitos no cuentan)", () => {
  const r = calcular(CAT, [
    { grupo: "botellas", nombre: "Absolut Vodka", cantidad: 1 },
    { grupo: "chupitos", nombre: "Tequila azul", cantidad: 2 },
    { grupo: "refrescos", nombre: "Coca-Cola", cantidad: 8 },
    { grupo: "refrescos", nombre: "Sprite", cantidad: 3 }
  ], JUE, "pista");
  assert.equal(r.refrescosMax, 10);
  assert.equal(r.errores.length, 1);
  assert.equal(r.total, 60 + 100);
});

const conRefrescos = (botellas) => [
  { grupo: "botellas", nombre: "Ron Barceló", cantidad: botellas },
  { grupo: "refrescos", nombre: "Coca-Cola", cantidad: 10 * botellas }
];

test("mínimo de botellas: 1 en pista y 2 en VIP", () => {
  assert.equal(calcular(CAT, conRefrescos(1), SAB, "pista").errores.length, 0);
  assert.equal(calcular(CAT, conRefrescos(1), SAB, "vip").errores.length, 1);
  assert.equal(calcular(CAT, conRefrescos(2), SAB, "vip").errores.length, 0);
  assert.equal(calcular(CAT, [{ grupo: "chupitos", nombre: "Tequila fresa", cantidad: 3 }], SAB, "pista").errores.length, 1);
});

test("hay que elegir todos los refrescos incluidos", () => {
  const pocos = conRefrescos(2);
  pocos[1].cantidad = 13;
  const r = calcular(CAT, pocos, SAB, "vip");
  assert.equal(r.errores.length, 1);
  assert.match(r.errores[0], /faltan 7 refrescos/);
  pocos[1].cantidad = 19;
  assert.match(calcular(CAT, pocos, SAB, "vip").errores[0], /falta 1 refresco:/);
});

test("buscador: sugiere mientras se escribe y traduce otras marcas", () => {
  assert.deepEqual(nombres("refrescos", "coc"), ["Coca-Cola", "Coca-Cola Zero"]);
  assert.equal(nombres("refrescos", "pepsi")[0], "Coca-Cola");
  assert.equal(buscar(CAT.refrescos, "pepsi")[0].alias, "pepsi");
  assert.deepEqual(nombres("refrescos", "seven up"), ["Sprite"]);
  assert.deepEqual(nombres("refrescos", "7up"), ["Sprite"]);
  assert.deepEqual(nombres("refrescos", "red bull"), ["Power King"]);
  assert.deepEqual(nombres("refrescos", "TONICA"), ["Tónica", "Tónica fresa", "Tónica limón"]);
  assert.deepEqual(nombres("botellas", "seagrams"), ["Ginebra Seagram's"]);
  assert.equal(nombres("botellas", "ciroc").length, 5);
  assert.deepEqual(nombres("botellas", "Vodka"), ["Absolut Vodka", "Ciroc Vodka", "Ciroc Coconut", "Ciroc Apple", "Ciroc Red Berry", "Ciroc Peach"]);
  assert.equal(buscar(CAT.botellas, "Ron")[0].alias, null, "la categoría no es un alias");
  assert.deepEqual(nombres("champan", "moet"), ["Moët blanco", "Moët verde"]);
  assert.deepEqual(nombres("refrescos", "zzz"), []);
  assert.equal(nombres("refrescos", "").length, CAT.refrescos.length);
});
