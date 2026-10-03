-- Tipos enumerados de ARC. Prefijo arc_ porque la base de datos se comparte con otras apps.
-- Añadir un valor es fácil (alter type ... add value); quitarlo no.

create type public.arc_app_role as enum ('user', 'admin');

create type public.arc_product_kind as enum ('weapon', 'blueprint', 'mod', 'bundle');

create type public.arc_rarity as enum ('common', 'uncommon', 'rare', 'epic', 'legendary');

create type public.arc_weapon_type as enum (
  'assault_rifle', 'battle_rifle', 'smg', 'shotgun', 'pistol',
  'hand_cannon', 'lmg', 'sniper', 'special'
);

create type public.arc_mod_slot as enum (
  'muzzle', 'optic', 'barrel', 'underbarrel', 'magazine', 'stock', 'tech'
);

create type public.arc_game_platform as enum ('pc_steam', 'pc_epic', 'ps5', 'xbox');

-- Estado de la entrega
create type public.arc_order_status as enum (
  'requested', 'scheduled', 'delivering', 'delivered', 'cancelled'
);

-- Estado del pago, independiente de la entrega
create type public.arc_payment_status as enum (
  'unpaid', 'awaiting', 'paid_online', 'paid_manual', 'refunded', 'disputed', 'not_required'
);

create type public.arc_payment_mode as enum ('online', 'discord');

create type public.arc_appointment_status as enum (
  'held', 'booked', 'checked_in', 'completed', 'no_show', 'rescheduled', 'cancelled'
);

create type public.arc_discount_type as enum ('percent', 'fixed');
