/* =========================================================
   COMPROBAR SUPABASE: npm run comprobar-supabase
   Comprueba que el servidor y la base de datos (migraciones de
   supabase/migrations) encajan. Todo lo que crea lo borra al acabar:
   1. Lee los RPPs.
   2. Lista: apunta un nombre de prueba en una noche lejana, comprueba
      que el duplicado se rechaza y lo borra.
   3. Reservados: crea una reserva de prueba con sus bebidas
      (crear_reserva), la vuelve a leer y la borra.
   4. Lee la disponibilidad de mesas y la tabla del panel de la web.
   ========================================================= */
"use strict";

const { createClient } = require("@supabase/supabase-js");
const { cargarEnv } = require("./server.js");
const { crearAlmacenSupabase } = require("./almacen-supabase.js");

const NOCHE_PRUEBA = "2099-12-31";

async function main() {
  cargarEnv();
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en .env.");

  const almacen = crearAlmacenSupabase({ url: SUPABASE_URL, clave: SUPABASE_SECRET_KEY });
  // Cliente directo solo para borrar la reserva de prueba (el servidor nunca borra reservas)
  const db = createClient(String(SUPABASE_URL).trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, ""), SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  // ---------- 1. RPPs ----------
  const rpps = await almacen.rpps();
  console.log(`  ✔ Conexión correcta. RPPs: ${rpps.map((r) => r.nombre + (r.activo ? "" : " (inactivo)")).join(", ") || "ninguno"}`);

  // ---------- 2. Lista ----------
  const alta = { fecha: NOCHE_PRUEBA, nombre: "Prueba Conexión", clave: "prueba conexion", rpp: null };
  const r = await almacen.anadir(alta);
  if (!r.ok) throw new Error(`No se ha podido apuntar el nombre de prueba (${r.motivo}). Bórralo del ${NOCHE_PRUEBA} en Supabase y repite.`);
  console.log("  ✔ Lista: alta de prueba guardada");
  try {
    const dup = await almacen.anadir(alta);
    if (dup.ok || dup.motivo !== "duplicado") throw new Error("El duplicado no se ha rechazado.");
    console.log("  ✔ Lista: duplicado rechazado");
    const noche = await almacen.deNoche(NOCHE_PRUEBA);
    if (!noche.some((x) => x.id === r.inscripcion.id)) throw new Error("El alta no aparece al leer la noche.");
    console.log("  ✔ Lista: lectura de la noche");
  } finally {
    if (!(await almacen.borrar(r.inscripcion.id))) throw new Error("No se ha podido borrar el alta de prueba.");
    console.log("  ✔ Lista: alta de prueba borrada");
  }

  // ---------- 3. Reservados ----------
  const prueba = {
    fecha: NOCHE_PRUEBA, tipo: "pista", nombre: "Prueba Conexión", telefono: "+34600000000", personas: 2, rpp: null,
    botellas: [{ nombre: "Prueba botella", cantidad: 1, precio: 50 }],
    refrescos: [{ nombre: "Prueba refresco", cantidad: 10, precio: 0 }],
    chupitos: [], champan: [],
    total: 50, aConsultar: false, notas: "Prueba de npm run comprobar-supabase: se borra sola"
  };
  const reserva = await almacen.crearReserva(prueba);
  if (!reserva.ok) {
    throw new Error(reserva.motivo === "datos"
      ? "La base de datos no acepta la reserva de prueba (alguna regla de la tabla reservas). Mira el mensaje de arriba: si es el teléfono, dime qué formato pide."
      : `crear_reserva rechaza la reserva de prueba (motivo: ${reserva.motivo}).`);
  }
  console.log("  ✔ Reservados: reserva de prueba guardada con crear_reserva");
  try {
    const leidas = await almacen.reservasDeNoche(NOCHE_PRUEBA);
    const leida = leidas.find((x) => x.id === reserva.reserva.id);
    if (!leida) throw new Error("La reserva de prueba no aparece al leer la noche.");
    if (leida.botellas.length !== 1 || leida.refrescos.length !== 1 || leida.botellas[0].precio !== 50) {
      throw new Error(`Las bebidas no se han guardado bien en reserva_lineas: ${JSON.stringify({ botellas: leida.botellas, refrescos: leida.refrescos })}`);
    }
    console.log(`  ✔ Reservados: lectura con sus bebidas (estado: ${leida.estado}, teléfono guardado: ${leida.telefono})`);
  } finally {
    const id = reserva.reserva.id;
    const lineas = await db.from("reserva_lineas").delete().eq("reserva", id);
    const borrada = await db.from("reservas").delete().eq("id", id).select("id");
    if (lineas.error || borrada.error || !borrada.data.length) {
      throw new Error(`No se ha podido borrar la reserva de prueba (${(lineas.error || borrada.error || {}).message || "no encontrada"}). Bórrala a mano: reservas del ${NOCHE_PRUEBA}.`);
    }
    console.log("  ✔ Reservados: reserva de prueba borrada");
  }

  // ---------- 4. Lecturas ----------
  const disp = await db.rpc("disponibilidad_reservas", { p_desde: NOCHE_PRUEBA, p_hasta: NOCHE_PRUEBA });
  if (disp.error) throw new Error(`Supabase (disponibilidad_reservas): ${disp.error.message}`);
  console.log(`  ✔ Mesas por noche: ${disp.data.map((x) => `${x.tipo} ${x.mesas}`).join(", ")}`);

  await almacen.leerContenido();
  console.log("  ✔ Tabla del panel de la web (web_contenido)");

  console.log("\n  Todo en orden: la lista, los reservados y el panel ya pueden usar Supabase.\n");
}

main().catch((e) => {
  console.error(`\n  ✘ ${e.message}\n`);
  if (/web_contenido/.test(e.message)) {
    console.error("  Falta la tabla del panel: ejecuta supabase/migrations/005_web_contenido.sql en Supabase → SQL Editor.\n");
  } else if (/schema cache|does not exist|Could not find/i.test(e.message)) {
    console.error("  Faltan tablas o funciones: aplica las migraciones de supabase/migrations en Supabase → SQL Editor.\n");
  } else if (/Invalid API key|JWT|401|permission denied/i.test(e.message)) {
    console.error("  Revisa SUPABASE_SECRET_KEY en .env: tiene que ser la clave secreta (sb_secret_…), no la pública.\n");
  }
  process.exitCode = 1;
});
