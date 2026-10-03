-- Catálogo de ARC: productos (armas, planos, mods, packs), traducciones, detalles por tipo,
-- compatibilidades, imágenes y configuración global.
-- Los nombres de restricciones son explícitos porque supabase-js los usa para desambiguar joins.

create table public."ARC_products" (
  id                  uuid primary key default gen_random_uuid(),
  kind                public.arc_product_kind not null,
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  rarity              public.arc_rarity not null default 'common',
  price_cents         integer not null check (price_cents >= 0),
  compare_at_cents    integer check (compare_at_cents is null or compare_at_cents > price_cents),
  stock               integer check (stock is null or stock >= 0),          -- null = ilimitado
  reserved            integer not null default 0 check (reserved >= 0),
  is_visible          boolean not null default false,
  featured_rank       smallint,                                              -- null = no destacado
  low_stock_threshold integer check (low_stock_threshold is null or low_stock_threshold >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint arc_products_reserved_le_stock check (stock is null or reserved <= stock)
);

create index arc_products_kind_visible_idx on public."ARC_products" (kind, is_visible);
create index arc_products_featured_idx on public."ARC_products" (featured_rank) where featured_rank is not null;

create trigger arc_products_updated_at
  before update on public."ARC_products"
  for each row execute function public.arc_set_updated_at();

create table public."ARC_product_translations" (
  product_id  uuid not null,
  locale      text not null check (locale in ('es', 'en')),
  name        text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  effect      text,                                                          -- para mods
  primary key (product_id, locale),
  constraint arc_translations_product_fk foreign key (product_id)
    references public."ARC_products" (id) on delete cascade
);

create table public."ARC_weapon_details" (
  product_id  uuid primary key,
  weapon_type public.arc_weapon_type not null,
  tier        smallint not null default 1 check (tier between 1 and 4),
  -- { "damage": 40, "fire_rate": 600, "range": 55, "stability": 70, "magazine": 30 }
  stats       jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object'),
  constraint arc_weapon_details_product_fk foreign key (product_id)
    references public."ARC_products" (id) on delete cascade
);

create table public."ARC_mod_details" (
  product_id uuid primary key,
  slot       public.arc_mod_slot not null,
  constraint arc_mod_details_product_fk foreign key (product_id)
    references public."ARC_products" (id) on delete cascade
);

create table public."ARC_blueprint_details" (
  product_id         uuid primary key,
  unlocks_product_id uuid,
  tier               smallint not null default 1 check (tier between 1 and 4),
  constraint arc_blueprint_product_fk foreign key (product_id)
    references public."ARC_products" (id) on delete cascade,
  constraint arc_blueprint_unlocks_fk foreign key (unlocks_product_id)
    references public."ARC_products" (id) on delete set null
);

create table public."ARC_weapon_mod_compat" (
  weapon_id uuid not null,
  mod_id    uuid not null,
  primary key (weapon_id, mod_id),
  constraint arc_compat_weapon_fk foreign key (weapon_id)
    references public."ARC_products" (id) on delete cascade,
  constraint arc_compat_mod_fk foreign key (mod_id)
    references public."ARC_products" (id) on delete cascade
);

create index arc_weapon_mod_compat_mod_idx on public."ARC_weapon_mod_compat" (mod_id);

-- Garantiza que la compatibilidad une un arma con un mod
create or replace function public.arc_check_weapon_mod_kinds()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select kind from public."ARC_products" where id = new.weapon_id) <> 'weapon' then
    raise exception 'weapon_id % no es un arma', new.weapon_id;
  end if;
  if (select kind from public."ARC_products" where id = new.mod_id) <> 'mod' then
    raise exception 'mod_id % no es una modificación', new.mod_id;
  end if;
  return new;
end;
$$;

create trigger arc_weapon_mod_compat_kinds
  before insert or update on public."ARC_weapon_mod_compat"
  for each row execute function public.arc_check_weapon_mod_kinds();

create table public."ARC_bundle_items" (
  bundle_id  uuid not null,
  product_id uuid not null,
  qty        integer not null default 1 check (qty > 0),
  primary key (bundle_id, product_id),
  check (bundle_id <> product_id),
  constraint arc_bundle_items_bundle_fk foreign key (bundle_id)
    references public."ARC_products" (id) on delete cascade,
  constraint arc_bundle_items_product_fk foreign key (product_id)
    references public."ARC_products" (id) on delete restrict
);

create table public."ARC_product_images" (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null,
  storage_path text not null,
  alt          text,
  sort         smallint not null default 0,
  constraint arc_product_images_product_fk foreign key (product_id)
    references public."ARC_products" (id) on delete cascade
);

create index arc_product_images_product_idx on public."ARC_product_images" (product_id, sort);

create table public."ARC_settings" (
  key        text primary key,
  value      jsonb not null,
  is_public  boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger arc_settings_updated_at
  before update on public."ARC_settings"
  for each row execute function public.arc_set_updated_at();

insert into public."ARC_settings" (key, value, is_public) values
  ('discord_invite_url',      '""'::jsonb,               true),
  ('online_payment_enabled',  'false'::jsonb,            true),
  ('store_timezone',          '"America/Lima"'::jsonb,   true),
  ('slot_minutes',            '30'::jsonb,               true),
  ('min_notice_hours',        '2'::jsonb,                true),
  ('max_days_ahead',          '14'::jsonb,               true),
  ('reschedule_limit',        '2'::jsonb,                true),
  ('reschedule_cutoff_hours', '3'::jsonb,                true),
  ('low_stock_threshold',     '3'::jsonb,                false);

-- ---------------------------------------------------------------------------
-- RLS
-- Público: solo productos visibles. Admin: todo.
-- ---------------------------------------------------------------------------

alter table public."ARC_products"             enable row level security;
alter table public."ARC_product_translations" enable row level security;
alter table public."ARC_weapon_details"       enable row level security;
alter table public."ARC_mod_details"          enable row level security;
alter table public."ARC_blueprint_details"    enable row level security;
alter table public."ARC_weapon_mod_compat"    enable row level security;
alter table public."ARC_bundle_items"         enable row level security;
alter table public."ARC_product_images"       enable row level security;
alter table public."ARC_settings"             enable row level security;

create policy "arc_products_read_visible"
  on public."ARC_products" for select
  using (is_visible or public.arc_is_admin());

create policy "arc_products_admin_write"
  on public."ARC_products" for all
  to authenticated
  using (public.arc_is_admin())
  with check (public.arc_is_admin());

-- Tablas hijas: visibles si su producto lo es
create or replace function public.arc_product_is_readable(pid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public."ARC_products" p
    where p.id = pid and (p.is_visible or public.arc_is_admin())
  );
$$;

create policy "arc_translations_read" on public."ARC_product_translations" for select
  using (public.arc_product_is_readable(product_id));
create policy "arc_translations_admin" on public."ARC_product_translations" for all to authenticated
  using (public.arc_is_admin()) with check (public.arc_is_admin());

create policy "arc_weapon_details_read" on public."ARC_weapon_details" for select
  using (public.arc_product_is_readable(product_id));
create policy "arc_weapon_details_admin" on public."ARC_weapon_details" for all to authenticated
  using (public.arc_is_admin()) with check (public.arc_is_admin());

create policy "arc_mod_details_read" on public."ARC_mod_details" for select
  using (public.arc_product_is_readable(product_id));
create policy "arc_mod_details_admin" on public."ARC_mod_details" for all to authenticated
  using (public.arc_is_admin()) with check (public.arc_is_admin());

create policy "arc_blueprint_details_read" on public."ARC_blueprint_details" for select
  using (public.arc_product_is_readable(product_id));
create policy "arc_blueprint_details_admin" on public."ARC_blueprint_details" for all to authenticated
  using (public.arc_is_admin()) with check (public.arc_is_admin());

create policy "arc_compat_read" on public."ARC_weapon_mod_compat" for select
  using (public.arc_product_is_readable(weapon_id) and public.arc_product_is_readable(mod_id));
create policy "arc_compat_admin" on public."ARC_weapon_mod_compat" for all to authenticated
  using (public.arc_is_admin()) with check (public.arc_is_admin());

create policy "arc_bundle_items_read" on public."ARC_bundle_items" for select
  using (public.arc_product_is_readable(bundle_id));
create policy "arc_bundle_items_admin" on public."ARC_bundle_items" for all to authenticated
  using (public.arc_is_admin()) with check (public.arc_is_admin());

create policy "arc_images_read" on public."ARC_product_images" for select
  using (public.arc_product_is_readable(product_id));
create policy "arc_images_admin" on public."ARC_product_images" for all to authenticated
  using (public.arc_is_admin()) with check (public.arc_is_admin());

create policy "arc_settings_read_public" on public."ARC_settings" for select
  using (is_public or public.arc_is_admin());
create policy "arc_settings_admin" on public."ARC_settings" for all to authenticated
  using (public.arc_is_admin()) with check (public.arc_is_admin());

-- ---------------------------------------------------------------------------
-- Storage: bucket público de imágenes; solo admins de ARC suben, cambian o borran.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arc-product-images', 'arc-product-images', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "arc_product_images_admin_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'arc-product-images' and public.arc_is_admin());

create policy "arc_product_images_admin_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'arc-product-images' and public.arc_is_admin())
  with check (bucket_id = 'arc-product-images' and public.arc_is_admin());

create policy "arc_product_images_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'arc-product-images' and public.arc_is_admin());
