/* =========================================================
   COMPROBAR SUPABASE: npm run comprobar-supabase
   Mira qué migraciones faltan, lee los RPPs, apunta un nombre y
   pide una reserva de prueba en una noche lejana, comprueba que los
   duplicados se rechazan y lo borra todo.
   ========================================================= */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const { cargarEnv } = require("./server.js");
const { crearAlmacenSupabase } = require("./almacen-supabase.js");

const NOCHE_PRUEBA = "2099-12-31";
const DIR_MIGRACIONES = path.join(__dirname, "..", "supabase", "migrations");

async function migracionesPendientes(url, clave) {
  const base = String(url).trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const db = createClient(base, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.from("migraciones").select("nombre");
  const aplicadas = new Set(error ? [] : data.map((x) => x.nombre));
  return fs.readdirSync(DIR_MIGRACIONES).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort()
    .filter((f) => !aplicadas.has(f.replace(/\.sql$/, "")));
}

async function main() {
  cargarEnv();
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en .env.");

  const almacen = crearAlmacenSupabase({ url: SUPABASE_URL, clave: SUPABASE_SECRET_KEY });

  const rpps = await almacen.rpps();
  console.log(`  ✔ Conexión correcta. RPPs: ${rpps.map((r) => r.nombre + (r.activo ? "" : " (inactivo)")).join(", ") || "ninguno"}`);

  const pendientes = await migracionesPendientes(SUPABASE_URL, SUPABASE_SECRET_KEY);
  if (pendientes.length) {
    throw new Error(`Faltan migraciones: ${pendientes.join(", ")}. Aplícalas en orden en Supabase → SQL Editor.`);
  }
  console.log("  ✔ Todas las migraciones aplicadas");

  // ---------- Lista ----------
  const alta = { fecha: NOCHE_PRUEBA, nombre: "Prueba Conexión", clave: "prueba conexion", rpp: null };
  const r = await almacen.anadir(alta);
  if (!r.ok) throw new Error(`No se ha podido apuntar el nombre de prueba (${r.motivo}). Bórralo del ${NOCHE_PRUEBA} en Supabase y repite.`);
  console.log("  ✔ Alta de prueba en la lista");

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

  // ---------- Reservas ----------
  const reserva = {
    fecha: NOCHE_PRUEBA, tipo: "pista", nombre: "Prueba Conexión", telefono: "+34600000000",
    personas: 2, rpp: null, notas: "", total: 50, aConsultar: false
  };
  const lineas = [{ grupo: "botellas", producto: "Prueba", cantidad: 1, precio: 50 }];
  const res = await almacen.crearReserva(reserva, lineas);
  if (!res.ok) throw new Error(`No se ha podido crear la reserva de prueba (${res.motivo}). Bórrala del ${NOCHE_PRUEBA} en Supabase y repite.`);
  console.log("  ✔ Reserva de prueba");
  try {
    const dup = await almacen.crearReserva(reserva, lineas);
    if (dup.ok || dup.motivo !== "duplicado") throw new Error("La reserva repetida no se ha rechazado.");
    console.log("  ✔ Reserva con el mismo teléfono rechazada");
    const d = await almacen.disponibilidad(NOCHE_PRUEBA, NOCHE_PRUEBA);
    if (!d.mesas.pista) throw new Error("No se leen las mesas de tipos_mesa.");
    console.log(`  ✔ Aforo: ${Object.entries(d.mesas).map(([t, n]) => `${n} ${t}`).join(", ")}`);
  } finally {
    if (!(await almacen.borrarReserva(res.id))) throw new Error("No se ha podido borrar la reserva de prueba.");
    console.log("  ✔ Reserva de prueba borrada");
  }

  console.log("\n  Todo en orden: la lista y las reservas ya pueden usar Supabase.\n");
}

main().catch((e) => {
  console.error(`\n  ✘ ${e.message}\n`);
  if (/schema cache|does not exist|Could not find/i.test(e.message)) {
    console.error("  Parece que faltan tablas o funciones: aplica las migraciones de supabase/migrations en Supabase → SQL Editor.\n");
  } else if (/Invalid API key|JWT|401|permission denied/i.test(e.message)) {
    console.error("  Revisa SUPABASE_SECRET_KEY en .env: tiene que ser la clave secreta (sb_secret_…), no la pública.\n");
  }
  process.exitCode = 1;
});
