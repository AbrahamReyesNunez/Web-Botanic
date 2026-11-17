/* =========================================================
   LÍMITE DE PETICIONES POR CLAVE (normalmente la IP), en memoria
   ventanas: [{ ms, max }] — se cumplen todas a la vez.
   ========================================================= */
"use strict";

function crearLimitador(ventanas) {
  const mayor = Math.max(...ventanas.map((v) => v.ms));
  const registros = new Map(); // clave -> [marcas de tiempo]

  function limpiar(ahora) {
    for (const [k, marcas] of registros) {
      const vivas = marcas.filter((t) => ahora - t < mayor);
      if (vivas.length) registros.set(k, vivas); else registros.delete(k);
    }
  }
  const temporizador = setInterval(() => limpiar(Date.now()), 60_000);
  temporizador.unref();

  /* ¿Se puede hacer otra? No la apunta: para eso está anotar() */
  function comprobar(clave, ahora = Date.now()) {
    const marcas = registros.get(clave) || [];
    for (const v of ventanas) {
      const dentro = marcas.filter((t) => ahora - t < v.ms);
      if (dentro.length >= v.max) {
        const esperar = Math.ceil((v.ms - (ahora - dentro[0])) / 1000);
        return { ok: false, esperar };
      }
    }
    return { ok: true };
  }

  function anotar(clave, ahora = Date.now()) {
    const marcas = registros.get(clave) || [];
    marcas.push(ahora);
    registros.set(clave, marcas);
    return ahora;
  }

  /* Comprueba y apunta a la vez, antes de cualquier espera: si se comprobara aquí y se apuntara
     después de esperar a la base de datos, varias peticiones simultáneas pasarían todas la comprobación.
     Devuelve { ok, marca } para devolver el hueco con liberar() si al final no se hace */
  function reservar(clave, ahora = Date.now()) {
    const r = comprobar(clave, ahora);
    if (!r.ok) return r;
    return { ok: true, marca: anotar(clave, ahora) };
  }

  function liberar(clave, marca) {
    const marcas = registros.get(clave);
    if (!marcas) return;
    const i = marcas.lastIndexOf(marca);
    if (i !== -1) marcas.splice(i, 1);
    if (!marcas.length) registros.delete(clave);
  }

  return { comprobar, anotar, reservar, liberar, cerrar: () => clearInterval(temporizador) };
}

module.exports = { crearLimitador };
