/* =========================================================
   BOTANIC CHIPIONA — lógica de la web
   ========================================================= */
(function () {
  "use strict";

  const CFG = window.BOTANIC_CONFIG || {};
  const EVENTOS = window.BOTANIC_EVENTOS || {};
  const NOCHES = window.BOTANIC_NOCHES || {};
  const GALERIA = window.BOTANIC_GALERIA || [];

  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const EXT_PORTADA = ["jpg", "jpeg", "png", "webp"];
  const STORAGE_KEY = "botanic_lista";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const el = (tag, attrs = {}, html = "") => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "dataset") Object.assign(n.dataset, v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    if (html) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Contenido interno de los botones .btn (texto + flecha que aparece al pasar el ratón) */
  const btnHTML = (texto, flecha = "→") =>
    `<span class="btn-label">${esc(texto)}</span><span class="btn-arrow" aria-hidden="true">${flecha}</span>`;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------------- Fechas (js/compartido/calendario.js, igual que el servidor) ---------------- */
  const { keyOf, fromKey, addDays, today, isOpen, horarioDe, listaAbierta, proximasNoches } = window.BotanicCalendario;

  const fechaLarga = (d) => `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  const fechaCorta = (d) => `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;

  function noche(d) {
    const k = keyOf(d);
    const ev = EVENTOS[k] || {};
    return {
      key: k,
      date: d,
      titulo: ev.titulo || NOCHES[d.getDay()] || `${DIAS[d.getDay()]} Botanic`,
      artistas: ev.artistas || "",
      descripcion: ev.descripcion || "",
      instagram: ev.instagram || "",
      portada: ev.portada || "",
      horario: ev.horario || horarioDe(d)
    };
  }

  /* ---------------- Portadas ---------------- */
  const coverCache = new Map(); // key -> Promise<url|null>

  function probe(url) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => res(url);
      img.onerror = () => res(null);
      img.src = url;
    });
  }

  function resolveCover(d) {
    const k = keyOf(d);
    if (coverCache.has(k)) return coverCache.get(k);
    const ev = EVENTOS[k];
    const candidatos = [];
    if (ev && ev.portada) candidatos.push(ev.portada);
    EXT_PORTADA.forEach((ext) => candidatos.push(`img/portadas/${k}.${ext}`));
    const p = (async () => {
      for (const url of candidatos) {
        const ok = await probe(url);
        if (ok) return ok;
      }
      return null;
    })();
    coverCache.set(k, p);
    return p;
  }

  function coverEl(d, { eager = false } = {}) {
    const n = noche(d);
    const wrap = el("div", { class: "cover" });
    // Sin portada todavía: se muestra el logo de Botanic
    wrap.appendChild(el("div", { class: "cover-fallback", role: "img", "aria-label": "Botanic" }));
    resolveCover(d).then((url) => {
      if (!url) return;
      const img = el("img", { src: url, alt: `Portada: ${n.titulo}, ${fechaLarga(d)}`, loading: eager ? "eager" : "lazy", decoding: "async" });
      wrap.replaceChildren(img);
    });
    return wrap;
  }

  /* ---------------- Almacenamiento local (solo comodidad) ---------------- */
  function leerInscripciones() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; }
  }
  function guardarInscripcion(k, datos) {
    try {
      const all = leerInscripciones();
      all[k] = datos;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) { /* sin almacenamiento: no pasa nada */ }
  }

  /* =========================================================
     CABECERA
     ========================================================= */
  function initHeader() {
    const bar = $("#topbar");
    const onScroll = () => bar.classList.toggle("scrolled", window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const burger = $("#burger");
    const nav = $("#nav");
    const setOpen = (open) => {
      nav.classList.toggle("open", open);
      document.body.style.overflow = open ? "hidden" : "";
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    };
    burger.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
    nav.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  }

  /* =========================================================
     PORTADA: título neón
     ========================================================= */
  /* Título neón: cada letra entra por separado */
  function initTitulo() {
    const h1 = $("#neon-title");
    if (!h1 || reducedMotion) return;
    const letras = Array.from(h1.textContent);
    h1.replaceChildren(...letras.map((c, i) => {
      const s = el("span", { class: c === "Ø" ? "ch o-slash" : "ch", "aria-hidden": "true" }, esc(c));
      s.style.setProperty("--i", i);
      return s;
    }));
  }

  /* =========================================================
     CINTA EN MOVIMIENTO
     ========================================================= */
  function initMarquee() {
    document.querySelectorAll("[data-marquee]").forEach((m) => {
      const texto = m.dataset.marquee;
      const mitad = Array.from({ length: 4 }, () => `<span>${esc(texto)}</span>`).join("");
      // Dos mitades idénticas: al desplazar -50% el bucle no tiene salto
      m.replaceChildren(el("div", { class: "marquee-track" }, mitad + mitad));
    });
  }

  /* =========================================================
     APARICIÓN AL HACER SCROLL
     ========================================================= */
  const revealObserver = ("IntersectionObserver" in window && !reducedMotion)
    ? new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        revealObserver.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" })
    : null;

  function reveal(node, delay) {
    if (!node.hasAttribute("data-reveal")) node.setAttribute("data-reveal", "");
    if (delay !== undefined) node.style.setProperty("--d", delay);
    if (revealObserver) revealObserver.observe(node);
    else node.classList.add("is-in");
  }

  function initReveal() {
    document.querySelectorAll("[data-reveal]").forEach((n) => reveal(n));
  }

  /* =========================================================
     PARALLAX (portada y reservados)
     ========================================================= */
  function initParallax() {
    if (reducedMotion) return;
    const capas = Array.from(document.querySelectorAll("[data-depth]"));
    if (!capas.length) return;
    const hero = $("#inicio");
    let mx = 0, my = 0, pendiente = false;

    const pintar = () => {
      pendiente = false;
      const vh = window.innerHeight;
      capas.forEach((c) => {
        const sec = c.parentElement.getBoundingClientRect();
        if (sec.bottom < -100 || sec.top > vh + 100) return;
        const depth = parseFloat(c.dataset.depth) || 0;
        const enHero = c.parentElement === hero;
        const x = enHero ? mx * depth * 60 : 0;
        let y;
        if (enHero) {
          y = -sec.top * depth + my * depth * 40;
        } else {
          // Desplazamiento según la distancia al centro de la pantalla, limitado a lo que la capa sobresale por arriba
          const limite = Math.max(0, -c.offsetTop) * 0.9;
          y = Math.max(-limite, Math.min(limite, -(sec.top + sec.height / 2 - vh / 2) * depth));
        }
        c.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      });
    };
    const pedir = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(pintar); } };

    window.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", pedir);
    if (finePointer) {
      hero.addEventListener("pointermove", (e) => {
        mx = e.clientX / window.innerWidth - 0.5;
        my = e.clientY / window.innerHeight - 0.5;
        pedir();
      });
    }
    pintar();
  }

  /* =========================================================
     MODO LIGERO: sin aceleración por hardware (o en equipos lentos) los focos,
     el brillo de los botones y el del cursor bajan la portada a ~14 fps.
     Se miden los fps un segundo y, si no llegan a 40, se apagan esos efectos.
     El resultado se guarda junto al renderizador gráfico: el navegador restaura
     sessionStorage al reabrir las pestañas, y si entretanto se ha activado la
     aceleración por hardware el renderizador cambia y se vuelve a medir.
     ========================================================= */
  const LIGERO_KEY = "botanic_fx_ligero";

  function renderizadorGrafico() {
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      if (!gl) return "sin-webgl";
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const nombre = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      const perder = gl.getExtension("WEBGL_lose_context");
      if (perder) perder.loseContext();
      return String(nombre);
    } catch (e) { return "desconocido"; }
  }

  function initModoLigero() {
    if (reducedMotion) return;
    const activar = () => document.documentElement.classList.add("fx-ligero");
    const gpu = renderizadorGrafico();
    try {
      const guardado = sessionStorage.getItem(LIGERO_KEY);
      if (guardado === gpu) return activar();
      if (guardado) sessionStorage.removeItem(LIGERO_KEY);
    } catch (e) { /* sin almacenamiento */ }

    // Se espera a que acabe la entrada del título para no medir la carga de la página
    setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      const tiempos = [];
      let ultimo = 0;
      const medir = (ahora) => {
        if (ultimo) tiempos.push(ahora - ultimo);
        ultimo = ahora;
        if (tiempos.length < 120 && tiempos.reduce((a, b) => a + b, 0) < 1000) return requestAnimationFrame(medir);
        if (document.visibilityState !== "visible" || tiempos.length < 5) return;
        tiempos.sort((a, b) => a - b);
        if (tiempos[tiempos.length >> 1] > 25) {
          activar();
          try { sessionStorage.setItem(LIGERO_KEY, gpu); } catch (e) { /* vale solo para esta carga */ }
        }
      };
      requestAnimationFrame(medir);
    }, 2500);
  }

  /* =========================================================
     EFECTOS DE RATÓN: brillo, inclinación 3D, botones magnéticos
     ========================================================= */
  function initPointerFx() {
    if (!finePointer || reducedMotion) return;

    // Brillo que sigue al cursor (con suavizado)
    const glow = $("#cursor-glow");
    let gx = window.innerWidth / 2, gy = window.innerHeight / 2, tx = gx, ty = gy, animando = false;
    const seguir = () => {
      gx += (tx - gx) * 0.14;
      gy += (ty - gy) * 0.14;
      glow.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
      if (Math.abs(tx - gx) > 0.5 || Math.abs(ty - gy) > 0.5) requestAnimationFrame(seguir);
      else animando = false;
    };
    document.addEventListener("pointermove", (e) => {
      tx = e.clientX; ty = e.clientY;
      glow.classList.add("on");
      if (!animando) { animando = true; requestAnimationFrame(seguir); }
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => glow.classList.remove("on"));

    // Inclinación 3D en tarjetas y portadas (delegado: sirve para elementos creados después)
    let tiltActual = null;
    const soltarTilt = () => {
      if (!tiltActual) return;
      tiltActual.classList.remove("tilting");
      tiltActual.style.removeProperty("--rx");
      tiltActual.style.removeProperty("--ry");
      tiltActual = null;
    };
    document.addEventListener("pointermove", (e) => {
      const t = e.target.closest(".tilt");
      if (t !== tiltActual) soltarTilt();
      if (!t) return;
      tiltActual = t;
      const r = t.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      t.classList.add("tilting");
      t.style.setProperty("--ry", `${((px - 0.5) * 14).toFixed(2)}deg`);
      t.style.setProperty("--rx", `${((0.5 - py) * 14).toFixed(2)}deg`);
      t.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      t.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
    }, { passive: true });
    document.addEventListener("pointerleave", soltarTilt);

    // Botones magnéticos
    let btnActual = null;
    const soltarBtn = () => {
      if (!btnActual) return;
      btnActual.style.removeProperty("--tx");
      btnActual.style.removeProperty("--ty");
      btnActual = null;
    };
    document.addEventListener("pointermove", (e) => {
      const b = e.target.closest(".btn");
      if (b !== btnActual) soltarBtn();
      if (!b || b.disabled) return;
      btnActual = b;
      const r = b.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      b.style.setProperty("--tx", `${(dx / r.width * 14).toFixed(1)}px`);
      b.style.setProperty("--ty", `${(dy / r.height * 10).toFixed(1)}px`);
    }, { passive: true });
  }

  /* =========================================================
     ESTA SEMANA
     ========================================================= */
  function initWeek() {
    const strip = $("#week-strip");
    const noches = proximasNoches(4);
    const t = today().getTime();
    noches.forEach((d, i) => {
      const n = noche(d);
      const item = el("div", { class: "week-item" });
      const card = el("button", { class: "week-card tilt", type: "button", "aria-label": `${fechaLarga(d)}: ${n.titulo}. Ver y apuntarse a la lista` });
      card.appendChild(coverEl(d, { eager: i < 2 }));
      if (d.getTime() === t) card.appendChild(el("span", { class: "week-tag" }, "Hoy"));
      card.appendChild(el("div", { class: "week-meta" },
        `<span class="week-day">${esc(fechaLarga(d))}</span>
         <span class="week-title">${esc(n.titulo)}</span>
         <span class="week-cta">${listaAbierta(d) ? "Apúntate a la lista →" : "Ver noche →"}</span>`));
      card.addEventListener("click", () => abrirDia(d, true));
      item.appendChild(card);
      strip.appendChild(item);
      reveal(item, i + 1);
    });
  }

  /* =========================================================
     CALENDARIO
     ========================================================= */
  const cal = {
    year: 0,
    month: 0,
    selected: null,
    min: null,
    max: null
  };

  function initCalendar() {
    const t = today();
    cal.year = t.getFullYear();
    cal.month = t.getMonth();
    cal.min = new Date(t.getFullYear(), t.getMonth() - 3, 1);
    cal.max = new Date(t.getFullYear(), t.getMonth() + 6, 1);

    $("#cal-prev").addEventListener("click", () => moverMes(-1));
    $("#cal-next").addEventListener("click", () => moverMes(1));

    // Deslizar para cambiar de mes en móvil
    let sx = null, sy = null;
    const grid = $("#cal-grid");
    grid.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    grid.addEventListener("touchend", (e) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && !e.target.closest(".day-panel")) moverMes(dx < 0 ? 1 : -1);
      sx = sy = null;
    });

    renderCalendar();
  }

  function moverMes(delta) {
    const d = new Date(cal.year, cal.month + delta, 1);
    if (d < cal.min || d > cal.max) return;
    cal.year = d.getFullYear();
    cal.month = d.getMonth();
    cal.selected = null;
    renderCalendar();
  }

  function renderCalendar() {
    const grid = $("#cal-grid");
    const first = new Date(cal.year, cal.month, 1);
    const days = new Date(cal.year, cal.month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // semana empieza en lunes
    const t = today().getTime();
    const proxima = proximasNoches(1, true)[0];
    const kProx = proxima ? keyOf(proxima) : "";

    $("#cal-month").textContent = `${MESES[cal.month]} ${cal.year}`;
    $("#cal-prev").disabled = new Date(cal.year, cal.month - 1, 1) < cal.min;
    $("#cal-next").disabled = new Date(cal.year, cal.month + 1, 1) > cal.max;

    grid.replaceChildren();
    for (let i = 0; i < offset; i++) grid.appendChild(el("div", { class: "cal-day empty", "aria-hidden": "true" }));

    for (let day = 1; day <= days; day++) {
      const d = new Date(cal.year, cal.month, day);
      const k = keyOf(d);
      const open = isOpen(d);
      const classes = ["cal-day", open ? "open" : "closed"];
      if (d.getTime() < t) classes.push("past");
      if (d.getTime() === t) classes.push("today");
      if (cal.selected === k) classes.push("selected");
      if (k === kProx) classes.push("next");

      if (open) {
        const n = noche(d);
        const cell = el("button", {
          class: classes.join(" "),
          type: "button",
          dataset: { key: k },
          "aria-label": `${fechaLarga(d)}, ${n.titulo}`,
          "aria-expanded": cal.selected === k ? "true" : "false"
        });
        cell.appendChild(coverEl(d));
        cell.appendChild(el("span", { class: "cal-num" }, String(day)));
        cell.appendChild(el("span", { class: "cal-label" }, esc(n.titulo)));
        cell.addEventListener("click", () => toggleDia(k));
        grid.appendChild(cell);
      } else {
        const cell = el("div", { class: classes.join(" "), "aria-label": `${fechaLarga(d)}, cerrado` });
        cell.appendChild(el("span", { class: "cal-num" }, String(day)));
        grid.appendChild(cell);
      }
    }

    if (cal.selected) insertarPanel(cal.selected, false);
  }

  function toggleDia(k) {
    if (cal.selected === k) { cerrarPanel(); return; }
    cal.selected = k;
    grid().querySelectorAll(".cal-day.selected").forEach((c) => { c.classList.remove("selected"); c.setAttribute("aria-expanded", "false"); });
    const cell = grid().querySelector(`[data-key="${k}"]`);
    if (cell) { cell.classList.add("selected"); cell.setAttribute("aria-expanded", "true"); }
    insertarPanel(k, true);
  }

  const grid = () => $("#cal-grid");

  function cerrarPanel() {
    const k = cal.selected;
    cal.selected = null;
    grid().querySelector(".day-panel")?.remove();
    const cell = k && grid().querySelector(`[data-key="${k}"]`);
    if (cell) { cell.classList.remove("selected"); cell.setAttribute("aria-expanded", "false"); cell.focus({ preventScroll: true }); }
  }

  function insertarPanel(k, scroll) {
    const g = grid();
    g.querySelector(".day-panel")?.remove();
    const cell = g.querySelector(`[data-key="${k}"]`);
    if (!cell) return;

    // Colocar el panel justo después de la última celda de esa semana
    const cells = Array.from(g.children);
    const idx = cells.indexOf(cell);
    const finFila = Math.min(idx - (idx % 7) + 6, cells.length - 1);
    const panel = buildPanel(fromKey(k));
    cells[finFila].after(panel);

    if (scroll) {
      requestAnimationFrame(() => {
        const top = panel.getBoundingClientRect().top + window.scrollY - 80;
        const needs = panel.getBoundingClientRect().top < 70 || panel.getBoundingClientRect().top > window.innerHeight * 0.55;
        if (needs) window.scrollTo({ top, behavior: "smooth" });
      });
    }
  }

  /* Abrir un día desde fuera del calendario (tira semanal, botones) */
  function abrirDia(d, scrollToPanel) {
    cal.year = d.getFullYear();
    cal.month = d.getMonth();
    cal.selected = keyOf(d);
    renderCalendar();
    if (scrollToPanel) {
      const panel = grid().querySelector(".day-panel");
      if (panel) {
        const top = panel.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top, behavior: "smooth" });
      }
    }
  }

  /* ---------------- Panel del día ---------------- */
  function buildPanel(d) {
    const n = noche(d);
    const panel = el("div", { class: "day-panel", role: "region", "aria-label": `${fechaLarga(d)}: ${n.titulo}` });

    const close = el("button", { class: "dp-close", type: "button", "aria-label": "Cerrar" }, "&times;");
    close.addEventListener("click", cerrarPanel);
    panel.appendChild(close);

    const coverBox = el("div", { class: "dp-cover tilt" });
    coverBox.appendChild(coverEl(d, { eager: true }));
    panel.appendChild(coverBox);

    const info = el("div", { class: "dp-info" });
    info.innerHTML = `
      <p class="dp-date">${esc(fechaLarga(d))}</p>
      <h3 class="dp-title">${esc(n.titulo)}</h3>
      ${n.artistas ? `<p class="dp-artists">${esc(n.artistas)}</p>` : ""}
      ${n.descripcion ? `<p class="dp-desc">${esc(n.descripcion)}</p>` : ""}
      <ul class="dp-facts">
        <li>🕦 ${esc(n.horario)}</li>
        <li>🔞 +18 · DNI</li>
        <li>📍 ${esc(CFG.ciudad || "Chipiona")}</li>
      </ul>
      ${n.instagram ? `<a class="dp-ig" href="${esc(n.instagram)}" target="_blank" rel="noopener">Ver publicación en Instagram ↗</a>` : ""}
    `;
    info.appendChild(buildLista(d, n));
    panel.appendChild(info);
    return panel;
  }

  /* ---------------- Lista ---------------- */
  function buildLista(d, n) {
    const box = el("div", { class: "list-box" });

    if (!listaAbierta(d)) {
      const pasado = d < today();
      box.innerHTML = `<h4>Lista</h4><p class="list-closed">${pasado
        ? "Esta noche ya pasó. ¡Te esperamos en la próxima!"
        : "La lista de hoy ya está cerrada. Puedes venir igualmente a la puerta o escribirnos por WhatsApp."}</p>`;
      return box;
    }

    const previa = leerInscripciones()[n.key];
    if (previa) {
      renderHecho(box, d, n, previa);
      return box;
    }
    renderForm(box, d, n);
    return box;
  }

  /* ---------------- RPP del link (?rpp=código) ---------------- */
  const RPP_KEY = "botanic_rpp";
  let rppActual = null; // { codigo, nombre } validado por el servidor

  /* Lee el RPP del link o, si no hay, el que se guardó en esta pestaña */
  async function initRpp() {
    const codigo = new URLSearchParams(location.search).get("rpp");
    if (codigo === null) {
      try { rppActual = JSON.parse(sessionStorage.getItem(RPP_KEY)); } catch (e) { rppActual = null; }
    } else {
      rppActual = null;
      if (/^[a-z0-9]{4,32}$/.test(codigo)) {
        try {
          const r = await fetch(`/api/rpp/${codigo}`);
          if (r.ok) { const j = await r.json(); rppActual = { codigo: j.codigo, nombre: j.nombre }; }
        } catch (e) { /* sin servidor: queda sin RPP */ }
      }
      try {
        if (rppActual) sessionStorage.setItem(RPP_KEY, JSON.stringify(rppActual));
        else sessionStorage.removeItem(RPP_KEY);
      } catch (e) { /* sin almacenamiento: vale solo para esta carga */ }
    }
    document.querySelectorAll(".rpp-field input").forEach((i) => { i.value = textoRpp(); });
  }

  const textoRpp = () => (rppActual ? rppActual.nombre : "Sin RPP");

  /* Token firmado por el servidor; se pide al mostrar el formulario */
  async function pedirToken() {
    const r = await fetch("/api/form-token", { cache: "no-store" });
    if (!r.ok) throw new Error("token");
    return { valor: (await r.json()).token, pedido: Date.now() };
  }

  const ICONO_CANDADO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 9V7A5 5 0 0 0 7 7v2H5v13h14V9h-2zm-8-2a3 3 0 0 1 6 0v2H9V7zm4 10.7V19h-2v-1.3a2 2 0 1 1 2 0z"/></svg>`;

  function renderForm(box, d, n) {
    const id = `l-${n.key}`;
    box.innerHTML = `
      <h4>Apúntate a la <span>lista</span></h4>
      <p class="list-hint">Lista para el ${esc(fechaLarga(d).toLowerCase())}. Di tu nombre y enseña tu DNI en la puerta.</p>
      <form novalidate>
        <div class="form-grid">
          <div class="field">
            <label for="${id}-nombre">Nombre y apellidos</label>
            <input id="${id}-nombre" name="nombre" autocomplete="name" autocapitalize="words" spellcheck="false" required maxlength="${window.BotanicNombre.MAX}">
          </div>
          <div class="field rpp-field">
            <label for="${id}-rpp">RPP</label>
            <div class="rpp-locked">
              <input id="${id}-rpp" value="${esc(textoRpp())}" readonly tabindex="-1" aria-readonly="true">
              ${ICONO_CANDADO}
            </div>
          </div>
          <div class="hp" aria-hidden="true">
            <label>No rellenar <input name="web" tabindex="-1" autocomplete="off"></label>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-neon" type="submit">${btnHTML("Apuntarme")}</button>
        </div>
        <p class="form-error" role="alert" hidden></p>
        <p class="list-legal">Al apuntarte confirmas que eres mayor de 18 años y aceptas que usemos tu nombre solo para gestionar la lista de esta noche.</p>
      </form>`;

    const form = $("form", box);
    const input = form.elements.nombre;
    const err = $(".form-error", box);
    const mostrarError = (msg) => { err.textContent = msg; err.hidden = !msg; input.setAttribute("aria-invalid", msg ? "true" : "false"); };
    let token = pedirToken().catch(() => null);

    input.addEventListener("blur", () => {
      if (!input.value.trim()) return;
      const v = window.BotanicNombre.validar(input.value);
      mostrarError(v.ok ? "" : v.error);
      if (v.ok) input.value = v.nombre;
    });
    input.addEventListener("input", () => { if (!err.hidden) mostrarError(""); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = window.BotanicNombre.validar(input.value);
      if (!v.ok) { mostrarError(v.error); input.focus(); return; }
      mostrarError("");

      const btn = $("button[type=submit]", form);
      const etiqueta = $(".btn-label", btn);
      btn.disabled = true;
      etiqueta.textContent = "Enviando…";
      const reactivar = (msg) => { btn.disabled = false; etiqueta.textContent = "Apuntarme"; mostrarError(msg); };

      try {
        let t = await token;
        if (!t) t = await (token = pedirToken());
        // El servidor no acepta tokens de menos de 3 s (bots): si hace falta, se espera
        const espera = 3200 - (Date.now() - t.pedido);
        if (espera > 0) await new Promise((r) => setTimeout(r, espera));

        const r = await fetch("/api/lista", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fecha: n.key, nombre: v.nombre, rpp: rppActual ? rppActual.codigo : null, token: t.valor, web: form.elements.web.value })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) {
          if (r.status === 400 && /caducado/.test(j.error || "")) token = pedirToken().catch(() => null);
          return reactivar(j.error || "No se ha podido completar la inscripción.");
        }
        const guardado = { nombre: j.nombre, rpp: j.rpp };
        guardarInscripcion(n.key, guardado);
        renderHecho(box, d, n, guardado);
      } catch (ex) {
        reactivar("No se ha podido conectar. Revisa tu conexión e inténtalo de nuevo.");
      }
    });
  }

  function renderHecho(box, d, n, g) {
    box.innerHTML = `
      <div class="list-done">
        <div class="tick" aria-hidden="true">✓</div>
        <h4>¡Estás en la lista!</h4>
        <p>${esc(g.nombre)} · ${esc(fechaLarga(d))}${g.rpp ? ` · RPP ${esc(g.rpp)}` : ""}.<br>
        Di tu nombre en la puerta y enseña tu DNI. ¡Nos vemos dentro!</p>
        <button class="btn btn-ghost btn-sm" type="button">${btnHTML("Apuntar a otra persona", "+")}</button>
      </div>`;
    $("button", box).addEventListener("click", () => renderForm(box, d, n));
  }

  /* =========================================================
     GALERÍA
     ========================================================= */
  const gal = { filtro: "todas", fotos: [], visibles: 0, pagina: 24 };

  function initGallery() {
    const noches = GALERIA.filter((g) => g && g.fotos && g.fotos.length)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    $("#gal-ig").href = `https://www.instagram.com/${CFG.instagram}/`;

    if (!noches.length) { $("#gal-empty").hidden = false; return; }

    const filters = $("#gal-filters");
    const mkChip = (id, label) => {
      const c = el("button", { class: "chip", type: "button", role: "tab", "aria-selected": id === gal.filtro ? "true" : "false" }, esc(label));
      c.addEventListener("click", () => {
        gal.filtro = id;
        filters.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-selected", "false"));
        c.setAttribute("aria-selected", "true");
        renderGallery(noches, true);
      });
      filters.appendChild(c);
    };
    mkChip("todas", "Todas");
    noches.forEach((g) => {
      const d = fromKey(g.fecha);
      mkChip(g.fecha, g.titulo ? `${fechaCorta(d)} · ${g.titulo}` : `${DIAS[d.getDay()]} ${fechaCorta(d)}`);
    });

    $("#gal-more-btn").addEventListener("click", () => renderGallery(noches, false));
    renderGallery(noches, true);
  }

  function renderGallery(noches, reset) {
    const grid = $("#gal-grid");
    if (reset) {
      gal.fotos = [];
      noches.filter((g) => gal.filtro === "todas" || g.fecha === gal.filtro).forEach((g) => {
        const d = fromKey(g.fecha);
        const cap = `${g.titulo || DIAS[d.getDay()]} · ${fechaLarga(d)}`;
        g.fotos.forEach((src) => gal.fotos.push({ src, cap }));
      });
      gal.visibles = 0;
      grid.replaceChildren();
    }
    const desde = gal.visibles;
    const hasta = Math.min(gal.fotos.length, desde + gal.pagina);
    for (let i = desde; i < hasta; i++) {
      const f = gal.fotos[i];
      const b = el("button", { class: "gal-item", type: "button", "aria-label": `Ampliar foto ${i + 1}: ${f.cap}` });
      const img = el("img", { src: f.src, alt: f.cap, loading: "lazy", decoding: "async" });
      img.addEventListener("load", () => img.classList.add("loaded"));
      img.addEventListener("error", () => b.remove());
      if (img.complete) img.classList.add("loaded");
      b.appendChild(img);
      b.addEventListener("click", () => abrirVisor(i));
      grid.appendChild(b);
      reveal(b, (i - desde) % 4);
    }
    gal.visibles = hasta;
    $("#gal-more").hidden = gal.visibles >= gal.fotos.length;
  }

  /* ---------------- Visor ---------------- */
  let lbIndex = 0;
  let lbLastFocus = null;

  function abrirVisor(i) {
    lbLastFocus = document.activeElement;
    lbIndex = i;
    pintarVisor();
    $("#lightbox").hidden = false;
    document.body.style.overflow = "hidden";
    $("#lb-close").focus();
  }
  function cerrarVisor() {
    $("#lightbox").hidden = true;
    document.body.style.overflow = "";
    lbLastFocus && lbLastFocus.focus();
  }
  function pintarVisor() {
    const f = gal.fotos[lbIndex];
    if (!f) return;
    $("#lb-img").src = f.src;
    $("#lb-img").alt = f.cap;
    $("#lb-caption").textContent = `${f.cap} · ${lbIndex + 1}/${gal.fotos.length}`;
  }
  function moverVisor(delta) {
    lbIndex = (lbIndex + delta + gal.fotos.length) % gal.fotos.length;
    pintarVisor();
  }

  function initLightbox() {
    const lb = $("#lightbox");
    $("#lb-close").addEventListener("click", cerrarVisor);
    $("#lb-prev").addEventListener("click", () => moverVisor(-1));
    $("#lb-next").addEventListener("click", () => moverVisor(1));
    lb.addEventListener("click", (e) => { if (e.target === lb) cerrarVisor(); });
    document.addEventListener("keydown", (e) => {
      if (lb.hidden) return;
      if (e.key === "Escape") cerrarVisor();
      if (e.key === "ArrowLeft") moverVisor(-1);
      if (e.key === "ArrowRight") moverVisor(1);
    });
    let sx = null;
    lb.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", (e) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) moverVisor(dx < 0 ? 1 : -1);
      sx = null;
    });
  }

  /* =========================================================
     RESERVADOS: mesa en pista y mesa VIP
     ========================================================= */
  const RES = window.BOTANIC_RESERVADOS || { tipos: {}, botellas: [], refrescos: [] };
  const MAX_UNIDADES = 10;
  let resTipo = null;      // tipo mostrado en el panel
  let resLastFocus = null;

  function initReservados() {
    const panel = $("#res-panel");
    const opciones = Array.from(document.querySelectorAll(".res-opcion"));

    // Los paneles de todos los tipos van montados y apilados en la misma celda:
    // así la sección no cambia de alto al abrir o cambiar de mesa (el fondo se recolocaría de golpe)
    const cards = {};
    Object.keys(RES.tipos).forEach((tipo) => {
      const c = buildResPanel(tipo);
      c.inert = true;
      c.addEventListener("animationend", (e) => { if (e.target === c) c.classList.remove("is-out"); });
      cards[tipo] = c;
      panel.appendChild(c);
    });

    // Sale el panel actual y entra el nuevo (o se queda cerrado)
    const mostrar = (tipo) => {
      const anterior = resTipo;
      resTipo = tipo;
      opciones.forEach((o) => {
        const activa = o.dataset.tipo === tipo;
        o.classList.toggle("active", activa);
        o.setAttribute("aria-expanded", String(activa));
      });
      if (anterior) {
        const c = cards[anterior];
        c.classList.remove("is-in");
        c.classList.toggle("is-out", !reducedMotion);
        c.inert = true;
      }
      panel.classList.toggle("abierto", Boolean(tipo));
      panel.classList.toggle("cambio", Boolean(anterior && tipo)); // el nuevo espera a que salga el anterior
      if (!tipo) return;
      const c = cards[tipo];
      c.classList.remove("is-out");
      c.classList.add("is-in");
      c.inert = false;
      if (window.matchMedia("(max-width: 859px)").matches) {
        requestAnimationFrame(() => panel.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" }));
      }
    };

    opciones.forEach((o) => o.addEventListener("click", () => mostrar(resTipo === o.dataset.tipo ? null : o.dataset.tipo)));

    // Formulario
    const modal = $("#res-modal");
    $("#res-modal-close").addEventListener("click", cerrarReserva);
    modal.addEventListener("click", (e) => { if (e.target === modal) cerrarReserva(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) cerrarReserva(); });
  }

  function buildResPanel(tipo) {
    const t = RES.tipos[tipo] || {};
    const box = el("div", { class: `res-card res-card-${tipo}` });
    const cerrar = el("button", { class: "dp-close", type: "button", "aria-label": "Cerrar" }, "&times;");
    cerrar.addEventListener("click", () => {
      const opcion = document.querySelector(`.res-opcion[data-tipo="${tipo}"]`);
      opcion.click();
      opcion.focus(); // en móvil el panel encoge la sección: vuelve la vista al botón
    });
    box.appendChild(cerrar);

    const cuerpo = el("div", { class: "res-card-cuerpo" }, `
      <p class="eyebrow">${esc(t.subtitulo)}</p>
      <h3 class="res-card-titulo">${esc(t.nombre)}</h3>
      <p class="res-card-desc">${esc(t.descripcion)}</p>
      <ul class="res-incluye">${(t.incluye || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`);
    const acciones = el("div", { class: "form-actions" });
    const reservar = el("button", { class: "btn btn-neon", type: "button" }, btnHTML(`Reservar ${t.nombre.toLowerCase()}`));
    reservar.addEventListener("click", () => abrirReserva(tipo));
    acciones.appendChild(reservar);
    cuerpo.appendChild(acciones);
    // Cascada: cada bloque entra un poco después del anterior
    Array.from(cuerpo.children).forEach((c, i) => c.style.setProperty("--d", i));
    box.appendChild(cuerpo);
    return box;
  }

  /* ---------------- Formulario de reserva ---------------- */
  function abrirReserva(tipo) {
    resLastFocus = document.activeElement;
    renderReservaForm(tipo);
    $("#res-modal").hidden = false;
    document.body.style.overflow = "hidden";
    $("#res-modal-close").focus();
  }

  function cerrarReserva() {
    $("#res-modal").hidden = true;
    document.body.style.overflow = "";
    resLastFocus && resLastFocus.focus();
  }

  const filasCantidad = (grupo, items) => items.map((nombre, i) => `
    <li class="qty-row">
      <span class="qty-nombre">${esc(nombre)}</span>
      <span class="qty" data-grupo="${grupo}" data-nombre="${esc(nombre)}">
        <button type="button" class="qty-btn" data-paso="-1" aria-label="Quitar ${esc(nombre)}" disabled>−</button>
        <output class="qty-n" id="qty-${grupo}-${i}" aria-live="polite">0</output>
        <button type="button" class="qty-btn" data-paso="1" aria-label="Añadir ${esc(nombre)}">+</button>
      </span>
    </li>`).join("");

  function renderReservaForm(tipo) {
    const cuerpo = $("#res-modal-cuerpo");
    const noches = proximasNoches(8, true);
    const t = RES.tipos[tipo] || {};
    const opcionesNoche = noches.map((d) => `<option value="${keyOf(d)}">${esc(fechaLarga(d))}</option>`).join("");

    cuerpo.innerHTML = `
      <p class="eyebrow">Reservados</p>
      <h3 class="res-modal-titulo" id="res-modal-titulo">Solicita tu <span>reserva</span></h3>
      <p class="list-hint">Te confirmaremos la reserva por WhatsApp o llamada.</p>
      <form novalidate>
        <div class="form-grid res-form-grid">
          <div class="field">
            <label for="res-tipo">Tipo de mesa</label>
            <div class="rpp-locked">
              <input id="res-tipo" value="${esc(t.nombre)}" readonly tabindex="-1" aria-readonly="true">
              ${ICONO_CANDADO}
            </div>
            <input type="hidden" name="tipo" value="${esc(tipo)}">
          </div>
          <div class="field">
            <label for="res-noche">Noche</label>
            <select id="res-noche" name="noche">${opcionesNoche}</select>
          </div>
          <div class="field">
            <label for="res-nombre">Nombre y apellidos</label>
            <input id="res-nombre" name="nombre" autocomplete="name" autocapitalize="words" spellcheck="false" required maxlength="${window.BotanicNombre.MAX}">
          </div>
          <div class="field">
            <label for="res-tel">Teléfono</label>
            <input id="res-tel" name="telefono" type="tel" inputmode="tel" autocomplete="tel" required maxlength="20">
          </div>
          <div class="field">
            <label for="res-personas">Personas</label>
            <input id="res-personas" name="personas" type="number" inputmode="numeric" min="1" max="30" value="4" required>
          </div>
        </div>

        <fieldset class="res-grupo">
          <legend>Botellas</legend>
          <ul class="qty-list">${filasCantidad("botellas", RES.botellas)}</ul>
        </fieldset>
        <fieldset class="res-grupo">
          <legend>Refrescos</legend>
          <ul class="qty-list">${filasCantidad("refrescos", RES.refrescos)}</ul>
        </fieldset>

        <div class="field">
          <label for="res-notas">Comentarios (opcional)</label>
          <textarea id="res-notas" name="notas" rows="3" maxlength="500" placeholder="Cumpleaños, hora de llegada, alguna petición…"></textarea>
        </div>

        <div class="form-actions">
          <button class="btn btn-neon" type="submit">${btnHTML("Enviar reserva")}</button>
        </div>
        <p class="form-error" role="alert" hidden></p>
        <p class="list-legal">La reserva no es firme hasta que te la confirmemos. Solo para mayores de 18 años.</p>
      </form>`;

    const form = $("form", cuerpo);
    const err = $(".form-error", cuerpo);
    const mostrarError = (msg, campo) => {
      err.textContent = msg;
      err.hidden = !msg;
      form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
      if (campo) { campo.setAttribute("aria-invalid", "true"); campo.focus(); }
    };

    // Contadores − / +
    form.addEventListener("click", (e) => {
      const b = e.target.closest(".qty-btn");
      if (!b) return;
      const q = b.parentElement;
      const out = $(".qty-n", q);
      const n = Math.max(0, Math.min(MAX_UNIDADES, Number(out.textContent) + Number(b.dataset.paso)));
      out.textContent = String(n);
      q.classList.toggle("has", n > 0);
      q.querySelector('[data-paso="-1"]').disabled = n === 0;
      q.querySelector('[data-paso="1"]').disabled = n === MAX_UNIDADES;
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = form.elements;
      const v = window.BotanicNombre.validar(f.nombre.value);
      if (!v.ok) return mostrarError(v.error, f.nombre);
      const tel = f.telefono.value.replace(/[\s.-]/g, "");
      if (!/^\+?\d{9,15}$/.test(tel)) return mostrarError("Escribe un teléfono válido.", f.telefono);
      const personas = Number(f.personas.value);
      if (!Number.isInteger(personas) || personas < 1 || personas > 30) return mostrarError("Indica cuántas personas venís (1 a 30).", f.personas);
      if (!f.noche.value) return mostrarError("No hay noches disponibles para reservar.", f.noche);
      mostrarError("");

      const cantidades = (grupo) => Array.from(form.querySelectorAll(`.qty[data-grupo="${grupo}"]`))
        .map((q) => ({ nombre: q.dataset.nombre, cantidad: Number($(".qty-n", q).textContent) }))
        .filter((x) => x.cantidad > 0);

      const datos = {
        tipo: f.tipo.value,
        fecha: f.noche.value,
        nombre: v.nombre,
        telefono: tel,
        personas,
        botellas: cantidades("botellas"),
        refrescos: cantidades("refrescos"),
        notas: f.notas.value.trim()
      };
      enviarReserva(datos).then(() => renderReservaHecha(datos));
    });

    $("#res-modal-caja").scrollTop = 0;
  }

  /* Sin servidor todavía: aquí se conectará el guardado de la reserva */
  function enviarReserva(datos) {
    return Promise.resolve(datos);
  }

  function renderReservaHecha(datos) {
    const t = RES.tipos[datos.tipo] || {};
    const lista = (items) => items.map((x) => `${x.cantidad} × ${esc(x.nombre)}`).join(", ");
    const cuerpo = $("#res-modal-cuerpo");
    cuerpo.innerHTML = `
      <div class="list-done">
        <div class="tick" aria-hidden="true">✓</div>
        <h4 id="res-modal-titulo">¡Solicitud enviada!</h4>
        <p>${esc(t.nombre)} · ${esc(fechaLarga(fromKey(datos.fecha)))} · ${datos.personas} ${datos.personas === 1 ? "persona" : "personas"}</p>
        ${datos.botellas.length ? `<p><strong>Botellas:</strong> ${lista(datos.botellas)}</p>` : ""}
        ${datos.refrescos.length ? `<p><strong>Refrescos:</strong> ${lista(datos.refrescos)}</p>` : ""}
        <p>Te escribiremos al ${esc(datos.telefono)} para confirmarla.</p>
        <button class="btn btn-ghost btn-sm" type="button">${btnHTML("Cerrar")}</button>
      </div>`;
    $("button", cuerpo).addEventListener("click", cerrarReserva);
  }

  /* =========================================================
     INFO Y PIE
     ========================================================= */
  function initInfo() {
    const wa = `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent("Hola Botanic! Quiero información para reservar una mesa 🍾")}`;
    $("#vip-wa").href = wa;
    $("#vip-tel").href = `tel:+${CFG.whatsapp}`;
    $("#vip-tel-label").textContent = `llámanos al ${String(CFG.telefono).replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}`;

    $("#info-address").textContent = CFG.direccion;
    $("#ft-address").textContent = CFG.direccion;
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CFG.mapsQuery || CFG.direccion)}`;
    $("#maps-link").href = mapsUrl;
    $("#map").src = `https://www.google.com/maps?q=${encodeURIComponent(CFG.mapsQuery || CFG.direccion)}&output=embed`;

    const hoy = new Date().getDay();
    const orden = [1, 2, 3, 4, 5, 6, 0];
    const abiertos = CFG.diasAbierto || [];
    $("#hours").innerHTML = orden.map((dow) => {
      const open = abiertos.includes(dow);
      const cls = [open ? "is-open" : "", dow === hoy ? "is-today" : ""].join(" ").trim();
      return `<tr class="${cls}"><td>${DIAS[dow]}</td><td>${open ? esc(CFG.horarios[dow] || "") : "Cerrado"}</td></tr>`;
    }).join("");

    $("#ft-ig").href = `https://www.instagram.com/${CFG.instagram}/`;
    $("#ft-fb").href = `https://www.facebook.com/${CFG.facebook}/`;
    $("#ft-wa").href = `https://wa.me/${CFG.whatsapp}`;
    $("#ft-year").textContent = new Date().getFullYear();

    // Botones "Apúntate a la lista": abren la próxima noche con lista abierta
    document.querySelectorAll("[data-ir-proxima]").forEach((a) => {
      a.addEventListener("click", (e) => {
        const [d] = proximasNoches(1, true);
        if (!d) return;
        e.preventDefault();
        abrirDia(d, true);
      });
    });
  }

  /* ---------------- Arranque ---------------- */
  document.addEventListener("DOMContentLoaded", () => {
    initHeader();
    initTitulo();
    initMarquee();
    initWeek();
    initCalendar();
    initGallery();
    initLightbox();
    initReservados();
    initInfo();
    initRpp();
    initReveal();
    initParallax();
    initPointerFx();
    initModoLigero();

    // Enlace directo a un día: index.html#dia=2026-10-17
    const m = location.hash.match(/^#dia=(\d{4}-\d{2}-\d{2})$/);
    if (m && isOpen(fromKey(m[1]))) abrirDia(fromKey(m[1]), true);
  });
})();
