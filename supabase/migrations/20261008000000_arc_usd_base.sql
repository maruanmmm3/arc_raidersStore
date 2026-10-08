-- Moneda base USD: los precios se cargan y guardan en centavos de dólar.
-- El comprador paga en USD (PayPal) o en ARS (transferencia), convertido con ARC_settings.usd_rate.
-- base_total_cents del pedido pasa a ser el total en USD; exchange_rate, el cambio usado si pagó en pesos.

alter table public."ARC_orders" alter column currency set default 'USD';

-- Precios: los de ejemplo estaban en centavos de ARS (×1.000 del valor en dólares) y vuelven a USD.
-- Los cargados a mano después (menos de $ 1.000) ya se pensaron en dólares y se mantienen.
update public."ARC_products"
set price_cents = case when price_cents >= 100000 then round(price_cents / 1000.0)::int else price_cents end,
    compare_at_cents = case when compare_at_cents >= 100000 then round(compare_at_cents / 1000.0)::int else compare_at_cents end;

create or replace function public.arc_create_guest_order(
  p_items     jsonb,   -- [{ "product_id": uuid, "qty": int, "mod_ids": [uuid] }]
  p_email     text,
  p_discord   text,
  p_embark_id text,
  p_platform  public.arc_game_platform,
  p_note      text,
  p_user_id   uuid,
  p_currency  text    -- USD (PayPal) o ARS (transferencia, convertido con usd_rate)
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
  v_currency   text := upper(coalesce(p_currency, 'USD'));
  v_rate       numeric;
  v_total      int;
begin
  if p_user_id is not null and exists (
       select 1 from public."ARC_profiles" where id = p_user_id and is_blocked) then
    raise exception 'ARC_BLOCKED';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'ARC_INVALID_EMAIL'; end if;
  if v_discord !~ '^[a-z0-9_.]{2,32}$' or v_discord like '%..%' then raise exception 'ARC_INVALID_DISCORD'; end if;
  -- Moneda: los precios base están en USD. USD se paga por PayPal; ARS por transferencia,
  -- convertido con el tipo de cambio de ARC_settings (pesos por 1 dólar).
  if v_currency not in ('ARS', 'USD') then raise exception 'ARC_INVALID_CURRENCY'; end if;
  if v_currency = 'USD'
     and coalesce((select value #>> '{}' from public."ARC_settings" where key = 'paypal_email'), '') = '' then
    raise exception 'ARC_USD_DISABLED';
  end if;
  if v_currency = 'ARS' then
    v_rate := (select nullif(value #>> '{}', '')::numeric from public."ARC_settings" where key = 'usd_rate');
    if v_rate is null or v_rate <= 0 then raise exception 'ARC_ARS_DISABLED'; end if;
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

  -- 3. Total en la moneda del pedido (base en centavos de USD; en pesos se redondea al peso entero)
  v_total := case when v_currency = 'ARS' then (ceil(v_subtotal * v_rate / 100) * 100)::int else v_subtotal end;

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
