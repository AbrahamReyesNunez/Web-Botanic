/* =========================================================
   PANEL DE LISTA — recuento de inscritos por noche y RPP
   ========================================================= */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const REFRESCO_MS = 30_000;

  let datos = null;       // último resumen de la noche
  let reservas = null;    // reservas de la noche seleccionada
  let refresco = null;

  const fechaTexto = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    const f = new Date(y, m - 1, d);
    return `${DIAS[f.getDay()]} ${d} ${MESES[m - 1]} ${y}`;
  };
  const hora = (iso) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  async function api(ruta, opciones = {}) {
    const r = await fetch(ruta, { cache: "no-store", ...opciones });
    if (r.status === 401) { mostrarAcceso(); throw new Error("sesion"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "Error del servidor");
    return j;
  }

  function mostrarAcceso() {
    clearInterval(refresco);
    $("#panel").hidden = true;
    $("#salir").hidden = true;
    $("#acceso").hidden = false;
    $("#clave").focus();
  }

  async function mostrarPanel() {
    $("#acceso").hidden = true;
    $("#panel").hidden = false;
    $("#salir").hidden = false;
    await Promise.all([cargarNoches(), cargarRpps()]);
    clearInterval(refresco);
    refresco = setInterval(() => { if (!document.hidden) cargarResumen().catch(() => {}); }, REFRESCO_MS);
  }

  /* ---------- Noches ---------- */
  async function cargarNoches() {
    const j = await api("/api/admin/noches");
    const sel = $("#noche");
    const actual = sel.value || j.porDefecto;
    sel.replaceChildren(...j.noches.map((n) => {
      const o = document.createElement("option");
      o.value = n.fecha;
      o.textContent = `${fechaTexto(n.fecha)} · ${n.total} en lista · ${n.reservas} reserva${n.reservas === 1 ? "" : "s"}`;
      return o;
    }));
    if (actual && j.noches.some((n) => n.fecha === actual)) sel.value = actual;
    await cargarResumen();
  }

  /* ---------- Resumen de la noche ---------- */
  async function cargarResumen() {
    const fecha = $("#noche").value;
    if (!fecha) return;
    datos = await api(`/api/admin/resumen?fecha=${encodeURIComponent(fecha)}`);
    $("#total").textContent = datos.total;
    $("#total-fecha").textContent = fechaTexto(fecha);
    pintarStats();
    pintarFilas();
    await cargarReservas();
  }

  async function cargarReservas() {
    const fecha = $("#noche").value;
    if (!fecha) return;
    reservas = await api(`/api/admin/reservas?fecha=${encodeURIComponent(fecha)}`);
    $("#reservas-total").textContent = reservas.total;
    $("#reservas-vip").textContent = reservas.vip;
    $("#reservas-pista").textContent = reservas.pista;
    $("#reservas-exportar").disabled = reservas.reservas.length === 0;
    $("#reservas-vacias").hidden = reservas.reservas.length > 0;
    $("#reservas-filas").replaceChildren(...reservas.reservas.map((reserva) => {
      const tr = document.createElement("tr");
      for (const texto of [reserva.nombre, reserva.tipo === "vip" ? "VIP" : "Pista", resumenBebidas(reserva)]) {
        const td = document.createElement("td");
        td.textContent = texto;
        tr.appendChild(td);
      }
      return tr;
    }));
  }

  const cantidadBebidas = (items) => items.map((item) => `${item.cantidad}× ${item.nombre}`);

  function resumenBebidas(reserva) {
    const principales = [...cantidadBebidas(reserva.botellas), ...cantidadBebidas(reserva.refrescos)];
    const extras = [...cantidadBebidas(reserva.chupitos), ...cantidadBebidas(reserva.champan)];
    return `${principales.join(" + ")}${extras.length ? ` (+ ${extras.join(" + ")})` : ""}`;
  }

  function pintarStats() {
    const box = $("#rpp-stats");
    box.replaceChildren(...datos.porRpp.map((g) => {
      const pct = datos.total ? Math.round((g.total / datos.total) * 100) : 0;
      const item = document.createElement("div");
      item.className = "rpp-stat" + (g.codigo ? "" : " sin-rpp");
      const nombre = document.createElement("span");
      nombre.className = "rpp-stat-nombre";
      nombre.textContent = g.nombre;
      const num = document.createElement("span");
      num.className = "rpp-stat-num";
      num.textContent = `${g.total} · ${pct}%`;
      const barra = document.createElement("span");
      barra.className = "rpp-stat-barra";
      barra.style.setProperty("--pct", `${pct}%`);
      item.append(nombre, num, barra);
      return item;
    }));
  }

  function pintarFilas() {
    const q = $("#buscar").value.trim().toLowerCase();
    const filas = datos.inscripciones.filter((x) => !q || x.nombre.toLowerCase().includes(q) || x.rpp.toLowerCase().includes(q));
    $("#filas").replaceChildren(...filas.map((x) => {
      const tr = document.createElement("tr");
      for (const texto of [hora(x.creado), x.nombre, x.rpp]) {
        const td = document.createElement("td");
        td.textContent = texto;
        tr.appendChild(td);
      }
      const td = document.createElement("td");
      const b = document.createElement("button");
      b.className = "admin-del";
      b.type = "button";
      b.textContent = "Borrar";
      b.setAttribute("aria-label", `Borrar a ${x.nombre}`);
      b.addEventListener("click", () => borrar(x));
      td.appendChild(b);
      tr.appendChild(td);
      return tr;
    }));
    $("#vacio").hidden = datos.inscripciones.length > 0;
  }

  async function borrar(x) {
    if (!confirm(`¿Borrar a "${x.nombre}" de la lista? No se puede deshacer.`)) return;
    try {
      await api(`/api/admin/inscripcion/${encodeURIComponent(x.id)}`, { method: "DELETE" });
      await cargarNoches();
    } catch (e) {
      if (e.message !== "sesion") alert(e.message);
    }
  }

  /* ---------- Links de RPP: uno para la lista y otro para reservados ---------- */
  const TIPOS_LINK = [
    { tipo: "Lista", param: "rpp" },
    { tipo: "Reservados", param: "reserva" }
  ];

  function filaLink(tipo, url) {
    const fila = document.createElement("div");
    fila.className = "rpp-link";
    fila.classList.add(tipo === "Lista" ? "rpp-lista" : "rpp-reservados");
    const etiqueta = document.createElement("span");
    etiqueta.className = "rpp-link-tipo";
    etiqueta.textContent = tipo;
    const link = document.createElement("code");
    link.textContent = url;
    const copiar = document.createElement("button");
    copiar.className = "btn btn-ghost btn-sm";
    copiar.type = "button";
    copiar.setAttribute("aria-label", `Copiar link de ${tipo.toLowerCase()}`);
    copiar.innerHTML = '<span class="btn-label">Copiar</span><span class="btn-arrow" aria-hidden="true">⧉</span>';
    copiar.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(url);
        copiar.querySelector(".btn-label").textContent = "¡Copiado!";
        setTimeout(() => { copiar.querySelector(".btn-label").textContent = "Copiar"; }, 1600);
      } catch (e) { window.prompt("Copia el link:", url); }
    });
    fila.append(etiqueta, link, copiar);
    return fila;
  }

  async function cargarRpps() {
    const j = await api("/api/admin/rpps");
    $("#rpp-links").replaceChildren(...j.rpps.map((r) => {
      const li = document.createElement("li");
      if (!r.activo) li.className = "inactivo";
      const nombre = document.createElement("strong");
      nombre.textContent = r.nombre + (r.activo ? "" : " (inactivo)");
      const acciones = document.createElement("div");
      acciones.className = "rpp-acciones";
      const editar = document.createElement("button");
      editar.className = "admin-del rpp-editar";
      editar.type = "button";
      editar.textContent = "Editar";
      editar.setAttribute("aria-label", `Editar ${r.nombre}`);
      editar.addEventListener("click", () => editarRpp(r));
      const estado = document.createElement("button");
      estado.className = "admin-del";
      estado.type = "button";
      estado.textContent = r.activo ? "Eliminar" : "Reactivar";
      estado.setAttribute("aria-label", `${r.activo ? "Eliminar" : "Reactivar"} ${r.nombre}`);
      estado.addEventListener("click", () => cambiarEstadoRpp(r));
      acciones.append(editar, estado);
      li.append(nombre, acciones, ...TIPOS_LINK.map((t) => filaLink(t.tipo, `${location.origin}/?${t.param}=${r.codigo}`)));
      return li;
    }));
  }

  function mostrarErrorRpp(mensaje = "") {
    const error = $("#rpp-error");
    error.textContent = mensaje;
    error.hidden = !mensaje;
  }

  async function editarRpp(rpp) {
    const nombre = prompt("Nuevo nombre del RPP:", rpp.nombre);
    if (nombre === null || nombre.trim() === rpp.nombre) return;
    try {
      mostrarErrorRpp();
      await api(`/api/admin/rpp/${encodeURIComponent(rpp.codigo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim() })
      });
      await Promise.all([cargarRpps(), cargarResumen()]);
    } catch (e) {
      if (e.message !== "sesion") mostrarErrorRpp(e.message);
    }
  }

  async function cambiarEstadoRpp(rpp) {
    const activo = !rpp.activo;
    const accion = activo ? "reactivar" : "eliminar";
    const detalle = activo ? "" : " Sus inscripciones y su historial se conservarán.";
    if (!confirm(`¿Quieres ${accion} a ${rpp.nombre}?${detalle}`)) return;
    try {
      mostrarErrorRpp();
      await api(`/api/admin/rpp/${encodeURIComponent(rpp.codigo)}`, { method: activo ? "PATCH" : "DELETE" });
      await Promise.all([cargarRpps(), cargarResumen()]);
    } catch (e) {
      if (e.message !== "sesion") mostrarErrorRpp(e.message);
    }
  }

  function exportarPDF() {
    if (!datos) return;
    const grupos = datos.porRpp.map((grupo) => ({
      nombre: grupo.nombre,
      personas: datos.inscripciones
        .filter((x) => x.rppCodigo === grupo.codigo)
        .map((x) => x.nombre)
    })).filter((grupo) => grupo.personas.length);
    if (!grupos.length) {
      alert("No hay inscripciones para exportar en esta noche.");
      return;
    }

    const ventana = window.open("", "_blank");
    if (!ventana) {
      alert("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para descargar la lista en PDF.");
      return;
    }

    ventana.document.open();
    ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Lista</title><style>
      @page { size: A4; margin: 18mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; font-family: Calibri, sans-serif; }
      h1 { margin: 0 0 8mm; font-size: 13pt; font-weight: 400; }
      section + section { break-before: page; page-break-before: always; }
      table { width: 100%; border-collapse: collapse; }
      thead { display: table-header-group; }
      th { padding: 0 0 5mm; text-align: left; font-size: 15pt; font-weight: 700; }
      td { padding: 0 0 2mm; font-size: 11pt; break-inside: avoid; page-break-inside: avoid; }
      @media screen { body { max-width: 210mm; margin: 15mm auto; padding: 18mm; box-shadow: 0 0 8px #aaa; } section + section { margin-top: 15mm; border-top: 1px solid #ccc; padding-top: 10mm; } }
    </style></head><body></body></html>`);
    ventana.document.close();
    const titulo = ventana.document.createElement("h1");
    titulo.textContent = `Lista · ${fechaTexto(datos.fecha)}`;
    ventana.document.title = `Lista ${fechaTexto(datos.fecha)}`;
    ventana.document.body.appendChild(titulo);
    for (const grupo of grupos) {
      const seccion = ventana.document.createElement("section");
      const tabla = ventana.document.createElement("table");
      const cabecera = ventana.document.createElement("thead");
      const filaCabecera = ventana.document.createElement("tr");
      const encabezado = ventana.document.createElement("th");
      encabezado.textContent = grupo.nombre;
      filaCabecera.appendChild(encabezado);
      cabecera.appendChild(filaCabecera);
      const lista = ventana.document.createElement("tbody");
      for (const persona of grupo.personas) {
        const fila = ventana.document.createElement("tr");
        const elemento = ventana.document.createElement("td");
        elemento.textContent = persona;
        fila.appendChild(elemento);
        lista.appendChild(fila);
      }
      tabla.append(cabecera, lista);
      seccion.appendChild(tabla);
      ventana.document.body.appendChild(seccion);
    }
    ventana.addEventListener("afterprint", () => ventana.close(), { once: true });
    setTimeout(() => {
      ventana.focus();
      ventana.print();
    }, 100);
  }

  function exportarReservasPDF() {
    if (!reservas || !reservas.reservas.length) return;
    const ventana = window.open("", "_blank");
    if (!ventana) {
      alert("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para guardar la lista en PDF.");
      return;
    }

    ventana.document.open();
    ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reservas</title><style>
      @page { size: A4; margin: 18mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; font-family: Calibri, sans-serif; }
      h1 { margin: 0 0 8mm; font-size: 15pt; }
      h2 { margin: 7mm 0 3mm; font-size: 13pt; break-after: avoid-page; page-break-after: avoid; }
      article { margin: 0 0 5mm; break-inside: avoid; page-break-inside: avoid; }
      p { margin: 0 0 1.5mm; font-size: 11pt; }
      .nombre { font-weight: 700; }
      @media screen { body { max-width: 210mm; margin: 15mm auto; padding: 18mm; box-shadow: 0 0 8px #aaa; } }
    </style></head><body></body></html>`);
    ventana.document.close();
    ventana.document.title = `Reservas ${fechaTexto(reservas.fecha)}`;
    const titulo = ventana.document.createElement("h1");
    titulo.textContent = `Reservas · ${fechaTexto(reservas.fecha)} · ${reservas.vip} VIP · ${reservas.pista} en pista`;
    ventana.document.body.appendChild(titulo);

    for (const [tipo, etiqueta] of [["vip", "Mesas VIP"], ["pista", "Mesas en pista"]]) {
      const grupo = reservas.reservas.filter((reserva) => reserva.tipo === tipo);
      if (!grupo.length) continue;
      const encabezado = ventana.document.createElement("h2");
      encabezado.textContent = etiqueta;
      ventana.document.body.appendChild(encabezado);
      for (const reserva of grupo) {
        const bloque = ventana.document.createElement("article");
        const nombre = ventana.document.createElement("p");
        nombre.className = "nombre";
        nombre.textContent = reserva.nombre;
        const bebidas = ventana.document.createElement("p");
        bebidas.textContent = resumenBebidas(reserva);
        bloque.append(nombre, bebidas);
        ventana.document.body.appendChild(bloque);
      }
    }

    setTimeout(() => {
      ventana.focus();
      ventana.print();
    }, 100);
  }

  /* ---------- Arranque ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#login-error");
      err.hidden = true;
      try {
        const r = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clave: $("#clave").value })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "No se ha podido entrar.");
        $("#clave").value = "";
        await mostrarPanel();
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      }
    });

    $("#salir").addEventListener("click", async () => {
      await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
      mostrarAcceso();
    });
    $("#exportar").addEventListener("click", exportarPDF);
    $("#reservas-exportar").addEventListener("click", exportarReservasPDF);
    $("#rpp-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#rpp-nombre");
      try {
        mostrarErrorRpp();
        await api("/api/admin/rpps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: input.value.trim() })
        });
        input.value = "";
        await Promise.all([cargarRpps(), cargarResumen()]);
      } catch (ex) {
        if (ex.message !== "sesion") mostrarErrorRpp(ex.message);
      }
    });
    $("#noche").addEventListener("change", () => cargarResumen().catch((e) => {
      if (e.message !== "sesion") alert(e.message);
    }));
    $("#buscar").addEventListener("input", () => { if (datos) pintarFilas(); });

    // Si ya hay sesión, directo al panel
    mostrarPanel().catch(() => mostrarAcceso());
  });
})();
