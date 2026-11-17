/* =========================================================
   ESTILO DE LA ÉPOCA (se elige en el panel: /admin.html → Estilo de la web)
   js/arranque.js pone <html data-tema="…"> antes de pintar; aquí se añaden
   los adornos. La estructura, las letras y el neón no cambian: solo se
   decoran el logo, la portada y el pie, y caen partículas por encima.
   Verano (el estilo de siempre) no añade nada.
   ========================================================= */
(function () {
  "use strict";

  const tema = document.documentElement.getAttribute("data-tema");
  if (!tema) return;

  const movil = window.matchMedia("(max-width: 700px)").matches;
  const azar = (a, b) => a + Math.random() * (b - a);
  const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];

  /* ---------- Dibujos (SVG) ---------- */
  const GORRO = `<svg viewBox="0 0 100 80"><path d="M10 62C12 36 34 12 64 10c16-1 28 10 30 26l-8 4c-4-10-10-14-18-13-16 3-24 17-26 35z" fill="#e3263a"/><path d="M64 10c16-1 28 10 30 26l-8 4c-2-10-8-16-16-18z" fill="#a8132a" opacity=".55"/><rect x="4" y="56" width="52" height="17" rx="8.5" fill="#fff6f0"/><circle cx="89" cy="41" r="9" fill="#fff6f0"/></svg>`;

  const SOMBRERO = `<svg viewBox="0 0 100 90"><ellipse cx="50" cy="76" rx="47" ry="11" fill="#1d0f30"/><path d="M27 74c7-22 13-44 23-64 4-7 12-8 14-2-4 6-6 14-4 24 3 16 8 30 13 42z" fill="#33184f"/><path d="M28 66q22 7 44 0l2 8q-24 7-47 0z" fill="#ff8a1f"/><rect x="44" y="65" width="12" height="11" rx="1.5" fill="none" stroke="#ffd23f" stroke-width="2.5"/></svg>`;

  const ANTIFAZ = `<svg viewBox="0 0 120 64"><defs><linearGradient id="tema-antifaz" x1="0" x2="1"><stop offset="0" stop-color="#ff3ad8"/><stop offset=".5" stop-color="#ffd60a"/><stop offset="1" stop-color="#2ec4ff"/></linearGradient></defs><path d="M92 24c4-14 12-20 22-20-6 6-10 12-10 20z" fill="#2ec4ff"/><path d="M98 26c8-10 16-12 22-10-8 4-12 8-14 14z" fill="#ffd60a"/><path d="M86 22c0-12 4-20 12-24-2 8-2 16 0 24z" fill="#ff3ad8"/><path fill-rule="evenodd" fill="url(#tema-antifaz)" d="M4 30c12-14 38-14 56-2 18-12 44-12 56 2 4 16-10 28-28 28-14 0-22-8-28-14-6 6-14 14-28 14C14 58 0 46 4 30zm18 8c5-8 18-8 24 0-6 7-18 7-24 0zm52 0c6-8 19-8 24 0-6 7-18 7-24 0z"/><circle cx="60" cy="34" r="2.2" fill="#fff"/><circle cx="12" cy="34" r="1.6" fill="#fff"/><circle cx="108" cy="34" r="1.6" fill="#fff"/></svg>`;

  const BOLA = `<svg viewBox="0 0 40 52"><rect x="15" y="0" width="10" height="8" rx="2" fill="#d4af37"/><circle cx="20" cy="30" r="18" style="fill:var(--c)"/><path d="M4 26q16 8 32 0" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/><ellipse cx="13" cy="23" rx="5" ry="7" fill="#fff" opacity=".35"/></svg>`;

  const CALABAZA = `<svg viewBox="0 0 80 72"><path d="M38 12c0-6 4-10 9-11l1 4c-4 1-6 4-6 8z" fill="#3f7a2a"/><ellipse cx="22" cy="42" rx="18" ry="26" fill="#c9561a"/><ellipse cx="58" cy="42" rx="18" ry="26" fill="#c9561a"/><ellipse cx="40" cy="42" rx="20" ry="28" fill="#ff7b1f"/><g class="tema-cara" fill="#ffd23f"><path d="M26 34l7-8 3 11z"/><path d="M54 34l-7-8-3 11z"/><path d="M22 48q18 14 36 0l-4 2-3-4-4 6-4-5-3 6-3-6-4 5-4-6-3 4z"/></g></svg>`;

  const ARANA = `<svg viewBox="0 0 40 30"><g stroke="#140a1f" stroke-width="2" fill="none" stroke-linecap="round"><path d="M14 14L4 8M14 17L2 17M14 20L4 27M16 22l-6 7"/><path d="M26 14l10-6M26 17l12 0M26 20l10 7M24 22l6 7"/></g><circle cx="20" cy="18" r="7" fill="#140a1f"/><circle cx="20" cy="9" r="4.5" fill="#140a1f"/><circle cx="18.4" cy="8.6" r="1" fill="#ff8a1f"/><circle cx="21.6" cy="8.6" r="1" fill="#ff8a1f"/></svg>`;

  const MURCIELAGO = `<svg viewBox="0 0 64 32"><path d="M32 10c-3-2-4-5-3-7l2 3h2l2-3c1 2 0 5-3 7zm0 0c-6-1-12-6-22-6 4 4 2 8-8 9 6 2 8 7 6 13 6-4 12-4 16 0 2-6 5-10 8-10s6 4 8 10c4-4 10-4 16 0-2-6 0-11 6-13-10-1-12-5-8-9-10 0-16 5-22 6z" fill="#14081f"/></svg>`;

  // Instrumentos de chirigota y comparsa en línea de neón
  const GUITARRA = `<svg viewBox="0 0 64 96" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M32 40c-8 0-12 6-10 12-8 2-12 10-10 20 2 12 12 18 20 18s18-6 20-18c2-10-2-18-10-20 2-6-2-12-10-12z"/><circle cx="32" cy="68" r="6"/><path d="M29 41V10M35 41V10M27 10V2h10v8zM26 80h12"/><path d="M31 10v70M33 10v70" stroke-width="1"/></svg>`;
  const BOMBO = `<svg viewBox="0 0 96 80" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="44" cy="44" r="32"/><circle cx="44" cy="44" r="24"/><path d="M44 12l8 8 8-5 4 9h9l-3 9 6 7-8 5 4 9-9 2-1 10-9-3-5 9-6-8-9 6-2-10-10-1 3-9-9-5 7-7-5-8 9-2v-10l9 3z" stroke-width="1.5"/><path d="M80 8L62 30"/><ellipse cx="84" cy="5" rx="7" ry="5"/></svg>`;
  const CAJA = `<svg viewBox="0 0 80 72" fill="none" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="40" cy="30" rx="28" ry="8"/><path d="M12 30v26c0 5 13 8 28 8s28-3 28-8V30"/><path d="M12 33l10 26 8-23 10 26 10-26 8 24 10-26" stroke-width="1.5"/><path d="M14 4l28 22M66 4L38 26"/><circle cx="13" cy="3" r="2.5"/><circle cx="67" cy="3" r="2.5"/></svg>`;
  const PITO = `<svg viewBox="0 0 96 32" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="11" width="78" height="10" rx="5"/><path d="M30 11v10M58 11v10" stroke-width="1.5"/><circle cx="44" cy="16" r="2"/><ellipse cx="86" cy="16" rx="4" ry="8"/><path d="M90 9c4 3 4 11 0 14" stroke-width="1.5"/></svg>`;

  /* Telaraña de esquina: radios desde la esquina y anillos que se comban hacia dentro */
  function telarana() {
    const R = [30, 58, 90, 124];
    const angulos = [0, 18, 36, 54, 72, 90].map((g) => (g * Math.PI) / 180);
    const p = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
    let d = angulos.map((a) => { const [x, y] = p(140, a); return `M0 0L${x.toFixed(1)} ${y.toFixed(1)}`; }).join("");
    for (const r of R) {
      for (let i = 0; i < angulos.length - 1; i++) {
        const [x1, y1] = p(r, angulos[i]);
        const [x2, y2] = p(r, angulos[i + 1]);
        const [cx, cy] = p(r * 0.82, (angulos[i] + angulos[i + 1]) / 2);
        d += `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      }
    }
    return `<svg viewBox="0 0 140 140" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="1.1"><path d="${d}"/></svg>`;
  }

  /* ---------- Piezas ---------- */
  const adorno = (clase, html, estilo = "") => `<span class="${clase}" aria-hidden="true"${estilo ? ` style="${estilo}"` : ""}>${html}</span>`;

  // Logo: gorro, sombrero o antifaz sobre la Ø (cabecera, portada y pie)
  function adornarLogo(svg, clase) {
    document.querySelectorAll(".o-slash").forEach((o) => {
      if (!o.querySelector(".tema-logo")) o.insertAdjacentHTML("beforeend", adorno(`tema-logo ${clase}`, svg));
    });
  }

  function adornarPortada(html) {
    const hero = document.querySelector(".hero");
    if (hero) hero.insertAdjacentHTML("beforeend", `<div class="tema-portada" aria-hidden="true">${html}</div>`);
  }

  function adornarPie(html) {
    const pie = document.querySelector(".footer-inner");
    if (pie) pie.insertAdjacentHTML("afterbegin", `<div class="tema-pie" aria-hidden="true">${html}</div>`);
  }

  /* Partículas que caen o cruzan la pantalla (no se crean con "reducir movimiento"; el CSS las
     esconde también en el modo ligero de equipos lentos) */
  function particulas(clase, n, crear) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let html = "";
    for (let i = 0; i < n; i++) html += crear(i);
    document.body.insertAdjacentHTML("beforeend", `<div class="tema-particulas ${clase}" aria-hidden="true">${html}</div>`);
  }

  /* ---------- Cada época ---------- */
  const TEMAS = {
    navidad() {
      adornarLogo(GORRO, "tema-gorro");
      adornarPortada([
        ["6%", "150px", "#e3263a", "4.2s"], ["14%", "210px", "#d4af37", "5s"],
        ["84%", "190px", "#d4af37", "4.6s"], ["92%", "140px", "#e3263a", "3.9s"]
      ].map(([x, l, c, t]) => adorno("tema-bola", BOLA, `--x:${x};--l:${l};--c:${c};--t:${t}`)).join(""));
      particulas("tema-nieve", movil ? 16 : 30, () => `<i style="--x:${azar(0, 100).toFixed(1)}vw;--s:${azar(3, 7).toFixed(1)}px;--o:${azar(0.35, 0.9).toFixed(2)};--t:${azar(9, 18).toFixed(1)}s;--d:${(-azar(0, 18)).toFixed(1)}s;--v:${azar(-40, 40).toFixed(0)}px"></i>`);
    },

    halloween() {
      adornarLogo(SOMBRERO, "tema-sombrero");
      adornarPortada(
        adorno("tema-telarana tema-izq", telarana()) +
        adorno("tema-telarana tema-der", telarana()) +
        adorno("tema-arana", ARANA) +
        adorno("tema-calabaza tema-c1", CALABAZA) +
        adorno("tema-calabaza tema-c2", CALABAZA) +
        adorno("tema-calabaza tema-c3", CALABAZA)
      );
      // Pocos murciélagos y de vez en cuando: cada uno cruza y espera su turno fuera de la pantalla
      particulas("tema-murcielagos", movil ? 2 : 4, (i) => `<i style="--y:${azar(10, 55).toFixed(0)}vh;--s:${azar(0.6, 1.1).toFixed(2)};--t:${azar(16, 26).toFixed(1)}s;--d:${(i * 5 + azar(1, 4)).toFixed(1)}s">${MURCIELAGO}</i>`);
    },

    carnaval() {
      adornarLogo(ANTIFAZ, "tema-antifaz");
      adornarPortada(adorno("tema-neon tema-guitarra", GUITARRA) + adorno("tema-neon tema-bombo", BOMBO));
      adornarPie([GUITARRA, BOMBO, CAJA, PITO].map((svg, i) => adorno(`tema-neon tema-n${i}`, svg)).join(""));
      // Papelillos: el confeti del Carnaval de Cádiz
      const colores = ["#ff3ad8", "#ffd60a", "#2ec4ff", "#2fe0a8", "#ff6b3d", "#ffffff"];
      particulas("tema-papelillos", movil ? 14 : 26, () => `<i style="--x:${azar(0, 100).toFixed(1)}vw;--c:${elegir(colores)};--w:${azar(5, 8).toFixed(1)}px;--h:${azar(8, 12).toFixed(1)}px;--t:${azar(7, 13).toFixed(1)}s;--d:${(-azar(0, 13)).toFixed(1)}s;--v:${azar(-60, 60).toFixed(0)}px;--g:${azar(360, 1080).toFixed(0)}deg"></i>`);
    }
  };

  // Después de app.js (que monta el título letra a letra): este script va detrás en index.html
  document.addEventListener("DOMContentLoaded", () => { if (TEMAS[tema]) TEMAS[tema](); });
})();
