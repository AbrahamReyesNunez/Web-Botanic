/* =========================================================
   CONFIGURACIÓN GENERAL DE LA WEB DE BOTANIC CHIPIONA
   Edita este archivo para cambiar horarios, contacto, etc.
   ========================================================= */
window.BOTANIC_CONFIG = {
  nombre: "Botanic",
  ciudad: "Chipiona",
  direccion: "Calle Dr. Tolosa Latour, 37 · 11550 Chipiona (Cádiz)",
  mapsQuery: "Discoteca Botanic, Calle Dr. Tolosa Latour 37, Chipiona",
  telefono: "671434657",            // reservas y mesas VIP
  whatsapp: "34671434657",          // con prefijo de país, sin "+"
  instagram: "discotecabotanic",
  facebook: "BOTANICHIPIONA",

  /* Días de apertura: 0 = domingo, 1 = lunes, ... 6 = sábado */
  diasAbierto: [3, 4, 5, 6],

  /* Horario por día de la semana (solo días abiertos) */
  horarios: {
    3: "23:30 – 06:00",
    4: "23:30 – 06:00",
    5: "23:30 – 07:00",
    6: "23:30 – 07:00"
  },

  /* Hasta qué hora (24h) del mismo día se puede apuntar uno a la lista */
  cierreListaHora: 23,

  /* Fechas en las que NO se abre aunque sea miércoles-sábado (formato AAAA-MM-DD) */
  cerrado: [
    // "2026-12-24",
  ],

  /* Fechas especiales en las que SÍ se abre aunque no toque (formato AAAA-MM-DD) */
  aperturasExtra: [
    // "2026-12-31",
  ],

  /* ------------------------------------------------------------------
     LISTA: dónde se envían las inscripciones.
     - Si "endpoint" está vacío, la inscripción se envía por WhatsApp
       al número de arriba con todos los datos ya rellenados.
     - Si pegas aquí la URL de la Web App de Google Apps Script
       (ver backend/google-apps-script.gs), las inscripciones se guardan
       automáticamente en una hoja de Google Sheets.
     ------------------------------------------------------------------ */
  lista: {
    endpoint: "",
    maxAcompanantes: 10
  }
};
