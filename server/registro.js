/* =========================================================
   REGISTRO DE EVENTOS DE SEGURIDAD Y ERRORES (log interno)
   Una línea JSON por evento, por la salida del proceso (la recoge pm2, el
   servicio de Windows, systemd o el panel de Render). Ejemplo:
   {"ts":"2026-11-18T22:10:03.120Z","nivel":"aviso","evento":"login_fallido","origen":"Xk2…","metodo":"POST","ruta":"/api/admin/login","status":401}

   Qué NO se guarda nunca: cuerpos de las peticiones (nombres, teléfonos, claves),
   cookies, cabeceras, la parte ?… de la URL ni la IP. En su lugar va "origen":
   la huella HMAC de la IP (la misma que la lista). Con FORM_SECRET fijo, la misma IP
   da siempre la misma huella: se pueden seguir los intentos de un mismo origen
   sin guardar la IP. Para saber si una IP concreta es la de un aviso, se calcula
   su huella con la misma clave.
   ========================================================= */
"use strict";

const { crearLimitador } = require("./limites.js");

const MAX_RUTA = 200;
/* Un mismo evento desde un mismo origen se apunta como mucho 10 veces por minuto: quien manda miles
   de peticiones no puede llenar el disco de avisos. Los que se saltan se cuentan en "omitidos" */
const MAX_POR_MINUTO = 10;

function crearRegistro({ escribir = (linea) => process.stdout.write(`${linea}\n`), escribirError = (linea) => process.stderr.write(`${linea}\n`), ahora = () => new Date() } = {}) {
  const frecuencia = crearLimitador([{ ms: 60_000, max: MAX_POR_MINUTO }]);
  const omitidos = new Map();   // "evento|origen" -> número de avisos que no se han escrito

  /* JSON.stringify escapa saltos de línea y caracteres de control: una ruta inventada no puede
     partir la línea ni fingir otro evento en el log */
  function linea(nivel, evento, datos) {
    return JSON.stringify({ ts: ahora().toISOString(), nivel, evento, ...datos });
  }

  /* Solo el camino de la URL, sin ?… (puede llevar códigos de RPP o fechas) y con un largo máximo */
  const rutaDe = (url) => String(url || "").split("?")[0].slice(0, MAX_RUTA);

  /* Evento de seguridad: login, acceso denegado, límite superado, servidor lleno… */
  function aviso(evento, { origen = null, metodo, ruta, status } = {}) {
    const clave = `${evento}|${origen}`;
    if (!frecuencia.reservar(clave).ok) {
      // Tope de memoria: con miles de orígenes distintos se pierde el recuento, no el servidor
      if (omitidos.size >= 10_000 && !omitidos.has(clave)) omitidos.clear();
      omitidos.set(clave, (omitidos.get(clave) || 0) + 1);
      return;
    }
    const saltados = omitidos.get(clave);
    omitidos.delete(clave);
    escribir(linea("aviso", evento, { origen, metodo, ruta: rutaDe(ruta), status, ...(saltados ? { omitidos: saltados } : {}) }));
  }

  /* Error interno: aquí sí va el detalle (mensaje y pila) que el visitante nunca ve */
  function error(evento, e, { origen = null, metodo, ruta } = {}) {
    escribirError(linea("error", evento, {
      origen, metodo, ruta: rutaDe(ruta),
      mensaje: String((e && e.message) || e).slice(0, 1000),
      pila: e && e.stack ? String(e.stack).slice(0, 4000) : undefined
    }));
  }

  return { aviso, error, cerrar: () => frecuencia.cerrar() };
}

/* Qué evento de seguridad es cada respuesta (null = nada que apuntar).
   Los 400 normales (un nombre mal escrito, una fecha cerrada…) no se apuntan: son errores del visitante */
function eventoDe(metodo, ruta, status) {
  if (ruta === "/api/admin/login" && metodo === "POST") {
    if (status === 200) return "login_ok";
    if (status === 401) return "login_fallido";
    if (status === 429) return "login_bloqueado";
  }
  if (ruta === "/api/admin/logout" && status === 200) return "logout";
  if (status === 401 || status === 403) return "acceso_denegado";
  if (status === 429) return "limite_superado";
  if (status === 413) return "peticion_demasiado_grande";
  if (status === 503) return "no_disponible";
  if (status >= 500) return "error_respuesta";
  return null;
}

module.exports = { crearRegistro, eventoDe };
