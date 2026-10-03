-- Pedidos de ARC: cabecera, líneas (los mods cuelgan de su arma), historial de estados y notas internas.
-- Los clientes solo leen. Crear y cambiar pedidos se hace con funciones del servidor (siguiente migración).

create table public."ARC_orders" (
  id                  uuid primary key default gen_random_uuid(),
  number              bigint generated always as identity (start with 1001) unique,  -- se muestra como BX-001001
  user_id             uuid not null,
  status              public.arc_order_status not null default 'requested',
  payment_mode        public.arc_payment_mode not null,
  payment_status      public.arc_payment_status not null default 'unpaid',
  subtotal_cents      integer not null check (subtotal_cents >= 0),
  discount_cents      integer not null default 0 check (discount_cents >= 0),
  total_cents         integer not null check (total_cents >= 0),
  currency            text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  payment_method      text,
  payment_reference   text,
  provider            text,
  provider_session_id text,
  provider_payment_id text,
  -- Datos del jugador copiados al pedido: el reporte no cambia si luego edita su perfil
  embark_id           text not null check (embark_id ~ '^[^#\s]{2,32}#[0-9]{3,6}$'),
  platform            public.arc_game_platform not null,
  region              text check (char_length(region) <= 40),
  availability_note   text check (char_length(availability_note) <= 500),
  discord_username    text,
  assigned_to         uuid,
  reserved_until      timestamptz,
  paid_at             timestamptz,
  delivered_at        timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint arc_orders_user_fk foreign key (user_id)
    references public."ARC_profiles" (id) on delete restrict,
  constraint arc_orders_assigned_fk foreign key (assigned_to)
    references public."ARC_profiles" (id) on delete set null,
  constraint arc_orders_total_check check (total_cents = subtotal_cents - discount_cents)
);

create index arc_orders_user_idx on public."ARC_orders" (user_id, created_at desc);
create index arc_orders_status_idx on public."ARC_orders" (status, created_at desc);

create trigger arc_orders_updated_at
  before update on public."ARC_orders"
  for each row execute function public.arc_set_updated_at();

create table public."ARC_order_items" (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null,
  product_id       uuid not null,
  parent_item_id   uuid,                       -- mod montado en el arma de esta línea
  kind             public.arc_product_kind not null,
  names            jsonb not null,             -- {"es": "...", "en": "..."} en el momento de la compra
  unit_price_cents integer not null check (unit_price_cents >= 0),
  qty              integer not null check (qty between 1 and 10),
  constraint arc_order_items_order_fk foreign key (order_id)
    references public."ARC_orders" (id) on delete cascade,
  constraint arc_order_items_product_fk foreign key (product_id)
    references public."ARC_products" (id) on delete restrict,
  constraint arc_order_items_parent_fk foreign key (parent_item_id)
    references public."ARC_order_items" (id) on delete cascade
);

create index arc_order_items_order_idx on public."ARC_order_items" (order_id);

create table public."ARC_order_status_history" (
  id         bigint generated always as identity primary key,
  order_id   uuid not null,
  field      text not null check (field in ('status', 'payment_status')),
  from_value text,
  to_value   text not null,
  changed_by uuid,                              -- null = sistema
  note       text,
  created_at timestamptz not null default now(),
  constraint arc_status_history_order_fk foreign key (order_id)
    references public."ARC_orders" (id) on delete cascade
);

create index arc_status_history_order_idx on public."ARC_order_status_history" (order_id, created_at);

create table public."ARC_order_notes" (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null,
  author_id  uuid,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint arc_order_notes_order_fk foreign key (order_id)
    references public."ARC_orders" (id) on delete cascade,
  constraint arc_order_notes_author_fk foreign key (author_id)
    references public."ARC_profiles" (id) on delete set null
);

-- Cronología: cada cambio de status o payment_status queda registrado.
-- Las funciones de admin pasan la nota con set_config('arc.status_note', ..., true).
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

create trigger arc_orders_log_status
  after insert or update of status, payment_status on public."ARC_orders"
  for each row execute function public.arc_log_order_status();

-- ---------------------------------------------------------------------------
-- RLS: cada usuario lee sus pedidos; el admin, todos. Nadie escribe desde el cliente.
-- ---------------------------------------------------------------------------

alter table public."ARC_orders"               enable row level security;
alter table public."ARC_order_items"          enable row level security;
alter table public."ARC_order_status_history" enable row level security;
alter table public."ARC_order_notes"          enable row level security;

create or replace function public.arc_order_is_readable(oid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public."ARC_orders" o
    where o.id = oid and (o.user_id = (select auth.uid()) or public.arc_is_admin())
  );
$$;

create policy "arc_orders_read_own_or_admin" on public."ARC_orders" for select to authenticated
  using (user_id = (select auth.uid()) or public.arc_is_admin());

create policy "arc_order_items_read" on public."ARC_order_items" for select to authenticated
  using (public.arc_order_is_readable(order_id));

create policy "arc_status_history_read" on public."ARC_order_status_history" for select to authenticated
  using (public.arc_order_is_readable(order_id));

create policy "arc_order_notes_admin_read" on public."ARC_order_notes" for select to authenticated
  using (public.arc_is_admin());
create policy "arc_order_notes_admin_insert" on public."ARC_order_notes" for insert to authenticated
  with check (public.arc_is_admin() and author_id = (select auth.uid()));

revoke all on public."ARC_orders", public."ARC_order_items", public."ARC_order_status_history",
              public."ARC_order_notes" from anon;
revoke insert, update, delete on public."ARC_orders", public."ARC_order_items",
              public."ARC_order_status_history" from authenticated;
revoke update, delete on public."ARC_order_notes" from authenticated;
