/* =========================================================
   COMPROBACIÓN DE LOS SECRETOS AL ARRANCAR
   En producción el servidor NO arranca con secretos ausentes o débiles:
   un panel con una clave fácil es la puerta de entrada más sencilla.
   En local (desarrollo) solo avisa, para no estorbar.

   Producción = NODE_ENV=production, o detrás de un proxy (TRUST_PROXY=1 o remoto):
   el README exige el proxy para publicar la web, así que se detecta aunque
   nadie se acuerde de poner NODE_ENV.
   ========================================================= */
"use strict";

const crypto = require("node:crypto");

const CLAVE_EJEMPLO = "cambia-esta-clave";   // la de .env.example, pública en GitHub
const MIN_ADMIN = 20;
const MIN_DISTINTOS = 8;                      // "aaaaaaaaaaaaaaaaaaaa" tiene 20 caracteres pero no es una clave
const MIN_FORM_SECRET = 32;
const COMO_GENERAR = "Genera una con: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"";

const esProduccion = (env) => env.NODE_ENV === "production" || env.TRUST_PROXY === "1" || env.TRUST_PROXY === "remoto";

/* Revisa las variables de entorno. No sale del proceso ni escribe nada: devuelve
   { produccion, errores, avisos, claveAdmin } y server.js decide (errores → no arranca) */
function revisarEntorno(env) {
  const produccion = esProduccion(env);
  const errores = [];
  const avisos = [];
  // En producción, un problema es un error; en local, un aviso
  const problema = (texto) => (produccion ? errores : avisos).push(texto);

  /* ---------- ADMIN_KEY: la clave del panel ---------- */
  let claveAdmin = env.ADMIN_KEY;
  if (claveAdmin === CLAVE_EJEMPLO) {
    errores.push("ADMIN_KEY es la clave de ejemplo de .env.example (pública en GitHub). Pon una tuya, de 20 caracteres o más.");
  } else if (!claveAdmin) {
    if (produccion) {
      // En producción no se inventa una: se escribiría en el log, y el log no es lugar para una clave
      errores.push(`Falta ADMIN_KEY: en producción el panel necesita una clave fija de ${MIN_ADMIN} caracteres o más. ${COMO_GENERAR}`);
    } else {
      claveAdmin = crypto.randomBytes(18).toString("base64url");
      avisos.push(`ADMIN_KEY no definida (ver .env.example). Clave temporal del panel: ${claveAdmin}`);
    }
  } else if (claveAdmin.length < MIN_ADMIN) {
    problema(`ADMIN_KEY tiene ${claveAdmin.length} caracteres: usa ${MIN_ADMIN} o más. ${COMO_GENERAR}`);
  } else if (new Set(claveAdmin).size < MIN_DISTINTOS) {
    problema(`ADMIN_KEY repite casi siempre los mismos caracteres: usa una clave aleatoria. ${COMO_GENERAR}`);
  }

  /* ---------- FORM_SECRET: firma de los formularios y huella de la IP (lista y log) ----------
     Si falta, se genera uno al arrancar: es seguro, pero los formularios abiertos caducan al reiniciar
     y la misma IP deja de dar la misma huella en el log. Si es corto, se podría adivinar */
  if (!env.FORM_SECRET) {
    if (produccion) avisos.push("Sin FORM_SECRET: los formularios abiertos caducan al reiniciar y la huella de origen del log cambia en cada arranque.");
  } else if (env.FORM_SECRET.length < MIN_FORM_SECRET) {
    problema(`FORM_SECRET tiene ${env.FORM_SECRET.length} caracteres: usa ${MIN_FORM_SECRET} o más. ${COMO_GENERAR}`);
  } else if (env.FORM_SECRET === env.ADMIN_KEY) {
    // Cada secreto, para una sola cosa: si uno se filtra, no arrastra al otro
    problema("FORM_SECRET y ADMIN_KEY son iguales: usa dos claves distintas.");
  }

  /* ---------- Supabase: las dos variables o ninguna ---------- */
  if (!env.SUPABASE_URL !== !env.SUPABASE_SECRET_KEY) {
    errores.push("Falta SUPABASE_URL o SUPABASE_SECRET_KEY en .env: hacen falta las dos (o ninguna, para usar JSON).");
  }

  return { produccion, errores, avisos, claveAdmin };
}

module.exports = { revisarEntorno, esProduccion };
