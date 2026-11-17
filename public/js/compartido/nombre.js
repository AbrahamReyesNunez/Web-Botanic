/* =========================================================
   FILTRO DE NOMBRES DE LA LISTA — compartido entre la web y el servidor
   El servidor es quien decide; la web usa las mismas reglas para avisar antes.
   ========================================================= */
(function (root, modulo) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = modulo();
  else root.BotanicNombre = modulo();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MAX_CRUDO = 60;     // lo que llega antes de limpiar espacios
  const MAX = 40;
  const MIN = 5;
  const MAX_PALABRAS = 5;
  const MAX_LETRAS_PALABRA = 20;

  const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "el", "van", "von", "da", "di"]);

  /* Palabras que no se aceptan como parte de un nombre (comparación sin tildes y en minúsculas) */
  const BLOQUEADAS = new Set([
    // relleno y bromas
    "test", "prueba", "asdf", "qwerty", "nombre", "apellido", "apellidos", "anonimo", "anonima",
    "nadie", "ninguno", "ninguna", "fulano", "fulanito", "mengano", "zutano", "usuario", "admin",
    "null", "undefined", "xxx", "xd", "lol", "jaja", "jajaja", "jeje", "nose", "botanic", "rpp", "lista",
    // insultos y obscenidades
    "puta", "puto", "putas", "putos", "polla", "pollas", "mierda", "joder", "culo", "pene", "cabron",
    "cabrona", "gilipollas", "imbecil", "idiota", "subnormal", "maricon", "marica", "zorra", "follar",
    "chocho", "cojon", "cojones", "hostia", "paja", "pajillero", "mamon", "mamona", "capullo", "tonto",
    "tonta", "estupido", "estupida", "retrasado", "retrasada", "nazi", "hitler", "sexo", "porno", "tetas",
    "teta", "caca", "pedo", "cagar", "cagon", "chupamela", "chupapollas", "comepollas", "hijoputa", "hdp",
    "ptm", "verga", "cono", "panocha", "malparido", "pendejo", "pendeja"
  ]);

  /* Trozos que no pueden aparecer en ningún sitio, aunque vayan pegados o separados */
  const SUBCADENAS = [
    "gilipollas", "hijodeputa", "hijoputa", "chupapollas", "comepollas", "chupamela", "subnormal",
    "mierda", "follar", "pajillero", "hitler", "asdf", "qwert"
  ];

  const quitarTildes = (s) => s.normalize("NFD").replace(/\p{M}/gu, "");
  const letrasDe = (palabra) => palabra.replace(/[^\p{L}]/gu, "");

  function capitalizar(palabra, esPrimera) {
    const p = palabra.toLowerCase();
    if (!esPrimera && PARTICULAS.has(p)) return p;
    // Mayúscula al inicio y tras apóstrofo o guion: O'Connor, Ruiz-Mateos
    return p.replace(/(^|['\-])(\p{L})/gu, (m, sep, c) => sep + c.toUpperCase());
  }

  /* Limpia espacios y pone Mayúscula Inicial */
  function normalizar(crudo) {
    const s = String(crudo ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
    if (!s) return "";
    return s.split(" ").map((p, i) => capitalizar(p, i === 0)).join(" ");
  }

  /* Clave para detectar duplicados: sin tildes, minúsculas, sin signos */
  function clave(nombre) {
    return quitarTildes(String(nombre)).toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  }

  const fallo = (error) => ({ ok: false, error });

  function validar(crudo) {
    if (typeof crudo !== "string") return fallo("Escribe tu nombre y apellido.");
    if (crudo.length > MAX_CRUDO) return fallo(`El nombre puede tener como máximo ${MAX} caracteres.`);

    const nombre = normalizar(crudo);
    if (!nombre) return fallo("Escribe tu nombre y apellido.");
    if (nombre.length > MAX) return fallo(`El nombre puede tener como máximo ${MAX} caracteres.`);
    if (nombre.length < MIN) return fallo("Escribe tu nombre y al menos un apellido.");

    // Solo letras (de cualquier idioma), espacios, apóstrofo, guion y punto; sin signos seguidos
    // y sin punto pegado a otra letra (deja "J. Pérez", no "web.com")
    if (!/^\p{L}[\p{L}'.\- ]*$/u.test(nombre) || /['.\-]{2,}/.test(nombre) || /\.\p{L}/u.test(nombre)) {
      return fallo("El nombre solo puede llevar letras.");
    }

    const palabras = nombre.split(" ");
    if (palabras.length > MAX_PALABRAS) return fallo("Escribe solo tu nombre y apellidos.");
    if (palabras.some((p) => letrasDe(p).length > MAX_LETRAS_PALABRA)) return fallo("Hay una palabra demasiado larga.");
    const significativas = palabras.filter((p) => !PARTICULAS.has(p.toLowerCase()) && letrasDe(p).length >= 2);
    if (significativas.length < 2) return fallo("Escribe tu nombre y al menos un apellido.");

    const plano = quitarTildes(nombre).toLowerCase();
    if (/(\p{L})\1\1/u.test(plano)) return fallo("Eso no parece un nombre real.");
    for (const p of plano.split(" ")) {
      const l = letrasDe(p);
      if (l.length < 2 || PARTICULAS.has(l)) continue; // iniciales y partículas
      if (!/[aeiouy]/.test(l) || /[bcdfghjklmnpqrstvwxz]{5,}/.test(l)) return fallo("Eso no parece un nombre real.");
    }

    const palabrasPlanas = plano.split(/[ '.\-]+/);
    const compacto = plano.replace(/[^a-z]/g, "");
    if (palabrasPlanas.some((p) => BLOQUEADAS.has(p)) || SUBCADENAS.some((s) => compacto.includes(s))) {
      return fallo("Ese nombre no está permitido.");
    }

    return { ok: true, nombre };
  }

  return { MAX, normalizar, validar, clave };
});
