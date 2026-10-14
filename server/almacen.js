/* =========================================================
   ALMACÉN EN JSON (desarrollo local y pruebas)
   - rpps.json: lo edita el equipo a mano; se relee solo si cambia.
   - inscripciones.json: lo escribe el servidor. Las escrituras van en
     cola y son atómicas (archivo temporal + rename) para no corromperlo.
   En producción se usa almacen-supabase.js, con la misma interfaz:
   todo devuelve promesas y anadir() comprueba duplicados y topes.
   ========================================================= */
"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function leerJSON(archivo, defecto) {
  try {
    return JSON.parse(fs.readFileSync(archivo, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return defecto;
    throw new Error(`No se puede leer ${archivo}: ${e.message}`);
  }
}

function crearAlmacen(dir) {
  const archivoRpps = path.join(dir, "rpps.json");
  const archivoInscripciones = path.join(dir, "inscripciones.json");
  fs.mkdirSync(dir, { recursive: true });

  let rppsCache = [];
  let rppsMtime = -1;
  const inscripciones = leerJSON(archivoInscripciones, []);
  let cola = Promise.resolve();

  function rpps() {
    let mtime = 0;
    try { mtime = fs.statSync(archivoRpps).mtimeMs; } catch (e) { /* sin archivo: sin RPPs */ }
    if (mtime !== rppsMtime) {
      rppsMtime = mtime;
      rppsCache = mtime ? leerJSON(archivoRpps, []) : [];
    }
    return rppsCache;
  }

  const rppActivo = (codigo) => rpps().find((r) => r.codigo === codigo && r.activo !== false) || null;

  function guardar() {
    const datos = JSON.stringify(inscripciones, null, 2);
    cola = cola.then(async () => {
      const tmp = `${archivoInscripciones}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, datos, "utf8");
      await fsp.rename(tmp, archivoInscripciones);
    });
    return cola;
  }

  const deNoche = (fecha) => inscripciones.filter((x) => x.fecha === fecha);

  /* Node atiende una petición cada vez, así que comprobar e insertar aquí es atómico */
  async function anadir({ fecha, nombre, clave, rpp }, topes = {}) {
    const noche = deNoche(fecha);
    if (noche.some((x) => x.clave === clave)) return { ok: false, motivo: "duplicado" };
    if (topes.maxPorNoche && noche.length >= topes.maxPorNoche) return { ok: false, motivo: "noche_llena" };
    if (rpp && topes.maxPorRppNoche && noche.filter((x) => x.rpp === rpp).length >= topes.maxPorRppNoche) {
      return { ok: false, motivo: "rpp_lleno" };
    }
    const nueva = { id: crypto.randomUUID(), fecha, nombre, clave, rpp, creado: new Date().toISOString() };
    inscripciones.push(nueva);
    await guardar();
    return { ok: true, inscripcion: nueva };
  }

  async function borrar(id) {
    const i = inscripciones.findIndex((x) => x.id === id);
    if (i === -1) return false;
    inscripciones.splice(i, 1);
    await guardar();
    return true;
  }

  function recuentoNoches() {
    const cuenta = new Map();
    for (const x of inscripciones) cuenta.set(x.fecha, (cuenta.get(x.fecha) || 0) + 1);
    return [...cuenta].map(([fecha, total]) => ({ fecha, total }));
  }

  return {
    tipo: "json",
    rpps: async () => rpps(),
    rppActivo: async (codigo) => rppActivo(codigo),
    deNoche: async (fecha) => deNoche(fecha),
    recuentoNoches: async () => recuentoNoches(),
    anadir,
    borrar,
    esperar: () => cola
  };
}

module.exports = { crearAlmacen };
