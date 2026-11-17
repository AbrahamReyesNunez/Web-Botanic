-- =========================================================
-- 004 · RETENCIÓN DE DATOS PERSONALES (30 días)
-- Cada día, pasados 30 días desde la noche:
-- - Lista: el nombre pasa a "Anonimizado" (la fila se queda: noche y RPP
--   siguen contando para las estadísticas).
-- - Reservas: se borran nombre, teléfono y comentarios (se quedan mesa,
--   pedido, importe, RPP y estado).
-- Además, las peticiones que siguen "pendiente" cuando la noche ya pasó
-- quedan como "caducada".
-- Usa pg_cron (Supabase lo incluye). Requiere 001 y 003.
-- Para probarla a mano: select public.anonimizar_antiguos(30);
-- =========================================================
begin;

create or replace function public.anonimizar_antiguos(p_dias integer default 30)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_limite date;
  v_inscripciones integer;
  v_reservas integer;
  v_caducadas integer;
begin
  if p_dias is null or p_dias < 1 then
    raise exception 'p_dias tiene que ser 1 o más';
  end if;
  v_limite := v_hoy - p_dias;

  -- "clave" debe seguir siendo única por noche: se sustituye por una basada en el id
  update public.inscripciones
     set nombre = 'Anonimizado', clave = 'anonimizado:' || id::text
   where fecha < v_limite and clave not like 'anonimizado:%';
  get diagnostics v_inscripciones = row_count;

  update public.reservas
     set nombre = null, telefono = null, notas = null
   where fecha < v_limite and nombre is not null;
  get diagnostics v_reservas = row_count;

  update public.reservas
     set estado = 'caducada'
   where estado = 'pendiente' and fecha < v_hoy;
  get diagnostics v_caducadas = row_count;

  return jsonb_build_object('inscripciones', v_inscripciones, 'reservas', v_reservas, 'caducadas', v_caducadas);
end;
$$;

revoke execute on function public.anonimizar_antiguos(integer) from public, anon, authenticated;
grant execute on function public.anonimizar_antiguos(integer) to service_role;

-- Todos los días a las 11:00 UTC (12:00 o 13:00 en Chipiona): la noche anterior ya ha terminado
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('botanic-anonimizar', '0 11 * * *', $$select public.anonimizar_antiguos(30)$$);

insert into public.migraciones (nombre) values ('004_retencion') on conflict (nombre) do nothing;

commit;
