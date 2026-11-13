/* =========================================================
   CONTENIDO DE LA WEB: lo que se edita desde el panel
   - eventos: nombre, DJ invitado, texto, Instagram y foto de cada noche
   - dias:    días que se cierran o se abren aunque no toque
   - galeria: nombre, portada y anclados de los álbumes de Drive
   - ajustes: estilo de la web según la época (verano, navidad, halloween, carnaval)
   La web lo recibe en /api/web.js (window.BOTANIC_WEB).
   ========================================================= */
"use strict";

const crypto = require("node:crypto");

const ID_DRIVE = /^[A-Za-z0-9_-]{10,100}$/;
const INSTAGRAM = /^https:\/\/(www\.)?instagram\.com\/[^\s"'<>]{1,200}$/;
const TIPOS_FOTO = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_ANCLADAS = 200;
const TEMAS = ["verano", "navidad", "halloween", "carnaval"];   // verano = el estilo de siempre

const vacio = () => ({ eventos: {}, dias: {}, galeria: {}, ajustes: {} });
/* Supabase sin la tabla web_contenido (falta la migración supabase/migrations/005_web_contenido.sql) */
const faltaTabla = (e) => /web_contenido/.test(e && e.message) && /schema cache|does not exist|Could not find/i.test(e.message);
/* La tabla aún no admite la sección "ajustes" (falta la migración 006_tema_web.sql) */
const faltaAjustes = (e) => /web_contenido_seccion_check/.test(e && e.message);
const ok = (cuerpo = {}, status = 200) => ({ status, cuerpo: { ok: true, ...cuerpo } });
const error = (status, mensaje) => ({ status, cuerpo: { ok: false, error: mensaje } });

/* Texto opcional: sin espacios sobrantes, sin caracteres de control y con un máximo */
function texto(v, max) {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string" || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(v)) return null;
  const t = v.trim();
  return t.length <= max ? t : null;
}

/* Comprueba la cabecera del archivo, no solo el Content-Type que manda el navegador */
function tipoReal(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function crearContenido({ almacen, cal, drive }) {
  let datos = vacio();
  // Se carga al arrancar; hasta entonces la web ve el contenido vacío
  const listo = almacen.leerContenido()
    .then((c) => { datos = { ...vacio(), ...c }; })
    .catch((e) => console.error(faltaTabla(e)
      ? `\n  ✘ Falta la tabla web_contenido en Supabase: el panel no podrá guardar eventos, días ni ajustes de la galería.\n    Ejecuta supabase/migrations/005_web_contenido.sql en Supabase → SQL Editor → New query → Run y reinicia el servidor.\n`
      : `No se pudo leer el contenido de la web: ${e.message}`));

  // Los cambios van de uno en uno: cada uno parte de lo que dejó el anterior.
  // Si la base de datos falla, el panel recibe un mensaje claro en vez de "Error interno"
  let cola = Promise.resolve();
  const enCola = (fn) => (...args) => {
    const p = cola.then(() => fn(...args)).catch((e) => {
      console.error(e);
      if (faltaTabla(e)) return error(503, "Falta la tabla web_contenido en la base de datos. Ejecuta supabase/migrations/005_web_contenido.sql en Supabase → SQL Editor y reinicia el servidor.");
      if (faltaAjustes(e)) return error(503, "La base de datos aún no puede guardar el estilo de la web. Ejecuta supabase/migrations/006_tema_web.sql en Supabase → SQL Editor.");
      return error(500, `No se ha podido guardar en la base de datos (${e.message}).`);
    });
    cola = p.catch(() => {});
    return p;
  };

  async function guardar(seccion, valor) {
    await almacen.guardarContenido(seccion, valor);
    datos = { ...datos, [seccion]: valor };
  }

  /* Borra en Drive una foto que ya no se usa. Si falla, la foto se queda en Drive, pero no se pierde nada */
  function borrarFotoDrive(id) {
    if (id && drive.configurado) drive.borrar(id).catch((e) => console.error(e.message));
  }

  /* ---------- Script público para la web ----------
     Se genera una sola vez por cada cambio (datos es un objeto nuevo tras cada guardado),
     con su ETag para que el navegador pueda preguntar «¿ha cambiado?» y recibir un 304 */
  let publicado = { de: null, texto: "", etag: "" };
  function publico() {
    if (publicado.de !== datos) {
      const texto = `window.BOTANIC_WEB = ${JSON.stringify(datos)};\n`;
      publicado = { de: datos, texto, etag: `"${crypto.createHash("sha256").update(texto).digest("base64url").slice(0, 27)}"` };
    }
    return publicado;
  }
  const script = () => publico().texto;

  /* ---------- Eventos ---------- */
  async function guardarEvento(fecha, d) {
    if (!cal.esClaveValida(fecha)) return error(400, "Fecha no válida.");
    if (!d || typeof d !== "object") return error(400, "Datos no válidos.");
    const titulo = texto(d.titulo, 80);
    const dj = texto(d.dj, 120);
    const descripcion = texto(d.descripcion, 500);
    const instagram = texto(d.instagram, 250);
    const foto = texto(d.foto, 100);
    if (!titulo) return error(400, "El nombre del evento debe tener entre 1 y 80 caracteres.");
    if (dj === null) return error(400, "El DJ invitado no puede pasar de 120 caracteres.");
    if (descripcion === null) return error(400, "La descripción no puede pasar de 500 caracteres.");
    if (instagram === null || (instagram && !INSTAGRAM.test(instagram))) return error(400, "El enlace de Instagram debe empezar por https://www.instagram.com/");
    if (foto === null || (foto && !ID_DRIVE.test(foto))) return error(400, "La foto no es válida.");

    const evento = { titulo };
    if (dj) evento.dj = dj;
    if (descripcion) evento.descripcion = descripcion;
    if (instagram) evento.instagram = instagram;
    if (foto) evento.foto = foto;

    const anterior = datos.eventos[fecha];
    await guardar("eventos", { ...datos.eventos, [fecha]: evento });
    if (anterior && anterior.foto && anterior.foto !== foto) borrarFotoDrive(anterior.foto);
    return ok({ evento });
  }

  /* Quitar (o cancelar) un evento deja el día cerrado: en la web, la lista y las reservas.
     Si ese día ya está cerrado según data/config.js, basta con quitar el cambio del panel */
  async function borrarEvento(fecha) {
    if (!cal.esClaveValida(fecha)) return error(400, "Fecha no válida.");
    const anterior = datos.eventos[fecha];
    if (!anterior) return error(404, "Ese día no tiene evento.");
    const { [fecha]: _, ...resto } = datos.eventos;
    await guardar("eventos", resto);
    const { [fecha]: __, ...otrosDias } = datos.dias;
    const dia = cal.abiertoPorConfig(cal.fromKey(fecha)) ? "cerrado" : null;
    await guardar("dias", dia ? { ...otrosDias, [fecha]: dia } : otrosDias);
    borrarFotoDrive(anterior.foto);
    return ok({ dia });
  }

  /* Sube una foto de evento a Drive y devuelve su id. El evento se guarda aparte con guardarEvento */
  async function subirFoto(buf) {
    const tipo = tipoReal(buf);
    if (!tipo) return error(415, "La foto debe ser JPG, PNG o WebP.");
    try {
      const id = await drive.subir(`evento-${Date.now()}.${TIPOS_FOTO[tipo]}`, tipo, buf);
      if (!ID_DRIVE.test(String(id))) return error(502, "Google Drive no devolvió un id válido.");
      return ok({ id }, 201);
    } catch (e) {
      return error(e.status || 502, e.message);
    }
  }

  /* ---------- Días del calendario ---------- */
  async function guardarDia(fecha, d) {
    if (!cal.esClaveValida(fecha)) return error(400, "Fecha no válida.");
    const estado = d && d.estado;
    if (estado !== "cerrado" && estado !== "abierto" && estado !== null) return error(400, "El estado debe ser cerrado, abierto o null.");
    const { [fecha]: _, ...resto } = datos.dias;
    await guardar("dias", estado ? { ...resto, [fecha]: estado } : resto);
    return ok({ fecha, estado });
  }

  /* ---------- Galería ---------- */
  async function guardarAlbum(carpeta, d) {
    if (!ID_DRIVE.test(carpeta)) return error(400, "Álbum no válido.");
    if (!d || typeof d !== "object") return error(400, "Datos no válidos.");
    const nombre = texto(d.nombre, 80);
    const portada = texto(d.portada, 100);
    if (nombre === null) return error(400, "El nombre no puede pasar de 80 caracteres.");
    if (portada === null || (portada && !ID_DRIVE.test(portada))) return error(400, "La portada no es válida.");
    if (d.anclado !== undefined && typeof d.anclado !== "boolean") return error(400, "Anclado debe ser true o false.");
    const ancladas = d.fotosAncladas === undefined ? [] : d.fotosAncladas;
    if (!Array.isArray(ancladas) || ancladas.length > MAX_ANCLADAS || !ancladas.every((id) => typeof id === "string" && ID_DRIVE.test(id))) {
      return error(400, "Las fotos ancladas no son válidas.");
    }

    // Solo se guarda lo que cambia algo; un álbum sin ajustes desaparece de la lista
    const ajustes = {};
    if (nombre) ajustes.nombre = nombre;
    if (portada) ajustes.portada = portada;
    if (d.anclado) ajustes.anclado = true;
    if (ancladas.length) ajustes.fotosAncladas = [...new Set(ancladas)];
    const { [carpeta]: _, ...resto } = datos.galeria;
    await guardar("galeria", Object.keys(ajustes).length ? { ...resto, [carpeta]: ajustes } : resto);
    return ok({ ajustes });
  }

  /* ---------- Estilo de la web según la época ---------- */
  async function guardarTema(d) {
    const tema = d && d.tema;
    if (!TEMAS.includes(tema)) return error(400, `El estilo debe ser uno de estos: ${TEMAS.join(", ")}.`);
    await guardar("ajustes", { ...datos.ajustes, tema });
    return ok({ tema });
  }

  return {
    listo,
    dias: () => datos.dias,
    todo: () => datos,
    script,
    publico,
    guardarEvento: enCola(guardarEvento),
    borrarEvento: enCola(borrarEvento),
    subirFoto,
    guardarDia: enCola(guardarDia),
    guardarAlbum: enCola(guardarAlbum),
    guardarTema: enCola(guardarTema)
  };
}

module.exports = { crearContenido };
