"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { esc } = require("../public/js/compartido/dom.js");

test("esc escapa los caracteres especiales de HTML", () => {
  assert.equal(esc(`<a href="x" title='y'>R&B</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;R&amp;B&lt;/a&gt;");
  assert.equal(esc("Noche Tropical"), "Noche Tropical");
});

test("esc convierte null y undefined en texto vacío y los números en texto", () => {
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc(0), "0");
});
