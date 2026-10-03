-- Perfiles de ARC, roles y función arc_is_admin().
--
-- Los usuarios de auth.users se comparten con las otras apps del proyecto. Para no añadir
-- otro trigger al registro, el perfil de ARC se crea la primera vez que el usuario entra
-- en la tienda, con la RPC arc_ensure_profile().

create or replace function public.arc_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public."ARC_profiles" (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text not null
                   check (char_length(username) between 3 and 32 and username ~ '^[A-Za-z0-9_]+$'),
  -- ID de Embark: Nombre#1234
  embark_id        text check (embark_id is null or embark_id ~ '^[^#\s]{2,32}#[0-9]{3,6}$'),
  platform         public.arc_game_platform,
  discord_id       text,
  discord_username text,
  role             public.arc_app_role not null default 'user',
  is_blocked       boolean not null default false,
  locale           text not null default 'es' check (locale in ('es', 'en')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Nombre de usuario único sin distinguir mayúsculas
create unique index arc_profiles_username_key on public."ARC_profiles" (lower(username));
create unique index arc_profiles_discord_id_key on public."ARC_profiles" (discord_id) where discord_id is not null;

create trigger arc_profiles_updated_at
  before update on public."ARC_profiles"
  for each row execute function public.arc_set_updated_at();

-- Devuelve el perfil del usuario actual y lo crea si aún no existe
create or replace function public.arc_ensure_profile()
returns public."ARC_profiles"
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  u          auth.users%rowtype;
  meta       jsonb;
  is_discord boolean;
  base       text;
  result     public."ARC_profiles";
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into result from public."ARC_profiles" where id = uid;
  if found then
    return result;
  end if;

  select * into u from auth.users where id = uid;
  meta := coalesce(u.raw_user_meta_data, '{}'::jsonb);
  is_discord := coalesce(u.raw_app_meta_data ->> 'provider', '') = 'discord';

  base := lower(regexp_replace(
    coalesce(meta ->> 'username', meta ->> 'name', meta ->> 'full_name',
             split_part(coalesce(u.email, ''), '@', 1)),
    '[^A-Za-z0-9_]', '', 'g'));
  if base is null or char_length(base) < 3 then
    base := 'raider';
  end if;
  base := left(base, 24);
  if exists (select 1 from public."ARC_profiles" p where lower(p.username) = base) then
    base := base || '_' || substr(replace(uid::text, '-', ''), 1, 6);
  end if;

  insert into public."ARC_profiles" (id, username, discord_id, discord_username, locale)
  values (
    uid,
    base,
    case when is_discord then meta ->> 'provider_id' end,
    case when is_discord then coalesce(meta ->> 'full_name', meta ->> 'name') end,
    case when meta ->> 'locale' in ('es', 'en') then meta ->> 'locale' else 'es' end
  )
  on conflict (id) do nothing;

  select * into result from public."ARC_profiles" where id = uid;
  return result;
end;
$$;

revoke execute on function public.arc_ensure_profile() from public, anon;
grant execute on function public.arc_ensure_profile() to authenticated;

-- ¿El usuario actual es admin de ARC? security definer para leer perfiles sin pasar por RLS.
-- En v1 se añadirá: and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'  (MFA obligatorio)
create or replace function public.arc_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."ARC_profiles"
    where id = (select auth.uid())
      and role = 'admin'
      and not is_blocked
  );
$$;

-- RLS: cada usuario ve y edita su perfil; el admin ve todos.
alter table public."ARC_profiles" enable row level security;

create policy "arc_profiles_select_own_or_admin"
  on public."ARC_profiles" for select
  to authenticated
  using (id = (select auth.uid()) or public.arc_is_admin());

create policy "arc_profiles_update_own"
  on public."ARC_profiles" for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- El usuario solo puede cambiar estas columnas. role e is_blocked se cambian
-- con RPCs de admin (v1), nunca desde el cliente. Los inserts los hace arc_ensure_profile().
revoke all on public."ARC_profiles" from anon;
revoke insert, update, delete on public."ARC_profiles" from authenticated;
grant select on public."ARC_profiles" to authenticated;
grant update (username, embark_id, platform, locale) on public."ARC_profiles" to authenticated;
