/* =========================================================
   TOKEN DE FORMULARIO (lista y reservas)
   El navegador lo pide al abrir el formulario (/api/form-token) y lo
   devuelve al enviar. Va firmado con HMAC: no se puede inventar, y se
   rechaza si es demasiado reciente (bots que envían al instante) o viejo.
   ========================================================= */
"use strict";

const crypto = require("node:crypto");

const MIN = 60_000;

function crearTokens({ secreto, minMs = 3000, maxMs = 2 * 60 * MIN }) {
  const firmar = (ts) => crypto.createHmac("sha256", secreto).update(String(ts)).digest("base64url");

  function crear() {
    const ts = Date.now();
    return `${ts}.${firmar(ts)}`;
  }

  function valido(token) {
    if (typeof token !== "string" || token.length > 100) return false;
    const [ts, firma] = token.split(".");
    if (!/^\d{10,16}$/.test(ts || "") || !firma) return false;
    const esperada = Buffer.from(firmar(ts));
    const recibida = Buffer.from(firma);
    if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return false;
    const edad = Date.now() - Number(ts);
    return edad >= minMs && edad <= maxMs;
  }

  return { crear, valido };
}

module.exports = { crearTokens };
