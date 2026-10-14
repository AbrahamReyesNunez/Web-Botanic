-- =========================================================
-- BASE DE DATOS DE LA LISTA DE BOTANIC (Supabase / PostgreSQL)
-- Pégalo entero en Supabase → SQL Editor → New query → Run.
-- Se puede volver a ejecutar sin perder datos.
--
-- Solo el servidor (con la clave secreta) puede leer y escribir:
-- RLS activado sin políticas y sin permisos para anon/authenticated,
-- así que la clave pública no da acceso a nada.
-- =========================================================

-- ---------- RPPs ----------
create table if not exists public.rpps (
  codigo text primary key check (codigo ~ '^[a-z0-9]{4,32}$'),
  nombre text not null check (char_length(nombre) between 1 and 60),
  activo boolean not null default true,
  creado timestamptz not null default now()
);

comment on table public.rpps is 'RPPs de la lista. Para quitar uno, pon activo = false (no lo borres: se pierde el recuento de sus inscripciones).';

-- ---------- Inscripciones ----------
create table if not exists public.inscripciones (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  nombre text not null check (char_length(nombre) between 1 and 60),
  clave text not null,                    -- nombre sin tildes ni mayúsculas, para detectar duplicados
  rpp text references public.rpps (codigo) on update cascade on delete restrict,
  creado timestamptz not null default now(),
  constraint inscripciones_nombre_unico_por_noche unique (fecha, clave)
);

create index if not exists inscripciones_fecha_rpp_idx on public.inscripciones (fecha, rpp);

-- ---------- Acceso: solo el servidor ----------
alter table public.rpps enable row level security;
alter table public.inscripciones enable row level security;

revoke all on table public.rpps, public.inscripciones from anon, authenticated;
grant select, insert, update, delete on table public.rpps, public.inscripciones to service_role;

-- ---------- Alta en la lista (atómica) ----------
-- Comprueba duplicados y topes e inserta en una sola transacción. El bloqueo
-- por noche evita que dos altas simultáneas se salten el tope.
create or replace function public.inscribir(
  p_fecha date,
  p_nombre text,
  p_clave text,
  p_rpp text,
  p_max_noche integer,
  p_max_rpp integer
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_fila public.inscripciones;
begin
  perform pg_advisory_xact_lock(hashtext('botanic_lista:' || p_fecha::text));

  if exists (select 1 from public.inscripciones where fecha = p_fecha and clave = p_clave) then
    return jsonb_build_object('ok', false, 'motivo', 'duplicado');
  end if;

  if coalesce(p_max_noche, 0) > 0
     and (select count(*) from public.inscripciones where fecha = p_fecha) >= p_max_noche then
    return jsonb_build_object('ok', false, 'motivo', 'noche_llena');
  end if;

  if p_rpp is not null and coalesce(p_max_rpp, 0) > 0
     and (select count(*) from public.inscripciones where fecha = p_fecha and rpp = p_rpp) >= p_max_rpp then
    return jsonb_build_object('ok', false, 'motivo', 'rpp_lleno');
  end if;

  insert into public.inscripciones (fecha, nombre, clave, rpp)
  values (p_fecha, p_nombre, p_clave, p_rpp)
  returning * into v_fila;

  return jsonb_build_object('ok', true, 'inscripcion', to_jsonb(v_fila));
end;
$$;

-- ---------- Recuento por noche (panel) ----------
create or replace function public.recuento_noches()
returns table (fecha date, total bigint)
language sql
stable
set search_path = ''
as $$
  select i.fecha, count(*) from public.inscripciones i group by i.fecha;
$$;

revoke execute on function public.inscribir(date, text, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.recuento_noches() from public, anon, authenticated;
grant execute on function public.inscribir(date, text, text, text, integer, integer) to service_role;
grant execute on function public.recuento_noches() to service_role;

-- ---------- RPPs de prueba (los mismos de data/db/rpps.json) ----------
insert into public.rpps (codigo, nombre, activo) values
  ('c5y1ritg', 'Prueba 1', true),
  ('e397qki6', 'Prueba 2', true),
  ('u8p4bg63', 'Prueba 3', true),
  ('1xmhuoap', 'Prueba 4', true)
on conflict (codigo) do nothing;
