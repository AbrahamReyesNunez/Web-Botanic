-- =========================================================
-- 009 · LISTA: HUELLA DEL ORIGEN Y CUPOS ANTES QUE DUPLICADOS
-- - inscripciones.origen: huella de la IP de cada alta (HMAC con la clave
--   del servidor; no se puede volver a la IP). Sirve para borrar de golpe
--   las altas de un abuso:
--     delete from public.inscripciones where fecha = '…' and origen = '…';
--   Se borra a los 30 días, con el resto de datos personales (004).
-- - inscribir() comprueba los cupos antes que los duplicados: con la noche
--   llena, la respuesta es la misma esté o no el nombre, así que no se
--   puede usar para averiguar quién está apuntado.
-- Requiere 001 y 004. Se puede volver a ejecutar sin perder datos.
-- =========================================================
begin;

alter table public.inscripciones add column if not exists origen text;
comment on column public.inscripciones.origen is 'Huella (HMAC) de la IP del alta, para borrar en bloque las de un abuso. Se borra a los 30 días.';
create index if not exists inscripciones_fecha_origen_idx on public.inscripciones (fecha, origen) where origen is not null;

-- La versión anterior no tenía p_origen. Con el valor por defecto, los
-- servidores sin actualizar pueden seguir llamándola igual
drop function if exists public.inscribir(date, text, text, text, integer, integer);

create or replace function public.inscribir(
  p_fecha date,
  p_nombre text,
  p_clave text,
  p_rpp text,
  p_max_noche integer,
  p_max_rpp integer,
  p_origen text default null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_fila public.inscripciones;
begin
  perform pg_advisory_xact_lock(hashtext('botanic_lista:' || p_fecha::text));

  if coalesce(p_max_noche, 0) > 0
     and (select count(*) from public.inscripciones where fecha = p_fecha) >= p_max_noche then
    return jsonb_build_object('ok', false, 'motivo', 'noche_llena');
  end if;

  if p_rpp is not null and coalesce(p_max_rpp, 0) > 0
     and (select count(*) from public.inscripciones where fecha = p_fecha and rpp = p_rpp) >= p_max_rpp then
    return jsonb_build_object('ok', false, 'motivo', 'rpp_lleno');
  end if;

  if exists (select 1 from public.inscripciones where fecha = p_fecha and clave = p_clave) then
    return jsonb_build_object('ok', false, 'motivo', 'duplicado');
  end if;

  insert into public.inscripciones (fecha, nombre, clave, rpp, origen)
  values (p_fecha, p_nombre, p_clave, p_rpp, p_origen)
  returning * into v_fila;

  return jsonb_build_object('ok', true, 'inscripcion', to_jsonb(v_fila));
end;
$$;

revoke execute on function public.inscribir(date, text, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.inscribir(date, text, text, text, integer, integer, text) to service_role;

-- Retención (004): además del nombre, se borra la huella del origen
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
     set nombre = 'Anonimizado', clave = 'anonimizado:' || id::text, origen = null
   where fecha < v_limite and (clave not like 'anonimizado:%' or origen is not null);
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

insert into public.migraciones (nombre) values ('009_lista_origen') on conflict (nombre) do nothing;

commit;
