-- Admin de productos: guardar un producto completo (datos, traducciones, detalles por tipo,
-- compatibilidades y contenido de packs) en una sola transacción.

create or replace function public.arc_admin_save_product(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid := p_id;
  v_kind     public.arc_product_kind := (p_data ->> 'kind')::public.arc_product_kind;
  v_existing public.arc_product_kind;
  v_locale   text;
  v_mod_ids  uuid[];
begin
  if not public.arc_is_admin() then raise exception 'ARC_FORBIDDEN' using errcode = '42501'; end if;
  if v_kind is null then raise exception 'ARC_INVALID_PRODUCT'; end if;
  if coalesce(trim(p_data #>> '{translations,es,name}'), '') = ''
     or coalesce(trim(p_data #>> '{translations,en,name}'), '') = '' then
    raise exception 'ARC_TRANSLATIONS_REQUIRED';
  end if;

  if v_id is null then
    insert into public."ARC_products" (
      kind, slug, rarity, price_cents, compare_at_cents, stock, is_visible, featured_rank, low_stock_threshold)
    values (
      v_kind,
      p_data ->> 'slug',
      (p_data ->> 'rarity')::public.arc_rarity,
      (p_data ->> 'price_cents')::int,
      (p_data ->> 'compare_at_cents')::int,
      (p_data ->> 'stock')::int,
      coalesce((p_data ->> 'is_visible')::boolean, false),
      (p_data ->> 'featured_rank')::smallint,
      (p_data ->> 'low_stock_threshold')::int)
    returning id into v_id;
  else
    select kind into v_existing from public."ARC_products" where id = v_id for update;
    if not found then raise exception 'ARC_NOT_FOUND'; end if;
    if v_existing <> v_kind then raise exception 'ARC_KIND_IMMUTABLE'; end if;

    update public."ARC_products"
    set slug                = p_data ->> 'slug',
        rarity              = (p_data ->> 'rarity')::public.arc_rarity,
        price_cents         = (p_data ->> 'price_cents')::int,
        compare_at_cents    = (p_data ->> 'compare_at_cents')::int,
        stock               = (p_data ->> 'stock')::int,
        is_visible          = coalesce((p_data ->> 'is_visible')::boolean, false),
        featured_rank       = (p_data ->> 'featured_rank')::smallint,
        low_stock_threshold = (p_data ->> 'low_stock_threshold')::int
    where id = v_id;
  end if;

  -- Traducciones: siempre ES y EN
  foreach v_locale in array array['es', 'en'] loop
    insert into public."ARC_product_translations" (product_id, locale, name, description, effect)
    values (
      v_id,
      v_locale,
      trim(p_data #>> array['translations', v_locale, 'name']),
      coalesce(trim(p_data #>> array['translations', v_locale, 'description']), ''),
      nullif(trim(coalesce(p_data #>> array['translations', v_locale, 'effect'], '')), ''))
    on conflict (product_id, locale) do update
    set name = excluded.name, description = excluded.description, effect = excluded.effect;
  end loop;

  if v_kind = 'weapon' then
    insert into public."ARC_weapon_details" (product_id, weapon_type, tier, stats)
    values (
      v_id,
      (p_data #>> '{weapon,weapon_type}')::public.arc_weapon_type,
      coalesce((p_data #>> '{weapon,tier}')::smallint, 1),
      coalesce(p_data #> '{weapon,stats}', '{}'::jsonb))
    on conflict (product_id) do update
    set weapon_type = excluded.weapon_type, tier = excluded.tier, stats = excluded.stats;

    if p_data ? 'compatible_mod_ids' then
      v_mod_ids := coalesce(array(select jsonb_array_elements_text(p_data -> 'compatible_mod_ids')::uuid), '{}');
      delete from public."ARC_weapon_mod_compat" where weapon_id = v_id and mod_id <> all (v_mod_ids);
      insert into public."ARC_weapon_mod_compat" (weapon_id, mod_id)
      select v_id, unnest(v_mod_ids)
      on conflict do nothing;
    end if;

  elsif v_kind = 'mod' then
    insert into public."ARC_mod_details" (product_id, slot)
    values (v_id, (p_data #>> '{mod,slot}')::public.arc_mod_slot)
    on conflict (product_id) do update set slot = excluded.slot;

  elsif v_kind = 'blueprint' then
    insert into public."ARC_blueprint_details" (product_id, unlocks_product_id, tier)
    values (
      v_id,
      (p_data #>> '{blueprint,unlocks_product_id}')::uuid,
      coalesce((p_data #>> '{blueprint,tier}')::smallint, 1))
    on conflict (product_id) do update
    set unlocks_product_id = excluded.unlocks_product_id, tier = excluded.tier;

  elsif v_kind = 'bundle' and p_data ? 'bundle_items' then
    delete from public."ARC_bundle_items" where bundle_id = v_id;
    insert into public."ARC_bundle_items" (bundle_id, product_id, qty)
    select v_id, (e ->> 'product_id')::uuid, coalesce((e ->> 'qty')::int, 1)
    from jsonb_array_elements(p_data -> 'bundle_items') e;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.arc_admin_save_product(uuid, jsonb) from public, anon;
grant execute on function public.arc_admin_save_product(uuid, jsonb) to authenticated;

-- Email de contacto que muestra la página /contacto (vacío = no se muestra)
insert into public."ARC_settings" (key, value, is_public)
values ('contact_email', '""'::jsonb, true)
on conflict (key) do nothing;
