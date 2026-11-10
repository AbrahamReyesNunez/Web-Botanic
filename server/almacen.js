/* =========================================================
   ALMACÉN EN JSON (desarrollo local y pruebas)
   - rpps.json: lo edita el equipo a mano; se relee solo si cambia.
   - inscripciones.json y reservas.json: los escribe el servidor. Las
     escrituras van en cola y son atómicas (archivo temporal + rename).
   - mesas.json (opcional): mesas de cada tipo, p. ej. {"pista": 30, "vip": 7}.
   En producción se usa almacen-supabase.js, con la misma interfaz:
   todo devuelve promesas; anadir() y crearReserva() comprueban duplicados,
   topes y aforo igual que las funciones de la base de datos.
   ========================================================= */
"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const MESAS_POR_DEFECTO = { pista: 30, vip: 7 };
const ACTIVAS = new Set(["pendiente", "confirmada"]);
const ESTADOS = new Set(["pendiente", "confirmada", "rechazada", "cancelada", "caducada"]);

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
  const archivoReservas = path.join(dir, "reservas.json");
  const archivoMesas = path.join(dir, "mesas.json");
  fs.mkdirSync(dir, { recursive: true });

  let rppsCache = [];
  let rppsMtime = -1;
  const inscripciones = leerJSON(archivoInscripciones, []);
  const reservas = leerJSON(archivoReservas, []);
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

  function guardarEn(archivo, lista) {
    const datos = JSON.stringify(lista, null, 2);
    cola = cola.then(async () => {
      const tmp = `${archivo}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, datos, "utf8");
      await fsp.rename(tmp, archivo);
    });
    return cola;
  }
  const guardar = () => guardarEn(archivoInscripciones, inscripciones);
  const guardarReservas = () => guardarEn(archivoReservas, reservas);

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

  /* ---------- Reservas ---------- */
  const mesas = () => leerJSON(archivoMesas, MESAS_POR_DEFECTO);
  const confirmadasDe = (fecha, tipo, salvo) =>
    reservas.filter((x) => x.fecha === fecha && x.tipo === tipo && x.estado === "confirmada" && x.id !== salvo).length;

  async function crearReserva(r, lineas) {
    const m = mesas();
    if (!Object.prototype.hasOwnProperty.call(m, r.tipo)) return { ok: false, motivo: "tipo" };
    if (confirmadasDe(r.fecha, r.tipo) >= m[r.tipo]) return { ok: false, motivo: "completo" };
    if (reservas.some((x) => x.fecha === r.fecha && x.telefono === r.telefono && ACTIVAS.has(x.estado))) {
      return { ok: false, motivo: "duplicado" };
    }
    const nueva = {
      id: crypto.randomUUID(), fecha: r.fecha, tipo: r.tipo, estado: "pendiente",
      nombre: r.nombre, telefono: r.telefono, personas: r.personas, rpp: r.rpp, notas: r.notas || null,
      total: r.total, a_consultar: !!r.aConsultar, creado: new Date().toISOString(), decidido: null,
      lineas: lineas.map((l) => ({ ...l }))
    };
    reservas.push(nueva);
    await guardarReservas();
    return { ok: true, id: nueva.id };
  }

  /* Lo que en Supabase hace el trigger de aforo al cambiar el estado */
  async function decidirReserva(id, estado) {
    if (!ESTADOS.has(estado)) return { ok: false, motivo: "estado" };
    const x = reservas.find((r) => r.id === id);
    if (!x) return { ok: false, motivo: "no_existe" };
    if (estado === "confirmada" && x.estado !== "confirmada" && confirmadasDe(x.fecha, x.tipo, x.id) >= (mesas()[x.tipo] ?? 0)) {
      return { ok: false, motivo: "completo" };
    }
    if (estado !== x.estado) x.decidido = estado === "pendiente" ? null : new Date().toISOString();
    x.estado = estado;
    await guardarReservas();
    return { ok: true };
  }

  async function borrarReserva(id) {
    const i = reservas.findIndex((x) => x.id === id);
    if (i === -1) return false;
    reservas.splice(i, 1);
    await guardarReservas();
    return true;
  }

  function disponibilidad(desde, hasta) {
    const cuenta = new Map();
    for (const x of reservas) {
      if (x.estado !== "confirmada" || x.fecha < desde || x.fecha > hasta) continue;
      const k = `${x.fecha}|${x.tipo}`;
      cuenta.set(k, (cuenta.get(k) || 0) + 1);
    }
    return {
      mesas: { ...mesas() },
      confirmadas: [...cuenta].map(([k, total]) => { const [fecha, tipo] = k.split("|"); return { fecha, tipo, total }; })
    };
  }

  return {
    tipo: "json",
    rpps: async () => rpps(),
    rppActivo: async (codigo) => rppActivo(codigo),
    deNoche: async (fecha) => deNoche(fecha),
    recuentoNoches: async () => recuentoNoches(),
    anadir,
    borrar,
    crearReserva,
    decidirReserva,
    borrarReserva,
    reservas: async () => reservas.map((x) => ({ ...x })),
    disponibilidad: async (desde, hasta) => disponibilidad(desde, hasta),
    esperar: () => cola
  };
}

module.exports = { crearAlmacen };
