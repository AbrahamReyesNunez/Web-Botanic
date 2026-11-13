/* =========================================================
   PORTADAS Y EVENTOS DEL CALENDARIO
   ---------------------------------------------------------
   LO NORMAL: crea y edita los eventos (nombre, foto…) desde el panel,
   /admin.html → Eventos y calendario. Lo del panel manda sobre este archivo.

   SIN PANEL (título, artistas, texto, portada, enlace al post):
     Añade una entrada abajo con la fecha como clave. "portada" es la
     URL (o la ruta dentro de img/) de la imagen.
   ========================================================= */
window.BOTANIC_EVENTOS = {
  // "2026-10-17": {
  //   titulo: "Noche Tropical",
  //   artistas: "DJ Invitado · Animación",
  //   descripcion: "Fiesta temática con dress code tropical.",
  //   portada: "https://…/portada.jpg",
  //   instagram: "https://www.instagram.com/p/XXXXXXXX/"
  // },
};

/* Nombre por defecto de cada noche cuando no hay evento definido */
window.BOTANIC_NOCHES = {
  3: "Miércoles Botanic",
  4: "Jueves Botanic",
  5: "Viernes Botanic",
  6: "Sábado Botanic"
};
