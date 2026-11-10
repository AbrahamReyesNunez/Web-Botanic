/* =========================================================
   BOTANIC CHIPIONA — Google Apps Script de la galería
   ---------------------------------------------------------
   GET  → lista los álbumes (subcarpetas de la galería) para la web y el panel.
   POST → sube o borra fotos de eventos (solo el servidor de la web, con la clave).

   CÓMO ACTUALIZARLO (una vez):
   1. Sustituye todo el código del proyecto por este y guarda.
   2. Arriba, elige la función "configurarClave" y pulsa Ejecutar. La primera vez
      Google pide permisos: acéptalos. En el registro de ejecución sale la clave:
      cópiala al .env del servidor como DRIVE_SCRIPT_CLAVE=...
   3. Implementar → Gestionar implementaciones → lápiz (Editar) →
      Versión: "Nueva versión" → Implementar. Así la URL no cambia.
      (Ejecutar como: yo · Quién tiene acceso: cualquier usuario)

   Las fotos de eventos van a la carpeta "Botanic · Fotos de eventos" de tu Drive,
   que el script crea sola la primera vez (fuera de la galería, para que no salga
   como un álbum).
   ========================================================= */

const CARPETA_GALERIA = "16K4RLGrm390CDqbCoL_e215kb8ImoQpd";
const NOMBRE_CARPETA_EVENTOS = "Botanic · Fotos de eventos";
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];

/* ---------- GET: álbumes ----------
   [{ id, nombre, creado, fotos: [{ id, nombre }] }], del más reciente al más antiguo */
function doGet() {
  const raiz = DriveApp.getFolderById(CARPETA_GALERIA);
  const albumes = [];
  const carpetas = raiz.getFolders();

  while (carpetas.hasNext()) {
    const carpeta = carpetas.next();
    const fotos = [];
    const archivos = carpeta.getFiles();
    while (archivos.hasNext()) {
      const a = archivos.next();
      if (a.getMimeType().startsWith("image/")) {
        fotos.push({ id: a.getId(), nombre: a.getName() });
      }
    }
    // Orden natural: foto2 va antes que foto10
    fotos.sort((x, y) => x.nombre.localeCompare(y.nombre, "es", { numeric: true }));
    albumes.push({
      id: carpeta.getId(),   // el panel guarda los ajustes (nombre, portada, anclados) por este id
      nombre: carpeta.getName(),
      creado: carpeta.getDateCreated().getTime(),
      fotos: fotos
    });
  }

  albumes.sort((x, y) => y.creado - x.creado);
  return json(albumes);
}

/* ---------- POST: fotos de eventos ----------
   { clave, accion: "subir", nombre, tipo, datos (base64) } → { ok, id }
   { clave, accion: "borrar", id }                          → { ok } */
function doPost(e) {
  try {
    const cuerpo = JSON.parse(e.postData.contents);

    const clave = PropertiesService.getScriptProperties().getProperty("CLAVE_SUBIDA");
    if (!clave || cuerpo.clave !== clave) return json({ ok: false, error: "Clave incorrecta" });

    if (cuerpo.accion === "subir") {
      if (TIPOS_FOTO.indexOf(cuerpo.tipo) === -1) return json({ ok: false, error: "Tipo de imagen no permitido" });
      const blob = Utilities.newBlob(Utilities.base64Decode(cuerpo.datos), cuerpo.tipo, String(cuerpo.nombre || "evento.jpg"));
      const archivo = carpetaEventos().createFile(blob);
      // Visible para cualquiera con el enlace: así la web puede mostrarla
      archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return json({ ok: true, id: archivo.getId() });
    }

    if (cuerpo.accion === "borrar") {
      const archivo = DriveApp.getFileById(String(cuerpo.id));
      // Solo se borran fotos de la carpeta de eventos, nunca de la galería
      const idEventos = carpetaEventos().getId();
      const padres = archivo.getParents();
      while (padres.hasNext()) {
        if (padres.next().getId() === idEventos) {
          archivo.setTrashed(true);
          return json({ ok: true });
        }
      }
      return json({ ok: false, error: "Esa foto no es de la carpeta de eventos" });
    }

    return json({ ok: false, error: "Acción desconocida" });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

/* Carpeta de fotos de eventos: se crea la primera vez y su id se guarda en las propiedades del script */
function carpetaEventos() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("CARPETA_EVENTOS");
  if (id) {
    try {
      const carpeta = DriveApp.getFolderById(id);
      if (!carpeta.isTrashed()) return carpeta;
    } catch (err) { /* borrada: se crea otra */ }
  }
  const nueva = DriveApp.createFolder(NOMBRE_CARPETA_EVENTOS);
  props.setProperty("CARPETA_EVENTOS", nueva.getId());
  return nueva;
}

/* Ejecútala una vez desde el editor: crea la clave (si no existe) y la carpeta de eventos, y las muestra en el registro */
function configurarClave() {
  const props = PropertiesService.getScriptProperties();
  let clave = props.getProperty("CLAVE_SUBIDA");
  if (!clave) {
    clave = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
    props.setProperty("CLAVE_SUBIDA", clave);
  }
  const carpeta = carpetaEventos();
  Logger.log("Copia esta línea en el .env del servidor:\nDRIVE_SCRIPT_CLAVE=" + clave);
  Logger.log("Carpeta de fotos de eventos: " + carpeta.getUrl());
}

function json(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(ContentService.MimeType.JSON);
}
