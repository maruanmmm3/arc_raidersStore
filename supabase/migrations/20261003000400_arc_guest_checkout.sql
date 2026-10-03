-- Compra sin registro: datos (Discord, email, ID de Embark) → transferencia → Discord → entrega.
-- Sin cita: la hora se acuerda por Discord tras confirmar el pago.
-- Cada pedido tiene un código público (como el del ticket) para ver su estado sin cuenta.

-- Pedidos de invitados: sin user_id, con email
alter table public."ARC_orders" alter column user_id drop not null;
alter table public."ARC_orders" alter column platform drop not null;
alter table public."ARC_orders" add column guest_email text
  check (guest_email is null or guest_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public."ARC_orders" add column public_code text unique;
alter table public."ARC_orders"
  add constraint arc_orders_buyer_check check (user_id is not null or guest_email is not null);

-- Historial: "changed_by" del alta es null en pedidos de invitados
create or replace function public.arc_log_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(current_setting('arc.status_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public."ARC_order_status_history" (order_id, field, from_value, to_value, changed_by)
    values (new.id, 'status', null, new.status::text, new.user_id),
           (new.id, 'payment_status', null, new.payment_status::text, new.user_id);
  else
    if new.status is distinct from old.status then
      insert into public."ARC_order_status_history" (order_id, field, from_value, to_value, changed_by, note)
      values (new.id, 'status', old.status::text, new.status::text, auth.uid(), v_note);
    end if;
    if new.payment_status is distinct from old.payment_status then
      insert into public."ARC_order_status_history" (order_id, field, from_value, to_value, changed_by, note)
      values (new.id, 'payment_status', old.payment_status::text, new.payment_status::text, auth.uid(), v_note);
    end if;
  end if;
  return new;
end;
$$;

-- Datos de pago y de Discord que ve el comprador (editables en /admin/ajustes)
insert into public."ARC_settings" (key, value, is_public) values
  ('payment_holder',           '""'::jsonb,                          true),
  ('payment_cbu',              '"0000003100051463346547"'::jsonb,    true),
  ('payment_alias',            '""'::jsonb,                          true),
  ('payment_bank',             '"Mercado Pago"'::jsonb,              true),
  ('discord_delivery_channel', '"#entregas"'::jsonb,                 true),
  ('max_open_orders_per_email','3'::jsonb,                           false)
on conflict (key) do nothing;

-- Código público del pedido: 8 caracteres sin ambiguos (0/O, 1/I)
create or replace function public.arc_new_order_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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
    exit when not exists (select 1 from public."ARC_orders" where public_code = code);
  end loop;
  return code;
end;
$$;

revoke execute on function public.arc_new_order_code() from public, anon, authenticated;

-- Crea un pedido sin cita. Lo llama la Edge Function create-order (service_role).
-- p_user_id es opcional: si el comprador tiene sesión, el pedido queda en su cuenta.
create or replace function public.arc_create_guest_order(
  p_items     jsonb,   -- [{ "product_id": uuid, "qty": int, "mod_ids": [uuid] }]
  p_email     text,
  p_discord   text,
  p_embark_id text,
  p_platform  public.arc_game_platform,
  p_note      text,
  p_user_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product    public."ARC_products";
  v_line       jsonb;
  v_pid        uuid;
  v_qty        int;
  v_mod_id     uuid;
  v_mod_ids    uuid[];
  v_line_price int;
  v_subtotal   int := 0;
  v_need       jsonb := '{}'::jsonb;
  v_email      text := lower(trim(coalesce(p_email, '')));
  v_discord    text := regexp_replace(lower(trim(coalesce(p_discord, ''))), '^@', '');
  v_order_id   uuid;
  v_number     bigint;
  v_item_id    uuid;
  v_code       text;
begin
  if p_user_id is not null and exists (
       select 1 from public."ARC_profiles" where id = p_user_id and is_blocked) then
    raise exception 'ARC_BLOCKED';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'ARC_INVALID_EMAIL'; end if;
  if v_discord !~ '^[a-z0-9_.]{2,32}$' or v_discord like '%..%' then raise exception 'ARC_INVALID_DISCORD'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'ARC_INVALID_ITEMS';
  end if;

  perform pg_advisory_xact_lock(hashtext('arc_create_order'));

  -- Antiabuso: pocos pedidos abiertos sin pagar por email (reservan stock)
  if (select count(*) from public."ARC_orders"
      where guest_email = v_email and status = 'requested' and payment_status = 'unpaid')
     >= public.arc_setting_int('max_open_orders_per_email', 3) then
    raise exception 'ARC_TOO_MANY_OPEN_ORDERS';
  end if;

  -- 1. Valida líneas y calcula precios con los datos de la BD
  for v_line in select value from jsonb_array_elements(p_items) loop
    v_pid := (v_line ->> 'product_id')::uuid;
    v_qty := (v_line ->> 'qty')::int;
    if v_pid is null or v_qty is null or v_qty not between 1 and 10 then raise exception 'ARC_INVALID_ITEMS'; end if;

    select * into v_product from public."ARC_products" where id = v_pid and is_visible;
    if not found then raise exception 'ARC_PRODUCT_UNAVAILABLE'; end if;

    v_mod_ids := coalesce(
      array(select jsonb_array_elements_text(coalesce(v_line -> 'mod_ids', '[]'::jsonb))::uuid), '{}');
    v_line_price := v_product.price_cents;

    if cardinality(v_mod_ids) > 0 then
      if v_product.kind <> 'weapon' then raise exception 'ARC_INVALID_MODS'; end if;
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

  -- 2. Stock
  for v_pid, v_qty in select key::uuid, value::int from jsonb_each_text(v_need) loop
    select * into v_product from public."ARC_products" where id = v_pid for update;
    if v_product.stock is not null and v_product.stock - v_product.reserved < v_qty then
      raise exception 'ARC_OUT_OF_STOCK:%', v_product.slug;
    end if;
  end loop;

  -- 3. Pedido, líneas y reserva de stock
  v_code := public.arc_new_order_code();
  insert into public."ARC_orders" (
    user_id, guest_email, public_code, status, payment_mode, payment_status,
    subtotal_cents, discount_cents, total_cents, embark_id, platform, availability_note,
    discord_username, reserved_until)
  values (
    p_user_id, v_email, v_code, 'requested', 'discord', 'unpaid',
    v_subtotal, 0, v_subtotal, trim(p_embark_id), p_platform, nullif(trim(coalesce(p_note, '')), ''),
    v_discord, now() + interval '48 hours')
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

  return jsonb_build_object(
    'order_id', v_order_id, 'number', v_number, 'public_code', v_code, 'total_cents', v_subtotal);
end;
$$;

revoke execute on function public.arc_create_guest_order(jsonb, text, text, text, public.arc_game_platform, text, uuid)
  from public, anon, authenticated;
grant execute on function public.arc_create_guest_order(jsonb, text, text, text, public.arc_game_platform, text, uuid)
  to service_role;

-- Página pública del pedido: quien tiene el código ve el estado y los datos de pago
create or replace function public.arc_get_order_public(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_id', o.id,
    'number', o.number,
    'public_code', o.public_code,
    'status', o.status,
    'payment_status', o.payment_status,
    'total_cents', o.total_cents,
    'currency', o.currency,
    'created_at', o.created_at,
    'delivered_at', o.delivered_at,
    'buyer_confirmed_at', o.buyer_confirmed_at,
    'discord_username', o.discord_username,
    'embark_id', o.embark_id,
    'platform', o.platform,
    'can_confirm', (o.status = 'delivered' and o.buyer_confirmed_at is null),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', i.id, 'parent_item_id', i.parent_item_id, 'kind', i.kind, 'names', i.names,
               'qty', i.qty, 'unit_price_cents', i.unit_price_cents)
             order by i.parent_item_id nulls first), '[]'::jsonb)
      from public."ARC_order_items" i where i.order_id = o.id),
    'payment', (
      select jsonb_object_agg(s.key, s.value #>> '{}')
      from public."ARC_settings" s
      where s.key in ('payment_holder', 'payment_cbu', 'payment_alias', 'payment_bank',
                      'discord_invite_url', 'discord_delivery_channel'))
  )
  from public."ARC_orders" o
  where o.public_code = upper(trim(p_code));
$$;

revoke execute on function public.arc_get_order_public(text) from public;
grant execute on function public.arc_get_order_public(text) to anon, authenticated;

-- Conformidad de entrega con el código (para compradores sin cuenta)
create or replace function public.arc_confirm_delivery_public(p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public."ARC_orders";
begin
  select * into o from public."ARC_orders" where public_code = upper(trim(p_code)) for update;
  if not found then raise exception 'ARC_NOT_FOUND'; end if;
  if o.status <> 'delivered' then raise exception 'ARC_NOT_DELIVERED'; end if;
  if o.buyer_confirmed_at is not null then return o.buyer_confirmed_at; end if;

  update public."ARC_orders" set buyer_confirmed_at = now() where id = o.id;
  insert into public."ARC_order_status_history" (order_id, field, from_value, to_value, changed_by)
  values (o.id, 'buyer_confirmation', null, 'confirmed', (select auth.uid()));
  return now();
end;
$$;

revoke execute on function public.arc_confirm_delivery_public(text) from public;
grant execute on function public.arc_confirm_delivery_public(text) to anon, authenticated;

-- Estados de entrega también para pedidos sin cita: requested → delivering → delivered
create or replace function public.arc_admin_set_order_status(
  p_order_id uuid, p_status public.arc_order_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o        public."ARC_orders";
  v_note   text := nullif(trim(coalesce(p_note, '')), '');
  v_has_ap boolean;
begin
  if not public.arc_is_admin() then raise exception 'ARC_FORBIDDEN' using errcode = '42501'; end if;

  select * into o from public."ARC_orders" where id = p_order_id for update;
  if not found then raise exception 'ARC_NOT_FOUND'; end if;
  v_has_ap := exists (select 1 from public."ARC_appointments"
                      where order_id = o.id and status in ('held', 'booked', 'checked_in'));

  if not (
       (o.status in ('requested', 'scheduled') and p_status in ('delivering', 'cancelled'))
    or (o.status = 'delivering' and p_status in ('delivered', 'cancelled'))
    or (o.status = 'delivering' and p_status = 'scheduled' and v_has_ap)
    or (o.status = 'delivering' and p_status = 'requested' and not v_has_ap)
  ) then
    raise exception 'ARC_INVALID_TRANSITION';
  end if;

  if p_status = 'cancelled' and v_note is null then raise exception 'ARC_NOTE_REQUIRED'; end if;
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
