-- =========================================================
-- 006 · ESTILO DE LA WEB SEGÚN LA ÉPOCA
-- Nueva sección "ajustes" en web_contenido: { "tema": "verano" | "navidad" | "halloween" | "carnaval" }.
-- Se cambia desde el panel (/admin.html → Estilo de la web).
-- Requiere 005. Se puede volver a ejecutar sin perder datos.
-- =========================================================
begin;

alter table public.web_contenido drop constraint if exists web_contenido_seccion_check;
alter table public.web_contenido add constraint web_contenido_seccion_check
  check (seccion in ('eventos', 'dias', 'galeria', 'ajustes'));

comment on table public.web_contenido is 'Contenido de la web editado desde el panel (/admin.html): eventos, días abiertos o cerrados, ajustes de la galería y estilo de la web según la época.';

insert into public.migraciones (nombre) values ('006_tema_web') on conflict (nombre) do nothing;

commit;
