-- El checkout pide el usuario de Discord del comprador (obligatorio) para que el staff pueda contactarlo.
-- arc_create_order recibe un parámetro nuevo; se sustituye la versión anterior.

drop function public.arc_create_order(uuid, jsonb, text, public.arc_game_platform, text, text,
  public.arc_payment_mode, timestamptz);

create or replace function public.arc_create_order(
  p_user_id      uuid,
  p_items        jsonb,   -- [{ "product_id": uuid, "qty": int, "mod_ids": [uuid] }]
  p_embark_id    text,
  p_platform     public.arc_game_platform,
  p_region       text,
  p_note         text,
  p_payment_mode public.arc_payment_mode,
  p_slot_start   timestamptz,
  p_discord_username text   -- usuario de Discord para contactar al comprador
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
  v_discord    text;
begin
  select * into v_profile from public."ARC_profiles" where id = p_user_id;
  if not found then raise exception 'ARC_NO_PROFILE'; end if;
  if v_profile.is_blocked then raise exception 'ARC_BLOCKED'; end if;

  -- Usuario de Discord (formato actual: 2-32 caracteres, minúsculas, números, "_" y ".")
  v_discord := regexp_replace(lower(trim(coalesce(p_discord_username, ''))), '^@', '');
  if v_discord !~ '^[a-z0-9_.]{2,32}$' or v_discord like '%..%' then
    raise exception 'ARC_INVALID_DISCORD';
  end if;

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
    v_discord, v_admin, p_slot_start + v_len + interval '24 hours')
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
  public.arc_payment_mode, timestamptz, text) from public, anon, authenticated;
grant execute on function public.arc_create_order(uuid, jsonb, text, public.arc_game_platform, text, text,
  public.arc_payment_mode, timestamptz, text) to service_role;

-- El jugador puede guardar su usuario de Discord en el perfil (además de vincularlo con el login de Discord)
grant update (discord_username) on public."ARC_profiles" to authenticated;
