-- =========================================================
-- 008 · RECUENTOS DEL PANEL SOLO EN UN RANGO DE FECHAS
-- recuento_noches() y recuento_reservas() agrupaban todo el histórico
-- cada vez que se abre el panel: 12 ms con una temporada, y cada
-- temporada más lo alarga. Estas versiones reciben el rango (el servidor
-- pide desde hace un año hasta dentro de un año) y usan los índices por
-- fecha de inscripciones y reservas.
-- Las funciones sin parámetros se quedan para los servidores que aún no
-- se hayan actualizado.
-- Requiere 001 y 007. Se puede volver a ejecutar sin perder datos.
-- =========================================================
begin;

create or replace function public.recuento_noches(p_desde date, p_hasta date)
returns table (fecha date, total bigint)
language sql
stable
set search_path = ''
as $$
  select i.fecha, count(*)
  from public.inscripciones i
  where i.fecha between p_desde and p_hasta
  group by i.fecha;
$$;

create or replace function public.recuento_reservas(p_desde date, p_hasta date)
returns table (fecha date, total bigint)
language sql
stable
set search_path = ''
as $$
  select r.fecha, count(*)
  from public.reservas r
  where r.fecha between p_desde and p_hasta
  group by r.fecha;
$$;

-- Supabase da EXECUTE a anon/authenticated por defecto en las funciones nuevas: se quita
revoke execute on function public.recuento_noches(date, date) from public, anon, authenticated;
revoke execute on function public.recuento_reservas(date, date) from public, anon, authenticated;
grant execute on function public.recuento_noches(date, date) to service_role;
grant execute on function public.recuento_reservas(date, date) to service_role;

insert into public.migraciones (nombre) values ('008_recuento_por_fechas') on conflict (nombre) do nothing;

commit;
