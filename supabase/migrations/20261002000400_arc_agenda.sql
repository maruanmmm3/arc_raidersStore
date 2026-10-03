-- Agenda de entregas: salas de Discord, horario del staff, excepciones y citas.
-- Funciones: huecos libres, crear pedido con cita, ticket, cancelar y acciones de admin.

create table public."ARC_discord_rooms" (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 40),
  channel_url text check (channel_url is null or channel_url ~ '^https://(discord\.com|discordapp\.com)/channels/'),
  is_active   boolean not null default true,
  sort        smallint not null default 0,
  created_at  timestamptz not null default now()
);

create table public."ARC_availability_rules" (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null,
  weekday    smallint not null check (weekday between 0 and 6),   -- 0 = domingo (extract dow)
  start_time time not null,
  end_time   time not null,
  timezone   text not null default 'America/Lima',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  constraint arc_rules_admin_fk foreign key (admin_id)
    references public."ARC_profiles" (id) on delete cascade
);

-- Rechaza zonas horarias inexistentes (now() at time zone 'X' falla si X no existe)
create or replace function public.arc_validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform now() at time zone new.timezone;
  return new;
end;
$$;

create trigger arc_rules_validate_tz
  before insert or update of timezone on public."ARC_availability_rules"
  for each row execute function public.arc_validate_timezone();

create table public."ARC_availability_exceptions" (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid,                                -- null = afecta a todo el staff
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint arc_exceptions_admin_fk foreign key (admin_id)
    references public."ARC_profiles" (id) on delete cascade
);

create table public."ARC_appointments" (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null,
  ticket_code      text not null unique,
  admin_id         uuid not null,
  room_id          uuid not null,
  slot_start       timestamptz not null,
  slot_end         timestamptz not null,
  status           public.arc_appointment_status not null default 'booked',
  hold_expires_at  timestamptz,
  reschedule_count smallint not null default 0,
  checked_in_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (slot_end > slot_start),
  constraint arc_appointments_order_fk foreign key (order_id)
    references public."ARC_orders" (id) on delete cascade,
  constraint arc_appointments_admin_fk foreign key (admin_id)
    references public."ARC_profiles" (id) on delete restrict,
  constraint arc_appointments_room_fk foreign key (room_id)
    references public."ARC_discord_rooms" (id) on delete restrict
);

-- Red de seguridad: ni un admin, ni una sala, ni un pedido con dos citas activas a la vez.
-- Los huecos siguen una rejilla fija (slot_minutes), así que basta con comparar el inicio.
create unique index arc_appt_admin_slot_key on public."ARC_appointments" (admin_id, slot_start)
  where status in ('held', 'booked', 'checked_in');
create unique index arc_appt_room_slot_key on public."ARC_appointments" (room_id, slot_start)
  where status in ('held', 'booked', 'checked_in');
create unique index arc_appt_order_active_key on public."ARC_appointments" (order_id)
  where status in ('held', 'booked', 'checked_in');
create index arc_appt_slot_idx on public."ARC_appointments" (slot_start);

create trigger arc_appointments_updated_at
  before update on public."ARC_appointments"
  for each row execute function public.arc_set_updated_at();

-- ---------------------------------------------------------------------------
-- Utilidades internas
-- ---------------------------------------------------------------------------

create or replace function public.arc_setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::int from public."ARC_settings" where key = p_key), p_default);
$$;

-- Código de ticket tipo K7QF-29XM: sin caracteres ambiguos (0/O, 1/I)
create or replace function public.arc_new_ticket_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 símbolos: sin sesgo con % 32
  b    bytea;
  code text;
begin
  loop
    b := extensions.gen_random_bytes(8);
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
      if i = 3 then code := code || '-'; end if;
    end loop;
    exit when not exists (select 1 from public."ARC_appointments" where ticket_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.arc_product_names(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(locale, name), '{}'::jsonb)
  from public."ARC_product_translations" where product_id = p_product_id;
$$;

-- Huecos por admin: horario semanal − excepciones − citas activas − antelación mínima
create or replace function public.arc_slot_candidates(p_days int)
returns table (admin_id uuid, slot_start timestamptz, slot_end timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select make_interval(mins => public.arc_setting_int('slot_minutes', 30)) as len,
           now() + make_interval(hours => public.arc_setting_int('min_notice_hours', 2)) as earliest,
           now() + make_interval(days => least(greatest(p_days, 1), public.arc_setting_int('max_days_ahead', 14))) as latest
  ),
  rules as (
    select r.*
    from public."ARC_availability_rules" r
    join public."ARC_profiles" p on p.id = r.admin_id and p.role = 'admin' and not p.is_blocked
    where r.is_active
  ),
  candidates as (
    select r.admin_id, (ts at time zone r.timezone) as s
    from rules r
    cross join cfg
    cross join lateral generate_series(
      (now() at time zone r.timezone)::date,
      (cfg.latest at time zone r.timezone)::date,
      interval '1 day') as d
    cross join lateral generate_series(
      d::date + r.start_time,
      d::date + r.end_time - cfg.len,
      cfg.len) as ts
    where extract(dow from d) = r.weekday
  )
  select distinct c.admin_id, c.s, c.s + cfg.len
  from candidates c
  cross join cfg
  where c.s >= cfg.earliest
    and c.s < cfg.latest
    and not exists (
      select 1 from public."ARC_availability_exceptions" x
      where (x.admin_id is null or x.admin_id = c.admin_id)
        and tstzrange(x.starts_at, x.ends_at) && tstzrange(c.s, c.s + cfg.len))
    and not exists (
      select 1 from public."ARC_appointments" ap
      where ap.admin_id = c.admin_id
        and (ap.status in ('booked', 'checked_in') or (ap.status = 'held' and ap.hold_expires_at > now()))
        and tstzrange(ap.slot_start, ap.slot_end) && tstzrange(c.s, c.s + cfg.len));
$$;

revoke execute on function public.arc_slot_candidates(int) from public, anon, authenticated;

-- Sala libre para un intervalo (null si no queda ninguna)
create or replace function public.arc_free_room(p_start timestamptz, p_end timestamptz)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public."ARC_discord_rooms" r
  where r.is_active
    and not exists (
      select 1 from public."ARC_appointments" ap
      where ap.room_id = r.id
        and (ap.status in ('booked', 'checked_in') or (ap.status = 'held' and ap.hold_expires_at > now()))
        and tstzrange(ap.slot_start, ap.slot_end) && tstzrange(p_start, p_end))
  order by r.sort, r.name
  limit 1;
$$;

revoke execute on function public.arc_free_room(timestamptz, timestamptz) from public, anon, authenticated;

-- Pública: solo horas, nunca quién atiende ni otras citas
create or replace function public.arc_get_available_slots(p_days int default 14)
returns table (slot_start timestamptz, slot_end timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct c.slot_start, c.slot_end
  from public.arc_slot_candidates(p_days) c
  where public.arc_free_room(c.slot_start, c.slot_end) is not null
  order by 1;
$$;

grant execute on function public.arc_get_available_slots(int) to anon, authenticated;

-- Libera o consume el stock reservado por un pedido (solo productos con stock limitado)
create or replace function public.arc_apply_order_stock(p_order_id uuid, p_consume boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public."ARC_products" p
  set reserved = greatest(0, p.reserved - n.qty),
      stock    = case when p_consume then greatest(0, p.stock - n.qty) else p.stock end
  from (
    select product_id, sum(qty)::int as qty
    from public."ARC_order_items" where order_id = p_order_id
    group by product_id
  ) n
  where p.id = n.product_id and p.stock is not null;
$$;

revoke execute on function public.arc_apply_order_stock(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Crear pedido + cita. Solo la llama la Edge Function create-order (service_role),
-- que antes verifica el JWT del usuario. Todo el precio se calcula aquí.
-- ---------------------------------------------------------------------------
create or replace function public.arc_create_order(
  p_user_id      uuid,
  p_items        jsonb,   -- [{ "product_id": uuid, "qty": int, "mod_ids": [uuid] }]
  p_embark_id    text,
  p_platform     public.arc_game_platform,
  p_region       text,
  p_note         text,
  p_payment_mode public.arc_payment_mode,
  p_slot_start   timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile    public."ARC_profiles";
  v_product    public."ARC_products";
  v_line       jsonb;
  v_pid        uuid;
  v_qty        int;
  v_mod_id     uuid;
  v_mod_ids    uuid[];
  v_line_price int;
  v_subtotal   int := 0;
  v_need       jsonb := '{}'::jsonb;   -- { product_id: unidades }
  v_len        interval;
  v_admin      uuid;
  v_room       uuid;
  v_order_id   uuid;
  v_number     bigint;
  v_item_id    uuid;
  v_code       text;
begin
  select * into v_profile from public."ARC_profiles" where id = p_user_id;
  if not found then raise exception 'ARC_NO_PROFILE'; end if;
  if v_profile.is_blocked then raise exception 'ARC_BLOCKED'; end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'ARC_INVALID_ITEMS';
  end if;

  if p_payment_mode = 'online' and not coalesce(
       (select (value #>> '{}')::boolean from public."ARC_settings" where key = 'online_payment_enabled'), false) then
    raise exception 'ARC_ONLINE_PAYMENT_DISABLED';
  end if;

  if p_slot_start is null then raise exception 'ARC_SLOT_REQUIRED'; end if;

  -- Un pedido a la vez: evita que dos compras se lleven el mismo hueco o la última unidad
  perform pg_advisory_xact_lock(hashtext('arc_create_order'));

  -- 1. Valida cada línea y calcula su precio con los datos de la BD
  for v_line in select value from jsonb_array_elements(p_items) loop
    v_pid := (v_line ->> 'product_id')::uuid;
    v_qty := (v_line ->> 'qty')::int;
    if v_pid is null or v_qty is null or v_qty not between 1 and 10 then
      raise exception 'ARC_INVALID_ITEMS';
    end if;

    select * into v_product from public."ARC_products" where id = v_pid and is_visible;
    if not found then raise exception 'ARC_PRODUCT_UNAVAILABLE'; end if;

    v_mod_ids := coalesce(
      array(select jsonb_array_elements_text(coalesce(v_line -> 'mod_ids', '[]'::jsonb))::uuid), '{}');
    v_line_price := v_product.price_cents;

    if cardinality(v_mod_ids) > 0 then
      if v_product.kind <> 'weapon' then raise exception 'ARC_INVALID_MODS'; end if;
      -- Compatibles, visibles y como mucho uno por ranura
      if (select count(*)
          from public."ARC_weapon_mod_compat" c
          join public."ARC_products" m on m.id = c.mod_id and m.is_visible
          where c.weapon_id = v_pid and c.mod_id = any (v_mod_ids)) <> cardinality(v_mod_ids)
         or (select count(distinct md.slot) from public."ARC_mod_details" md
             where md.product_id = any (v_mod_ids)) <> cardinality(v_mod_ids) then
        raise exception 'ARC_INVALID_MODS';
      end if;
      v_line_price := v_line_price + (select coalesce(sum(price_cents), 0)::int
                                      from public."ARC_products" where id = any (v_mod_ids));
    end if;

    v_subtotal := v_subtotal + v_line_price * v_qty;
    v_need := v_need || jsonb_build_object(v_pid::text, coalesce((v_need ->> v_pid::text)::int, 0) + v_qty);
    foreach v_mod_id in array v_mod_ids loop
      v_need := v_need || jsonb_build_object(v_mod_id::text, coalesce((v_need ->> v_mod_id::text)::int, 0) + v_qty);
    end loop;
  end loop;

  -- 2. Stock disponible (stock − reservado) para todo lo que lleva el pedido
  for v_pid, v_qty in select key::uuid, value::int from jsonb_each_text(v_need) loop
    select * into v_product from public."ARC_products" where id = v_pid for update;
    if v_product.stock is not null and v_product.stock - v_product.reserved < v_qty then
      raise exception 'ARC_OUT_OF_STOCK:%', v_product.slug;
    end if;
  end loop;

  -- 3. Hueco: el admin libre con menos citas ese día, y una sala libre
  v_len := make_interval(mins => public.arc_setting_int('slot_minutes', 30));
  select c.admin_id into v_admin
  from public.arc_slot_candidates(366) c
  where c.slot_start = p_slot_start
  order by (select count(*) from public."ARC_appointments" ap
            where ap.admin_id = c.admin_id
              and ap.status in ('booked', 'checked_in', 'completed')
              and ap.slot_start >= date_trunc('day', p_slot_start)
              and ap.slot_start < date_trunc('day', p_slot_start) + interval '1 day'),
           random()
  limit 1;
  v_room := public.arc_free_room(p_slot_start, p_slot_start + v_len);
  if v_admin is null or v_room is null then raise exception 'ARC_SLOT_TAKEN'; end if;

  -- 4. Pedido, líneas, reserva de stock y cita
  insert into public."ARC_orders" (
    user_id, status, payment_mode, payment_status, subtotal_cents, discount_cents, total_cents,
    embark_id, platform, region, availability_note, discord_username, assigned_to, reserved_until)
  values (
    p_user_id, 'scheduled', p_payment_mode,
    case when p_payment_mode = 'online' then 'awaiting' else 'unpaid' end::public.arc_payment_status,
    v_subtotal, 0, v_subtotal,
    trim(p_embark_id), p_platform, nullif(trim(p_region), ''), nullif(trim(p_note), ''),
    v_profile.discord_username, v_admin, p_slot_start + v_len + interval '24 hours')
  returning id, number into v_order_id, v_number;

  for v_line in select value from jsonb_array_elements(p_items) loop
    v_pid := (v_line ->> 'product_id')::uuid;
    v_qty := (v_line ->> 'qty')::int;
    v_mod_ids := coalesce(
      array(select jsonb_array_elements_text(coalesce(v_line -> 'mod_ids', '[]'::jsonb))::uuid), '{}');

    insert into public."ARC_order_items" (order_id, product_id, kind, names, unit_price_cents, qty)
    select v_order_id, p.id, p.kind, public.arc_product_names(p.id), p.price_cents, v_qty
    from public."ARC_products" p where p.id = v_pid
    returning id into v_item_id;

    insert into public."ARC_order_items" (order_id, product_id, parent_item_id, kind, names, unit_price_cents, qty)
    select v_order_id, m.id, v_item_id, m.kind, public.arc_product_names(m.id), m.price_cents, v_qty
    from public."ARC_products" m where m.id = any (v_mod_ids);
  end loop;

  update public."ARC_products" p
  set reserved = p.reserved + n.qty
  from (select key::uuid as id, value::int as qty from jsonb_each_text(v_need)) n
  where p.id = n.id and p.stock is not null;

  v_code := public.arc_new_ticket_code();
  insert into public."ARC_appointments" (order_id, ticket_code, admin_id, room_id, slot_start, slot_end, status)
  values (v_order_id, v_code, v_admin, v_room, p_slot_start, p_slot_start + v_len, 'booked');

  return jsonb_build_object(
    'order_id', v_order_id, 'number', v_number, 'ticket_code', v_code,
    'total_cents', v_subtotal, 'slot_start', p_slot_start);
end;
$$;

revoke execute on function public.arc_create_order(uuid, jsonb, text, public.arc_game_platform, text, text,
  public.arc_payment_mode, timestamptz) from public, anon, authenticated;
grant execute on function public.arc_create_order(uuid, jsonb, text, public.arc_game_platform, text, text,
  public.arc_payment_mode, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Ticket de cita: lo ve el dueño del pedido o un admin
-- ---------------------------------------------------------------------------
create or replace function public.arc_get_ticket(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ticket_code', ap.ticket_code,
    'status', ap.status,
    'slot_start', ap.slot_start,
    'slot_end', ap.slot_end,
    'room', jsonb_build_object('name', r.name, 'channel_url', r.channel_url),
    'admin', jsonb_build_object('username', ad.username, 'discord_username', ad.discord_username),
    'order', jsonb_build_object(
      'id', o.id, 'number', o.number, 'status', o.status, 'payment_status', o.payment_status,
      'payment_mode', o.payment_mode, 'total_cents', o.total_cents, 'currency', o.currency,
      'embark_id', o.embark_id, 'platform', o.platform),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', i.id, 'parent_item_id', i.parent_item_id, 'kind', i.kind, 'names', i.names,
               'qty', i.qty, 'unit_price_cents', i.unit_price_cents)
             order by i.parent_item_id nulls first), '[]'::jsonb)
      from public."ARC_order_items" i where i.order_id = o.id),
    'store_timezone', (select value #>> '{}' from public."ARC_settings" where key = 'store_timezone'),
    'discord_invite_url', (select value #>> '{}' from public."ARC_settings" where key = 'discord_invite_url'),
    'can_cancel', (o.status = 'scheduled'
                   and o.payment_status in ('unpaid', 'not_required')
                   and ap.status = 'booked'
                   and ap.slot_start > now() + make_interval(hours => public.arc_setting_int('reschedule_cutoff_hours', 3)))
  )
  from public."ARC_appointments" ap
  join public."ARC_orders" o on o.id = ap.order_id
  join public."ARC_discord_rooms" r on r.id = ap.room_id
  join public."ARC_profiles" ad on ad.id = ap.admin_id
  where ap.ticket_code = upper(trim(p_code))
    and (o.user_id = (select auth.uid()) or public.arc_is_admin());
$$;

revoke execute on function public.arc_get_ticket(text) from public, anon;
grant execute on function public.arc_get_ticket(text) to authenticated;

-- ---------------------------------------------------------------------------
-- El jugador cancela su pedido (sin pagar y con antelación suficiente)
-- ---------------------------------------------------------------------------
create or replace function public.arc_cancel_my_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o  public."ARC_orders";
  ap public."ARC_appointments";
begin
  select * into o from public."ARC_orders" where id = p_order_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'ARC_NOT_FOUND'; end if;
  select * into ap from public."ARC_appointments"
  where order_id = o.id and status in ('held', 'booked', 'checked_in') for update;

  if o.status not in ('requested', 'scheduled')
     or o.payment_status not in ('unpaid', 'not_required')
     or (ap.id is not null and (ap.status <> 'booked'
         or ap.slot_start <= now() + make_interval(hours => public.arc_setting_int('reschedule_cutoff_hours', 3)))) then
    raise exception 'ARC_CANNOT_CANCEL';
  end if;

  perform set_config('arc.status_note', 'Cancelado por el jugador', true);
  update public."ARC_orders" set status = 'cancelled', cancelled_at = now() where id = o.id;
  update public."ARC_appointments" set status = 'cancelled' where id = ap.id;
  perform public.arc_apply_order_stock(o.id, false);
end;
$$;

revoke execute on function public.arc_cancel_my_order(uuid) from public, anon;
grant execute on function public.arc_cancel_my_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Acciones de admin
-- ---------------------------------------------------------------------------

-- Entrega: scheduled → delivering → delivered, con vuelta atrás si falla; cancelar con nota
create or replace function public.arc_admin_set_order_status(
  p_order_id uuid, p_status public.arc_order_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o      public."ARC_orders";
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.arc_is_admin() then raise exception 'ARC_FORBIDDEN' using errcode = '42501'; end if;

  select * into o from public."ARC_orders" where id = p_order_id for update;
  if not found then raise exception 'ARC_NOT_FOUND'; end if;

  if not (
       (o.status = 'requested'  and p_status = 'cancelled')
    or (o.status = 'scheduled'  and p_status in ('delivering', 'cancelled'))
    or (o.status = 'delivering' and p_status in ('delivered', 'scheduled', 'cancelled'))
  ) then
    raise exception 'ARC_INVALID_TRANSITION';
  end if;

  if p_status = 'cancelled' and v_note is null then raise exception 'ARC_NOTE_REQUIRED'; end if;
  -- Entregar sin cobrar solo como excepción anotada
  if p_status = 'delivered' and o.payment_status in ('unpaid', 'awaiting') and v_note is null then
    raise exception 'ARC_UNPAID_NEEDS_NOTE';
  end if;

  perform set_config('arc.status_note', coalesce(v_note, ''), true);

  update public."ARC_orders"
  set status       = p_status,
      assigned_to  = coalesce(assigned_to, (select auth.uid())),
      delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
      cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
  where id = o.id;

  update public."ARC_appointments"
  set status = case p_status
                 when 'delivering' then 'checked_in'
                 when 'delivered'  then 'completed'
                 when 'cancelled'  then 'cancelled'
                 else 'booked'
               end::public.arc_appointment_status,
      checked_in_at = case when p_status = 'delivering' then now() else checked_in_at end
  where order_id = o.id and status in ('held', 'booked', 'checked_in');

  if p_status = 'delivered' then
    perform public.arc_apply_order_stock(o.id, true);
  elsif p_status = 'cancelled' then
    perform public.arc_apply_order_stock(o.id, false);
  end if;
end;
$$;

-- El jugador no se presentó: la cita queda como no_show y el pedido vuelve a "requested"
create or replace function public.arc_admin_mark_no_show(p_order_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.arc_is_admin() then raise exception 'ARC_FORBIDDEN' using errcode = '42501'; end if;
  update public."ARC_appointments" set status = 'no_show'
  where order_id = p_order_id and status in ('booked', 'checked_in');
  if not found then raise exception 'ARC_NOT_FOUND'; end if;
  perform set_config('arc.status_note', coalesce(nullif(trim(p_note), ''), 'No se presentó'), true);
  update public."ARC_orders" set status = 'requested' where id = p_order_id and status in ('scheduled', 'delivering');
end;
$$;

-- Registrar un pago acordado por Discord (o marcar que no hace falta)
create or replace function public.arc_admin_mark_paid(
  p_order_id uuid, p_status public.arc_payment_status, p_reference text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o     public."ARC_orders";
  v_ref text := nullif(trim(coalesce(p_reference, '')), '');
begin
  if not public.arc_is_admin() then raise exception 'ARC_FORBIDDEN' using errcode = '42501'; end if;
  if p_status not in ('paid_manual', 'not_required') then raise exception 'ARC_INVALID_TRANSITION'; end if;
  if p_status = 'paid_manual' and v_ref is null then raise exception 'ARC_REFERENCE_REQUIRED'; end if;

  select * into o from public."ARC_orders" where id = p_order_id for update;
  if not found then raise exception 'ARC_NOT_FOUND'; end if;
  if o.payment_status not in ('unpaid', 'awaiting') or o.status = 'cancelled' then
    raise exception 'ARC_INVALID_TRANSITION';
  end if;

  perform set_config('arc.status_note', coalesce(v_ref, ''), true);
  update public."ARC_orders"
  set payment_status    = p_status,
      payment_method    = 'manual',
      payment_reference = v_ref,
      paid_at           = case when p_status = 'paid_manual' then now() else paid_at end
  where id = o.id;
end;
$$;

revoke execute on function public.arc_admin_set_order_status(uuid, public.arc_order_status, text) from public, anon;
revoke execute on function public.arc_admin_mark_no_show(uuid, text) from public, anon;
revoke execute on function public.arc_admin_mark_paid(uuid, public.arc_payment_status, text) from public, anon;
grant execute on function public.arc_admin_set_order_status(uuid, public.arc_order_status, text) to authenticated;
grant execute on function public.arc_admin_mark_no_show(uuid, text) to authenticated;
grant execute on function public.arc_admin_mark_paid(uuid, public.arc_payment_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public."ARC_discord_rooms"           enable row level security;
alter table public."ARC_availability_rules"      enable row level security;
alter table public."ARC_availability_exceptions" enable row level security;
alter table public."ARC_appointments"            enable row level security;

create policy "arc_rooms_admin" on public."ARC_discord_rooms" for all to authenticated
  using (public.arc_is_admin()) with check (public.arc_is_admin());
create policy "arc_rules_admin" on public."ARC_availability_rules" for all to authenticated
  using (public.arc_is_admin()) with check (public.arc_is_admin());
create policy "arc_exceptions_admin" on public."ARC_availability_exceptions" for all to authenticated
  using (public.arc_is_admin()) with check (public.arc_is_admin());

create policy "arc_appointments_read" on public."ARC_appointments" for select to authenticated
  using (public.arc_order_is_readable(order_id));

revoke all on public."ARC_discord_rooms", public."ARC_availability_rules",
              public."ARC_availability_exceptions", public."ARC_appointments" from anon;
revoke insert, update, delete on public."ARC_appointments" from authenticated;

-- Funciones internas: no se exponen en la API (leen ajustes privados o productos ocultos)
revoke execute on function public.arc_setting_int(text, int) from public, anon, authenticated;
revoke execute on function public.arc_product_names(uuid) from public, anon, authenticated;
revoke execute on function public.arc_new_ticket_code() from public, anon, authenticated;

-- Configuración por defecto: 3 salas de voz (añade el enlace del canal desde /admin/salas)
insert into public."ARC_discord_rooms" (name, sort) values ('Sala 1', 1), ('Sala 2', 2), ('Sala 3', 3);
