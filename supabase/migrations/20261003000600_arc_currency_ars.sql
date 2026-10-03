-- Se cobra en pesos argentinos (ARS).
-- Los precios de ejemplo estaban en centavos de dólar; se pasan a pesos multiplicando por 1.000
-- (ej.: 4,99 → $ 4.990). Son valores orientativos: ajústalos desde /admin.

alter table public."ARC_orders" alter column currency set default 'ARS';

update public."ARC_products"
set price_cents      = price_cents * 1000,
    compare_at_cents = compare_at_cents * 1000
where price_cents < 100000;  -- solo los precios de ejemplo (menos de $ 1.000), por si se ejecuta dos veces
