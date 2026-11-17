# Web de Discoteca Botanic Chipiona

Web de la discoteca Botanic (Chipiona) con agenda de eventos, galería de fotos, petición de mesas VIP y **lista por RPP**. Incluye un panel de administración para gestionar eventos, días de apertura, galería y estilo de la web.

## Índice

1. [Cómo funciona](#1-cómo-funciona)
2. [Primeros pasos (en tu ordenador)](#2-primeros-pasos-en-tu-ordenador)
3. [Estructura del proyecto](#3-estructura-del-proyecto)
4. [Tareas habituales (guía rápida)](#4-tareas-habituales-guía-rápida)
5. [Lista y RPPs](#5-lista-y-rpps)
6. [Reservas](#6-reservas)
7. [Panel de la web](#7-panel-de-la-web)
8. [Galería y Google Apps Script](#8-galería-y-google-apps-script)
9. [Base de datos (Supabase)](#9-base-de-datos-supabase)
10. [Seguridad y protección contra abusos](#10-seguridad-y-protección-contra-abusos)
11. [Publicar la web](#11-publicar-la-web)
12. [Trabajar en equipo con Git](#12-trabajar-en-equipo-con-git)
13. [Problemas frecuentes](#13-problemas-frecuentes)

---

## 1. Cómo funciona

```
   Navegador (web pública y panel /admin.html)
          │   solo habla con el servidor
          ▼
   Servidor Node.js  (carpeta server/)
          │
          ├──►  Supabase (PostgreSQL en la nube): lista, RPPs, reservas y contenido del panel
          │     ─ o, si no está configurado, archivos JSON en data/db/ (solo para desarrollo)
          │
          └──►  Google Apps Script ──► Google Drive: álbumes de la galería y fotos de eventos
```

- El **servidor** sirve la web (solo la carpeta `public/`), recibe las altas de la lista y las peticiones de reserva, y aplica todas las comprobaciones de seguridad.
- El **navegador nunca se conecta directamente a Supabase**: todo pasa por el servidor.
- Las **fotos** están en Google Drive. Un Google Apps Script lista los álbumes y sube las fotos de los eventos.
- Las **reservas y los RPPs** se gestionan, de momento, desde el panel de Supabase. Hay una API de administración preparada para una futura app móvil.

---

## 2. Primeros pasos (en tu ordenador)

### Requisitos
- [Node.js](https://nodejs.org) **22 o superior** (lo exige `@supabase/supabase-js`). Comprueba tu versión con `node -v`.
- Git.
- Opcional: acceso al proyecto de Supabase. Sin él, la web funciona igual con archivos JSON.

### Instalación

```
git clone https://github.com/AbrahamReyesNunez/Web-Botanic.git
cd Web-Botanic
git checkout develop        # la rama de trabajo (ver sección 12)
npm install                 # instala la librería de Supabase
copy .env.example .env      # en Mac/Linux: cp .env.example .env
```

Abre `.env` y cambia al menos `ADMIN_KEY` (ver la tabla de abajo). Después:

```
npm start                   # web: http://localhost:3000   ·   panel: http://localhost:3000/admin.html
npm test                    # ejecuta las pruebas automáticas (carpeta test/)
```

Al arrancar, la consola dice dónde se guardan los datos: `Datos: Supabase` o `Datos: data/db (JSON)`.

> Si abres `public/index.html` directamente, sin el servidor, la web se ve, pero la lista y las reservas no pueden enviar.

### Variables del archivo `.env`

`.env` guarda las claves y **nunca se sube a GitHub**. La plantilla, comentada, es `.env.example`.

| Variable | Para qué sirve | ¿Obligatoria? |
|---|---|---|
| `ADMIN_KEY` | Clave para entrar en `/admin.html`. Debe tener 20 caracteres o más. Con la clave de ejemplo el servidor **no arranca**, y si es más corta avisa. Si no la defines, se genera una temporal y se muestra en la consola. | Sí |
| `FORM_SECRET` | Texto largo y aleatorio para firmar los formularios y la huella de origen de la lista. Si está vacío se genera uno al arrancar: los formularios abiertos caducan al reiniciar. | En producción |
| `PORT` | Puerto del servidor (por defecto `3000`). | No |
| `TRUST_PROXY` | `0` sin proxy (en local), `1` con proxy en el mismo equipo (`cloudflared`, Nginx) y `remoto` con proxy en otra máquina (Render, Railway…). Ver [sección 11](#11-publicar-la-web). | En producción |
| `HOST` | Dirección en la que escucha el servidor. Por defecto es `127.0.0.1` con `TRUST_PROXY=1` y todas las demás veces escucha en todas. | No |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Conexión a la base de datos (ver [sección 9](#9-base-de-datos-supabase)). Sin ellas, los datos van a `data/db/` en JSON. | En producción |
| `DRIVE_SCRIPT_CLAVE` | Clave para que el panel suba fotos de eventos a Drive (ver [sección 8](#8-galería-y-google-apps-script)). Sin ella, el panel funciona pero no puede subir fotos. | Para subir fotos |

### Modo JSON y modo Supabase

| | Modo JSON (sin `SUPABASE_*`) | Modo Supabase |
|---|---|---|
| Dónde se guarda | `data/db/*.json` | Base de datos en la nube |
| Para qué | Desarrollo y pruebas | Producción |
| RPPs | `data/db/rpps.json` trae RPPs de prueba | Tabla `rpps` |
| Datos personales | No se anonimizan | Se anonimizan a los 30 días |

---

## 3. Estructura del proyecto

```
public/                          Lo ÚNICO que el servidor sirve a internet
  index.html                     Web pública
  admin.html                     Panel de la web (eventos, días, galería y estilo)
  404.html                       Página de "no encontrado"
  css/styles.css · admin.css     Estilos de la web y del panel
  css/temas.css                  Estilos de cada época (Navidad, Halloween, Carnaval)
  js/app.js                      Calendario, lista, reservas, galería y efectos de la web
  js/admin.js                    Panel de la web
  js/arranque.js                 Lo primero que se ejecuta: aplica el estilo de la época antes de pintar
  js/temas.js                    Adornos y partículas de cada época
  js/compartido/                 Código que usan la web, el panel y el servidor
    dom.js                       $ y esc() de la web y el panel
    calendario.js                Días de apertura y cierre de la lista
    nombre.js                    Filtro y normalización de nombres
    reservas.js                  Precios, buscador y teléfono de las reservas
  data/config.js                 ⚙ Horarios, contacto, días cerrados, topes de la lista, URL de la galería
  data/reservados.js             ⚙ Mesas, precios y bebidas de los reservados
  data/eventos.js                Nombre por defecto de cada noche (los eventos se crean en el panel)
  img/                           Logo y fondos (las fotos de la galería están en Google Drive)

server/                          Servidor (no se sirve)
  server.js                      Punto de entrada: rutas, cabeceras de seguridad, caché y compresión
  lista.js · reservas.js         Lógica de la lista y de las reservas
  admin.js                       Inicio de sesión del panel y API de administración
  limites.js                     Límites de peticiones por IP
  formulario.js                  Token de seguridad de los formularios
  contenido.js                   Eventos, días y ajustes de galería del panel (/api/web.js)
  galeria.js                     Copia de los álbumes de Drive (/api/galeria), renovada cada 10 min
  drive.js                       Subida de fotos de eventos a Drive a través del Apps Script
  almacen-supabase.js            Datos en Supabase (producción)
  almacen.js                     Datos en JSON (local y pruebas)
  comprobar-supabase.js          Comprobación de la conexión (npm run comprobar-supabase)

supabase/migrations/             Cambios de la base de datos, numerados (001 … 009)
google-apps-script/Codigo.gs     Código del Apps Script de la galería (se pega en Google Apps Script)
data/db/                         Solo en modo JSON. Solo rpps.json (con RPPs de prueba) está en GitHub
test/                            Pruebas automáticas (node --test)
documentacion/                   Documentos del proyecto (las revisiones de seguridad no se suben)
```

Los archivos marcados con ⚙ son los que se editan a mano para cambiar la configuración. Lo que no está en `public/` (`.env`, `data/db/`, el código del servidor y la documentación) **nunca se sirve** a internet.

---

## 4. Tareas habituales (guía rápida)

| Quiero… | Dónde | Detalles |
|---|---|---|
| Crear un evento o ponerle foto | Panel → **Eventos y calendario** → pulsa el día | [§7](#7-panel-de-la-web) |
| Abrir o cerrar un día concreto | Panel → **Eventos y calendario** → pulsa el día → "Abrir" o "Cerrar" | [§7](#7-panel-de-la-web) |
| Cambiar el estilo (Navidad, Halloween…) | Panel → **Estilo de la web**, arriba del todo | [§7](#7-panel-de-la-web) |
| Subir un álbum a la galería | Crear una carpeta en Google Drive | [§8](#8-galería-y-google-apps-script) |
| Añadir o desactivar un RPP | Supabase → Table Editor → `rpps` | [§5](#5-lista-y-rpps) |
| Ver la lista de una noche | Supabase → Table Editor → `inscripciones` | [§5](#5-lista-y-rpps) |
| Confirmar o rechazar una reserva | Supabase → Table Editor → `reservas` (columna `estado`) | [§6](#6-reservas) |
| Cambiar cuántas mesas hay | Supabase → Table Editor → `tipos_mesa` (columna `mesas`) | [§6](#6-reservas) |
| Cambiar precios o bebidas | `public/data/reservados.js` y reiniciar el servidor | [§6](#6-reservas) |
| Cambiar horarios, contacto o días de apertura | `public/data/config.js` | [§7](#7-panel-de-la-web) |

Si una noche no tiene foto de evento, se muestra el logo.

---

## 5. Lista y RPPs

### Cómo se apunta la gente
- La lista pide solo **nombre y apellidos**. El campo **RPP** no se puede editar a mano:
  - Con el link de un RPP (`https://dominio/?rpp=CÓDIGO`) se abre directamente la lista de la próxima noche, que queda fijada a ese RPP aunque la persona navegue por la web.
  - Cada RPP tiene también un link de reservados (`https://dominio/?reserva=CÓDIGO`). Abre la web en la sección de reservados y la reserva queda asignada a ese RPP. Cada link cuenta solo para lo suyo.
  - Quien entra sin link queda en **"Sin RPP"**. Así nadie puede asignarse un RPP a mano.
- La lista de una noche se abre **7 días antes** (`lista.diasAntelacion`) y se cierra **a las 23:00** de ese día (`cierreListaHora`). Las dos cosas están en `public/data/config.js` y usan la hora de Madrid.
- Topes por noche y por RPP: `lista.maxPorNoche` y `lista.maxPorRppNoche` en `public/data/config.js`.

### Gestionar los RPPs
- **Añadir un RPP:** Supabase → **Table Editor → rpps → Insert row**. Escribe solo su `nombre`: el `codigo` del link se genera solo. No puede haber dos RPPs con el mismo nombre.
- **Desactivar un RPP:** pon `activo` en `false`. No borres la fila, así se conservan sus inscripciones.
- Los cambios tardan hasta 30 s en verse en la web.
- En modo JSON se hace lo mismo en `data/db/rpps.json`.

### Ver la lista
Supabase → **Table Editor → inscripciones** (filtra por `fecha` y `rpp`).

La API de administración (`/api/admin/noches`, `resumen`, `reservas`, `rpps`, `rpp/:codigo` e `inscripcion/:id`) no tiene pantalla en la web: se mantiene para la futura app móvil.

---

## 6. Reservas

La web no hace reservas directas, sino **peticiones**. Entran como `pendiente` y el equipo las confirma o las rechaza, de momento desde Supabase y más adelante desde la app.

### Estados
```
 pendiente ──► confirmada
     │    └──► rechazada
     ├──────► cancelada   (la anula el cliente)
     └──────► caducada    (la noche pasó sin decidirla; se pone sola)
```

### Gestión diaria
- **Confirmar o rechazar:** Supabase → **Table Editor → reservas** y cambia `estado`. Para leerlas con comodidad, usa **vista_reservas**: una fila por reserva con el pedido en texto, el RPP y un enlace de WhatsApp al cliente.
- **Aforo:** `tipos_mesa.mesas` dice cuántas mesas hay de cada tipo (pista 30, VIP 7). Solo cuentan las **confirmadas**: mientras queden mesas sin confirmar, se siguen aceptando peticiones. Con todas confirmadas, ese tipo se bloquea esa noche en la web (pista y VIP por separado) y la base de datos no deja confirmar ni una más. Si cambias `mesas`, la web lo nota en unos 30 s.
- **Precios y bebidas:** están en `public/data/reservados.js` y los calcula el servidor; lo que mande el navegador no cuenta. Cada línea guarda el precio del momento. **Después de cambiarlos, reinicia el servidor** (`npm start`) para que los use.

### Reglas de las peticiones
- Una petición activa por teléfono y noche. Si el teléfono ya tiene una, se responde como si se hubiera recibido, pero no se guarda: así nadie puede averiguar si un número ha reservado. El equipo ve la primera.
- El teléfono va en formato internacional.
- Hasta 5 personas por botella.
- El pedido se comprueba contra el catálogo.
- Límites por IP: ver [sección 10](#10-seguridad-y-protección-contra-abusos).

---

## 7. Panel de la web

Entra en `/admin.html` con la clave de `ADMIN_KEY`. Lo que se cambia en el panel se guarda en la base de datos (tabla `web_contenido`) y la web lo recibe en `/api/web.js`.

### Estilo de la web (arriba del todo)
Las opciones son **Verano, Navidad, Halloween o Carnaval**. Verano es el estilo de siempre. Los demás mantienen la estructura, las letras y el neón magenta, y añaden un color secundario y adornos:
- **Navidad:** dorado y rojo, gorro de Papá Noel en la Ø del logo, guirnalda de luces, bolas colgando y nieve.
- **Halloween:** naranja y morado, sombrero de bruja, telarañas, araña, calabazas encendidas y murciélagos que cruzan de vez en cuando.
- **Carnaval (de Cádiz):** amarillo y azul, antifaz, serpentinas, papelillos y guitarra, bombo, caja y pito de caña en neón.

Las partículas (nieve, papelillos, murciélagos) no se muestran si el dispositivo tiene activado "reducir movimiento" ni en equipos lentos. El estilo se ve al recargar la web.

### Pestaña "Eventos y calendario"
Muestra un calendario por meses. Al pulsar un día puedes:
- **Abrirlo o cerrarlo** aunque no toque (por ejemplo, abrir en Nochevieja o cerrar un sábado). Si eliges lo que ya tocaba según `public/data/config.js`, no se guarda ningún cambio. La lista y los reservados respetan estos cambios al momento.
- **Crear, editar o quitar su evento**: nombre, DJ invitado, descripción, enlace de Instagram y foto. La foto se reduce en el navegador y se sube a la carpeta de eventos de Google Drive. Al cambiarla o quitar el evento, la foto anterior va a la papelera de Drive.

Los días de apertura habituales se configuran en `public/data/config.js` (`diasAbierto`, `horarios`, `cerrado` y `aperturasExtra`). Si chocan con lo marcado en el panel, manda el panel.

### Pestaña "Galería"
Muestra los álbumes de Drive. Para cada uno puedes cambiar el nombre que se ve en la web, elegir la portada, anclar el álbum para que salga el primero y anclar fotos para que salgan primero dentro del álbum. En Drive no se cambia nada. "Resetear ajustes" borra todo lo cambiado en ese álbum y lo deja como está en Drive.

---

## 8. Galería y Google Apps Script

### Subir fotos a la galería
La galería lee las carpetas de Google Drive a través del Apps Script cuya URL está en `galeria.scriptUrl` (`public/data/config.js`). **Cada carpeta es un álbum.**

1. Crea una carpeta nueva dentro de la carpeta de la galería en Drive. Su nombre será el título del álbum.
2. Sube las fotos y compártelas como **"Cualquier persona con el enlace"**. Si no, no se ven en la web.
3. Portada: la elegida en el panel. Si no hay, la foto llamada `portada` (`portada.jpg`, `portada.png`…) y, si tampoco existe, la primera.
4. No hace falta tocar la web: el álbum aparece solo en **10 minutos como mucho**. El servidor guarda una copia de la lista de álbumes para no llamar a Google en cada visita, y reiniciar el servidor la renueva al momento. El panel siempre ve la lista al día. Las carpetas vacías no se muestran.
5. Los álbumes salen del más reciente al más antiguo, con los anclados primero. Se ven los que caben en una fila y el resto con "Ver galería".

### Configurar o actualizar el Apps Script
El código completo está en `google-apps-script/Codigo.gs`. Repite estos pasos cada vez que cambie ese archivo:

1. Abre el proyecto en [Google Apps Script](https://script.google.com), sustituye todo el código por el de `Codigo.gs` y guarda.
2. Arriba, elige la función `configurarClave` y pulsa **Ejecutar** (la primera vez, acepta los permisos). Esto crea la clave y la carpeta "Botanic · Fotos de eventos" en tu Drive. En el registro salen dos líneas:
   - `DRIVE_SCRIPT_CLAVE=…` → cópiala al `.env` del servidor.
   - `const HASH_CLAVE = "…";` → sustitúyela por la línea `HASH_CLAVE` del código y guarda. Así una petición anónima no gasta la cuota de la cuenta de Google.
3. **Implementar → Gestionar implementaciones → lápiz (Editar) → Versión: "Nueva versión" → Implementar** (con "Ejecutar como: yo" y "Quién tiene acceso: cualquier usuario"). Editar la implementación existente hace que la URL no cambie. Si creas una implementación nueva, actualiza `galeria.scriptUrl`.
4. Reinicia el servidor (`npm start`).

---

## 9. Base de datos (Supabase)

Supabase es una base de datos PostgreSQL en la nube con un panel web. Solo el servidor habla con ella, usando la clave secreta del `.env`. Las tablas tienen RLS activado y la clave pública no tiene permisos.

### Puesta en marcha (una vez por proyecto de Supabase)
1. Aplica **todas** las migraciones de `supabase/migrations/` en orden (ver abajo). La 001 también funciona sobre una base de datos que ya tuviera el antiguo `schema.sql`, sin perder datos.
2. Supabase → **Project Settings → API Keys**: copia la URL del proyecto y la clave secreta (`sb_secret_…`) a `SUPABASE_URL` y `SUPABASE_SECRET_KEY` en `.env`.
3. Ejecuta `npm run comprobar-supabase`. Lee los RPPs, apunta y borra un nombre de prueba y una reserva de prueba (en la noche del 31/12/2099) y comprueba la tabla del panel.

### Migraciones
Cada cambio de la base de datos es un archivo numerado en `supabase/migrations/`:

| Nº | Qué añade |
|---|---|
| 001 | Tablas iniciales (RPPs e inscripciones) |
| 002 | Mejoras de los RPPs |
| 003 | Reservas |
| 004 | Borrado de datos personales a los 30 días (pg_cron) |
| 005 | Contenido del panel de la web |
| 006 | Estilo de la época |
| 007 | Recuento de reservas en la base de datos |
| 008 | Recuentos por rango de fechas |
| 009 | Huella del origen de las altas de la lista |

- Se aplican **una sola vez y en orden**: Supabase → **SQL Editor → New query**, pega el archivo entero y pulsa **Run**.
- La tabla `migraciones` indica cuáles tiene ya tu base de datos.
- Para un cambio nuevo, crea el siguiente número (`010_….sql`). **No edites las migraciones ya aplicadas.**

### Tablas

| Tabla | Contenido |
|---|---|
| `rpps` | `codigo` (el del link, automático), `nombre`, `activo` |
| `inscripciones` | `fecha` de la noche, `nombre`, `clave` (nombre sin tildes, para detectar duplicados), `rpp`, `origen` (huella de la IP), `creado` |
| `tipos_mesa` | `tipo` (`pista`, `vip`), `nombre`, `mesas` (aforo por noche) |
| `reservas` | `fecha`, `tipo`, `estado`, `nombre`, `telefono`, `personas`, `rpp`, `notas`, `total` (€), `a_consultar`, `creado`, `decidido` |
| `reserva_lineas` | `reserva`, `grupo`, `producto`, `cantidad`, `precio` por unidad (null: a consultar) |
| `vista_reservas` | Vista para leer las reservas: pedido en texto, RPP y enlace de WhatsApp |
| `web_contenido` | Lo que se edita en el panel: eventos, días cambiados, ajustes de la galería y estilo de la época |
| `migraciones` | Migraciones aplicadas |

### Datos personales
Se guardan **30 días** después de cada noche. Cada día (pg_cron, migración 004), los nombres de la lista pasan a "Anonimizado" y las reservas pierden el nombre, el teléfono y los comentarios. Las filas se quedan para las estadísticas. En modo JSON (solo local) no se anonimiza nada.

### La clave secreta
Da acceso total a la base de datos. Ponla **solo** en `.env` y en las variables del hosting: nunca en el código, en el README ni en GitHub. Si se filtra, genera otra en el mismo panel de Supabase.

### Pausa del plan gratuito
Supabase pausa el proyecto tras 7 días sin actividad. Mientras el servidor esté encendido no ocurre: cada 12 horas hace una consulta mínima, aunque no haya visitas, y si Supabase no responde lo escribe en el registro. Si se llega a pausar, se reactiva desde el panel de Supabase con **Restore**.

---

## 10. Seguridad y protección contra abusos

| Capa | Qué hace |
|---|---|
| Filtro de nombre | Pide nombre y apellido. Solo letras, máximo 40 caracteres y 5 palabras. Rechaza tecleo aleatorio, letras repetidas, insultos y nombres de broma. Normaliza las mayúsculas. |
| Token de formulario | Lo firma el servidor. No vale si se envía en menos de 3 s ni pasadas 2 h. |
| Campo trampa | Un campo oculto que solo rellenan los bots. Se les responde "ok" y no se guarda nada. |
| Límites por IP (lista) | 5 altas cada 10 min, 15 al día, 5 por noche y 20 intentos cada 10 min. |
| Límites por IP (reservas) | 3 peticiones por hora y 6 al día. Una petición rechazada no gasta. |
| Límites por IP (panel) | 5 intentos de clave cada 15 min. |
| Sin carreras | Los huecos de los límites se cogen antes de esperar a la base de datos, así que muchas peticiones a la vez no se los saltan. En Supabase, los topes se comprueban dentro de la propia base de datos. |
| Duplicados y topes | El mismo nombre no puede repetirse en una noche. Si ya está, se responde igual que a un alta nueva (sin guardarla), para que la lista no sirva para averiguar quién va. Los topes se comprueban antes que los duplicados. |
| Huella del origen | Cada alta guarda una huella de la IP (`origen`), no la IP. Con `FORM_SECRET` fijo, la misma IP da siempre la misma huella. Se borra a los 30 días con el resto de datos personales. |
| Servidor | Cuerpo máximo de 1 KB (8 KB en reservas), solo JSON con campos conocidos, conexiones con tiempo máximo y cabeceras de seguridad (CSP…). Solo se sirve `public/`. |

**Borrar de golpe las altas de un abuso:** Supabase → SQL Editor:
```sql
delete from inscripciones where fecha = 'AAAA-MM-DD' and origen = '…';
```

---

## 11. Publicar la web

### Dónde
La web necesita un servidor que ejecute **Node.js 22 o superior**: un PC o VPS con `cloudflared`, Render, Railway… **GitHub Pages no sirve.**

### Configuración de producción (`.env` o variables del hosting)
- `ADMIN_KEY` de 20 caracteres o más.
- `FORM_SECRET` fijo, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` y `DRIVE_SCRIPT_CLAVE`. Sin Supabase, los datos se guardan en `data/db/`, que en un hosting se pierde al redesplegar.
- **`TRUST_PROXY`**, para que los límites por IP vean la IP real de cada visitante:
  - `1` con el túnel de Cloudflare (`cloudflared`) en el mismo equipo. La IP se lee del final de `X-Forwarded-For` solo si la conexión viene del propio equipo, y el servidor escucha solo en 127.0.0.1: nadie llega al puerto sin pasar por el túnel. **Sin esto**, todas las visitas llegarían desde 127.0.0.1 y compartirían los límites (5 fallos de clave de cualquiera bloquearían el panel).
  - `remoto` en un hosting con el proxy en otra máquina (Render, Railway…).
  - `0` sin proxy.

### Supervisor
Ejecuta el servidor con algo que lo vuelva a arrancar si se cae: pm2, un servicio de Windows, systemd o el propio hosting. Ante un error inesperado, el servidor lo escribe en el registro y se cierra para volver a arrancar limpio.

### Cloudflare
En el dominio, activa *SSL/TLS → Edge Certificates → Always Use HTTPS*. El servidor ya manda `Strict-Transport-Security`, y la cookie del panel va con `Secure` cuando está detrás del proxy.

### Caché: cómo hacer que se vean los cambios
El servidor comprime HTML, CSS y JS (brotli o gzip) y manda un `ETag` con cada archivo, así que en una visita repetida el navegador solo pregunta «¿ha cambiado?». Por eso, al cambiar un archivo:

| Archivo | Qué hacer |
|---|---|
| CSS o JS enlazado con `?v=` en el HTML (`styles.css?v=18`, `app.js?v=19`…) | **Sube el número** en el HTML. Con `?v=`, el navegador guarda el archivo un año sin preguntar. |
| Imágenes de `public/img/` | Se guardan una semana. Para cambiar una, usa otro nombre de archivo (o añade `?v=`). |
| HTML, `public/data/*.js` y `public/js/compartido/*.js` | Nada: los cambios se ven al momento. |

---

## 12. Trabajar en equipo con Git

### Las ramas
Una rama es una línea de trabajo independiente. Así cada persona trabaja en lo suyo sin romper la versión que funciona.

| Rama | Para qué |
|------|----------|
| `main` | Versión publicada. Solo se actualiza desde `develop`. |
| `develop` | Rama de trabajo común. Aquí se junta todo antes de publicar. |
| `feature/<nombre>` | Una por cambio (por ejemplo, `feature/galeria-octubre`). Sale de `develop` y vuelve a `develop`. |

```
 feature/mi-cambio        ●───●───●
                         /         \   (pull request)
 develop        ───●────●───────────●────────●
                                              \   (pull request para publicar)
 main           ───●───────────────────────────●
```

### Pasos para hacer un cambio
```
git checkout develop && git pull           # 1. ponte al día
git checkout -b feature/mi-cambio          # 2. crea tu rama
# ...haz los cambios...
npm test                                   # 3. comprueba que todo sigue funcionando
git add -A && git commit -m "Describe el cambio"
git push -u origin feature/mi-cambio       # 4. súbela a GitHub
```
5. En GitHub, abre un **pull request** de `feature/mi-cambio` a `develop`. La otra persona lo revisa y lo fusiona.
6. Para publicar, abre un pull request de `develop` a `main`.

### Comandos útiles
| Comando | Qué hace |
|---|---|
| `git status` | Qué archivos has cambiado y en qué rama estás |
| `git fetch` | Mira qué hay nuevo en GitHub sin tocar tus archivos |
| `git pull` | Trae los cambios de GitHub a tu rama |
| `git log --oneline --graph --all` | Dibuja el árbol de ramas y commits |

---

## 13. Problemas frecuentes

| Problema | Causa y solución |
|---|---|
| El servidor no arranca y habla de `ADMIN_KEY` | Estás usando la clave de ejemplo de `.env.example`. Pon una tuya de 20 caracteres o más. |
| La consola dice `Datos: data/db (JSON)` y querías Supabase | Faltan `SUPABASE_URL` o `SUPABASE_SECRET_KEY` en `.env`. Comprueba la conexión con `npm run comprobar-supabase`. |
| Error de Supabase sobre una tabla o función que no existe | Falta aplicar alguna migración. Mira la tabla `migraciones` y aplica las que falten, en orden. |
| Supabase no responde | El proyecto puede estar pausado. Ve al panel de Supabase y pulsa **Restore**. |
| El panel no puede subir fotos | Falta `DRIVE_SCRIPT_CLAVE` en `.env` o el Apps Script no está actualizado ([§8](#8-galería-y-google-apps-script)). |
| Un álbum nuevo no aparece | Espera hasta 10 min o reinicia el servidor. Comprueba que la carpeta no está vacía y que las fotos se comparten "con el enlace". |
| No se ve un cambio de CSS o JS | Sube el número `?v=` en el HTML ([§11](#11-publicar-la-web)). |
| Un cambio de precios no se aplica | Reinicia el servidor después de editar `public/data/reservados.js`. |
| La lista dice que está cerrada | Se abre 7 días antes y se cierra a las 23:00 del día. Comprueba también que el día está abierto (panel o `config.js`). |
| La lista o las reservas no envían | Estás abriendo `index.html` sin el servidor. Usa `npm start` y entra en `http://localhost:3000`. |
| `npm install` o `npm start` fallan con errores raros | Comprueba que tienes Node 22 o superior (`node -v`). |
