-- =========================================================
-- 003 · RESERVAS DE MESA
-- - tipos_mesa: cuántas mesas hay de cada tipo cada noche (aforo).
-- - reservas: una petición por fila. Entra como "pendiente" y se confirma
--   o rechaza cambiando "estado" (la futura app o el Table Editor).
-- - reserva_lineas: lo pedido, con el precio de ese momento.
-- - Aforo: la base de datos no deja tener más reservas confirmadas que mesas
--   de un tipo en una noche, venga el cambio de donde venga.
-- - vista_reservas: una fila por reserva, cómoda de leer en el Table Editor.
-- Requiere 001.
-- =========================================================
begin;

-- ---------- Tipos de mesa y aforo ----------
create table if not exists public.tipos_mesa (
  tipo text primary key check (tipo ~ '^[a-z]{2,20}$'),   -- el mismo que en data/reservados.js
  nombre text not null check (char_length(nombre) between 1 and 60),
  mesas integer not null check (mesas between 0 and 1000)
);
comment on table public.tipos_mesa is 'Mesas de cada tipo por noche. Cambia "mesas" para ajustar el aforo (se aplica al momento).';

insert into public.tipos_mesa (tipo, nombre, mesas) values
  ('pista', 'Mesa en pista', 30),
  ('vip', 'Mesa VIP', 7)
on conflict (tipo) do nothing;

-- ---------- Reservas ----------
create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  tipo text not null references public.tipos_mesa (tipo) on update cascade on delete restrict,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmada', 'rechazada', 'cancelada', 'caducada')),
  nombre text check (char_length(nombre) between 1 and 60),      -- null: anonimizada (ver 004)
  telefono text check (telefono ~ '^\+[1-9][0-9]{7,14}$'),       -- formato internacional: +34600123123
  personas smallint not null check (personas between 1 and 30),
  rpp text references public.rpps (codigo) on update cascade on delete restrict,
  notas text check (char_length(notas) <= 500),
  total integer not null check (total between 0 and 100000),     -- euros; lo calcula el servidor
  a_consultar boolean not null default false,                    -- lleva algo sin precio (champán)
  creado timestamptz not null default now(),
  decidido timestamptz,                                          -- cuándo dejó de estar pendiente
  constraint reservas_datos_personales check ((nombre is null) = (telefono is null))
);
comment on table public.reservas is 'Peticiones de reserva. Para confirmar o rechazar, cambia "estado". No se pueden confirmar más mesas que las de tipos_mesa.';
comment on column public.reservas.estado is 'pendiente → confirmada / rechazada. cancelada: la anula el cliente. caducada: la noche pasó sin decidirla.';

-- Una petición activa por teléfono y noche (también protege de dos envíos simultáneos)
create unique index if not exists reservas_un_telefono_por_noche
  on public.reservas (fecha, telefono) where estado in ('pendiente', 'confirmada');
create index if not exists reservas_fecha_idx on public.reservas (fecha);
create index if not exists reservas_confirmadas_idx on public.reservas (fecha, tipo) where estado = 'confirmada';
create index if not exists reservas_rpp_idx on public.reservas (rpp);

-- ---------- Líneas del pedido ----------
create table if not exists public.reserva_lineas (
  reserva uuid not null references public.reservas (id) on delete cascade,
  grupo text not null check (grupo in ('botellas', 'chupitos', 'champan', 'refrescos', 'suplementos')),
  producto text not null check (char_length(producto) between 1 and 60),
  cantidad smallint not null check (cantidad between 1 and 300),
  precio integer check (precio between 0 and 10000),   -- por unidad, en euros; null = a consultar
  primary key (reserva, grupo, producto)
);
comment on table public.reserva_lineas is 'Bebidas de cada reserva con el precio por unidad del momento en que se pidió.';

-- ---------- Aforo y fecha de decisión (al insertar o cambiar una reserva) ----------
-- security definer: cuenta todas las confirmadas aunque quien confirma (la futura app)
-- solo vea parte de las reservas por RLS. Es seguro: una función de trigger no se puede
-- llamar directamente y el search_path vacío obliga a nombres completos.
create or replace function public.reservas_antes_de_guardar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mesas integer;
  v_confirmadas integer;
begin
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    new.decidido := case when new.estado = 'pendiente' then null else now() end;
  end if;

  if new.estado = 'confirmada' and (
       tg_op = 'INSERT' or old.estado is distinct from 'confirmada'
       or old.fecha is distinct from new.fecha or old.tipo is distinct from new.tipo) then
    -- Mismo cerrojo que crear_reserva: dos confirmaciones a la vez no se saltan el aforo
    perform pg_advisory_xact_lock(hashtext('botanic_reservas:' || new.fecha::text || ':' || new.tipo));
    select t.mesas into v_mesas from public.tipos_mesa t where t.tipo = new.tipo;
    select count(*) into v_confirmadas from public.reservas r
      where r.fecha = new.fecha and r.tipo = new.tipo and r.estado = 'confirmada' and r.id <> new.id;
    if v_confirmadas >= coalesce(v_mesas, 0) then
      raise exception 'Aforo completo: ya hay % de % mesas (%) confirmadas el %.',
        v_confirmadas, coalesce(v_mesas, 0), new.tipo, new.fecha
        using errcode = 'P0001', hint = 'Rechaza o cancela otra reserva confirmada, o sube "mesas" en tipos_mesa.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reservas_antes_de_guardar on public.reservas;
create trigger reservas_antes_de_guardar
  before insert or update on public.reservas
  for each row execute function public.reservas_antes_de_guardar();

-- ---------- Alta de una reserva (atómica) ----------
-- El servidor ya ha validado y calculado todo; aquí se comprueba el aforo y el
-- teléfono repetido y se guardan la reserva y sus líneas en una sola transacción.
create or replace function public.crear_reserva(
  p_fecha date,
  p_tipo text,
  p_nombre text,
  p_telefono text,
  p_personas integer,
  p_rpp text,
  p_notas text,
  p_total integer,
  p_a_consultar boolean,
  p_lineas jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_mesas integer;
begin
  perform pg_advisory_xact_lock(hashtext('botanic_reservas:' || p_fecha::text || ':' || p_tipo));

  select t.mesas into v_mesas from public.tipos_mesa t where t.tipo = p_tipo;
  if v_mesas is null then
    return jsonb_build_object('ok', false, 'motivo', 'tipo');
  end if;
  if (select count(*) from public.reservas r
        where r.fecha = p_fecha and r.tipo = p_tipo and r.estado = 'confirmada') >= v_mesas then
    return jsonb_build_object('ok', false, 'motivo', 'completo');
  end if;

  begin
    insert into public.reservas (fecha, tipo, nombre, telefono, personas, rpp, notas, total, a_consultar)
    values (p_fecha, p_tipo, p_nombre, p_telefono, p_personas, p_rpp, nullif(p_notas, ''), p_total, coalesce(p_a_consultar, false))
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'motivo', 'duplicado');
  end;

  insert into public.reserva_lineas (reserva, grupo, producto, cantidad, precio)
  select v_id, l ->> 'grupo', l ->> 'producto', (l ->> 'cantidad')::smallint, (l ->> 'precio')::integer
  from jsonb_array_elements(p_lineas) as l;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------- Disponibilidad para la web ----------
-- Mesas de cada tipo y reservas confirmadas por noche entre dos fechas
-- (fecha null: ese tipo no tiene ninguna confirmada en el rango).
create or replace function public.disponibilidad_reservas(p_desde date, p_hasta date)
returns table (tipo text, mesas integer, fecha date, confirmadas bigint)
language sql
stable
set search_path = ''
as $$
  select t.tipo, t.mesas, r.fecha, count(r.id)
  from public.tipos_mesa t
  left join public.reservas r
    on r.tipo = t.tipo and r.estado = 'confirmada' and r.fecha between p_desde and p_hasta
  group by t.tipo, t.mesas, r.fecha;
$$;

-- ---------- Vista para el Table Editor ----------
-- security_invoker: respeta los permisos de quien la consulta (sin él, saltaría el RLS)
create or replace view public.vista_reservas
with (security_invoker = true) as
select
  r.fecha,
  t.nombre as mesa,
  r.estado,
  r.nombre,
  r.telefono,
  'https://wa.me/' || substr(r.telefono, 2) as whatsapp,
  r.personas,
  coalesce(p.nombre, 'Sin RPP') as rpp,
  (select string_agg(l.cantidad || '× ' || l.producto, ', '
            order by array_position(array['botellas', 'chupitos', 'champan', 'refrescos', 'suplementos'], l.grupo), l.producto)
     from public.reserva_lineas l where l.reserva = r.id) as pedido,
  r.total || ' €' || case when r.a_consultar then ' + champán a consultar' else '' end as total,
  r.notas,
  r.creado,
  r.decidido,
  r.id
from public.reservas r
join public.tipos_mesa t on t.tipo = r.tipo
left join public.rpps p on p.codigo = r.rpp
order by r.fecha desc, r.creado;

-- ---------- Acceso: solo el servidor ----------
alter table public.tipos_mesa enable row level security;
alter table public.reservas enable row level security;
alter table public.reserva_lineas enable row level security;

revoke all on table public.tipos_mesa, public.reservas, public.reserva_lineas, public.vista_reservas from anon, authenticated;
grant select, insert, update, delete on table public.tipos_mesa, public.reservas, public.reserva_lineas to service_role;
grant select on table public.vista_reservas to service_role;

revoke execute on function public.reservas_antes_de_guardar() from public, anon, authenticated;
revoke execute on function public.crear_reserva(date, text, text, text, integer, text, text, integer, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.disponibilidad_reservas(date, date) from public, anon, authenticated;
grant execute on function public.crear_reserva(date, text, text, text, integer, text, text, integer, boolean, jsonb) to service_role;
grant execute on function public.disponibilidad_reservas(date, date) to service_role;

insert into public.migraciones (nombre) values ('003_reservas') on conflict (nombre) do nothing;

commit;
