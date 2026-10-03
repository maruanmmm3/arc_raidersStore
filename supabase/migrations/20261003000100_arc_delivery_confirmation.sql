-- Conformidad del cliente: tras la entrega, el comprador confirma que ha recibido el producto.
-- Queda registrada con fecha en el pedido y en su cronología.

alter table public."ARC_orders" add column buyer_confirmed_at timestamptz;

alter table public."ARC_order_status_history" drop constraint "ARC_order_status_history_field_check";
alter table public."ARC_order_status_history"
  add constraint arc_status_history_field_check
  check (field in ('status', 'payment_status', 'buyer_confirmation'));

create or replace function public.arc_confirm_delivery(p_order_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public."ARC_orders";
begin
  select * into o from public."ARC_orders"
  where id = p_order_id and user_id = (select auth.uid())
  for update;
  if not found then raise exception 'ARC_NOT_FOUND'; end if;
  if o.status <> 'delivered' then raise exception 'ARC_NOT_DELIVERED'; end if;
  if o.buyer_confirmed_at is not null then return o.buyer_confirmed_at; end if;

  update public."ARC_orders" set buyer_confirmed_at = now() where id = o.id;
  insert into public."ARC_order_status_history" (order_id, field, from_value, to_value, changed_by)
  values (o.id, 'buyer_confirmation', null, 'confirmed', (select auth.uid()));
  return now();
end;
$$;

revoke execute on function public.arc_confirm_delivery(uuid) from public, anon;
grant execute on function public.arc_confirm_delivery(uuid) to authenticated;

-- El ticket incluye ahora la fecha de entrega y la conformidad del cliente
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
      'embark_id', o.embark_id, 'platform', o.platform,
      'delivered_at', o.delivered_at, 'buyer_confirmed_at', o.buyer_confirmed_at),
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
                   and ap.slot_start > now() + make_interval(hours => public.arc_setting_int('reschedule_cutoff_hours', 3))),
    'can_confirm', (o.status = 'delivered' and o.buyer_confirmed_at is null and o.user_id = (select auth.uid()))
  )
  from public."ARC_appointments" ap
  join public."ARC_orders" o on o.id = ap.order_id
  join public."ARC_discord_rooms" r on r.id = ap.room_id
  join public."ARC_profiles" ad on ad.id = ap.admin_id
  where ap.ticket_code = upper(trim(p_code))
    and (o.user_id = (select auth.uid()) or public.arc_is_admin());
$$;
