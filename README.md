# Web de Discoteca Botanic Chipiona

Web de la discoteca con agenda, galería, mesas VIP y **lista por RPP**. Un pequeño servidor en Node.js sirve la web y guarda las inscripciones y solicitudes de reservados en **Supabase** (o en archivos JSON si no está configurado).

## Arrancar en local

Requisito: [Node.js](https://nodejs.org) 20 o superior.

```
npm install                 # instala la librería de Supabase
copy .env.example .env      # y cambia ADMIN_KEY (y SUPABASE_* si usas la base de datos)
npm start                   # http://localhost:3000  ·  panel: http://localhost:3000/admin.html
npm test                    # pruebas del filtro de nombres, del almacén y de la API
```

Al arrancar, la consola dice dónde se guardan los datos: `Datos: Supabase` o `Datos: data/db (JSON)`.

Si abres `index.html` directamente (sin servidor), la web se ve, pero la lista no puede enviar.

## Estructura

```
index.html · admin.html          Web pública y panel de la web (eventos, días y galería)
admin-lista.html                 Panel anterior de lista, RPPs y reservados (sin enlazar)
css/styles.css · css/admin.css   Estilos
js/app.js                        Calendario, lista, galería, efectos
js/admin.js · js/admin-lista.js  Panel de la web · panel anterior
js/compartido/                   Código que usan la web y el servidor
  calendario.js                  Días de apertura y cierre de lista
  nombre.js                      Filtro y normalización de nombres
server/                          Servidor (server.js, lista.js, admin.js, limites.js)
  contenido.js                   Eventos, días y ajustes de galería del panel (/api/web.js)
  drive.js                       Subida de fotos de eventos a Drive vía Apps Script
  almacen-supabase.js            Datos en Supabase (producción)
  almacen.js                     Datos en JSON (local y pruebas)
  comprobar-supabase.js          npm run comprobar-supabase
supabase/migrations/             Migraciones de la base de datos, en orden (005: tabla del panel de la web)
data/config.js                   Horarios, contacto, días cerrados, topes de la lista
data/eventos.js                  Nombre por defecto de cada noche (los eventos se crean en el panel)
google-apps-script/Codigo.gs     Código del Google Apps Script de la galería (se pega en Apps Script)
data/db/                         Solo en modo JSON: rpps.json, inscripciones.json, reservas.json y contenido.json
img/                             Logo y portadas (las fotos de la galería están en Google Drive)
test/                            Pruebas (node --test)
```

## Lista y RPPs

- La lista pide solo **nombre y apellidos**. El campo **RPP** no se puede editar:
  - Con el link de un RPP (`https://dominio/?rpp=CÓDIGO`) abre directamente la lista de la próxima noche y queda fijado en ese RPP, también si la persona navega por la web.
  - Cada RPP tiene además un link de reservados (`https://dominio/?reserva=CÓDIGO`): abre la web en la sección de reservados y la reserva queda asignada a ese RPP. Cada link cuenta solo para lo suyo.
  - Sin link queda en **"Sin RPP"**, así nadie puede asignarse un RPP a mano.
- **Panel anterior** (`/admin-lista.html`, sin enlazar desde ningún sitio): inscritos por noche y por RPP con porcentajes, buscador, borrado de nombres colados, exportación de la lista a PDF agrupada por RPP, y enlaces de lista y reservados para copiar.
- Desde el panel puedes crear y editar RPPs. Sus códigos y links se generan automáticamente; al eliminarlos se desactivan en vez de borrarlos, para conservar el historial y las inscripciones.
- El formulario de reservados guarda las solicitudes como `pendiente` hasta que se confirman o rechazan. El panel cuenta las mesas VIP y en pista por noche y permite exportar sus nombres y bebidas a PDF. Los teléfonos y comentarios se guardan para gestionar la solicitud, pero no se incluyen en el panel ni en el PDF.
- La lista de un día se cierra a las 23:00 de ese día (`cierreListaHora` en `data/config.js`, hora de Madrid).

### Protección contra abusos
| Capa | Qué hace |
|---|---|
| Filtro de nombre | Pide nombre y apellido. Solo letras, máximo 40 caracteres y 5 palabras. Rechaza tecleo aleatorio, letras repetidas, insultos y nombres de broma. Normaliza mayúsculas. |
| Token de formulario | Firmado por el servidor; no vale si se envía en menos de 3 s ni pasadas 2 h. |
| Campo trampa | Campo oculto que solo rellenan los bots: se responde "ok" y no se guarda nada. |
| Límites por IP | 5 altas cada 10 min, 15 al día y 20 intentos cada 10 min. Login del panel: 5 intentos cada 15 min. |
| Duplicados y topes | El mismo nombre no puede repetirse en una noche. Topes por noche y por RPP en `data/config.js`. En Supabase se comprueban dentro de la base de datos, así que dos altas simultáneas no se los saltan. |
| Servidor | Cuerpo máximo de 1 KB, solo JSON y campos conocidos. Cabeceras de seguridad (CSP…). Los archivos internos no se sirven. |

## Panel de la web

`/admin.html`, con la clave de `ADMIN_KEY`. Tiene dos pestañas:

- **Eventos y calendario**: un calendario por meses. Al pulsar un día puedes:
  - Marcarlo como abierto o cerrado aunque no toque (por ejemplo, abrir en Nochevieja o cerrar un sábado). Si eliges lo que ya tocaba según `data/config.js`, no se guarda ningún cambio. La lista y los reservados respetan estos cambios al momento.
  - Crear, editar o quitar su evento: nombre, DJ invitado, descripción, enlace de Instagram y foto. La foto se reduce en el navegador y se sube a la carpeta de eventos de Google Drive; al cambiarla o quitar el evento, la anterior va a la papelera de Drive.
- **Galería**: los álbumes de Drive. Para cada uno puedes cambiar el nombre que se ve en la web, elegir la portada, anclar el álbum (sale el primero) y anclar fotos (salen primero dentro del álbum). En Drive no se cambia nada. "Resetear ajustes" borra todo lo cambiado en ese álbum y lo deja como en Drive.

Lo que se cambia en el panel se guarda en la base de datos (tabla `web_contenido`) y la web lo recibe en `/api/web.js`.

La lista, los RPPs y los reservados ya no tienen panel, pero su API (`/api/admin/...`) y sus datos siguen intactos para la futura app móvil.

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
| `rpps` | `codigo` (el del link; lo genera la base de datos), `nombre`, `activo` |
| `inscripciones` | `fecha` de la noche, `nombre`, `clave` (nombre sin tildes, para duplicados), `rpp`, `creado` |
| `reservas` | Cabecera de cada solicitud: fecha, tipo de mesa, `estado` (pendiente → confirmada / rechazada; cancelada, caducada), contacto, personas, total |
| `reserva_lineas` | Bebidas de cada reserva: grupo, producto, cantidad y precio por unidad del momento |
| `tipos_mesa` | Mesas de cada tipo por noche (aforo). No se pueden confirmar más reservas que mesas |
| `vista_reservas` | Vista para gestionar las reservas desde Supabase (pedido en texto y enlace de WhatsApp) |
| `migraciones` | Migraciones de `supabase/migrations` ya aplicadas |
| `web_contenido` | Lo que se edita en el panel: una fila con los eventos, otra con los días cambiados y otra con los ajustes de la galería |

Las reservas se crean con la función `crear_reserva` (cabecera y bebidas a la vez). Para confirmar o rechazar una, cambia su `estado` en Supabase. Los teléfonos se guardan en formato internacional (`+34…`).

**Puesta en marcha (una vez por proyecto de Supabase):**
1. Aplica las migraciones de `supabase/migrations` en orden (Supabase → **SQL Editor → New query** → pega el archivo → **Run**). La `005_web_contenido.sql` es la del panel de la web y se puede ejecutar más de una vez sin perder datos.
2. Supabase → **Project Settings → API Keys**: copia la URL del proyecto y la clave secreta (`sb_secret_…`) a `SUPABASE_URL` y `SUPABASE_SECRET_KEY` en `.env`.
3. `npm run comprobar-supabase`: comprueba la lista, los reservados y el panel creando datos de prueba en la noche del 31/12/2099 y borrándolos al acabar.

La clave secreta da acceso total a la base de datos: solo en `.env` y en las variables del hosting, nunca en el código, en el README ni en GitHub. Si se filtra, genera otra en el mismo panel.

En el plan gratuito, Supabase pausa el proyecto tras 7 días sin actividad; se reactiva desde el panel.

## Tareas habituales

### Crear un evento o ponerle foto
Panel → **Eventos y calendario** → pulsa el día. Si una noche no tiene foto, se muestra el logo.

### Subir fotos a la galería
La galería lee las carpetas de Google Drive a través del Google Apps Script de `galeria.scriptUrl` en `data/config.js`. Cada carpeta es un álbum.
1. Crea una carpeta nueva en Drive (su nombre es el título del álbum) y sube las fotos.
2. Las fotos tienen que estar compartidas como "Cualquier persona con el enlace" para que se vean en la web.
3. Portada: la elegida en el panel; si no hay, la foto llamada `portada` (`portada.jpg`, `portada.png`…); si tampoco, la primera.
4. No hace falta tocar la web: el álbum aparece solo al recargar. Una carpeta vacía no se muestra.
5. Los álbumes salen del más reciente al más antiguo (los anclados en el panel, primero). Se ven los que caben en una fila y el resto con "Ver galería".

### Cerrar o abrir un día concreto
Panel → **Eventos y calendario** → pulsa el día → "Abrir" o "Cerrar". (También se puede con `cerrado` y `aperturasExtra` en `data/config.js`; lo del panel manda.)

## Publicar
La lista necesita un hosting que ejecute Node.js (Render, Railway, un VPS…); GitHub Pages no sirve. Define `ADMIN_KEY`, `FORM_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DRIVE_SCRIPT_CLAVE` y, detrás de un proxy, `TRUST_PROXY=1`. Sin Supabase, los datos se guardan en archivos JSON, que en estos hostings se pierden al redesplegar.

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
