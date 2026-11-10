/* =========================================================
   ALMACÉN EN JSON (desarrollo local y pruebas)
   - rpps.json: lo gestiona el panel; se relee si cambia externamente.
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
  const archivoReservas = path.join(dir, "reservas.json");
  fs.mkdirSync(dir, { recursive: true });

  let rppsCache = [];
  let rppsMtime = -1;
  const inscripciones = leerJSON(archivoInscripciones, []);
  const reservas = leerJSON(archivoReservas, []);
  let cola = Promise.resolve();
  let colaRpps = Promise.resolve();
  let colaReservas = Promise.resolve();

  function rpps() {
    let mtime = 0;
    try { mtime = fs.statSync(archivoRpps).mtimeMs; } catch (e) { /* sin archivo: sin RPPs */ }
    if (mtime !== rppsMtime) {
      rppsMtime = mtime;
      rppsCache = mtime ? leerJSON(archivoRpps, []) : [];
    }
    return rppsCache;
  }

  function actualizarRpps(mutar) {
    const operacion = colaRpps.then(async () => {
      const lista = [...rpps()];
      const resultado = mutar(lista);
      if (resultado === null) return null;
      const tmp = `${archivoRpps}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(lista, null, 2), "utf8");
      await fsp.rename(tmp, archivoRpps);
      rppsCache = lista;
      rppsMtime = fs.statSync(archivoRpps).mtimeMs;
      return resultado;
    });
    colaRpps = operacion.then(() => undefined, () => undefined);
    return operacion;
  }

  /* Sin código se genera uno como en Supabase (nuevo_codigo_rpp): 8 caracteres hexadecimales */
  function crearRpp({ codigo, nombre }) {
    return actualizarRpps((lista) => {
      if (codigo && lista.some((x) => x.codigo === codigo)) throw new Error("Ya existe un RPP con ese código.");
      while (!codigo || lista.some((x) => x.codigo === codigo)) codigo = crypto.randomBytes(4).toString("hex");
      const nuevo = { codigo, nombre, activo: true };
      lista.push(nuevo);
      return nuevo;
    });
  }

  function actualizarRpp(codigo, cambios) {
    return actualizarRpps((lista) => {
      const indice = lista.findIndex((x) => x.codigo === codigo);
      if (indice < 0) return null;
      lista[indice] = { ...lista[indice], ...cambios };
      return lista[indice];
    });
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

  function guardarReservas() {
    const datos = JSON.stringify(reservas, null, 2);
    colaReservas = colaReservas.then(async () => {
      const tmp = `${archivoReservas}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, datos, "utf8");
      await fsp.rename(tmp, archivoReservas);
    });
    return colaReservas;
  }

  /* Igual que crear_reserva en Supabase: entra como "pendiente" hasta que se confirma o se rechaza */
  async function crearReserva(datos) {
    const reserva = { id: crypto.randomUUID(), estado: "pendiente", ...datos, creado: new Date().toISOString(), decidido: null };
    reservas.push(reserva);
    await guardarReservas();
    return { ok: true, reserva };
  }

  const reservasDeNoche = async (fecha) => reservas.filter((x) => x.fecha === fecha);
  const recuentoReservas = async () => {
    const cuenta = new Map();
    for (const x of reservas) cuenta.set(x.fecha, (cuenta.get(x.fecha) || 0) + 1);
    return [...cuenta].map(([fecha, total]) => ({ fecha, total }));
  };

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

  /* Contenido de la web que se edita desde el panel: { eventos, dias, galeria } en contenido.json */
  const archivoContenido = path.join(dir, "contenido.json");
  let colaContenido = Promise.resolve();
  const leerContenido = async () => ({ eventos: {}, dias: {}, galeria: {}, ...leerJSON(archivoContenido, {}) });

  function guardarContenido(seccion, valor) {
    const operacion = colaContenido.then(async () => {
      const contenido = await leerContenido();
      contenido[seccion] = valor;
      const tmp = `${archivoContenido}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(contenido, null, 2), "utf8");
      await fsp.rename(tmp, archivoContenido);
    });
    colaContenido = operacion.then(() => undefined, () => undefined);
    return operacion;
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
    reservasDeNoche,
    recuentoReservas,
    crearReserva,
    anadir,
    borrar,
    crearRpp,
    actualizarRpp,
    leerContenido,
    guardarContenido,
    esperar: () => Promise.all([cola, colaRpps, colaReservas, colaContenido])
  };
}

module.exports = { crearAlmacen };
