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

  /* ---------------- Fechas ---------------- */
  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const today = () => startOfDay(new Date());

  const fechaLarga = (d) => `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  const fechaCorta = (d) => `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;

  function isOpen(d) {
    const k = keyOf(d);
    if ((CFG.aperturasExtra || []).includes(k)) return true;
    if ((CFG.cerrado || []).includes(k)) return false;
    return (CFG.diasAbierto || [3, 4, 5, 6]).includes(d.getDay());
  }

  function horarioDe(d) {
    const h = CFG.horarios || {};
    return h[d.getDay()] || h[6] || "23:30";
  }

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

  /* ¿Se puede apuntar todavía a la lista de ese día? */
  function listaAbierta(d) {
    const t = today();
    if (d < t) return false;
    if (d.getTime() === t.getTime()) return new Date().getHours() < (CFG.cierreListaHora ?? 23);
    return true;
  }

  function proximasNoches(n, soloConLista = false) {
    const out = [];
    let d = today();
    for (let i = 0; i < 120 && out.length < n; i++, d = addDays(d, 1)) {
      if (isOpen(d) && (!soloConLista || listaAbierta(d))) out.push(d);
    }
    return out;
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

  /* ---------------- Aviso ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
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
     PORTADA: próxima noche
     ========================================================= */
  /* Hora "HH:MM" de apertura (parte 0) o cierre (parte 1) del horario de un día */
  function horaDe(d, parte, porDefecto) {
    const txt = (horarioDe(d).split("–")[parte] || porDefecto).trim();
    const [h, m] = txt.split(":").map(Number);
    return { h: isNaN(h) ? 0 : h, m: isNaN(m) ? 0 : m, txt };
  }
  const apertura = (d) => { const a = horaDe(d, 0, "23:30"); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), a.h, a.m); };
  const cierre = (d) => { const c = horaDe(d, 1, "06:00"); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, c.h, c.m); };

  /* ¿Estamos abiertos ahora? Si no, ¿cuál es la próxima apertura? */
  function estadoNoche(now) {
    const hoy = today();
    for (const d of [addDays(hoy, -1), hoy]) {
      if (isOpen(d) && now >= apertura(d) && now < cierre(d)) return { abierto: true, d };
    }
    const d = proximasNoches(3).find((x) => apertura(x) > now);
    return d ? { abierto: false, d } : null;
  }

  function initCountdown() {
    const box = $("#countdown");
    const label = $("#cd-label");
    const units = $("#cd-units");
    const open = $("#cd-open");
    const nums = { d: $("#cd-d"), h: $("#cd-h"), m: $("#cd-m"), s: $("#cd-s") };
    let estado = null;

    const pintarEstado = () => {
      estado = estadoNoche(new Date());
      if (!estado) { box.hidden = true; return false; }
      const n = noche(estado.d);
      if (estado.abierto) {
        label.textContent = `${n.titulo} · hasta las ${horaDe(estado.d, 1, "06:00").txt}`;
        units.hidden = true;
        open.hidden = false;
      } else {
        const d = estado.d;
        const esHoy = d.getTime() === today().getTime();
        const esMan = d.getTime() === addDays(today(), 1).getTime();
        const cuando = esHoy ? "Hoy" : esMan ? "Mañana" : fechaLarga(d);
        label.textContent = `Próxima noche · ${cuando} · ${n.titulo}`;
        units.hidden = false;
        open.hidden = true;
      }
      box.hidden = false;
      return true;
    };

    const poner = (node, valor) => {
      const v = pad(valor);
      if (node.textContent === v) return;
      node.textContent = v;
      if (reducedMotion) return;
      node.classList.remove("tick");
      void node.offsetWidth; // reinicia la animación
      node.classList.add("tick");
    };

    const tick = () => {
      if (document.hidden) return;
      const now = new Date();
      const objetivo = estado.abierto ? cierre(estado.d) : apertura(estado.d);
      let falta = Math.max(0, Math.floor((objetivo - now) / 1000));
      if (falta === 0) { if (pintarEstado()) tick(); return; }
      if (estado.abierto) return;
      poner(nums.d, Math.floor(falta / 86400)); falta %= 86400;
      poner(nums.h, Math.floor(falta / 3600)); falta %= 3600;
      poner(nums.m, Math.floor(falta / 60));
      poner(nums.s, falta % 60);
    };

    if (!pintarEstado()) return;
    tick();
    setInterval(tick, 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  }

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
     PARALLAX (portada y VIP)
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
          // Desplazamiento según la distancia al centro de la pantalla, limitado al margen de la capa
          const limite = sec.height * 0.11;
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

  function renderForm(box, d, n) {
    const max = (CFG.lista && CFG.lista.maxAcompanantes) || 10;
    const opts = Array.from({ length: max + 1 }, (_, i) => `<option value="${i}">${i === 0 ? "Voy solo/a" : `+${i}`}</option>`).join("");
    const id = `l-${n.key}`;

    box.innerHTML = `
      <h4>Apúntate a la <span>lista</span></h4>
      <p class="list-hint">Lista para el ${esc(fechaLarga(d).toLowerCase())}. Presenta tu nombre y DNI en la puerta.</p>
      <form novalidate>
        <div class="form-grid">
          <div class="field full">
            <label for="${id}-nombre">Nombre y apellidos</label>
            <input id="${id}-nombre" name="nombre" autocomplete="name" required minlength="3" maxlength="80">
          </div>
          <div class="field">
            <label for="${id}-tel">Teléfono</label>
            <input id="${id}-tel" name="telefono" type="tel" inputmode="tel" autocomplete="tel" required placeholder="600 000 000">
          </div>
          <div class="field">
            <label for="${id}-acomp">Acompañantes</label>
            <select id="${id}-acomp" name="acompanantes">${opts}</select>
          </div>
          <div class="field full">
            <label for="${id}-email">Email (opcional)</label>
            <input id="${id}-email" name="email" type="email" autocomplete="email" maxlength="120">
          </div>
          <label class="check full"><input type="checkbox" name="edad" required> Soy mayor de 18 años.</label>
          <label class="check full"><input type="checkbox" name="privacidad" required> Acepto que Botanic use estos datos solo para gestionar la lista de esta noche.</label>
        </div>
        <div class="form-actions">
          <button class="btn btn-neon" type="submit">${btnHTML("Apuntarme")}</button>
        </div>
        <p class="form-error" role="alert" hidden></p>
      </form>`;

    const form = $("form", box);
    const err = $(".form-error", box);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.hidden = true;
      const fd = new FormData(form);
      const datos = {
        fecha: n.key,
        noche: n.titulo,
        nombre: String(fd.get("nombre") || "").trim().replace(/\s+/g, " "),
        telefono: String(fd.get("telefono") || "").replace(/[\s.-]/g, ""),
        email: String(fd.get("email") || "").trim(),
        acompanantes: Number(fd.get("acompanantes") || 0)
      };

      const fallo = validar(datos, fd);
      if (fallo) { err.textContent = fallo; err.hidden = false; return; }

      const btn = $("button[type=submit]", form);
      btn.disabled = true;
      $(".btn-label", btn).textContent = "Enviando…";

      try {
        const via = await enviarLista(datos);
        const guardado = { nombre: datos.nombre, acompanantes: datos.acompanantes, via };
        guardarInscripcion(n.key, guardado);
        renderHecho(box, d, n, guardado);
      } catch (ex) {
        btn.disabled = false;
        $(".btn-label", btn).textContent = "Apuntarme";
        err.textContent = "No se ha podido enviar. Revisa tu conexión e inténtalo de nuevo.";
        err.hidden = false;
      }
    });
  }

  function validar(d, fd) {
    if (d.nombre.length < 3 || !/\s/.test(d.nombre)) return "Escribe tu nombre y al menos un apellido.";
    if (!/^\+?\d{9,15}$/.test(d.telefono)) return "Escribe un teléfono válido.";
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return "El email no es válido.";
    if (!fd.get("edad")) return "Tienes que ser mayor de 18 años.";
    if (!fd.get("privacidad")) return "Tienes que aceptar el uso de tus datos para la lista.";
    return "";
  }

  function textoWhatsApp(d) {
    return [
      `Hola Botanic! Quiero apuntarme a la lista 🌴`,
      `📅 ${fechaLarga(fromKey(d.fecha))} (${d.noche})`,
      `👤 ${d.nombre}`,
      `📞 ${d.telefono}`,
      d.email ? `✉️ ${d.email}` : "",
      `👥 Acompañantes: ${d.acompanantes}`,
      `Total: ${d.acompanantes + 1} persona${d.acompanantes ? "s" : ""}`
    ].filter(Boolean).join("\n");
  }

  async function enviarLista(datos) {
    const endpoint = CFG.lista && CFG.lista.endpoint;
    if (endpoint) {
      const body = new URLSearchParams({ ...datos, acompanantes: String(datos.acompanantes), enviado: new Date().toISOString() });
      // Google Apps Script no devuelve cabeceras CORS: se envía en modo no-cors
      await fetch(endpoint, { method: "POST", mode: "no-cors", body });
      return "web";
    }
    const url = `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(textoWhatsApp(datos))}`;
    window.open(url, "_blank", "noopener");
    return "whatsapp";
  }

  function renderHecho(box, d, n, g) {
    const total = (g.acompanantes || 0) + 1;
    const viaWa = g.via === "whatsapp";
    box.innerHTML = `
      <div class="list-done">
        <div class="tick" aria-hidden="true">✓</div>
        <h4>${viaWa ? "¡Ya casi estás!" : "¡Estás en la lista!"}</h4>
        <p>${esc(g.nombre)} · ${total} persona${total > 1 ? "s" : ""} · ${esc(fechaLarga(d))}.<br>
        ${viaWa
          ? "Envía el mensaje que se ha abierto en WhatsApp para confirmar tu sitio."
          : "Di tu nombre en la puerta y enseña tu DNI. ¡Nos vemos dentro!"}</p>
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
     VIP, INFO Y PIE
     ========================================================= */
  function initInfo() {
    const wa = `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent("Hola Botanic! Quiero información para reservar una mesa VIP 🍾")}`;
    $("#vip-wa").href = wa;
    $("#vip-tel").href = `tel:+${CFG.whatsapp}`;
    $("#vip-tel-label").textContent = `Llamar · ${String(CFG.telefono).replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}`;

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
    initCountdown();
    initMarquee();
    initWeek();
    initCalendar();
    initGallery();
    initLightbox();
    initInfo();
    initReveal();
    initParallax();
    initPointerFx();

    // Enlace directo a un día: index.html#dia=2026-10-17
    const m = location.hash.match(/^#dia=(\d{4}-\d{2}-\d{2})$/);
    if (m && isOpen(fromKey(m[1]))) abrirDia(fromKey(m[1]), true);
  });
})();
