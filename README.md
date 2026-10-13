# Web de Discoteca Botanic Chipiona

Web estática (HTML + CSS + JS, sin dependencias). Se abre directamente con `index.html` o se sube tal cual a cualquier hosting (Netlify, Vercel, GitHub Pages, Hostinger…).

## Estructura

```
index.html                 Página
css/styles.css             Estilos (paleta: magenta neón + verde selva)
js/app.js                  Calendario, lista, galería, visor
data/config.js             Horarios, teléfono, dirección, días cerrados, envío de la lista
data/eventos.js            Títulos/artistas de noches concretas (opcional)
data/galeria.js            Índice de fotos (lo genera el script)
img/brand/                 Logo y fondos
img/portadas/              Portadas de cada noche
img/galeria/               Fotos hechas en la discoteca
actualizar-galeria.ps1     Regenera data/galeria.js
backend/google-apps-script.gs   Guarda la lista en Google Sheets (opcional)
```

## Tareas habituales

### Poner la portada de una noche
Descarga la portada que se sube a Instagram y guárdala con la fecha:

```
img/portadas/2026-10-17.jpg
```

Aparece sola en el calendario y en "Esta semana". Valen `.jpg`, `.jpeg`, `.png` y `.webp`.
Si un día no tiene portada se muestra el logo de Botanic.

Para añadir título, artistas, descripción o enlace al post, añade una entrada en `data/eventos.js`.

### Subir fotos de una noche a la galería
1. Crea la carpeta `img/galeria/2026-10-17` (opcional: `img/galeria/2026-10-17 Noche Tropical`).
2. Mete dentro las fotos.
3. Ejecuta:
   ```
   powershell -ExecutionPolicy Bypass -File actualizar-galeria.ps1
   ```
4. Sube los cambios al hosting.

Recomendado: reducir las fotos a unos 1600 px de lado largo antes de subirlas.

### Cerrar o abrir un día concreto
En `data/config.js`, añade la fecha a `cerrado` o a `aperturasExtra`.

## Lista
Al pulsar un día abierto en el calendario se despliega su portada con el formulario para apuntarse.
La lista se cierra a las 23:00 del mismo día (`cierreListaHora`).

- **Por defecto:** el formulario abre WhatsApp con un mensaje ya rellenado hacia el 671 434 657.
- **Con Google Sheets:** sigue las instrucciones de `backend/google-apps-script.gs`, pega la URL `/exec` en `data/config.js → lista.endpoint` y cada inscripción se guarda en una pestaña por noche.

Enlace directo a una noche: `index.html#dia=2026-10-17`.

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

Subir portadas o fotos de la galería puede hacerse directamente en `develop` sin rama propia.
