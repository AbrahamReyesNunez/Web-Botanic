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
      o.textContent = `${fechaTexto(n.fecha)} · ${n.total} inscrito${n.total === 1 ? "" : "s"}`;
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
    $("#exportar").href = `/api/admin/export.csv?fecha=${encodeURIComponent(fecha)}`;
    $("#total").textContent = datos.total;
    $("#total-fecha").textContent = fechaTexto(fecha);
    pintarStats();
    pintarFilas();
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
      li.append(nombre, ...TIPOS_LINK.map((t) => filaLink(t.tipo, `${location.origin}/?${t.param}=${r.codigo}`)));
      return li;
    }));
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
    $("#noche").addEventListener("change", () => cargarResumen().catch(() => {}));
    $("#buscar").addEventListener("input", () => { if (datos) pintarFilas(); });

    // Si ya hay sesión, directo al panel
    mostrarPanel().catch(() => mostrarAcceso());
  });
})();
