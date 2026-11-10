/* =========================================================
   PANEL DE LA WEB — eventos, días del calendario y galería
   (El panel anterior de lista, RPPs y reservados está en admin-lista.html)
   ========================================================= */
(function () {
  "use strict";

  const CFG = window.BOTANIC_CONFIG || {};
  const GAL = CFG.galeria || {};
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const pad = (n) => String(n).padStart(2, "0");
  const claveDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const deClave = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const fechaLarga = (k) => { const d = deClave(k); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };

  // Miniaturas de Drive: sin Referer, que Drive rechaza algunas peticiones que lo llevan
  const driveThumb = (id, tam) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=${tam}`;

  // contenido: { eventos, dias, galeria } del servidor · mes: primer día del mes visible · dia: clave del día abierto
  // fotoNueva/vistaNueva: foto elegida y aún sin guardar · vistas: { idDrive: dataURL } de las fotos subidas en esta sesión
  // (Drive tarda un rato en generar la miniatura de una foto recién subida; mientras, se usa la copia local)
  const estado = { contenido: null, driveConfigurado: false, mes: null, dia: null, fotoNueva: null, vistaNueva: null, fotoQuitada: false, vistas: {}, albumes: null };

  // Si la miniatura de Drive falla se prueba lh3.googleusercontent.com; si también falla, se oculta la imagen.
  // El evento "error" de las imágenes no burbujea: se escucha en fase de captura
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.src) return;
    const url = new URL(img.src);
    if (url.hostname === "drive.google.com" && url.searchParams.get("id")) {
      img.src = `https://lh3.googleusercontent.com/d/${encodeURIComponent(url.searchParams.get("id"))}=${url.searchParams.get("sz") || "w400"}`;
    } else if (url.hostname === "lh3.googleusercontent.com") {
      img.hidden = true;
    }
  }, true);

  /* ---------- Llamadas a la API ---------- */
  async function api(ruta, opciones = {}) {
    const r = await fetch(ruta, { cache: "no-store", ...opciones });
    if (r.status === 401) { mostrarAcceso(); throw new Error("sesion"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `Error del servidor (${r.status})`);
    return j;
  }
  const enviarJSON = (ruta, metodo, cuerpo) => api(ruta, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });

  /* Mensaje breve bajo un formulario. tipo: "ok" | "error" */
  function aviso(nodo, texto, tipo = "ok") {
    nodo.textContent = texto;
    nodo.className = `adm-aviso ${tipo}`;
    nodo.hidden = !texto;
  }

  /* ---------- Acceso ---------- */
  function mostrarAcceso() {
    $("#panel").hidden = true;
    $("#salir").hidden = true;
    $("#acceso").hidden = false;
    $("#clave").focus();
  }

  async function mostrarPanel() {
    const j = await api("/api/admin/contenido");
    estado.contenido = { eventos: j.eventos || {}, dias: j.dias || {}, galeria: j.galeria || {} };
    estado.driveConfigurado = !!j.driveConfigurado;
    $("#acceso").hidden = true;
    $("#panel").hidden = false;
    $("#salir").hidden = false;
    if (!estado.mes) { const hoy = new Date(); estado.mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1); }
    pintarMes();
  }

  /* ---------- Pestañas ---------- */
  function elegirPestana(id) {
    document.querySelectorAll(".adm-pestana").forEach((b) => {
      const activa = b.id === id;
      b.setAttribute("aria-selected", activa ? "true" : "false");
      $(`#${b.getAttribute("aria-controls")}`).hidden = !activa;
    });
    if (id === "tab-galeria" && !estado.albumes) cargarAlbumes();
  }

  /* =========================================================
     CALENDARIO
     ========================================================= */
  /* Lo que diría data/config.js sin cambios del panel */
  function abiertoPorDefecto(k) {
    if ((CFG.aperturasExtra || []).includes(k)) return true;
    if ((CFG.cerrado || []).includes(k)) return false;
    return (CFG.diasAbierto || [3, 4, 5, 6]).includes(deClave(k).getDay());
  }
  function abierto(k) {
    const panel = estado.contenido.dias[k];
    return panel ? panel === "abierto" : abiertoPorDefecto(k);
  }

  function pintarMes() {
    const m = estado.mes;
    $("#mes-titulo").textContent = `${MESES[m.getMonth()]} ${m.getFullYear()}`;
    const hoy = claveDe(new Date());
    const huecos = (m.getDay() + 6) % 7;   // la semana empieza en lunes
    const diasMes = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    let html = "<span></span>".repeat(huecos);
    for (let n = 1; n <= diasMes; n++) {
      const k = claveDe(new Date(m.getFullYear(), m.getMonth(), n));
      const ev = estado.contenido.eventos[k];
      const foto = fotoDeCelda(k);
      const cls = ["adm-celda", abierto(k) ? "abierto" : "cerrado"];
      if (estado.contenido.dias[k]) cls.push("cambiado");
      if (ev) cls.push("con-evento");
      if (foto) cls.push("con-foto");
      if (k === hoy) cls.push("hoy");
      if (k === estado.dia) cls.push("elegido");
      html += `
        <button type="button" class="${cls.join(" ")}" data-dia="${k}" aria-label="${esc(fechaLarga(k))}${ev ? `, evento: ${esc(ev.titulo)}` : ""}${abierto(k) ? "" : ", cerrado"}">
          <span class="adm-celda-num">${n}</span>
          ${foto ? `<img src="${foto}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
          ${ev ? `<span class="adm-celda-ev">${esc(ev.titulo)}</span>` : ""}
        </button>`;
    }
    $("#mes").innerHTML = html;
  }

  /* Foto que se ve en la casilla: la recién elegida (aún sin guardar), la copia local de una recién subida o la de Drive */
  function fotoDeCelda(k) {
    if (k === estado.dia && estado.vistaNueva) return estado.vistaNueva;
    if (k === estado.dia && estado.fotoQuitada) return null;
    const ev = estado.contenido.eventos[k];
    if (!ev || !ev.foto) return null;
    return estado.vistas[ev.foto] || driveThumb(ev.foto, "w300");
  }

  function moverMes(delta) {
    estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() + delta, 1);
    pintarMes();
  }

  /* ---------- Editor del día ---------- */
  function abrirDia(k) {
    estado.dia = k;
    estado.fotoNueva = null;
    estado.vistaNueva = null;
    estado.fotoQuitada = false;
    pintarMes();

    const ev = estado.contenido.eventos[k] || {};
    $("#dia").hidden = false;
    $("#dia-titulo").textContent = fechaLarga(k);
    pintarEstado(k);
    aviso($("#estado-msg"), "");

    $("#ev-titulo").value = ev.titulo || "";
    $("#ev-dj").value = ev.dj || "";
    $("#ev-descripcion").value = ev.descripcion || "";
    $("#ev-instagram").value = ev.instagram || "";
    $("#ev-titulo").removeAttribute("aria-invalid");
    $("#evento-borrar").hidden = !estado.contenido.eventos[k];
    $("#evento-hint").textContent = estado.contenido.eventos[k]
      ? "Este día tiene evento. Cambia lo que quieras y guarda."
      : "Este día no tiene evento: en la web sale con el nombre de la noche por defecto.";
    aviso($("#evento-msg"), "");
    aviso($("#foto-msg"), estado.driveConfigurado ? "" : "Para subir fotos falta DRIVE_SCRIPT_CLAVE en el .env del servidor.", "error");
    $("#foto-elegir").classList.toggle("deshabilitado", !estado.driveConfigurado);
    $("#foto-input").disabled = !estado.driveConfigurado;
    pintarFoto(ev.foto ? estado.vistas[ev.foto] || driveThumb(ev.foto, "w600") : null);

    $("#dia").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#dia-titulo").focus({ preventScroll: true });
  }

  function pintarFoto(src) {
    const img = $("#foto-preview");
    img.hidden = !src;
    if (src) img.src = src; else img.removeAttribute("src");
    $("#foto-vacia").hidden = !!src;
    $("#foto-quitar").hidden = !src;
  }

  /* Marca Abierto o Cerrado según cómo esté el día ahora mismo */
  function pintarEstado(k) {
    const actual = abierto(k) ? "abierto" : "cerrado";
    document.querySelectorAll('input[name="estado"]').forEach((r) => { r.checked = r.value === actual; });
    $("#dia-defecto").textContent = estado.contenido.dias[k]
      ? `Cambiado en el panel: normalmente ese día está ${abiertoPorDefecto(k) ? "abierto" : "cerrado"}.`
      : `Horario habitual: ${abiertoPorDefecto(k) ? "abierto (miércoles a sábado)" : "cerrado"}.`;
  }

  async function cambiarEstado(valor) {
    const k = estado.dia;
    // Si coincide con el horario habitual no hace falta guardar un cambio: se borra el que hubiera
    const cambio = valor === (abiertoPorDefecto(k) ? "abierto" : "cerrado") ? null : valor;
    try {
      await enviarJSON(`/api/admin/dia/${k}`, "PUT", { estado: cambio });
      if (cambio) estado.contenido.dias[k] = cambio; else delete estado.contenido.dias[k];
      aviso($("#estado-msg"), `Guardado: ese día está ${valor}.`);
      pintarEstado(k);
      pintarMes();
    } catch (e) {
      if (e.message !== "sesion") aviso($("#estado-msg"), e.message, "error");
      pintarEstado(k);
    }
  }

  /* Reduce la foto en el navegador (máx. 1600 px, JPEG) antes de subirla: menos espera y sin datos EXIF */
  function reducirFoto(archivo) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onerror = () => reject(new Error("No se pudo leer la foto."));
      lector.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Ese archivo no es una imagen válida."));
        img.onload = () => {
          const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
          const lienzo = document.createElement("canvas");
          lienzo.width = Math.round(img.naturalWidth * escala);
          lienzo.height = Math.round(img.naturalHeight * escala);
          lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
          const vista = lienzo.toDataURL("image/jpeg", 0.85);
          lienzo.toBlob((blob) => (blob ? resolve({ blob, vista }) : reject(new Error("No se pudo preparar la foto."))), "image/jpeg", 0.85);
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  async function elegirFoto(archivo) {
    if (!archivo) return;
    aviso($("#foto-msg"), "");
    try {
      const { blob, vista } = await reducirFoto(archivo);
      estado.fotoNueva = blob;
      estado.vistaNueva = vista;
      estado.fotoQuitada = false;
      pintarFoto(vista);
      pintarMes();   // la casilla del día enseña ya la foto
      aviso($("#foto-msg"), "Foto lista: se sube a Drive al guardar el evento.");
    } catch (e) {
      aviso($("#foto-msg"), e.message, "error");
    }
  }

  async function guardarEvento(e) {
    e.preventDefault();
    const k = estado.dia;
    const titulo = $("#ev-titulo").value.trim();
    const msg = $("#evento-msg");
    if (!titulo) {
      $("#ev-titulo").setAttribute("aria-invalid", "true");
      $("#ev-titulo").focus();
      return aviso(msg, "Ponle un nombre al evento.", "error");
    }
    $("#ev-titulo").removeAttribute("aria-invalid");
    const boton = $("#evento-guardar");
    boton.disabled = true;
    try {
      const anterior = estado.contenido.eventos[k] || {};
      let foto = estado.fotoQuitada ? "" : anterior.foto || "";
      if (estado.fotoNueva) {
        aviso(msg, "Subiendo la foto a Drive…");
        const r = await api("/api/admin/foto", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: estado.fotoNueva });
        foto = r.id;
        estado.vistas[foto] = estado.vistaNueva;
      }
      const j = await enviarJSON(`/api/admin/evento/${k}`, "PUT", {
        titulo,
        dj: $("#ev-dj").value,
        descripcion: $("#ev-descripcion").value,
        instagram: $("#ev-instagram").value,
        foto
      });
      estado.contenido.eventos[k] = j.evento;
      estado.fotoNueva = null;
      estado.vistaNueva = null;
      estado.fotoQuitada = false;
      aviso($("#foto-msg"), "");
      $("#evento-borrar").hidden = false;
      $("#evento-hint").textContent = "Este día tiene evento. Cambia lo que quieras y guarda.";
      aviso(msg, "Evento guardado. Ya se ve en la web.");
      pintarMes();
    } catch (ex) {
      if (ex.message !== "sesion") aviso(msg, ex.message, "error");
    } finally {
      boton.disabled = false;
    }
  }

  /* Quitar un evento pide una segunda pulsación para confirmar (los diálogos del navegador no se usan) */
  let confirmarBorrado = null;
  async function borrarEvento() {
    const boton = $("#evento-borrar");
    const msg = $("#evento-msg");
    if (!confirmarBorrado) {
      boton.querySelector(".btn-label").textContent = "¿Seguro? Pulsa otra vez";
      confirmarBorrado = setTimeout(() => {
        boton.querySelector(".btn-label").textContent = "Quitar evento";
        confirmarBorrado = null;
      }, 4000);
      return;
    }
    clearTimeout(confirmarBorrado);
    confirmarBorrado = null;
    boton.querySelector(".btn-label").textContent = "Quitar evento";
    try {
      await api(`/api/admin/evento/${estado.dia}`, { method: "DELETE" });
      delete estado.contenido.eventos[estado.dia];
      abrirDia(estado.dia);
      aviso(msg, "Evento quitado. La foto se ha mandado a la papelera de Drive.");
    } catch (e) {
      if (e.message !== "sesion") aviso(msg, e.message, "error");
    }
  }

  /* =========================================================
     GALERÍA
     ========================================================= */
  async function cargarAlbumes() {
    $("#adm-gal-cargando").hidden = false;
    $("#adm-gal-error").hidden = true;
    $("#adm-albumes").replaceChildren();
    try {
      if (!GAL.scriptUrl) throw new Error("falta galeria.scriptUrl en data/config.js");
      const r = await fetch(GAL.scriptUrl, { referrerPolicy: "no-referrer" });
      if (!r.ok) throw new Error(`el script respondió ${r.status}`);
      const datos = await r.json();
      if (!Array.isArray(datos)) throw new Error("la respuesta no tiene el formato esperado");
      estado.albumes = datos.filter((a) => a && a.nombre).map((a) => ({ ...a, fotos: Array.isArray(a.fotos) ? a.fotos.filter((f) => f && f.id) : [] }));
      pintarAlbumes();
    } catch (e) {
      $("#adm-gal-error-detalle").textContent = `Revisa la conexión (${e.message}).`;
      $("#adm-gal-error").hidden = false;
    } finally {
      $("#adm-gal-cargando").hidden = true;
    }
  }

  const ajustesDe = (id) => estado.contenido.galeria[id] || {};

  function pintarAlbumes() {
    const cont = $("#adm-albumes");
    // Sin id de carpeta no se pueden guardar ajustes: hay que actualizar el Apps Script
    if (estado.albumes.some((a) => !a.id)) {
      cont.innerHTML = `<p class="adm-aviso error">El Google Apps Script todavía no devuelve el id de cada carpeta. Pega el código de <code>google-apps-script/Codigo.gs</code> en tu proyecto de Apps Script y vuelve a implementarlo (ver README).</p>`;
      return;
    }
    if (!estado.albumes.length) {
      cont.innerHTML = `<p class="admin-hint">No hay álbumes en la carpeta de Drive.</p>`;
      return;
    }
    // Mismo orden que en la web: anclados primero y después los más recientes
    const orden = [...estado.albumes].sort((a, b) => (!!ajustesDe(b.id).anclado - !!ajustesDe(a.id).anclado) || ((b.creado || 0) - (a.creado || 0)));
    cont.innerHTML = orden.map((a) => {
      const aj = ajustesDe(a.id);
      const portada = a.fotos.find((f) => f.id === aj.portada) || a.fotos.find((f) => /^portada\.[a-z0-9]+$/i.test((f.nombre || "").trim())) || a.fotos[0];
      return `
        <details class="adm-album" data-id="${esc(a.id)}">
          <summary>
            <span class="adm-album-portada">${portada ? `<img src="${driveThumb(portada.id, "w200")}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</span>
            <span class="adm-album-txt">
              <strong>${esc(aj.nombre || a.nombre)}</strong>
              <small>${a.fotos.length ? `${a.fotos.length} ${a.fotos.length === 1 ? "foto" : "fotos"}` : "Vacío: no se muestra en la web"}${aj.nombre ? ` · en Drive: ${esc(a.nombre)}` : ""}</small>
            </span>
            ${aj.anclado ? `<span class="adm-chapa">Anclado</span>` : ""}
          </summary>
          <div class="adm-album-cuerpo"></div>
        </details>`;
    }).join("");
  }

  /* El contenido de cada álbum se pinta al abrirlo (así no se cargan todas las miniaturas de golpe) */
  function abrirAlbum(det) {
    const a = estado.albumes.find((x) => x.id === det.dataset.id);
    const aj = ajustesDe(a.id);
    const ancladas = aj.fotosAncladas || [];
    const portadaId = (a.fotos.find((f) => f.id === aj.portada) || {}).id || "";
    $(".adm-album-cuerpo", det).innerHTML = `
      <form class="adm-album-form">
        <div class="adm-album-campos">
          <div class="field">
            <label for="nom-${esc(a.id)}">Nombre en la web</label>
            <input id="nom-${esc(a.id)}" name="nombre" maxlength="80" autocomplete="off" value="${esc(aj.nombre || "")}" placeholder="${esc(a.nombre)}">
          </div>
          <label class="adm-check"><input type="checkbox" name="anclado" ${aj.anclado ? "checked" : ""}> Anclar el álbum (sale el primero)</label>
        </div>
        <p class="admin-hint">Pulsa <strong>Portada</strong> en la foto que quieras de portada y <strong>Anclar</strong> en las que deban salir primero dentro del álbum.${portadaId ? "" : " Sin portada elegida se usa la foto llamada «portada» o, si no hay, la primera."}</p>
        <div class="adm-fotos">
          ${a.fotos.map((f) => `
            <figure class="adm-foto-item${f.id === portadaId ? " es-portada" : ""}${ancladas.includes(f.id) ? " anclada" : ""}" data-foto="${esc(f.id)}">
              <img src="${driveThumb(f.id, "w300")}" alt="${esc(f.nombre)}" loading="lazy" referrerpolicy="no-referrer">
              <figcaption>
                <button type="button" class="adm-mini" data-accion="portada" aria-pressed="${f.id === portadaId}">Portada</button>
                <button type="button" class="adm-mini" data-accion="anclar" aria-pressed="${ancladas.includes(f.id)}">Anclar</button>
              </figcaption>
            </figure>`).join("")}
        </div>
        <div class="adm-acciones">
          <button class="btn btn-neon btn-sm" type="submit"><span class="btn-label">Guardar álbum</span><span class="btn-arrow" aria-hidden="true">✓</span></button>
          <button class="btn btn-ghost btn-sm" type="button" data-accion="restablecer"><span class="btn-label">Resetear ajustes</span></button>
        </div>
        <p class="adm-aviso" role="status" hidden></p>
      </form>`;
    // Estado de edición de este álbum (se guarda al pulsar "Guardar álbum")
    det._edicion = { portada: portadaId, ancladas: [...ancladas] };
  }

  function clicAlbum(e) {
    const det = e.target.closest(".adm-album");
    const boton = e.target.closest("button[data-accion]");
    if (!det || !boton || !det._edicion) return;
    const ed = det._edicion;
    const accion = boton.dataset.accion;
    if (accion === "restablecer") return guardarAlbum(det, true);
    const id = boton.closest("[data-foto]").dataset.foto;
    if (accion === "portada") ed.portada = ed.portada === id ? "" : id;
    if (accion === "anclar") ed.ancladas = ed.ancladas.includes(id) ? ed.ancladas.filter((x) => x !== id) : [...ed.ancladas, id];
    det.querySelectorAll("[data-foto]").forEach((fig) => {
      const fid = fig.dataset.foto;
      fig.classList.toggle("es-portada", fid === ed.portada);
      fig.classList.toggle("anclada", ed.ancladas.includes(fid));
      $('[data-accion="portada"]', fig).setAttribute("aria-pressed", fid === ed.portada);
      $('[data-accion="anclar"]', fig).setAttribute("aria-pressed", ed.ancladas.includes(fid));
    });
  }

  async function guardarAlbum(det, restablecer = false) {
    const form = $(".adm-album-form", det);
    const msg = $(".adm-aviso", form);
    const ed = det._edicion;
    const cuerpo = restablecer
      ? { nombre: "", portada: "", anclado: false, fotosAncladas: [] }
      : { nombre: form.nombre.value, portada: ed.portada, anclado: form.anclado.checked, fotosAncladas: ed.ancladas };
    try {
      const j = await enviarJSON(`/api/admin/album/${encodeURIComponent(det.dataset.id)}`, "PUT", cuerpo);
      if (Object.keys(j.ajustes).length) estado.contenido.galeria[det.dataset.id] = j.ajustes;
      else delete estado.contenido.galeria[det.dataset.id];
      const abierto = det.dataset.id;
      pintarAlbumes();
      // Se vuelve a abrir el álbum que se estaba editando, con su aviso
      const nuevo = $(`.adm-album[data-id="${CSS.escape(abierto)}"]`);
      nuevo.open = true;
      abrirAlbum(nuevo);
      aviso($(".adm-aviso", nuevo), restablecer ? "Ajustes reseteados: el álbum se ve como en Drive." : "Álbum guardado. Ya se ve así en la web.");
      nuevo.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {
      if (e.message !== "sesion") aviso(msg, e.message, "error");
    }
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

    document.querySelectorAll(".adm-pestana").forEach((b) => b.addEventListener("click", () => elegirPestana(b.id)));
    $("#mes-anterior").addEventListener("click", () => moverMes(-1));
    $("#mes-siguiente").addEventListener("click", () => moverMes(1));
    $("#mes").addEventListener("click", (e) => {
      const celda = e.target.closest("[data-dia]");
      if (celda) abrirDia(celda.dataset.dia);
    });
    document.querySelectorAll('input[name="estado"]').forEach((r) => r.addEventListener("change", () => cambiarEstado(r.value)));
    $("#foto-input").addEventListener("change", (e) => { elegirFoto(e.target.files[0]); e.target.value = ""; });
    $("#foto-quitar").addEventListener("click", () => {
      estado.fotoNueva = null;
      estado.vistaNueva = null;
      estado.fotoQuitada = true;
      pintarFoto(null);
      pintarMes();
      aviso($("#foto-msg"), "La foto se quita al guardar el evento.");
    });
    $("#evento-form").addEventListener("submit", guardarEvento);
    $("#evento-borrar").addEventListener("click", borrarEvento);

    $("#adm-gal-reintentar").addEventListener("click", cargarAlbumes);
    const albumes = $("#adm-albumes");
    albumes.addEventListener("toggle", (e) => { if (e.target.open && !e.target._edicion) abrirAlbum(e.target); }, true);
    albumes.addEventListener("click", clicAlbum);
    albumes.addEventListener("submit", (e) => { e.preventDefault(); guardarAlbum(e.target.closest(".adm-album")); });

    // Si ya hay sesión, directo al panel
    mostrarPanel().catch(() => mostrarAcceso());
  });
})();
