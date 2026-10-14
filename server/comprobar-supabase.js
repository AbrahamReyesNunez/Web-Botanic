/* =========================================================
   COMPROBAR SUPABASE: npm run comprobar-supabase
   Lee los RPPs, apunta un nombre de prueba en una noche lejana,
   comprueba que el duplicado se rechaza y lo borra.
   ========================================================= */
"use strict";

const { cargarEnv } = require("./server.js");
const { crearAlmacenSupabase } = require("./almacen-supabase.js");

const NOCHE_PRUEBA = "2099-12-31";

async function main() {
  cargarEnv();
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en .env.");

  const almacen = crearAlmacenSupabase({ url: SUPABASE_URL, clave: SUPABASE_SECRET_KEY });

  const rpps = await almacen.rpps();
  console.log(`  ✔ Conexión correcta. RPPs: ${rpps.map((r) => r.nombre + (r.activo ? "" : " (inactivo)")).join(", ") || "ninguno"}`);

  const alta = { fecha: NOCHE_PRUEBA, nombre: "Prueba Conexión", clave: "prueba conexion", rpp: null };
  const r = await almacen.anadir(alta);
  if (!r.ok) throw new Error(`No se ha podido apuntar el nombre de prueba (${r.motivo}). Bórralo del ${NOCHE_PRUEBA} en Supabase y repite.`);
  console.log("  ✔ Alta de prueba guardada");

  try {
    const dup = await almacen.anadir(alta);
    if (dup.ok || dup.motivo !== "duplicado") throw new Error("El duplicado no se ha rechazado.");
    console.log("  ✔ Duplicado rechazado");
    const noche = await almacen.deNoche(NOCHE_PRUEBA);
    if (!noche.some((x) => x.id === r.inscripcion.id)) throw new Error("El alta no aparece al leer la noche.");
    console.log("  ✔ Lectura de la noche");
  } finally {
    if (!(await almacen.borrar(r.inscripcion.id))) throw new Error("No se ha podido borrar el alta de prueba.");
    console.log("  ✔ Alta de prueba borrada");
  }
  console.log("\n  Todo en orden: la lista ya puede usar Supabase.\n");
}

main().catch((e) => {
  console.error(`\n  ✘ ${e.message}\n`);
  if (/schema cache|does not exist|Could not find/i.test(e.message)) {
    console.error("  Parece que faltan las tablas: ejecuta supabase/schema.sql en Supabase → SQL Editor.\n");
  } else if (/Invalid API key|JWT|401|permission denied/i.test(e.message)) {
    console.error("  Revisa SUPABASE_SECRET_KEY en .env: tiene que ser la clave secreta (sb_secret_…), no la pública.\n");
  }
  process.exitCode = 1;
});
