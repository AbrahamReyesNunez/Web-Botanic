"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validar, normalizar, clave } = require("../js/compartido/nombre.js");

test("acepta nombres reales y los normaliza", () => {
  const casos = {
    "maría josé de la fuente": "María José de la Fuente",
    "  JUAN   garcía  ": "Juan García",
    "o'connor ruiz": "O'Connor Ruiz",
    "ana ruiz-mateos": "Ana Ruiz-Mateos",
    "José Ángel Núñez Peña": "José Ángel Núñez Peña",
    "Lucía Fernández López": "Lucía Fernández López",
    "J. Antonio Pérez": "J. Antonio Pérez",
    "Concha Velasco": "Concha Velasco",
    "Christian Schmidt": "Christian Schmidt",
    "Mari Concepción Ruiz": "Mari Concepción Ruiz"
  };
  for (const [entrada, esperado] of Object.entries(casos)) {
    const r = validar(entrada);
    assert.equal(r.ok, true, `${entrada}: ${r.error}`);
    assert.equal(r.nombre, esperado);
  }
});

test("rechaza nombres incompletos, largos o con caracteres raros", () => {
  const malos = [
    "", "   ", "Juan", "Jo", "J P",
    "Juan123 Pérez", "Juan Pérez 😎", "Juan <script>", "www.ejemplo.com Pepe", "Ejemplo.com Pepe", "Juan_Pérez",
    "a".repeat(200), "Juan " + "Pérez ".repeat(10), "Juan Pérezpérezpérezpérezpérez",
    "Juan -- Pérez", 42, null, undefined, { nombre: "Juan Pérez" }
  ];
  for (const m of malos) assert.equal(validar(m).ok, false, `debería rechazar: ${String(m).slice(0, 30)}`);
});

test("rechaza tecleo aleatorio", () => {
  for (const m of ["asdfgh qwer", "Xkcdtrp Bnmlk", "Juaaaan Pérez", "Bcdfg Hjklm", "Qwerty Uiop"]) {
    assert.equal(validar(m).ok, false, m);
  }
});

test("rechaza insultos, bromas y relleno", () => {
  for (const m of ["Test Test", "Nombre Apellido", "Hijo de Puta", "Gilipollas Total", "Pedro Mierdaseca", "Anonimo Anonimo", "Fulano de Tal", "Maricon Perez", "Juan Polla"]) {
    assert.equal(validar(m).ok, false, m);
  }
});

test("clave de duplicados ignora tildes, mayúsculas y espacios", () => {
  assert.equal(clave(normalizar("  JOSÉ   pérez ")), clave("Jose Perez"));
});
