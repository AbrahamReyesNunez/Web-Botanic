-- =========================================================
-- 005 · CONTENIDO DE LA WEB (panel /admin.html)
-- Una fila por sección; el servidor la lee al arrancar y la web la recibe en /api/web.js:
-- - eventos: { "AAAA-MM-DD": { titulo, dj, descripcion, instagram, foto } }  (foto = id de Google Drive)
-- - dias:    { "AAAA-MM-DD": "cerrado" | "abierto" }  (mandan sobre data/config.js)
-- - galeria: { "idCarpetaDrive": { nombre, portada, anclado, fotosAncladas: [idFoto, …] } }
-- Requiere 001. Se puede volver a ejecutar sin perder datos.
-- =========================================================
begin;

create table if not exists public.web_contenido (
  seccion text primary key check (seccion in ('eventos', 'dias', 'galeria')),
  valor jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);

comment on table public.web_contenido is 'Contenido de la web editado desde el panel (/admin.html): eventos, días abiertos o cerrados y ajustes de la galería.';

-- Solo el servidor (clave secreta) puede leer y escribir
alter table public.web_contenido enable row level security;
revoke all on table public.web_contenido from anon, authenticated;
grant select, insert, update, delete on table public.web_contenido to service_role;

insert into public.migraciones (nombre) values ('005_web_contenido') on conflict (nombre) do nothing;

commit;
