-- Doble moneda: el comprador elige ARS (transferencia por CBU/alias) o USD (PayPal).
-- Los precios base siguen en centavos de ARS; el USD se calcula con ARC_settings.usd_rate
-- (pesos por 1 dólar). Cada pedido guarda su moneda, total, equivalente en ARS y el cambio usado.

alter table public."ARC_orders"
  add column base_total_cents integer check (base_total_cents is null or base_total_cents >= 0),
  add column exchange_rate    numeric(12, 4) check (exchange_rate is null or exchange_rate > 0);
alter table public."ARC_orders" drop constraint if exists "ARC_orders_currency_check";
alter table public."ARC_orders" add constraint arc_orders_currency_check check (currency in ('ARS', 'USD'));

-- Pedidos anteriores: estaban en ARS
update public."ARC_orders" set base_total_cents = total_cents where base_total_cents is null and currency = 'ARS';

insert into public."ARC_settings" (key, value, is_public) values
  ('usd_rate',     '"1000"'::jsonb, true),   -- pesos por 1 USD; vacío = USD desactivado
  ('paypal_email', '""'::jsonb,     true)    -- vacío = USD desactivado
on conflict (key) do nothing;

drop function public.arc_create_guest_order(jsonb, text, text, text, public.arc_game_platform, text, uuid);

create or replace function public.arc_create_guest_order(
  p_items     jsonb,   -- [{ "product_id": uuid, "qty": int, "mod_ids": [uuid] }]
  p_email     text,
  p_discord   text,
  p_embark_id text,
  p_platform  public.arc_game_platform,
  p_note      text,
  p_user_id   uuid,
  p_currency  text    -- ARS (transferencia) o USD (PayPal)
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
  v_currency   text := upper(coalesce(p_currency, 'ARS'));
  v_rate       numeric;
  v_total      int;
begin
  if p_user_id is not null and exists (
       select 1 from public."ARC_profiles" where id = p_user_id and is_blocked) then
    raise exception 'ARC_BLOCKED';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'ARC_INVALID_EMAIL'; end if;
  if v_discord !~ '^[a-z0-9_.]{2,32}$' or v_discord like '%..%' then raise exception 'ARC_INVALID_DISCORD'; end if;
  -- Moneda: ARS por transferencia; USD por PayPal con el tipo de cambio de ARC_settings
  if v_currency not in ('ARS', 'USD') then raise exception 'ARC_INVALID_CURRENCY'; end if;
  if v_currency = 'USD' then
    v_rate := (select nullif(value #>> '{}', '')::numeric from public."ARC_settings" where key = 'usd_rate');
    if v_rate is null or v_rate <= 0
       or coalesce((select value #>> '{}' from public."ARC_settings" where key = 'paypal_email'), '') = '' then
      raise exception 'ARC_USD_DISABLED';
    end if;
  end if;

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

  -- 3. Total en la moneda del pedido (los precios base están en centavos de ARS)
  v_total := case when v_currency = 'USD' then ceil(v_subtotal / v_rate)::int else v_subtotal end;

  -- 4. Pedido, líneas y reserva de stock
  v_code := public.arc_new_order_code();
  insert into public."ARC_orders" (
    user_id, guest_email, public_code, status, payment_mode, payment_status,
    subtotal_cents, discount_cents, total_cents, currency, base_total_cents, exchange_rate, payment_method,
    embark_id, platform, availability_note, discord_username, reserved_until)
  values (
    p_user_id, v_email, v_code, 'requested', 'discord', 'unpaid',
    v_total, 0, v_total, v_currency, v_subtotal, v_rate,
    case when v_currency = 'USD' then 'paypal' else 'transfer' end,
    trim(p_embark_id), p_platform, nullif(trim(coalesce(p_note, '')), ''),
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
    'order_id', v_order_id, 'number', v_number, 'public_code', v_code, 'total_cents', v_total, 'currency', v_currency);
end;
$$;

revoke execute on function public.arc_create_guest_order(jsonb, text, text, text, public.arc_game_platform, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.arc_create_guest_order(jsonb, text, text, text, public.arc_game_platform, text, uuid, text)
  to service_role;

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
    'payment_method', o.payment_method,
    'exchange_rate', o.exchange_rate,
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
                      'discord_invite_url', 'discord_delivery_channel', 'paypal_email'))
  )
  from public."ARC_orders" o
  where o.public_code = upper(trim(p_code));
$$;

create or replace function public.arc_admin_list_users()
returns table (
  id                   uuid,
  username             text,
  email                text,
  discord_username     text,
  embark_id            text,
  platform             public.arc_game_platform,
  role                 public.arc_app_role,
  is_owner             boolean,
  is_blocked           boolean,
  created_at           timestamptz,
  orders_count         bigint,
  spent_cents          bigint,
  last_order_at        timestamptz,
  pending_appointments bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.arc_is_admin() then raise exception 'ARC_FORBIDDEN' using errcode = '42501'; end if;

  return query
  select
    p.id, p.username, u.email::text, p.discord_username, p.embark_id, p.platform,
    p.role, p.is_owner, p.is_blocked, p.created_at,
    (select count(*) from public."ARC_orders" o where o.user_id = p.id and o.status <> 'cancelled'),
    (select coalesce(sum(coalesce(o.base_total_cents, o.total_cents)), 0)::bigint from public."ARC_orders" o
      where o.user_id = p.id and o.payment_status in ('paid_online', 'paid_manual')),
    (select max(o.created_at) from public."ARC_orders" o where o.user_id = p.id),
    (select count(*) from public."ARC_appointments" ap
      where ap.admin_id = p.id and ap.status in ('booked', 'checked_in') and ap.slot_end > now())
  from public."ARC_profiles" p
  join auth.users u on u.id = p.id
  order by p.is_owner desc, (p.role = 'admin') desc, p.created_at desc;
end;
$$;
