-- Pedidos sin pagar: se cancelan pasado reserved_until (48 h) y liberan el stock reservado.
-- No hay pg_cron en el proyecto: se llama al crear un pedido (Edge Function) y al abrir /admin/pedidos.

create or replace function public.arc_expire_unpaid_orders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public."ARC_orders";
  n int := 0;
begin
  perform set_config('arc.status_note', 'Cancelado automáticamente: sin pago en 48 horas', true);
  for o in
    select * from public."ARC_orders"
    where status = 'requested' and payment_status = 'unpaid'
      and reserved_until is not null and reserved_until < now()
    for update skip locked
  loop
    update public."ARC_orders" set status = 'cancelled', cancelled_at = now() where id = o.id;
    perform public.arc_apply_order_stock(o.id, false);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.arc_expire_unpaid_orders() from public, anon;
grant execute on function public.arc_expire_unpaid_orders() to authenticated, service_role;
