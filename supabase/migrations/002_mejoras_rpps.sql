-- =========================================================
-- 002 · MEJORAS DE RPPs E INSCRIPCIONES
-- - El código del RPP se genera solo (8 caracteres): para dar de alta un RPP
--   en el Table Editor basta con escribir su nombre.
-- - Dos RPPs no pueden llamarse igual (sin distinguir mayúsculas).
-- - Índice para la columna rpp de inscripciones (relación sin índice).
-- Requiere 001.
-- =========================================================
begin;

-- 8 caracteres hexadecimales (0-9, a-f) al azar: cumplen el formato de codigo
create or replace function public.nuevo_codigo_rpp()
returns text
language sql
volatile
set search_path = ''
as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
$$;

revoke execute on function public.nuevo_codigo_rpp() from public, anon, authenticated;
grant execute on function public.nuevo_codigo_rpp() to service_role;

alter table public.rpps alter column codigo set default public.nuevo_codigo_rpp();

create unique index if not exists rpps_nombre_unico on public.rpps (lower(nombre));

create index if not exists inscripciones_rpp_idx on public.inscripciones (rpp);

insert into public.migraciones (nombre) values ('002_mejoras_rpps') on conflict (nombre) do nothing;

commit;
