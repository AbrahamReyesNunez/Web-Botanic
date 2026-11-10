-- =========================================================
-- 005 · Contenido de la web que se edita desde el panel (/admin.html)
-- Una fila por sección; el servidor la lee al arrancar y la web la recibe en /api/web.js.
--
-- Se puede ejecutar más de una vez sin perder datos.
-- A mano: Supabase → SQL Editor → New query → pega este archivo → Run.
-- =========================================================

create table if not exists public.web_contenido (
  seccion text primary key check (seccion in ('eventos', 'dias', 'galeria')),
  valor jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);

comment on table public.web_contenido is
  'Contenido de la web editado desde el panel. eventos: { "AAAA-MM-DD": { titulo, dj, descripcion, instagram, foto } } (foto = id de Google Drive). '
  'dias: { "AAAA-MM-DD": "cerrado" | "abierto" }. galeria: { "idCarpetaDrive": { nombre, portada, anclado, fotosAncladas } }.';

-- Solo el servidor (clave secreta) puede leer y escribir
alter table public.web_contenido enable row level security;
revoke all on table public.web_contenido from anon, authenticated;
grant select, insert, update, delete on table public.web_contenido to service_role;
