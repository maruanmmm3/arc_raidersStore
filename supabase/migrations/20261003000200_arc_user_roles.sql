-- Roles: un admin principal (dueño) que es el único que puede dar o quitar el rol admin,
-- y un máximo de admins (por defecto 2) garantizado por la base de datos.

alter table public."ARC_profiles" add column is_owner boolean not null default false;

-- Solo puede haber un dueño, y el dueño siempre es admin
create unique index arc_profiles_single_owner_key on public."ARC_profiles" (is_owner) where is_owner;
alter table public."ARC_profiles"
  add constraint arc_profiles_owner_is_admin check (not is_owner or role = 'admin');

insert into public."ARC_settings" (key, value, is_public)
values ('max_admins', '2'::jsonb, true)
on conflict (key) do nothing;

-- Límite de admins: se comprueba en cualquier cambio de rol, venga de donde venga
create or replace function public.arc_enforce_admin_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'admin' and (tg_op = 'INSERT' or old.role is distinct from 'admin') then
    if (select count(*) from public."ARC_profiles" where role = 'admin' and id <> new.id)
       >= public.arc_setting_int('max_admins', 2) then
      raise exception 'ARC_ADMIN_LIMIT';
    end if;
  end if;
  return new;
end;
$$;

create trigger arc_profiles_admin_limit
  before insert or update of role on public."ARC_profiles"
  for each row execute function public.arc_enforce_admin_limit();

create or replace function public.arc_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public."ARC_profiles"
    where id = (select auth.uid()) and is_owner and role = 'admin' and not is_blocked
  );
$$;

-- Solo el dueño cambia roles; no puede cambiarse a sí mismo ni tocar a otro dueño
create or replace function public.arc_owner_set_role(p_user_id uuid, p_role public.arc_app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.arc_is_owner() then raise exception 'ARC_FORBIDDEN' using errcode = '42501'; end if;
  if p_user_id = (select auth.uid()) then raise exception 'ARC_CANNOT_CHANGE_SELF'; end if;

  -- Serializa los cambios de rol para que el límite no se salte con dos peticiones simultáneas
  perform pg_advisory_xact_lock(hashtext('arc_admin_roles'));

  update public."ARC_profiles" set role = p_role where id = p_user_id and not is_owner;
  if not found then raise exception 'ARC_NOT_FOUND'; end if;
end;
$$;

-- Lista de usuarios de ARC para el panel (email incluido, que vive en auth.users)
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
    (select coalesce(sum(o.total_cents), 0)::bigint from public."ARC_orders" o
      where o.user_id = p.id and o.payment_status in ('paid_online', 'paid_manual')),
    (select max(o.created_at) from public."ARC_orders" o where o.user_id = p.id),
    (select count(*) from public."ARC_appointments" ap
      where ap.admin_id = p.id and ap.status in ('booked', 'checked_in') and ap.slot_end > now())
  from public."ARC_profiles" p
  join auth.users u on u.id = p.id
  order by p.is_owner desc, (p.role = 'admin') desc, p.created_at desc;
end;
$$;

revoke execute on function public.arc_enforce_admin_limit() from public, anon, authenticated;
revoke execute on function public.arc_is_owner() from public, anon;
revoke execute on function public.arc_owner_set_role(uuid, public.arc_app_role) from public, anon;
revoke execute on function public.arc_admin_list_users() from public, anon;
grant execute on function public.arc_is_owner() to authenticated;
grant execute on function public.arc_owner_set_role(uuid, public.arc_app_role) to authenticated;
grant execute on function public.arc_admin_list_users() to authenticated;

-- Admin principal: la cuenta del dueño del proyecto (maruan123trabajo@gmail.com)
update public."ARC_profiles" set is_owner = true where id = 'd38bc888-11e0-416e-9591-8f11bc34d8a7';
