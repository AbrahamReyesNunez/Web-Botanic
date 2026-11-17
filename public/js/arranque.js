/* Marca que hay JavaScript antes de pintar (activa las animaciones de aparición) */
document.documentElement.classList.add("js");

/* Estilo de la época elegido en el panel (api/web.js va justo antes). Se pone ya aquí para que
   la página no se pinte primero con el estilo de verano y cambie después */
(function () {
  var tema = ((window.BOTANIC_WEB || {}).ajustes || {}).tema;
  if (tema && tema !== "verano") document.documentElement.setAttribute("data-tema", tema);
})();
