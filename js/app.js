/* =========================================================
   BOTANIC CHIPIONA — lógica de la web
   ========================================================= */
(function () {
  "use strict";

  const CFG = window.BOTANIC_CONFIG || {};
  // Contenido editado desde el panel (/api/web.js): manda sobre data/eventos.js
  const WEB = window.BOTANIC_WEB || {};
  const EVENTOS = { ...(window.BOTANIC_EVENTOS || {}), ...(WEB.eventos || {}) };
  const NOCHES = window.BOTANIC_NOCHES || {};

  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const STORAGE_KEY = "botanic_lista";

  const { $, esc } = window.BotanicDom;   // js/compartido/dom.js
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

  /* Contenido interno de los botones .btn (texto + flecha que aparece al pasar el ratón) */
  const btnHTML = (texto, flecha = "→") =>
    `<span class="btn-label">${esc(texto)}</span><span class="btn-arrow" aria-hidden="true">${flecha}</span>`;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------------- Fechas (js/compartido/calendario.js, igual que el servidor) ---------------- */
  const { keyOf, fromKey, addDays, today, isOpen, horarioDe, listaAbierta, proximasNoches } = window.BotanicCalendario;

  const fechaLarga = (d) => `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;

  function noche(d) {
    const k = keyOf(d);
    const ev = EVENTOS[k] || {};
    return {
      key: k,
      date: d,
      titulo: ev.titulo || NOCHES[d.getDay()] || `${DIAS[d.getDay()]} Botanic`,
      dj: ev.dj || "",
      artistas: ev.artistas || "",   // solo data/eventos.js; el panel usa dj
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
      img.referrerPolicy = "no-referrer";   // Drive rechaza algunas peticiones con Referer
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
    // Foto subida desde el panel (Google Drive), con la URL alternativa por si falla la primera
    if (ev && ev.foto) candidatos.push(driveThumb(ev.foto, "w1200"), driveAlternativa(ev.foto, "w1200"));
    if (ev && ev.portada) candidatos.push(ev.portada);
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
      const img = el("img", { src: url, alt: `Portada: ${n.titulo}, ${fechaLarga(d)}`, loading: eager ? "eager" : "lazy", decoding: "async", referrerpolicy: "no-referrer" });
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
    // En pantallas táctiles el scroll va por su cuenta y este JS llega un fotograma tarde: las capas
    // irían a tirones detrás del dedo. Ahí la portada se mueve con CSS (animation-timeline) y el resto queda fijo
    if (reducedMotion || !finePointer) return;
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
        // Solo los días con evento llevan imagen en el calendario
        if (EVENTOS[k]) cell.appendChild(coverEl(d));
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
      ${n.dj ? `<p class="dp-artists">DJ invitado: ${esc(n.dj)}</p>` : ""}
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

  /* ---------------- RPP de los links ----------------
     Cada RPP tiene dos links con el mismo código y cada uno cuenta solo para lo suyo:
     ?rpp=código     → lista
     ?reserva=código → reservados (abre la web en la sección de reservados) */
  const RPP_KEY = "botanic_rpp";
  const RPP_RESERVA_KEY = "botanic_rpp_reserva";
  let rppActual = null;  // { codigo, nombre } de la lista, validado por el servidor
  let rppReserva = null; // { codigo, nombre } de los reservados

  /* Lee el RPP del parámetro del link o, si no está, el que se guardó en esta pestaña */
  async function rppDelLink(param, key) {
    const codigo = new URLSearchParams(location.search).get(param);
    if (codigo === null) {
      try { return JSON.parse(sessionStorage.getItem(key)); } catch (e) { return null; }
    }
    let rpp = null;
    if (/^[a-z0-9]{4,32}$/.test(codigo)) {
      try {
        const r = await fetch(`/api/rpp/${codigo}`);
        if (r.ok) { const j = await r.json(); rpp = { codigo: j.codigo, nombre: j.nombre }; }
      } catch (e) { /* sin servidor: queda sin RPP */ }
    }
    try {
      if (rpp) sessionStorage.setItem(key, JSON.stringify(rpp));
      else sessionStorage.removeItem(key);
    } catch (e) { /* sin almacenamiento: vale solo para esta carga */ }
    return rpp;
  }

  async function initRpp() {
    [rppActual, rppReserva] = await Promise.all([rppDelLink("rpp", RPP_KEY), rppDelLink("reserva", RPP_RESERVA_KEY)]);
    document.querySelectorAll(".rpp-field input").forEach((i) => { i.value = textoRpp(); });
    document.querySelectorAll(".res-rpp-field input").forEach((i) => { i.value = textoRpp(rppReserva); });
  }

  const textoRpp = (rpp = rppActual) => (rpp ? rpp.nombre : "Sin RPP");

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
     GALERÍA: álbumes de Google Drive
     Cada carpeta de Drive es un álbum. Las lista un Google Apps Script (data/config.js → galeria.scriptUrl);
     el servidor guarda una copia y la sirve en /api/galeria: { albumes: [{ id, nombre, creado, fotos: [{ id, nombre }] }] }.
     Se pide solo cuando la galería se acerca a la pantalla (o se abre un #album= directamente)
       #galeria         → tarjetas de los álbumes
       #album=Nombre    → fotos de ese álbum, con visor y descarga
     ========================================================= */
  const GAL = CFG.galeria || {};
  const MINI = GAL.tamMiniatura || "w800";
  const GRANDE = GAL.tamGrande || "w2000";
  const enc = encodeURIComponent;
  const driveThumb = (id, tam) => `https://drive.google.com/thumbnail?id=${enc(id)}&sz=${tam}`;
  const driveAlternativa = (id, tam) => `https://lh3.googleusercontent.com/d/${enc(id)}=${tam}`;
  const driveDescarga = (id) => `https://drive.google.com/uc?export=download&id=${enc(id)}`;
  // Sin Referer: Drive responde 429 a las imágenes pedidas desde algunos orígenes (por ejemplo localhost)
  const driveImg = (id, tam) => `src="${driveThumb(id, tam)}" data-drive-id="${esc(id)}" data-tam="${tam}" referrerpolicy="no-referrer"`;
  const ICONO_DESCARGA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`;

  // albumes: datos del script (null mientras carga) · abierto: nombre del álbum visible (null = lista)
  // fotos: las del visor · todos: "Ver galería" pulsado (se ven todos los álbumes, no solo una fila)
  const gal = { albumes: null, abierto: undefined, fotos: [], todos: false };

  function initGallery() {
    $("#gal-ig").href = `https://www.instagram.com/${CFG.instagram}/`;
    $("#gal-reintentar").addEventListener("click", cargarAlbumes);
    $("#gal-vista").addEventListener("click", (e) => {
      const b = e.target.closest(".gal-foto-abrir");
      if (b) abrirVisor(Number(b.dataset.indice));
      if (e.target.closest("#gal-mas-btn")) {
        gal.todos = !gal.todos;
        ajustarFila();
        if (!gal.todos) $("#galeria").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      }
    });
    // Al cambiar el ancho caben más o menos álbumes en la fila
    window.addEventListener("resize", ajustarFila);
    // El evento "error" de las imágenes no burbujea: se escucha en fase de captura
    document.addEventListener("error", fotoFallida, true);
    window.addEventListener("hashchange", () => {
      if (!gal.albumes && albumDelHash() !== null) cargarAlbumesUnaVez();
      pintarGaleria();
    });
    if (albumDelHash() !== null || !("IntersectionObserver" in window)) return cargarAlbumesUnaVez();
    const vigia = new IntersectionObserver((entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      vigia.disconnect();
      cargarAlbumesUnaVez();
    }, { rootMargin: "800px 0px" });
    vigia.observe($("#galeria"));
  }

  let albumesPedidos = false;
  function cargarAlbumesUnaVez() {
    if (albumesPedidos) return;
    albumesPedidos = true;
    cargarAlbumes();
  }

  /* Si la miniatura de Drive falla se prueba lh3.googleusercontent.com; si también falla, se avisa */
  function fotoFallida(e) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.driveId) return;
    if (!img.dataset.alternativa) {
      img.dataset.alternativa = "1";
      img.src = driveAlternativa(img.dataset.driveId, img.dataset.tam);
      return;
    }
    img.classList.add("rota");
    if (img.id === "lb-img") return $(".lb-figure").classList.remove("cargando");
    const caja = img.closest(".gal-foto, .gal-album-portada");
    if (caja && !$(".gal-rota", caja)) caja.insertAdjacentHTML("beforeend", `<span class="gal-rota">Foto no disponible</span>`);
  }

  async function cargarAlbumes() {
    const cargando = $("#gal-cargando");
    const error = $("#gal-error");
    error.hidden = true;
    cargando.hidden = false;

    // Si el servidor aún no tiene copia, espera al Apps Script (unos segundos); pasado tiempoMaximo, se aborta
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), (GAL.tiempoMaximo || 45) * 1000);
    try {
      const res = await fetch("api/galeria", { signal: control.signal });
      if (!res.ok) throw new Error(`el servidor respondió ${res.status}`);
      const datos = (await res.json()).albumes;
      if (!Array.isArray(datos)) throw new Error("la respuesta no tiene el formato esperado");

      // Solo álbumes con nombre y al menos una foto (una carpeta recién creada y vacía no sale), los más recientes primero
      gal.albumes = datos
        .filter((a) => a && a.nombre)
        .map((a) => ({ ...a, fotos: Array.isArray(a.fotos) ? a.fotos.filter((f) => f && f.id) : [] }))
        .filter((a) => a.fotos.length)
        .map((a) => aplicarAjustes(a, (WEB.galeria || {})[a.id] || {}))
        // Anclados primero; dentro de cada grupo, los más recientes primero
        .sort((a, b) => (b.anclado - a.anclado) || ((b.creado || 0) - (a.creado || 0)));
      cargando.hidden = true;
      pintarGaleria();
    } catch (err) {
      cargando.hidden = true;
      $("#gal-error-detalle").textContent = err.name === "AbortError"
        ? "El servidor de fotos está tardando demasiado. Inténtalo de nuevo en un momento."
        : `Revisa tu conexión e inténtalo de nuevo (${err.message}).`;
      error.hidden = false;
    } finally {
      clearTimeout(temporizador);
    }
  }

  /* Ajustes del panel para un álbum (por id de carpeta): nombre, portada, anclado y fotos ancladas */
  function aplicarAjustes(album, ajustes) {
    const porId = new Map(album.fotos.map((f) => [f.id, f]));
    // Las ancladas van primero, en el orden en que se anclaron; las que ya no existen en Drive se ignoran
    const ancladas = (ajustes.fotosAncladas || []).filter((id) => porId.has(id));
    const fotos = [...ancladas.map((id) => porId.get(id)), ...album.fotos.filter((f) => !ancladas.includes(f.id))];
    // Portada: la elegida en el panel; si no, la foto llamada "portada" (portada.jpg, Portada.PNG…); si no, la primera
    const portada = porId.get(ajustes.portada)
      || album.fotos.find((f) => /^portada\.[a-z0-9]+$/i.test((f.nombre || "").trim()))
      || fotos[0];
    return { ...album, nombre: ajustes.nombre || album.nombre, fotos, portada, anclado: !!ajustes.anclado };
  }

  function albumDelHash() {
    const m = location.hash.match(/^#album=(.*)$/);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }

  /* De entrada solo se ven los álbumes más recientes que caben en una fila; "Ver galería" muestra todos */
  function ajustarFila() {
    const grid = $("#gal-albumes");
    if (!grid) return;
    // Con auto-fill, la rejilla resuelve tantas columnas como caben, haya o no tarjetas
    const columnas = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
    const tarjetas = [...grid.children];
    tarjetas.forEach((t, i) => { t.hidden = !gal.todos && i >= columnas; });
    $("#gal-mas").hidden = tarjetas.length <= columnas;
    $("#gal-mas-btn").innerHTML = gal.todos
      ? btnHTML("Ver menos", "↑")
      : btnHTML(`Ver galería (${tarjetas.length} álbumes)`, "↓");
  }

  const nFotos = (n) => `${n} ${n === 1 ? "foto" : "fotos"}`;
  const publicado = (ms) => ms ? `publicado el ${new Date(ms).getDate()} de ${MESES[new Date(ms).getMonth()]}` : "";

  /* Pinta la lista o el álbum según el hash. Solo repinta si cambia lo que hay que ver */
  function pintarGaleria() {
    if (!gal.albumes) return;   // aún cargando: se pinta al llegar los datos
    const nombre = albumDelHash();
    if (nombre === gal.abierto) return;
    gal.abierto = nombre;
    cerrarVisor();

    const vista = $("#gal-vista");
    $("#gal-empty").hidden = true;

    if (nombre === null) {
      gal.fotos = [];
      if (!gal.albumes.length) { vista.replaceChildren(); $("#gal-empty").hidden = false; return; }
      vista.innerHTML = `<div class="gal-albumes" id="gal-albumes">${gal.albumes.map((a) => `
          <a class="gal-album" href="#album=${esc(enc(a.nombre))}">
            <div class="gal-album-portada">
              <img ${driveImg(a.portada.id, MINI)} alt="" loading="lazy" decoding="async">
            </div>
            <span class="gal-album-n">${nFotos(a.fotos.length)}</span>
            <div class="gal-album-info">
              <h3 class="gal-album-nombre">${esc(a.nombre)}</h3>
              ${a.creado ? `<p class="gal-album-meta">${esc(publicado(a.creado))}</p>` : ""}
            </div>
          </a>`).join("")}</div>
        <div class="gal-mas" id="gal-mas" hidden>
          <button class="btn btn-ghost" type="button" id="gal-mas-btn"></button>
        </div>`;
      ajustarFila();
    } else {
      const album = gal.albumes.find((a) => a.nombre === nombre);
      gal.fotos = album ? album.fotos : [];
      const cabecera = `
        <div class="gal-album-cab">
          <a class="gal-volver" href="#galeria">← Todos los álbumes</a>
          <h3 class="gal-album-titulo">${album ? esc(album.nombre) : "Álbum no encontrado"}</h3>
          <p class="gal-album-meta">${album
            ? esc([nFotos(album.fotos.length), publicado(album.creado)].filter(Boolean).join(" · "))
            : "Puede que lo hayan renombrado o borrado."}</p>
        </div>`;
      const fotos = !album ? "" : `<div class="gal-fotos">${album.fotos.map((f, i) => `
          <figure class="gal-foto">
            <button type="button" class="gal-foto-abrir" data-indice="${i}" aria-label="Ampliar foto ${i + 1}">
              <img ${driveImg(f.id, MINI)} alt="${esc(f.nombre || `Foto ${i + 1}`)}" loading="lazy" decoding="async">
            </button>
            <a class="gal-descargar" href="${driveDescarga(f.id)}" rel="noopener" aria-label="Descargar ${esc(f.nombre || `foto ${i + 1}`)}" title="Descargar">${ICONO_DESCARGA}</a>
          </figure>`).join("")}</div>`;
      vista.innerHTML = cabecera + fotos;
      // Al abrir un álbum (no hay elemento con ese id) el navegador no se mueve: se baja a la galería
      $("#galeria").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }
    vista.querySelectorAll(".gal-album, .gal-foto").forEach((n, i) => reveal(n, i % 4));
  }

  /* ---------------- Visor ---------------- */
  let lbIndex = 0;
  let lbLastFocus = null;

  function abrirVisor(i) {
    if (!gal.fotos[i]) return;
    lbLastFocus = document.activeElement;
    lbIndex = i;
    pintarVisor();
    $("#lightbox").hidden = false;
    document.body.style.overflow = "hidden";
    $("#lb-close").focus();
  }
  function cerrarVisor() {
    if ($("#lightbox").hidden) return;
    $("#lightbox").hidden = true;
    $("#lb-img").removeAttribute("src");
    document.body.style.overflow = "";
    if (lbLastFocus && document.contains(lbLastFocus)) lbLastFocus.focus();
  }
  function pintarVisor() {
    const f = gal.fotos[lbIndex];
    if (!f) return;
    const img = $("#lb-img");
    $(".lb-figure").classList.add("cargando");
    img.classList.remove("rota");
    delete img.dataset.alternativa;   // cada foto vuelve a empezar por la miniatura de Drive
    img.dataset.driveId = f.id;
    img.dataset.tam = GRANDE;
    img.alt = f.nombre || `Foto ${lbIndex + 1}`;
    img.src = driveThumb(f.id, GRANDE);
    $("#lb-caption").textContent = `${gal.abierto} · ${lbIndex + 1}/${gal.fotos.length}`;
    $("#lb-download").href = driveDescarga(f.id);

    // Precarga las vecinas para que pasar de foto sea instantáneo
    [-1, 1].forEach((d) => {
      const v = gal.fotos[(lbIndex + d + gal.fotos.length) % gal.fotos.length];
      if (!v || v === f) return;
      const pre = new Image();
      pre.referrerPolicy = "no-referrer";
      pre.src = driveThumb(v.id, GRANDE);
    });
  }
  function moverVisor(delta) {
    lbIndex = (lbIndex + delta + gal.fotos.length) % gal.fotos.length;
    pintarVisor();
  }

  function initLightbox() {
    const lb = $("#lightbox");
    $("#lb-img").addEventListener("load", () => $(".lb-figure").classList.remove("cargando"));
    $("#lb-close").addEventListener("click", cerrarVisor);
    $("#lb-prev").addEventListener("click", () => moverVisor(-1));
    $("#lb-next").addEventListener("click", () => moverVisor(1));
    lb.addEventListener("click", (e) => { if (e.target === lb) cerrarVisor(); });
    document.addEventListener("keydown", (e) => {
      if (lb.hidden) return;
      if (e.key === "Escape") cerrarVisor();
      if (e.key === "ArrowLeft") moverVisor(-1);
      if (e.key === "ArrowRight") moverVisor(1);
      // El Tab no se escapa del visor
      if (e.key === "Tab") {
        const enfocables = [...lb.querySelectorAll("a[href], button")];
        const primero = enfocables[0];
        const ultimo = enfocables[enfocables.length - 1];
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
      }
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
  const RES = window.BOTANIC_RESERVADOS || { tipos: {}, precios: {}, botellas: [], chupitos: [], champan: [], refrescos: [] };
  const Reservas = window.BotanicReservas; // precios y buscador (js/compartido/reservas.js)
  const MAX_UNIDADES = Reservas.MAX_POR_LINEA;
  let resTipo = null;      // tipo mostrado en el panel
  let resLastFocus = null;

  /* ---------------- Mesas completas (las dice el servidor) ----------------
     Un tipo está completo una noche cuando todas sus mesas están confirmadas.
     Sin respuesta del servidor se deja reservar: el servidor vuelve a comprobarlo al enviar. */
  let resDispo = { sinMesas: [], completas: {} };
  const resCompleto = (fecha, tipo) =>
    resDispo.sinMesas.includes(tipo) || (resDispo.completas[fecha] || []).includes(tipo);
  const resNoches = () => proximasNoches(8, true);
  const resTipoLleno = (tipo) => resNoches().every((d) => resCompleto(keyOf(d), tipo));

  async function cargarDisponibilidad() {
    try {
      const r = await fetch("/api/reservas/disponibilidad", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && j.ok) {
        const lista = (x) => (Array.isArray(x) ? x.filter((t) => typeof t === "string") : []);
        const completas = {};
        for (const [fecha, tipos] of Object.entries(j.completas || {})) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) completas[fecha] = lista(tipos);
        }
        resDispo = { sinMesas: lista(j.sinMesas), completas };
      }
    } catch (e) { /* sin servidor: se deja reservar */ }
    aplicarDisponibilidad();
  }

  /* Si un tipo está completo todas las próximas noches, su botón cambia y no deja abrir el formulario */
  function aplicarDisponibilidad() {
    Object.keys(RES.tipos).forEach((tipo) => {
      const lleno = resTipoLleno(tipo);
      const card = $(`.res-card-${tipo}`);
      const opcion = $(`.res-opcion[data-tipo="${tipo}"] .res-opcion-sub`);
      if (card) {
        const btn = $(".res-reservar", card);
        btn.disabled = lleno;
        $(".btn-label", btn).textContent = lleno ? "Completo" : `Reservar ${(RES.tipos[tipo].nombre || "").toLowerCase()}`;
        $(".res-completo", card).hidden = !lleno;
      }
      if (opcion) {
        opcion.dataset.original ??= opcion.textContent;
        opcion.textContent = lleno ? "Completo las próximas noches" : opcion.dataset.original;
        opcion.closest(".res-opcion").classList.toggle("completa", lleno);
      }
    });
  }

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

    cargarDisponibilidad();
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
    const completo = el("p", { class: "res-completo", role: "status", hidden: true },
      `Todas las mesas de este tipo están reservadas para las próximas noches. <a href="https://wa.me/${esc(CFG.whatsapp)}" target="_blank" rel="noopener">Escríbenos por WhatsApp</a> por si se libera alguna.`);
    cuerpo.appendChild(completo);
    const acciones = el("div", { class: "form-actions" });
    const reservar = el("button", { class: "btn btn-neon res-reservar", type: "button" }, btnHTML(`Reservar ${t.nombre.toLowerCase()}`));
    reservar.addEventListener("click", () => { if (!resTipoLleno(tipo)) abrirReserva(tipo); });
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

  /* Bloques del formulario: un buscador por tipo de bebida */
  const GRUPOS_RES = {
    botellas: { titulo: "Botellas", placeholder: "Busca ron, ginebra, whisky, vodka…", paso: 1 },
    chupitos: { titulo: "Botellas de chupito", placeholder: "Busca tequila de fresa, mango…", paso: 3 },
    champan: { titulo: "Champán", placeholder: "Busca Moët…", paso: 3 },
    refrescos: { titulo: "Refrescos", placeholder: "Busca Coca-Cola, tónica, Sprite…", paso: 2 }
  };
  const PASOS_RES = ["Noche", "Botellas", "Refrescos", "Extras", "Tus datos"];
  const ULTIMO_PASO = PASOS_RES.length - 1;
  const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const euros = (n) => `${n} €`;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const ICONO_LUPA = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>`;

  const buscadorHTML = (grupo) => {
    const g = GRUPOS_RES[grupo];
    const atajos = [...new Set((RES[grupo] || []).map((i) => i.categoria).filter(Boolean))];
    return `
      <div class="res-grupo" data-grupo="${grupo}">
        ${atajos.length ? `
        <div class="res-atajos" role="group" aria-label="Ver por tipo">
          ${atajos.map((a) => `<button type="button" class="res-atajo" data-atajo="${esc(a)}" aria-pressed="false">${esc(a)}</button>`).join("")}
        </div>` : ""}
        <div class="res-buscar">
          ${ICONO_LUPA}
          <input type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="res-sug-${grupo}"
            aria-label="Buscar ${esc(g.titulo.toLowerCase())}" placeholder="${esc(g.placeholder)}"
            autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">
          <ul class="res-sugerencias" id="res-sug-${grupo}" role="listbox" aria-label="Sugerencias" hidden></ul>
        </div>
        <p class="res-grupo-aviso" role="status" hidden></p>
        <ul class="res-elegidos" aria-label="${esc(g.titulo)} elegidos"></ul>
      </div>`;
  };

  const extraHTML = (grupo, nota) => `
    <details class="res-extra">
      <summary>
        <span class="res-extra-txt">
          <span class="res-extra-titulo">${esc(GRUPOS_RES[grupo].titulo)}</span>
          <span class="res-extra-nota">${nota}</span>
        </span>
        <span class="res-extra-n" data-grupo="${grupo}" hidden></span>
        <span class="res-extra-mas" aria-hidden="true"></span>
      </summary>
      ${buscadorHTML(grupo)}
    </details>`;

  function renderReservaForm(tipo) {
    const cuerpo = $("#res-modal-cuerpo");
    const caja = $("#res-modal-caja");
    const noches = proximasNoches(8, true);
    const t = RES.tipos[tipo] || {};
    const P = RES.precios || {};
    const porBotella = P.refrescosPorBotella || 0;
    const powerKing = (RES.refrescos || []).find((r) => r.suplemento);

    const tarjetasNoche = noches.map((d) => {
      const k = keyOf(d);
      const ev = (EVENTOS[k] || {}).titulo;
      const lleno = resCompleto(k, tipo);
      return `
        <label class="res-noche${lleno ? " completa" : ""}">
          <input type="radio" name="noche" value="${k}"${lleno ? " disabled" : ""}>
          <span class="res-noche-dia">${DIAS_CORTOS[d.getDay()]}</span>
          <span class="res-noche-num">${d.getDate()}</span>
          <span class="res-noche-mes">${MESES[d.getMonth()].slice(0, 3)}</span>
          <span class="res-noche-precio">${lleno ? "Completo" : `desde ${euros(Reservas.precioDe(RES, "botellas", {}, d.getDay()))}`}</span>
          ${ev ? `<span class="res-noche-evento">${esc(ev)}</span>` : ""}
        </label>`;
    }).join("");

    cuerpo.innerHTML = `
      <p class="eyebrow">Reservados · ${esc(t.nombre)}</p>
      <h3 class="res-modal-titulo" id="res-modal-titulo">Solicita tu <span>reserva</span></h3>
      <ol class="res-pasos" aria-label="Pasos de la reserva">
        ${PASOS_RES.map((p, i) => `
          <li><button type="button" class="res-paso-btn" data-ir="${i}">
            <span class="res-paso-n" aria-hidden="true">${i + 1}</span><span class="res-paso-txt">${p}</span>
          </button></li>`).join("")}
      </ol>

      <form novalidate>
        <input type="hidden" name="tipo" value="${esc(tipo)}">

        <section class="res-paso" aria-labelledby="res-p0">
          <h4 class="res-paso-titulo" id="res-p0" tabindex="-1">¿Qué noche venís?</h4>
          <p class="res-paso-sub">El precio de las botellas cambia según el día.</p>
          ${noches.length
            ? `<div class="res-noches" role="radiogroup" aria-labelledby="res-p0">${tarjetasNoche}</div>`
            : `<p class="res-paso-sub">Ahora mismo no hay noches disponibles para reservar.</p>`}
        </section>

        <section class="res-paso" aria-labelledby="res-p1" hidden>
          <h4 class="res-paso-titulo" id="res-p1" tabindex="-1">Elige tus botellas</h4>
          <p class="res-paso-sub">Cada botella incluye <strong>${porBotella} refrescos</strong>${t.minBotellas ? ` · mínimo ${plural(t.minBotellas, "botella", "botellas")} en esta mesa` : ""}.</p>
          ${buscadorHTML("botellas")}
        </section>

        <section class="res-paso" aria-labelledby="res-p2" hidden>
          <h4 class="res-paso-titulo" id="res-p2" tabindex="-1">Tus refrescos incluidos</h4>
          <p class="res-paso-sub">Elige todos los refrescos que van con tus botellas.${powerKing ? ` ${esc(powerKing.nombre)}: +${euros(powerKing.suplemento)} a la reserva, sea 1 lata o 10.` : ""}</p>
          <div class="res-medidor">
            <div class="res-huecos" aria-hidden="true"></div>
            <p class="res-medidor-txt" aria-live="polite"></p>
          </div>
          ${buscadorHTML("refrescos")}
        </section>

        <section class="res-paso" aria-labelledby="res-p3" hidden>
          <h4 class="res-paso-titulo" id="res-p3" tabindex="-1">¿Algo más para la mesa?</h4>
          <p class="res-paso-sub">Opcional: si no quieres nada más, pasa al siguiente paso.</p>
          ${extraHTML("chupitos", `${euros(P.chupito)} la botella, cualquier noche`)}
          ${extraHTML("champan", "Moët · precio a consultar")}
        </section>

        <section class="res-paso" aria-labelledby="res-p4" hidden>
          <h4 class="res-paso-titulo" id="res-p4" tabindex="-1">Tus datos</h4>
          <p class="res-paso-sub">Te confirmaremos la reserva por WhatsApp o llamada.</p>
          <div class="form-grid res-form-grid">
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
              <input id="res-personas" name="personas" type="number" inputmode="numeric" min="1" max="30" value="4" required aria-describedby="res-personas-nota">
              <p class="res-campo-nota" id="res-personas-nota"></p>
            </div>
            <div class="field res-rpp-field">
              <label for="res-rpp">RPP</label>
              <div class="rpp-locked">
                <input id="res-rpp" value="${esc(textoRpp(rppReserva))}" readonly tabindex="-1" aria-readonly="true">
                ${ICONO_CANDADO}
              </div>
            </div>
            <div class="field res-campo-ancho">
              <label for="res-notas">Comentarios (opcional)</label>
              <textarea id="res-notas" name="notas" rows="2" maxlength="500" placeholder="Cumpleaños, hora de llegada, alguna petición…"></textarea>
            </div>
            <div class="hp" aria-hidden="true">
              <label>No rellenar <input name="web" tabindex="-1" autocomplete="off"></label>
            </div>
          </div>
          <section class="res-carrito" aria-labelledby="res-carrito-titulo">
            <h5 class="res-carrito-titulo" id="res-carrito-titulo">Tu reserva</h5>
            <div class="res-carrito-cuerpo"></div>
            <p class="res-pago">El reservado se paga en la puerta de la discoteca.</p>
          </section>
          <p class="list-legal">Al enviar la solicitud, usaremos tu nombre y teléfono para gestionarla y contactarte. No será firme hasta que la confirmemos. Solo para mayores de 18 años.</p>
        </section>

        <p class="form-error" role="alert" hidden></p>

        <div class="res-barra">
          <div class="res-barra-info">
            <span class="res-barra-resumen"></span>
            <strong class="res-barra-total"></strong>
          </div>
          <div class="res-barra-acciones">
            <button type="button" class="btn btn-ghost btn-sm res-atras" aria-label="Atrás">${btnHTML("Atrás", "←")}</button>
            <button type="submit" class="btn btn-neon btn-sm res-siguiente"></button>
          </div>
        </div>
      </form>`;

    const form = $("form", cuerpo);
    const err = $(".form-error", cuerpo);
    const secciones = Array.from(form.querySelectorAll(".res-paso"));
    const botonesPaso = Array.from(cuerpo.querySelectorAll(".res-paso-btn"));
    const atras = $(".res-atras", form);
    const siguiente = $(".res-siguiente", form);
    const totalBarra = $(".res-barra-total", form);

    const mostrarError = (msg, campo) => {
      err.textContent = msg;
      err.hidden = !msg;
      form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
      if (campo) { campo.setAttribute("aria-invalid", "true"); campo.focus(); }
    };

    /* ---------- Estado ---------- */
    const carrito = new Map(); // "grupo|nombre" -> cantidad
    let paso = 0;
    let visitado = 0;
    let ultimo = null;          // última bebida añadida (para animarla)
    let refrescosAntes = 0;     // para rellenar solo los huecos nuevos del medidor
    let totalAntes = null;

    const clave = (grupo, nombre) => `${grupo}|${nombre}`;
    const cantidadDe = (grupo, nombre) => carrito.get(clave(grupo, nombre)) || 0;
    const listaCarrito = () => Array.from(carrito, ([k, cantidad]) => {
      const [grupo, nombre] = k.split("|");
      return { grupo, nombre, cantidad };
    });
    const nocheElegida = () => (form.querySelector('input[name="noche"]:checked') || {}).value || "";
    const diaElegido = () => (nocheElegida() ? fromKey(nocheElegida()).getDay() : null);
    const calculo = () => Reservas.calcular(RES, listaCarrito(), diaElegido(), tipo);
    const buscadorDe = (grupo) => $(`.res-grupo[data-grupo="${grupo}"] [role="combobox"]`, form);

    /* Qué le falta a un paso para poder seguir ("" si está completo) y dónde mandar el foco */
    function faltaEnPaso(i, r) {
      if (i === 0 && !nocheElegida()) {
        return { msg: "Elige la noche que venís.", campo: form.querySelector('input[name="noche"]:not(:disabled)') };
      }
      if (i === 1 && r.botellas < r.minBotellas) {
        const faltan = r.minBotellas - r.botellas;
        return { msg: `${t.nombre} lleva mínimo ${plural(r.minBotellas, "botella", "botellas")}: elige ${faltan === 1 ? "1 más" : `${faltan} más`}.`, campo: buscadorDe("botellas") };
      }
      if (i === 2 && r.refrescos !== r.refrescosMax) {
        const d = r.refrescosMax - r.refrescos;
        return {
          msg: d > 0
            ? `Te ${d === 1 ? "falta 1 refresco" : `faltan ${d} refrescos`} por elegir: con tus botellas van ${r.refrescosMax}.`
            : `Te ${-d === 1 ? "sobra 1 refresco" : `sobran ${-d} refrescos`}: con tus botellas van ${r.refrescosMax}.`,
          campo: buscadorDe("refrescos")
        };
      }
      return null;
    }
    const primerIncompleto = (r) => {
      for (let i = 0; i < ULTIMO_PASO; i++) if (faltaEnPaso(i, r)) return i;
      return ULTIMO_PASO;
    };

    const avisar = (grupo, msg) => {
      const aviso = $(`.res-grupo[data-grupo="${grupo}"] .res-grupo-aviso`, form);
      aviso.textContent = msg;
      aviso.hidden = !msg;
    };

    /* Cambia la cantidad de una bebida. Devuelve false si no se puede (límites) */
    function cambiar(grupo, nombre, delta) {
      const n = cantidadDe(grupo, nombre) + delta;
      // Los refrescos solo tienen el límite total; el resto, MAX_UNIDADES de cada
      if (delta > 0 && grupo !== "refrescos" && n > MAX_UNIDADES) {
        avisar(grupo, `Máximo ${MAX_UNIDADES} de cada. Si necesitas más, escríbelo en comentarios.`);
        return false;
      }
      if (delta > 0 && grupo === "refrescos") {
        const r = calculo();
        if (r.refrescos + delta > r.refrescosMax) {
          avisar(grupo, `Ya tienes los ${r.refrescosMax} refrescos incluidos. Quita alguno o añade otra botella.`);
          return false;
        }
      }
      avisar(grupo, "");
      if (n <= 0) carrito.delete(clave(grupo, nombre));
      else carrito.set(clave(grupo, nombre), n);
      ultimo = delta > 0 ? clave(grupo, nombre) : null;
      mostrarError("");
      repintar();
      return true;
    }

    /* Cantidad escrita a mano: se ajusta al máximo posible y avisa si se pasa */
    function fijar(grupo, nombre, n) {
      const r = calculo();
      const tope = grupo === "refrescos" ? r.refrescosMax - r.refrescos + cantidadDe(grupo, nombre) : MAX_UNIDADES;
      if (n > tope) {
        n = Math.max(0, tope);
        avisar(grupo, grupo === "refrescos"
          ? `Con tus botellas van ${r.refrescosMax} refrescos: de ${nombre} puedes poner hasta ${n}.`
          : `Máximo ${MAX_UNIDADES} de cada. Si necesitas más, escríbelo en comentarios.`);
      } else avisar(grupo, "");
      if (n <= 0) carrito.delete(clave(grupo, nombre));
      else carrito.set(clave(grupo, nombre), n);
      ultimo = null;
      mostrarError("");
      repintar();
    }

    const precioTexto = (grupo, item) => {
      const p = Reservas.precioDe(RES, grupo, item, diaElegido());
      if (p === null) return "A consultar";
      if (grupo === "refrescos") return item.suplemento ? `Incluido · +${euros(item.suplemento)}` : "Incluido";
      return euros(p);
    };
    const etiquetaPremium = (item) => (item.premium ? ` <span class="tag-premium">Premium</span>` : "");

    /* ---------- Pintado ---------- */
    function pintarElegidos(grupo, r) {
      const lista = $(`.res-grupo[data-grupo="${grupo}"] .res-elegidos`, form);
      const lleno = grupo === "refrescos" && r.refrescos >= r.refrescosMax;
      lista.innerHTML = r.lineas.filter((l) => l.grupo === grupo).map((l) => {
        const item = (RES[grupo] || []).find((i) => i.nombre === l.nombre) || {};
        const precio = grupo === "refrescos" ? precioTexto(grupo, item) : l.subtotal === null ? "A consultar" : euros(l.subtotal);
        const detalle = l.precio && l.cantidad > 1 ? `<span class="res-linea-ud">${l.cantidad} × ${euros(l.precio)}</span>` : "";
        const tope = grupo === "refrescos" ? lleno : l.cantidad >= MAX_UNIDADES;
        return `
          <li class="res-elegido${ultimo === clave(grupo, l.nombre) ? " nuevo" : ""}" data-grupo="${grupo}" data-nombre="${esc(l.nombre)}">
            <span class="res-elegido-check" aria-hidden="true">✓</span>
            <span class="res-elegido-nombre">${esc(l.nombre)}${etiquetaPremium(l)}</span>
            <span class="qty has">
              <button type="button" class="qty-btn" data-paso="-1" aria-label="Quitar un ${esc(l.nombre)}">−</button>
              <input class="qty-n" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" value="${l.cantidad}" aria-label="Cantidad de ${esc(l.nombre)}" autocomplete="off">
              <button type="button" class="qty-btn" data-paso="1" aria-label="Añadir otro ${esc(l.nombre)}"${tope ? " disabled" : ""}>+</button>
            </span>
            <span class="res-linea-precio">${detalle}<strong>${precio}</strong></span>
          </li>`;
      }).join("");
      const badge = form.querySelector(`.res-extra-n[data-grupo="${grupo}"]`);
      if (badge) {
        const n = r.lineas.filter((l) => l.grupo === grupo).reduce((s, l) => s + l.cantidad, 0);
        badge.textContent = n ? `${n} ${n === 1 ? "elegida" : "elegidas"}` : "";
        badge.hidden = !n;
      }
    }

    function pintarMedidor(r) {
      const huecos = $(".res-huecos", form);
      const total = Math.max(r.refrescosMax, r.refrescos);
      // Cada hueco lleno lleva el dibujo de su refresco, en el orden del carrito
      const elegidos = [];
      r.lineas.filter((l) => l.grupo === "refrescos").forEach((l) => {
        const item = (RES.refrescos || []).find((x) => x.nombre === l.nombre) || {};
        for (let k = 0; k < l.cantidad; k++) elegidos.push(item);
      });
      // Un grupo de huecos por botella (en móvil, cada botella en su fila)
      let html = "";
      for (let i = 0; i < total; i++) {
        const cls = ["res-hueco"];
        const item = elegidos[i];
        let estilo = `--i:${Math.max(0, i - refrescosAntes)}`;
        let titulo = "";
        if (i < r.refrescos) cls.push("lleno");
        if (i >= refrescosAntes && i < r.refrescos) cls.push("nuevo");
        if (i >= r.refrescosMax) cls.push("sobra");
        if (item) {
          if (item.envase) cls.push(`envase-${item.envase}`);
          const a = item.aspecto || {};
          if (a.liquido) cls.push("pintado");
          if (a.liquido) estilo += `;--color:${a.liquido}`;
          if (a.chapa) estilo += `;--chapa-color:${a.chapa}`;
          if (a.etiqueta) estilo += `;--etiqueta:${a.etiqueta}`;
          titulo = ` title="${esc(item.nombre || "")}"`;
        }
        if (porBotella && i % porBotella === 0) html += (i ? "</span>" : "") + `<span class="res-huecos-botella">`;
        html += `<span class="${cls.join(" ")}" style="${estilo}"${titulo}></span>`;
      }
      huecos.innerHTML = html + (total && porBotella ? "</span>" : "");
      refrescosAntes = r.refrescos;

      const d = r.refrescosMax - r.refrescos;
      const txt = $(".res-medidor-txt", form);
      txt.className = "res-medidor-txt" + (d === 0 && r.refrescosMax ? " ok" : d < 0 ? " mal" : "");
      txt.innerHTML = !r.refrescosMax
        ? "Elige primero tus botellas."
        : `<strong>${r.refrescos} / ${r.refrescosMax}</strong> ${d > 0 ? `· te ${d === 1 ? "falta 1" : `faltan ${d}`}` : d < 0 ? `· te ${-d === 1 ? "sobra 1" : `sobran ${-d}`}: quita alguno` : "· ¡completos!"}`;
    }

    function pintarBarra(r) {
      const partes = [];
      if (r.botellas) partes.push(plural(r.botellas, "botella", "botellas"));
      if (r.refrescosMax) partes.push(`${r.refrescos}/${r.refrescosMax} refrescos`);
      const extras = r.lineas.filter((l) => l.grupo === "chupitos" || l.grupo === "champan").reduce((s, l) => s + l.cantidad, 0);
      if (extras) partes.push(`${plural(extras, "extra", "extras")}`);
      $(".res-barra-resumen", form).textContent = partes.length ? partes.join(" · ") : nocheElegida() ? fechaLarga(fromKey(nocheElegida())) : "Tu reserva";
      const total = euros(r.total) + (r.aConsultar ? "*" : "");
      if (totalBarra.textContent !== total) {
        totalBarra.textContent = total;
        if (totalAntes !== null) {
          totalBarra.classList.remove("pop");
          void totalBarra.offsetWidth; // reinicia la animación
          totalBarra.classList.add("pop");
        }
        totalAntes = total;
      }
    }

    function pintarPasos(r) {
      const tope = primerIncompleto(r);
      botonesPaso.forEach((b, i) => {
        const hecho = i !== paso && i <= visitado && !faltaEnPaso(i, r) && i < ULTIMO_PASO;
        b.classList.toggle("hecho", hecho);
        b.classList.toggle("actual", i === paso);
        b.disabled = i > tope || i > visitado + 1;
        if (i === paso) b.setAttribute("aria-current", "step");
        else b.removeAttribute("aria-current");
      });
      $(".res-pasos", cuerpo).style.setProperty("--progreso", paso / ULTIMO_PASO);
    }

    function pintarResumen(r) {
      const destino = $(".res-carrito-cuerpo", form);
      const noche = nocheElegida();
      const cab = `<p class="res-carrito-cab">${esc(t.nombre)}${noche ? ` · ${esc(fechaLarga(fromKey(noche)))}` : ""}</p>`;
      const grupos = Object.keys(GRUPOS_RES).map((grupo) => {
        const lineas = r.lineas.filter((l) => l.grupo === grupo);
        if (!lineas.length) return "";
        return `
          <li class="res-carrito-grupo">
            <span>${esc(GRUPOS_RES[grupo].titulo)}</span>
            <button type="button" class="res-editar" data-ir="${GRUPOS_RES[grupo].paso}">Cambiar</button>
          </li>
          ${lineas.map((l) => `
            <li class="res-linea">
              <span class="res-linea-nombre"><span class="res-linea-cant">${l.cantidad}×</span> ${esc(l.nombre)}${etiquetaPremium(l)}</span>
              <span class="res-linea-precio"><strong>${grupo === "refrescos" ? "Incluido" : l.subtotal === null ? "A consultar" : euros(l.subtotal)}</strong></span>
            </li>`).join("")}`;
      }).join("");
      const extras = r.suplementos.map((s) => `
        <li class="res-linea res-linea-extra">
          <span class="res-linea-nombre">Suplemento ${esc(s.nombre)}</span>
          <span class="res-linea-precio"><strong>+${euros(s.importe)}</strong></span>
        </li>`).join("");
      destino.innerHTML = `
        ${cab}
        <ul class="res-carrito-lista">${grupos}${extras}</ul>
        <div class="res-total">
          <span>Total${r.aConsultar ? " <small>* + champán a consultar</small>" : ""}</span>
          <strong>${euros(r.total)}</strong>
        </div>`;
    }

    /* Hasta 5 personas por botella: el campo no deja subir de ahí y lo explica */
    function pintarPersonas(r) {
      const campo = form.elements.personas;
      const max = Math.min(30, r.personasMax || 30);
      campo.max = String(max);
      $("#res-personas-nota", form).textContent = r.personasMax
        ? `Hasta ${max} con ${plural(r.botellas, "botella", "botellas")}.`
        : "";
    }

    function repintar() {
      const r = calculo();
      Object.keys(GRUPOS_RES).forEach((g) => pintarElegidos(g, r));
      pintarMedidor(r);
      pintarBarra(r);
      pintarPasos(r);
      if (paso === ULTIMO_PASO) { pintarResumen(r); pintarPersonas(r); }
      ultimo = null;
    }

    /* ---------- Navegación entre pasos ---------- */
    function irA(i, foco = true) {
      const dir = i >= paso ? 1 : -1;
      paso = i;
      visitado = Math.max(visitado, i);
      secciones.forEach((s, j) => { s.hidden = j !== i; });
      const s = secciones[i];
      s.style.setProperty("--dir", dir);
      s.classList.remove("entra");
      void s.offsetWidth;
      s.classList.add("entra");
      atras.hidden = i === 0;
      siguiente.innerHTML = i === ULTIMO_PASO ? btnHTML("Enviar reserva") : btnHTML("Siguiente");
      mostrarError("");
      repintar();
      caja.scrollTop = 0;
      if (foco) $(".res-paso-titulo", s).focus({ preventScroll: true });
    }

    function avanzar() {
      const falta = faltaEnPaso(paso, calculo());
      if (falta) return mostrarError(falta.msg, falta.campo);
      irA(paso + 1);
    }

    atras.addEventListener("click", () => irA(paso - 1));
    cuerpo.addEventListener("click", (e) => {
      const b = e.target.closest("[data-ir]");
      if (b && !b.disabled) irA(Number(b.dataset.ir));
    });
    form.addEventListener("change", (e) => {
      if (e.target.name === "noche") { mostrarError(""); repintar(); }
    });
    form.addEventListener("input", (e) => e.target.removeAttribute("aria-invalid"));

    // − / + de lo elegido
    form.addEventListener("click", (e) => {
      const b = e.target.closest(".res-elegido .qty-btn");
      if (!b) return;
      const { grupo, nombre } = b.closest(".res-elegido").dataset;
      cambiar(grupo, nombre, Number(b.dataset.paso));
      // La lista se repinta: devuelve el foco al mismo botón (o al buscador si la línea desapareció)
      const mismo = form.querySelector(`.res-elegido[data-grupo="${grupo}"][data-nombre="${CSS.escape(nombre)}"] .qty-btn[data-paso="${b.dataset.paso}"]`);
      (mismo && !mismo.disabled ? mismo : buscadorDe(grupo)).focus({ preventScroll: true });
    });

    // Cantidad escrita a mano. Se aplica mientras se escribe (vacío o 0 esperan a salir del campo)
    const campoCantidad = (grupo, nombre) =>
      form.querySelector(`.res-elegido[data-grupo="${grupo}"][data-nombre="${CSS.escape(nombre)}"] .qty-n`);
    form.addEventListener("input", (e) => {
      const campo = e.target.closest(".res-elegido .qty-n");
      if (!campo) return;
      const { grupo, nombre } = campo.closest(".res-elegido").dataset;
      const limpio = campo.value.replace(/\D/g, "");
      const pos = Math.min(campo.selectionStart ?? limpio.length, limpio.length);
      if (!limpio || Number(limpio) === 0) { campo.value = limpio; return; }
      fijar(grupo, nombre, Number(limpio));
      // La lista se repinta: vuelve al mismo campo con el cursor donde estaba
      const nuevo = campoCantidad(grupo, nombre);
      if (nuevo) {
        nuevo.focus({ preventScroll: true });
        const p = Math.min(pos, nuevo.value.length);
        nuevo.setSelectionRange(p, p);
      }
    });
    form.addEventListener("change", (e) => {
      const campo = e.target.closest(".res-elegido .qty-n");
      if (!campo) return;
      const { grupo, nombre } = campo.closest(".res-elegido").dataset;
      if (campo.value === "") return repintar(); // vacío: vuelve a la cantidad que había
      if (Number(campo.value) === 0) fijar(grupo, nombre, 0);
    });
    form.addEventListener("keydown", (e) => {
      const campo = e.target.closest(".res-elegido .qty-n");
      if (!campo) return;
      const { grupo, nombre } = campo.closest(".res-elegido").dataset;
      if (e.key === "Enter") {
        e.preventDefault(); // no pasa de paso: solo confirma la cantidad
        campo.blur();
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        cambiar(grupo, nombre, e.key === "ArrowUp" ? 1 : -1);
        (campoCantidad(grupo, nombre) || buscadorDe(grupo)).focus({ preventScroll: true });
      }
    });

    /* ---------- Buscadores con sugerencias ---------- */
    form.querySelectorAll(".res-grupo[data-grupo]").forEach((bloque) => {
      const grupo = bloque.dataset.grupo;
      const input = $("[role=\"combobox\"]", bloque);
      const lista = $(".res-sugerencias", bloque);
      const atajos = Array.from(bloque.querySelectorAll(".res-atajo"));
      let resultados = [];
      let activo = -1;

      const marcarActivo = (i) => {
        activo = i;
        Array.from(lista.children).forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
        if (i >= 0 && lista.children[i]) {
          input.setAttribute("aria-activedescendant", lista.children[i].id);
          lista.children[i].scrollIntoView({ block: "nearest" });
        } else input.removeAttribute("aria-activedescendant");
      };

      const marcarAtajo = () => {
        const q = Reservas.normalizar(input.value);
        atajos.forEach((a) => a.setAttribute("aria-pressed", String(Reservas.normalizar(a.dataset.atajo) === q)));
      };

      const cerrar = () => {
        lista.hidden = true;
        input.setAttribute("aria-expanded", "false");
        marcarActivo(-1);
      };

      // Al abrir, sube el bloque (atajos + buscador) a lo alto de la caja: las sugerencias quedan a la vista debajo
      const subirBuscador = () => {
        const dy = bloque.getBoundingClientRect().top - caja.getBoundingClientRect().top - 16;
        if (Math.abs(dy) > 4) caja.scrollTo({ top: caja.scrollTop + dy, behavior: reducedMotion ? "auto" : "smooth" });
      };

      const abrir = () => {
        const estabaCerrada = lista.hidden;
        marcarAtajo();
        resultados = Reservas.buscar(RES[grupo] || [], input.value);
        lista.innerHTML = resultados.length
          ? resultados.map(({ item, alias }, i) => {
            const n = cantidadDe(grupo, item.nombre);
            return `
            <li role="option" id="res-sug-${grupo}-${i}" class="res-sug" aria-selected="false">
              <span class="res-sug-nombre">${esc(item.nombre)}${etiquetaPremium(item)}${n ? ` <span class="res-sug-n">×${n}</span>` : ""}</span>
              ${alias ? `<span class="res-sug-alias">“${esc(alias)}” → en Botanic tenemos ${esc(item.nombre)}</span>` : ""}
              <span class="res-sug-precio">${precioTexto(grupo, item)}</span>
            </li>`;
          }).join("")
          : `<li class="res-sug-nada" role="presentation">No tenemos “${esc(input.value.trim())}”. Prueba con otra bebida o pídela en comentarios.</li>`;
        lista.hidden = false;
        input.setAttribute("aria-expanded", "true");
        marcarActivo(resultados.length && input.value.trim() ? 0 : -1);
        if (estabaCerrada) subirBuscador();
      };

      const elegir = (i) => {
        const r = resultados[i];
        if (!r) return;
        if (cambiar(grupo, r.item.nombre, 1)) input.value = "";
        marcarAtajo();
        cerrar();
        input.focus();
      };

      // Se abre al escribir, al tocar el campo o con ↓; no al recibir el foco (taparía los atajos)
      input.addEventListener("input", abrir);
      input.addEventListener("click", () => { if (lista.hidden) abrir(); });
      input.addEventListener("blur", cerrar);
      input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (lista.hidden) return abrir();
          if (!resultados.length) return;
          const salto = e.key === "ArrowDown" ? 1 : -1;
          marcarActivo((activo + salto + resultados.length) % resultados.length);
        } else if (e.key === "Enter") {
          e.preventDefault(); // no pasa de paso
          if (!lista.hidden && resultados.length) elegir(activo >= 0 ? activo : 0);
        } else if (e.key === "Escape" && !lista.hidden) {
          e.stopPropagation(); // cierra las sugerencias, no el formulario
          cerrar();
        }
      });
      // pointerdown sin perder el foco del campo: así el blur no cierra la lista antes del clic
      lista.addEventListener("pointerdown", (e) => e.preventDefault());
      lista.addEventListener("click", (e) => {
        const li = e.target.closest(".res-sug");
        if (li) elegir(Array.from(lista.children).indexOf(li));
      });
      // Atajos: Ron, Ginebra… (otra pulsación sobre el mismo lo quita)
      atajos.forEach((a) => a.addEventListener("click", () => {
        input.value = a.getAttribute("aria-pressed") === "true" ? "" : a.dataset.atajo;
        input.focus();
        abrir();
      }));
    });

    /* ---------- Siguiente / enviar ---------- */
    // Código de seguridad del formulario (el mismo mecanismo que la lista)
    let token = pedirToken().catch(() => null);
    let enviando = false;

    /* La noche se ha llenado mientras elegía: se bloquea su tarjeta */
    function marcarNocheCompleta(fecha) {
      const input = form.querySelector(`input[name="noche"][value="${fecha}"]`);
      if (!input) return;
      input.checked = false;
      input.disabled = true;
      const tarjeta = input.closest(".res-noche");
      tarjeta.classList.add("completa");
      $(".res-noche-precio", tarjeta).textContent = "Completo";
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (paso < ULTIMO_PASO) return avanzar();
      if (enviando) return;

      const r = calculo();
      const incompleto = primerIncompleto(r);
      if (incompleto < ULTIMO_PASO) {
        const falta = faltaEnPaso(incompleto, r);
        irA(incompleto);
        return mostrarError(falta.msg, falta.campo);
      }
      const f = form.elements;
      const v = window.BotanicNombre.validar(f.nombre.value);
      if (!v.ok) return mostrarError(v.error, f.nombre);
      const telefono = Reservas.normalizarTelefono(f.telefono.value);
      if (!telefono) return mostrarError("Escribe un teléfono válido, por ejemplo 600 123 123.", f.telefono);
      const personas = Number(f.personas.value);
      if (!Number.isInteger(personas) || personas < 1 || personas > 30) return mostrarError("Indica cuántas personas venís (1 a 30).", f.personas);
      if (r.personasMax && personas > r.personasMax) {
        return mostrarError(`Con ${plural(r.botellas, "botella", "botellas")} podéis venir hasta ${r.personasMax} personas: añade otra botella o indica menos personas.`, f.personas);
      }
      mostrarError("");

      // Solo se manda lo elegido: el precio lo calcula el servidor
      const pedido = {
        tipo,
        fecha: nocheElegida(),
        nombre: v.nombre,
        telefono,
        personas,
        rpp: rppReserva ? rppReserva.codigo : null,
        notas: f.notas.value.trim(),
        carrito: listaCarrito(),
        web: f.web.value
      };

      enviando = true;
      siguiente.disabled = true;
      $(".btn-label", siguiente).textContent = "Enviando…";
      const reactivar = (msg, campo) => {
        enviando = false;
        siguiente.disabled = false;
        siguiente.innerHTML = btnHTML("Enviar reserva");
        mostrarError(msg, campo);
      };

      try {
        let tk = await token;
        if (!tk || Date.now() - tk.pedido > 100 * 60_000) tk = await (token = pedirToken());
        // El servidor no acepta tokens de menos de 3 s (bots): si hace falta, se espera
        const espera = 3200 - (Date.now() - tk.pedido);
        if (espera > 0) await new Promise((res) => setTimeout(res, espera));

        const resp = await fetch("/api/reservas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...pedido, token: tk.valor })
        });
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok || !j.ok) {
          if (resp.status === 400 && /caducado/.test(j.error || "")) token = pedirToken().catch(() => null);
          if (j.motivo === "completo") {
            (resDispo.completas[pedido.fecha] ||= []).push(tipo);
            marcarNocheCompleta(pedido.fecha);
            aplicarDisponibilidad();
            reactivar("");
            irA(0);
            return mostrarError(j.error);
          }
          return reactivar(j.error || "No se ha podido enviar la reserva.", j.motivo === "duplicado" ? f.telefono : undefined);
        }
        renderReservaHecha({
          tipo, fecha: pedido.fecha, personas, telefono: j.telefono || telefono, referencia: j.referencia,
          total: j.total ?? r.total, aConsultar: r.aConsultar, lineas: r.lineas
        });
      } catch (ex) {
        reactivar("No se ha podido conectar. Revisa tu conexión e inténtalo de nuevo.");
      }
    });

    irA(0, false);
  }

  /* +34600123123 → +34 600 123 123 */
  const telefonoLegible = (t) => (/^\+34\d{9}$/.test(t) ? `+34 ${t.slice(3, 6)} ${t.slice(6, 9)} ${t.slice(9)}` : t);

  function renderReservaHecha(h) {
    const t = RES.tipos[h.tipo] || {};
    const linea = (grupo) => {
      const ls = h.lineas.filter((l) => l.grupo === grupo);
      return ls.length ? `<p><strong>${esc(GRUPOS_RES[grupo].titulo)}:</strong> ${ls.map((x) => `${x.cantidad} × ${esc(x.nombre)}`).join(", ")}</p>` : "";
    };
    const cuerpo = $("#res-modal-cuerpo");
    cuerpo.innerHTML = `
      <div class="list-done">
        <div class="tick" aria-hidden="true">✓</div>
        <h4 id="res-modal-titulo">¡Petición enviada!</h4>
        <p class="res-referencia">Referencia <strong>${esc(h.referencia)}</strong></p>
        <p>${esc(t.nombre)} · ${esc(fechaLarga(fromKey(h.fecha)))} · ${plural(h.personas, "persona", "personas")}</p>
        ${Object.keys(GRUPOS_RES).map(linea).join("")}
        <p><strong>Total:</strong> ${euros(h.total)}${h.aConsultar ? " + champán a consultar" : ""}. Se paga en la puerta de la discoteca.</p>
        <p>Aún no es firme: te escribiremos por WhatsApp al <strong>${esc(telefonoLegible(h.telefono))}</strong> para confirmarla.</p>
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

    // Links de RPP: llevan directos a lo suyo (salvo que el link ya traiga un #ancla).
    //   ?reserva=código → sección de reservados
    //   ?rpp=código     → formulario de la lista de la próxima noche abierta (o la agenda si no hay ninguna)
    // Se espera a "load" para que las imágenes ya hayan ocupado su sitio y el salto no se desvíe
    const params = new URLSearchParams(location.search);
    if (!location.hash && (params.has("reserva") || params.has("rpp"))) {
      window.addEventListener("load", () => {
        const comportamiento = reducedMotion ? "auto" : "smooth";
        const [proxima] = proximasNoches(1, true);
        if (params.has("reserva")) return $("#reservados").scrollIntoView({ behavior: comportamiento });
        if (!proxima) return $("#agenda").scrollIntoView({ behavior: comportamiento });
        abrirDia(proxima, false);
        // Se ve el panel entero si el formulario cabe en pantalla; si no (móvil, con el cartel encima), directo al formulario
        const panel = $(".day-panel");
        const lista = $(".day-panel .list-box");
        if (!panel || !lista) return;
        const p = panel.getBoundingClientRect();
        const l = lista.getBoundingClientRect();
        const desde = l.bottom - p.top + 80 <= window.innerHeight ? p.top : l.top;
        window.scrollTo({ top: desde + window.scrollY - 80, behavior: comportamiento });
      }, { once: true });
    }
  });
})();
