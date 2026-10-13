# Web de Discoteca Botanic Chipiona

Web de la discoteca con agenda, galería, mesas VIP y **lista por RPP**. Un pequeño servidor en Node.js sin dependencias sirve la web y guarda las inscripciones.

## Arrancar en local

Requisito: [Node.js](https://nodejs.org) 20 o superior.

```
copy .env.example .env      # y cambia ADMIN_KEY
npm start                   # http://localhost:3000  ·  panel: http://localhost:3000/admin.html
npm test                    # pruebas del filtro de nombres y de la API
```

Si abres `index.html` directamente (sin servidor), la web se ve, pero la lista no puede enviar.

## Estructura

```
index.html · admin.html          Web pública y panel de la lista
css/styles.css · css/admin.css   Estilos
js/app.js                        Calendario, lista, galería, efectos
js/admin.js                      Panel de recuento
js/compartido/                   Código que usan la web y el servidor
  calendario.js                  Días de apertura y cierre de lista
  nombre.js                      Filtro y normalización de nombres
server/                          Servidor (server.js, lista.js, admin.js, almacen.js, limites.js)
data/config.js                   Horarios, contacto, días cerrados, topes de la lista
data/eventos.js                  Títulos/artistas de noches concretas (opcional)
data/galeria.js                  Índice de fotos (lo genera el script)
data/db/rpps.json                RPPs y sus códigos de link
data/db/inscripciones.json       Inscripciones (se crea solo; no se sube al repositorio)
img/                             Logo, portadas y galería
test/                            Pruebas (node --test)
```

## Lista y RPPs

- La lista pide solo **nombre y apellidos**. El campo **RPP** no se puede editar:
  - Con el link de un RPP (`https://dominio/?rpp=CÓDIGO`) queda fijado en ese RPP, también si la persona navega por la web.
  - Sin link queda en **"Sin RPP"**, así nadie puede asignarse un RPP a mano.
- **Añadir un RPP:** edita `data/db/rpps.json` con un código nuevo de 8 letras/números aleatorios. Para desactivarlo, pon `"activo": false`; sus inscripciones se conservan. No hace falta reiniciar el servidor.
- **Panel** (`/admin.html`, con la clave de `ADMIN_KEY`): inscritos por noche y por RPP con porcentajes, buscador, borrado de nombres colados, exportación a CSV y links de cada RPP para copiar.
- La lista de un día se cierra a las 23:00 de ese día (`cierreListaHora` en `data/config.js`, hora de Madrid).

### Protección contra abusos
| Capa | Qué hace |
|---|---|
| Filtro de nombre | Pide nombre y apellido. Solo letras, máximo 40 caracteres y 5 palabras. Rechaza tecleo aleatorio, letras repetidas, insultos y nombres de broma. Normaliza mayúsculas. |
| Token de formulario | Firmado por el servidor; no vale si se envía en menos de 3 s ni pasadas 2 h. |
| Campo trampa | Campo oculto que solo rellenan los bots: se responde "ok" y no se guarda nada. |
| Límites por IP | 5 altas cada 10 min, 15 al día y 20 intentos cada 10 min. Login del panel: 5 intentos cada 15 min. |
| Duplicados y topes | El mismo nombre no puede repetirse en una noche. Topes por noche y por RPP en `data/config.js`. |
| Servidor | Cuerpo máximo de 1 KB, solo JSON y campos conocidos. Cabeceras de seguridad (CSP…). Los archivos internos no se sirven. |

## Tareas habituales

### Poner la portada de una noche
Guarda la portada de Instagram como `img/portadas/AAAA-MM-DD.jpg` (también valen `.jpeg`, `.png` y `.webp`). Aparece sola en el calendario; si no hay, se muestra el logo.
Para añadir título, artistas, descripción o enlace al post, usa `data/eventos.js`.

### Subir fotos a la galería
1. Crea `img/galeria/2026-10-17` (opcional: `img/galeria/2026-10-17 Noche Tropical`) y mete las fotos, a ser posible de unos 1600 px de lado largo.
2. Ejecuta `powershell -ExecutionPolicy Bypass -File actualizar-galeria.ps1`.

### Cerrar o abrir un día concreto
En `data/config.js`, añade la fecha a `cerrado` o a `aperturasExtra`.

## Publicar
La lista necesita un hosting que ejecute Node.js (Render, Railway, un VPS…); GitHub Pages no sirve. Define `ADMIN_KEY`, `FORM_SECRET` y, detrás de un proxy, `TRUST_PROXY=1`. El JSON es temporal: con muchas inscripciones o varias instancias del servidor, hay que pasar a una base de datos (solo cambia `server/almacen.js`).

## Flujo de trabajo (2 personas)

| Rama | Para qué |
|------|----------|
| `main` | Versión publicada. Solo se actualiza desde `develop`. |
| `develop` | Rama de trabajo común. Aquí se integra todo antes de publicar. |
| `feature/<nombre>` | Una por cambio (ej: `feature/galeria-octubre`). Sale de `develop` y vuelve a `develop`. |

```
git checkout develop && git pull
git checkout -b feature/mi-cambio
# ...cambios...
git add -A && git commit -m "Describe el cambio"
git push -u origin feature/mi-cambio
# Pull request feature/mi-cambio -> develop; el otro lo revisa y lo fusiona.
# Para publicar: pull request develop -> main.
```

Las portadas y las fotos de la galería pueden subirse directamente a `develop`, sin rama propia.
