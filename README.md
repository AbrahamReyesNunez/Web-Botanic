# Web de Discoteca Botanic Chipiona

Web de la discoteca con agenda, galería, mesas VIP y **lista por RPP**. Un pequeño servidor en Node.js sirve la web y guarda las inscripciones y solicitudes de reservados en **Supabase** (o en archivos JSON si no está configurado).

## Arrancar en local

Requisito: [Node.js](https://nodejs.org) 22 o superior (lo exige `@supabase/supabase-js`; en el hosting, elegid también Node 22 o superior).

```
npm install                 # instala la librería de Supabase
copy .env.example .env      # y cambia ADMIN_KEY (y SUPABASE_* si usas la base de datos)
npm start                   # http://localhost:3000  ·  panel: http://localhost:3000/admin.html
npm test                    # pruebas del filtro de nombres, del almacén y de la API
```

Al arrancar, la consola dice dónde se guardan los datos: `Datos: Supabase` o `Datos: data/db (JSON)`.

Si abres `public/index.html` directamente (sin servidor), la web se ve, pero la lista no puede enviar.

## Estructura

```
public/                          Lo único que el servidor sirve a internet (la web)
  index.html · admin.html        Web pública y panel de la web (eventos, días y galería)
  css/styles.css · css/admin.css Estilos
  js/app.js                      Calendario, lista, galería, efectos
  js/admin.js                    Panel de la web
  js/compartido/                 Código compartido (web, panel y servidor)
    dom.js                       $ y esc() de la web y el panel
    calendario.js                Días de apertura y cierre de lista
    nombre.js                    Filtro y normalización de nombres
    reservas.js                  Precios, buscador y teléfono de las reservas
  data/config.js                 Horarios, contacto, días cerrados, topes y antelación de la lista, URL de la galería
  data/reservados.js             Mesas, precios y bebidas de los reservados (con el dibujo de cada refresco)
  data/eventos.js                Nombre por defecto de cada noche (los eventos se crean en el panel)
  img/                           Logo y fondos (las portadas y las fotos de la galería están en Google Drive)
server/                          Servidor (server.js, lista.js, reservas.js, admin.js, limites.js)
  formulario.js                  Token de seguridad de los formularios
  contenido.js                   Eventos, días y ajustes de galería del panel (/api/web.js)
  drive.js                       Subida de fotos de eventos a Drive vía Apps Script
  galeria.js                     Copia de los álbumes de Drive para la web (/api/galeria), renovada cada 10 min
  almacen-supabase.js            Datos en Supabase (producción)
  almacen.js                     Datos en JSON (local y pruebas)
  comprobar-supabase.js          npm run comprobar-supabase
supabase/migrations/             Cambios de la base de datos, numerados (001, 002…; 005: panel de la web)
google-apps-script/Codigo.gs     Código del Google Apps Script de la galería (se pega en Apps Script)
data/db/                         Solo en modo JSON (fuera de public/): rpps.json, mesas.json, inscripciones.json, reservas.json y contenido.json (las tres últimas no se suben)
                                 rpps.json trae RPP de prueba solo para desarrollo: los reales van en Supabase
test/                            Pruebas (node --test)
```

Todo lo que el navegador tiene que poder descargar va en `public/`; lo demás (`.env`, `data/db`, el código del servidor, la documentación) nunca se sirve.

## Lista y RPPs

- La lista pide solo **nombre y apellidos**. El campo **RPP** no se puede editar:
  - Con el link de un RPP (`https://dominio/?rpp=CÓDIGO`) abre directamente la lista de la próxima noche y queda fijado en ese RPP, también si la persona navega por la web.
  - Cada RPP tiene además un link de reservados (`https://dominio/?reserva=CÓDIGO`): abre la web en la sección de reservados y la reserva queda asignada a ese RPP. Cada link cuenta solo para lo suyo.
  - Sin link queda en **"Sin RPP"**, así nadie puede asignarse un RPP a mano.
- **Añadir un RPP:** en Supabase → **Table Editor → rpps → Insert row**, escribe solo su `nombre` (el `codigo` del link se genera solo y no puede haber dos RPP con el mismo nombre). Para desactivarlo, pon `activo` en `false` (no borres la fila: sus inscripciones se conservan). El cambio tarda hasta 30 s en verse. En modo JSON se hace igual en `data/db/rpps.json`.
- **Ver la lista:** en Supabase → **Table Editor** (`inscripciones` por noche y RPP). La API de administración de lista, RPPs y reservas (`/api/admin/noches`, `resumen`, `reservas`, `rpps`, `rpp/:codigo` e `inscripcion/:id`) no tiene pantalla en la web: se mantiene para la futura app móvil.
- La lista de una noche se abre **7 días antes** (`lista.diasAntelacion`) y se cierra a las 23:00 de ese día (`cierreListaHora`), los dos en `public/data/config.js`, hora de Madrid.

### Protección contra abusos
| Capa | Qué hace |
|---|---|
| Filtro de nombre | Pide nombre y apellido. Solo letras, máximo 40 caracteres y 5 palabras. Rechaza tecleo aleatorio, letras repetidas, insultos y nombres de broma. Normaliza mayúsculas. |
| Token de formulario | Firmado por el servidor; no vale si se envía en menos de 3 s ni pasadas 2 h. |
| Campo trampa | Campo oculto que solo rellenan los bots: se responde "ok" y no se guarda nada. |
| Límites por IP | 5 altas cada 10 min, 15 al día, 5 por noche y 20 intentos cada 10 min. Login del panel: 5 intentos cada 15 min. Los huecos se cogen antes de esperar a la base de datos, así que muchas peticiones a la vez no se los saltan. |
| Duplicados y topes | El mismo nombre no puede repetirse en una noche; si ya está, se responde igual que a un alta nueva (sin guardarla), para que la lista no sirva para averiguar quién va. Topes por noche y por RPP en `public/data/config.js`, comprobados antes que los duplicados. En Supabase se comprueban dentro de la base de datos, así que dos altas simultáneas no se los saltan. |
| Huella del origen | Cada alta guarda una huella de la IP (`origen`, migración 009), no la IP. Para quitar de golpe las altas de un abuso: Supabase → SQL Editor → `delete from inscripciones where fecha = 'AAAA-MM-DD' and origen = '…';`. Se borra a los 30 días con el resto de datos personales. Con `FORM_SECRET` fijo en `.env`, la misma IP da la misma huella aunque se reinicie el servidor. |
| Servidor | Cuerpo máximo de 1 KB (8 KB en reservas), solo JSON y campos conocidos. Cabeceras de seguridad (CSP…). Los archivos internos no se sirven. |

## Reservas

La web envía **peticiones**: entran como `pendiente` y el equipo las confirma o rechaza (de momento, en Supabase; más adelante, desde la app).

- **Estados:** `pendiente` → `confirmada` o `rechazada`. `cancelada` si la anula el cliente. `caducada`: la noche pasó sin decidirla (se pone sola).
- **Aforo:** `tipos_mesa.mesas` dice cuántas mesas hay de cada tipo (pista 30, VIP 7). Solo cuentan las **confirmadas**: mientras queden mesas sin confirmar, se siguen aceptando peticiones. Con todas confirmadas, ese tipo se bloquea esa noche en la web (pista y VIP por separado) y la base de datos no deja confirmar ni una más.
- **Confirmar o rechazar:** Supabase → **Table Editor → reservas**, cambia `estado`. Para leerlas cómodas, **vista_reservas**: una fila por reserva con el pedido en texto, el RPP y un enlace de WhatsApp al cliente.
- **Cambiar el aforo:** edita `mesas` en **tipos_mesa**. La web lo nota en unos 30 s.
- **Precios:** los calcula el servidor con `public/data/reservados.js`; lo que mande el navegador no cuenta. Cada línea guarda el precio del momento. Al cambiar precios o bebidas, reinicia el servidor (`npm start`) para que los use.
- **Protección:** las mismas capas que la lista (token, campo trampa, campos conocidos) más: 3 peticiones por hora y 6 al día por IP (sin carreras: se cuentan antes de esperar a la base de datos y una petición rechazada no gasta); una petición activa por teléfono y noche (si el teléfono ya tiene una, se responde como si se hubiera recibido, pero no se guarda: así nadie puede averiguar si un número ha reservado; el equipo ve la primera); teléfono en formato internacional; hasta 5 personas por botella; el pedido se comprueba contra el catálogo.

## Panel de la web

`/admin.html`, con la clave de `ADMIN_KEY`.

**Estilo de la web** (arriba del todo): Verano, Navidad, Halloween o Carnaval. Verano es el estilo de siempre; los demás mantienen la estructura, las letras y el neón magenta, y añaden un color secundario y adornos (`public/css/temas.css` y `public/js/temas.js`):
- **Navidad:** dorado y rojo, gorro de Papá Noel en la Ø del logo, guirnalda de luces, bolas colgando y nieve.
- **Halloween:** naranja y morado, sombrero de bruja, telarañas, araña, calabazas encendidas y murciélagos que cruzan de vez en cuando.
- **Carnaval (de Cádiz):** amarillo y azul, antifaz, serpentinas, papelillos y guitarra, bombo, caja y pito de caña en neón.

Las partículas (nieve, papelillos, murciélagos) no se muestran con "reducir movimiento" ni en equipos lentos. La web cambia al recargarla.

Además tiene dos pestañas:

- **Eventos y calendario**: un calendario por meses. Al pulsar un día puedes:
  - Marcarlo como abierto o cerrado aunque no toque (por ejemplo, abrir en Nochevieja o cerrar un sábado). Si eliges lo que ya tocaba según `public/data/config.js`, no se guarda ningún cambio. La lista y los reservados respetan estos cambios al momento.
  - Crear, editar o quitar su evento: nombre, DJ invitado, descripción, enlace de Instagram y foto. La foto se reduce en el navegador y se sube a la carpeta de eventos de Google Drive; al cambiarla o quitar el evento, la anterior va a la papelera de Drive.
- **Galería**: los álbumes de Drive. Para cada uno puedes cambiar el nombre que se ve en la web, elegir la portada, anclar el álbum (sale el primero) y anclar fotos (salen primero dentro del álbum). En Drive no se cambia nada. "Resetear ajustes" borra todo lo cambiado en ese álbum y lo deja como en Drive.

Lo que se cambia en el panel se guarda en la base de datos (tabla `web_contenido`) y la web lo recibe en `/api/web.js`.

Las reservas se gestionan en Supabase (ver **Reservas**) y los RPPs, en Supabase (ver **Lista y RPPs**).

### Configurar el Google Apps Script (una vez)
El panel necesita el id de cada carpeta y poder subir fotos a Drive. El código completo está en `google-apps-script/Codigo.gs`:
1. Abre tu proyecto de Apps Script, sustituye el código por el de `Codigo.gs` y guarda.
2. Elige la función `configurarClave` y pulsa **Ejecutar** (acepta los permisos la primera vez). Crea la clave y la carpeta "Botanic · Fotos de eventos" en tu Drive, y escribe en el registro la línea `DRIVE_SCRIPT_CLAVE=…`: cópiala al `.env`.
3. Implementar → Gestionar implementaciones → Editar → Versión: nueva → Implementar. Así la URL no cambia.
4. Reinicia el servidor (`npm start`).

## Base de datos (Supabase)

Supabase es una base de datos PostgreSQL en la nube con un panel web. Solo habla con ella el servidor, con la clave secreta del `.env`: el navegador nunca se conecta directamente, así que todas las protecciones de arriba siguen aplicándose. Las tablas tienen RLS activado y sin permisos para la clave pública.

| Tabla | Contenido |
|---|---|
| `rpps` | `codigo` (el del link, automático), `nombre`, `activo` |
| `inscripciones` | `fecha` de la noche, `nombre`, `clave` (nombre sin tildes, para duplicados), `rpp`, `creado` |
| `tipos_mesa` | `tipo` (`pista`, `vip`), `nombre`, `mesas` (aforo por noche) |
| `reservas` | `fecha`, `tipo`, `estado`, `nombre`, `telefono`, `personas`, `rpp`, `notas`, `total` (€), `a_consultar`, `creado`, `decidido` |
| `reserva_lineas` | `reserva`, `grupo`, `producto`, `cantidad`, `precio` por unidad (null: a consultar) |
| `migraciones` | Migraciones aplicadas |
| `vista_reservas` | Vista para leer las reservas: pedido en texto, RPP y enlace de WhatsApp |
| `web_contenido` | Lo que se edita en el panel de la web: eventos, días cambiados, ajustes de la galería (migración 005) y estilo de la época (sección `ajustes`, migración 006) |

**Migraciones:** cada cambio de la base de datos es un archivo de `supabase/migrations/`. Se aplican **una vez y en orden**: Supabase → **SQL Editor → New query**, pega el archivo entero y pulsa **Run**. La tabla `migraciones` dice cuáles tiene ya tu base de datos. Para un cambio nuevo, crea el siguiente número (`008_….sql`); no edites los ya aplicados.

**Puesta en marcha (una vez por proyecto de Supabase):**
1. Aplica las migraciones de `supabase/migrations/` en orden (001, 002…). La 001 también vale sobre una base de datos que ya tuviera el antiguo `schema.sql`: no pierde datos.
2. Supabase → **Project Settings → API Keys**: copia la URL del proyecto y la clave secreta (`sb_secret_…`) a `SUPABASE_URL` y `SUPABASE_SECRET_KEY` en `.env`.
3. `npm run comprobar-supabase`: lee los RPPs, apunta y borra un nombre de prueba y una reserva de prueba (en la noche del 31/12/2099) y comprueba la tabla del panel de la web.

**Datos personales:** se guardan 30 días después de cada noche. Cada día (pg_cron, migración 004) los nombres de la lista pasan a "Anonimizado" y las reservas pierden nombre, teléfono y comentarios; las filas se quedan para las estadísticas. En modo JSON (solo local) no se anonimiza.

La clave secreta da acceso total a la base de datos: solo en `.env` y en las variables del hosting, nunca en el código, en el README ni en GitHub. Si se filtra, genera otra en el mismo panel.

En el plan gratuito, Supabase pausa el proyecto tras 7 días sin actividad. Mientras el servidor esté encendido no pasa: hace una consulta mínima cada 12 horas (aunque no haya visitas en temporada baja) y, si Supabase no responde, lo escribe en el registro del servidor. Si se pausa, se reactiva desde el panel de Supabase → **Restore**.

## Tareas habituales

### Crear un evento o ponerle foto
Panel → **Eventos y calendario** → pulsa el día. Si una noche no tiene foto, se muestra el logo.

### Subir fotos a la galería
La galería lee las carpetas de Google Drive a través del Google Apps Script de `galeria.scriptUrl` en `public/data/config.js`. Cada carpeta es un álbum.
1. Crea una carpeta nueva en Drive (su nombre es el título del álbum) y sube las fotos.
2. Las fotos tienen que estar compartidas como "Cualquier persona con el enlace" para que se vean en la web.
3. Portada: la elegida en el panel; si no hay, la foto llamada `portada` (`portada.jpg`, `portada.png`…); si tampoco, la primera.
4. No hace falta tocar la web: el álbum aparece solo en 10 minutos como mucho (el servidor guarda una copia de la lista de álbumes para no llamar a Google en cada visita; reiniciar el servidor la renueva al momento). El panel siempre ve la lista al día. Una carpeta vacía no se muestra.
5. Los álbumes salen del más reciente al más antiguo (los anclados en el panel, primero). Se ven los que caben en una fila y el resto con "Ver galería".

### Cerrar o abrir un día concreto
Panel → **Eventos y calendario** → pulsa el día → "Abrir" o "Cerrar". (También se puede con `cerrado` y `aperturasExtra` en `public/data/config.js`; lo del panel manda.)

## Publicar
**Caché y compresión.** El servidor comprime HTML, CSS y JS (brotli o gzip) y manda un `ETag` con cada archivo, así que una visita repetida solo pregunta «¿ha cambiado?» y recibe un 304 sin cuerpo. Por eso, al cambiar un archivo:
- **CSS o JS con `?v=` en el HTML** (`styles.css?v=18`, `app.js?v=19`…): subid el número en el HTML. Con `?v=` el navegador guarda el archivo un año sin preguntar.
- **Imágenes de `public/img/`**: se guardan una semana. Para cambiar una, usad otro nombre de archivo (o añadid `?v=`).
- HTML, `public/data/*.js` y `public/js/compartido/*.js`: se ven al momento.

La lista necesita un hosting que ejecute Node.js (Render, Railway, un VPS…); GitHub Pages no sirve. Define `ADMIN_KEY`, `FORM_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DRIVE_SCRIPT_CLAVE` y, detrás de un proxy, `TRUST_PROXY=1`. También con el túnel de Cloudflare (`cloudflared`): sin `TRUST_PROXY=1` todas las visitas llegan desde la misma IP y comparten los límites. Con él, la IP de cada visitante se lee del final de `X-Forwarded-For`, que es la que añade el proxy. Sin Supabase, los datos se guardan en archivos JSON, que en estos hostings se pierden al redesplegar.

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

