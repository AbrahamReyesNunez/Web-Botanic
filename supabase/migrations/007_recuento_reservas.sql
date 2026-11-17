-- =========================================================
-- 007 · RECUENTO DE RESERVAS POR NOCHE (panel)
-- Igual que recuento_noches de la lista: la base de datos agrupa y
-- devuelve una fila por noche, en vez de mandar todas las reservas
-- al servidor para contarlas allí.
-- Antes se llamaba 006_recuento_reservas (coincidía en número con
-- 006_tema_web): si ya se aplicó con ese nombre, se puede volver a
-- ejecutar sin problema y su registro antiguo se borra.
-- Requiere 003. Se puede volver a ejecutar sin perder datos.
-- =========================================================
begin;

create or replace function public.recuento_reservas()
returns table (fecha date, total bigint)
language sql
stable
set search_path = ''
as $$
  select r.fecha, count(*) from public.reservas r group by r.fecha;
$$;

-- Supabase da EXECUTE a anon/authenticated por defecto en las funciones nuevas: se quita
revoke execute on function public.recuento_reservas() from public, anon, authenticated;
grant execute on function public.recuento_reservas() to service_role;

delete from public.migraciones where nombre = '006_recuento_reservas';
insert into public.migraciones (nombre) values ('007_recuento_reservas') on conflict (nombre) do nothing;

commit;
