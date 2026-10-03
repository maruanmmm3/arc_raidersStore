-- Datos de ejemplo para desarrollo local (se cargan con `npx supabase db reset`).
-- Nombres inspirados en el juego; rarezas, estadísticas y precios son inventados.
-- Revísalos contra la versión actual de ARC Raiders antes de usarlos en serio.

-- ---------------------------------------------------------------------------
-- Armas
-- ---------------------------------------------------------------------------
with w (slug, rarity, price, stock, featured, wtype, tier, stats, name_es, name_en, desc_es, desc_en) as (
  values
  ('kettle',    'common',    499,  20, null, 'assault_rifle', 1, '{"damage":32,"fire_rate":620,"range":45,"stability":60,"magazine":20}',
   'Kettle', 'Kettle',
   'Fusil de asalto fiable para tus primeras salidas a la superficie.',
   'Reliable assault rifle for your first trips topside.'),
  ('rattler',   'uncommon',  799,  15, null, 'assault_rifle', 2, '{"damage":30,"fire_rate":700,"range":48,"stability":55,"magazine":30}',
   'Rattler', 'Rattler',
   'Cadencia alta y cargador amplio. Ideal contra drones pequeños.',
   'High fire rate and a large magazine. Great against small drones.'),
  ('arpeggio',  'uncommon',  899,  12, 3,    'assault_rifle', 2, '{"damage":36,"fire_rate":540,"range":55,"stability":70,"magazine":24}',
   'Arpeggio', 'Arpeggio',
   'Ráfagas controladas con muy poco retroceso.',
   'Controlled bursts with very little recoil.'),
  ('tempest',   'epic',     1999,   5, 1,    'assault_rifle', 3, '{"damage":40,"fire_rate":650,"range":60,"stability":72,"magazine":30}',
   'Tempest', 'Tempest',
   'Fusil de asalto de gama alta: daño, alcance y estabilidad en un solo paquete.',
   'High-end assault rifle: damage, range and stability in one package.'),
  ('ferro',     'common',    399,  25, null, 'battle_rifle',  1, '{"damage":60,"fire_rate":120,"range":70,"stability":50,"magazine":1}',
   'Ferro', 'Ferro',
   'Fusil de cerrojo de un disparo. Lento, pero cada impacto cuenta.',
   'Single-shot break-action rifle. Slow, but every hit counts.'),
  ('renegade',  'rare',     1499,   8, 4,    'battle_rifle',  3, '{"damage":55,"fire_rate":280,"range":75,"stability":62,"magazine":10}',
   'Renegade', 'Renegade',
   'Fusil de batalla semiautomático para combate a media distancia.',
   'Semi-automatic battle rifle for mid-range fights.'),
  ('stitcher',  'common',    449,  20, null, 'smg',           1, '{"damage":22,"fire_rate":850,"range":30,"stability":58,"magazine":25}',
   'Stitcher', 'Stitcher',
   'Subfusil compacto para pasillos y espacios cerrados.',
   'Compact SMG for corridors and tight spaces.'),
  ('bobcat',    'epic',     1799,   4, null, 'smg',           3, '{"damage":26,"fire_rate":950,"range":34,"stability":64,"magazine":32}',
   'Bobcat', 'Bobcat',
   'El subfusil más rápido del catálogo.',
   'The fastest SMG in the catalog.'),
  ('il-toro',   'uncommon',  899,  10, null, 'shotgun',       2, '{"damage":110,"fire_rate":70,"range":15,"stability":40,"magazine":5}',
   'Il Toro', 'Il Toro',
   'Escopeta de corredera devastadora a corta distancia.',
   'Pump shotgun, devastating at close range.'),
  ('anvil',     'uncommon',  699,  14, null, 'hand_cannon',   2, '{"damage":75,"fire_rate":150,"range":40,"stability":45,"magazine":6}',
   'Anvil', 'Anvil',
   'Revólver pesado: mucho daño por bala.',
   'Heavy revolver: lots of damage per round.'),
  ('osprey',    'rare',     1599,   6, 2,    'sniper',        3, '{"damage":95,"fire_rate":45,"range":95,"stability":75,"magazine":5}',
   'Osprey', 'Osprey',
   'Rifle de francotirador con mira integrada.',
   'Sniper rifle with an integrated scope.'),
  ('torrente',  'rare',     1699,   5, null, 'lmg',           3, '{"damage":34,"fire_rate":600,"range":58,"stability":50,"magazine":60}',
   'Torrente', 'Torrente',
   'Ametralladora ligera para fuego de supresión.',
   'Light machine gun for suppressive fire.'),
  ('equalizer', 'legendary', 3999,  2, 5,    'special',       4, '{"damage":120,"fire_rate":300,"range":50,"stability":65,"magazine":40}',
   'Equalizer', 'Equalizer',
   'Arma experimental de energía. Muy escasa.',
   'Experimental energy weapon. Very scarce.')
),
ins as (
  insert into public."ARC_products" (kind, slug, rarity, price_cents, stock, is_visible, featured_rank)
  select 'weapon', slug, rarity::public.arc_rarity, price, stock, true, featured from w
  returning id, slug
),
det as (
  insert into public."ARC_weapon_details" (product_id, weapon_type, tier, stats)
  select ins.id, w.wtype::public.arc_weapon_type, w.tier, w.stats::jsonb
  from ins join w using (slug)
)
insert into public."ARC_product_translations" (product_id, locale, name, description)
select ins.id, 'es', w.name_es, w.desc_es from ins join w using (slug)
union all
select ins.id, 'en', w.name_en, w.desc_en from ins join w using (slug);

-- ---------------------------------------------------------------------------
-- Modificaciones
-- ---------------------------------------------------------------------------
with m (slug, rarity, price, stock, slot, name_es, name_en, effect_es, effect_en) as (
  values
  ('compensator',          'uncommon', 199, 30, 'muzzle',      'Compensador',             'Compensator',
   'Reduce el retroceso vertical.', 'Reduces vertical recoil.'),
  ('silencer',             'rare',     349, 15, 'muzzle',      'Silenciador',             'Silencer',
   'Reduce mucho el ruido del disparo.', 'Greatly reduces gunshot noise.'),
  ('extended-light-mag',   'common',   149, 40, 'magazine',    'Cargador ligero ampliado', 'Extended Light Mag',
   '+30 % de munición ligera por cargador.', '+30% light ammo per magazine.'),
  ('extended-medium-mag',  'uncommon', 249, 25, 'magazine',    'Cargador medio ampliado', 'Extended Medium Mag',
   '+30 % de munición media por cargador.', '+30% medium ammo per magazine.'),
  ('vertical-grip',        'common',   149, 35, 'underbarrel', 'Empuñadura vertical',     'Vertical Grip',
   'Mejora la estabilidad en ráfagas largas.', 'Improves stability on long bursts.'),
  ('angled-grip',          'uncommon', 229, 20, 'underbarrel', 'Empuñadura angular',      'Angled Grip',
   'Apuntado más rápido.', 'Faster aim down sights.'),
  ('stable-stock',         'uncommon', 199, 25, 'stock',       'Culata estable',          'Stable Stock',
   'Reduce el balanceo al apuntar.', 'Reduces sway while aiming.'),
  ('lightweight-stock',    'rare',     299, 12, 'stock',       'Culata ligera',           'Lightweight Stock',
   'Te mueves más rápido con el arma en mano.', 'Move faster with the weapon equipped.')
),
ins as (
  insert into public."ARC_products" (kind, slug, rarity, price_cents, stock, is_visible)
  select 'mod', slug, rarity::public.arc_rarity, price, stock, true from m
  returning id, slug
),
det as (
  insert into public."ARC_mod_details" (product_id, slot)
  select ins.id, m.slot::public.arc_mod_slot from ins join m using (slug)
)
insert into public."ARC_product_translations" (product_id, locale, name, description, effect)
select ins.id, 'es', m.name_es, '', m.effect_es from ins join m using (slug)
union all
select ins.id, 'en', m.name_en, '', m.effect_en from ins join m using (slug);

-- Compatibilidad por tipo de arma y ranura
with rules (wtype, slot) as (
  values
  ('assault_rifle', 'muzzle'), ('assault_rifle', 'magazine'), ('assault_rifle', 'underbarrel'), ('assault_rifle', 'stock'),
  ('battle_rifle',  'muzzle'), ('battle_rifle',  'magazine'), ('battle_rifle',  'stock'),
  ('smg',           'muzzle'), ('smg',           'magazine'), ('smg',           'underbarrel'), ('smg', 'stock'),
  ('shotgun',       'underbarrel'), ('shotgun', 'stock'),
  ('pistol',        'muzzle'), ('pistol', 'magazine'),
  ('hand_cannon',   'muzzle'),
  ('sniper',        'muzzle'), ('sniper', 'stock'),
  ('lmg',           'muzzle'), ('lmg', 'underbarrel'), ('lmg', 'stock')
)
insert into public."ARC_weapon_mod_compat" (weapon_id, mod_id)
select wd.product_id, md.product_id
from public."ARC_weapon_details" wd
join rules r on r.wtype::public.arc_weapon_type = wd.weapon_type
join public."ARC_mod_details" md on md.slot = r.slot::public.arc_mod_slot;

-- ---------------------------------------------------------------------------
-- Planos (blueprints)
-- ---------------------------------------------------------------------------
with b (slug, unlocks, rarity, price, stock, tier) as (
  values
  ('rattler-blueprint',   'rattler',   'uncommon',  999, 10, 2),
  ('arpeggio-blueprint',  'arpeggio',  'uncommon', 1099,  8, 2),
  ('tempest-blueprint',   'tempest',   'epic',     2999,  3, 3),
  ('renegade-blueprint',  'renegade',  'rare',     1999,  5, 3),
  ('bobcat-blueprint',    'bobcat',    'epic',     2699,  3, 3),
  ('osprey-blueprint',    'osprey',    'rare',     2199,  4, 3),
  ('torrente-blueprint',  'torrente',  'rare',     2299,  4, 3),
  ('equalizer-blueprint', 'equalizer', 'legendary',5999,  1, 4),
  ('silencer-blueprint',  'silencer',  'rare',      799,  6, 2)
),
ins as (
  insert into public."ARC_products" (kind, slug, rarity, price_cents, stock, is_visible)
  select 'blueprint', slug, rarity::public.arc_rarity, price, stock, true from b
  returning id, slug
),
det as (
  insert into public."ARC_blueprint_details" (product_id, unlocks_product_id, tier)
  select ins.id, target.id, b.tier
  from ins
  join b using (slug)
  join public."ARC_products" target on target.slug = b.unlocks
)
insert into public."ARC_product_translations" (product_id, locale, name, description)
select ins.id, 'es', 'Plano: ' || t.name,
       'Desbloquea la fabricación permanente de ' || t.name || ' en tu taller.'
from ins
join b using (slug)
join public."ARC_products" target on target.slug = b.unlocks
join public."ARC_product_translations" t on t.product_id = target.id and t.locale = 'es'
union all
select ins.id, 'en', t.name || ' Blueprint',
       'Permanently unlocks crafting ' || t.name || ' at your workshop.'
from ins
join b using (slug)
join public."ARC_products" target on target.slug = b.unlocks
join public."ARC_product_translations" t on t.product_id = target.id and t.locale = 'en';

-- ---------------------------------------------------------------------------
-- Pack: Tempest configurado
-- ---------------------------------------------------------------------------
with ins as (
  insert into public."ARC_products" (kind, slug, rarity, price_cents, compare_at_cents, stock, is_visible, featured_rank)
  values ('bundle', 'tempest-assault-kit', 'epic', 2499, 2796, 3, true, 6)
  returning id
),
items as (
  insert into public."ARC_bundle_items" (bundle_id, product_id, qty)
  select ins.id, p.id, 1
  from ins, public."ARC_products" p
  where p.slug in ('tempest', 'compensator', 'extended-medium-mag', 'vertical-grip')
)
insert into public."ARC_product_translations" (product_id, locale, name, description)
select id, 'es', 'Kit de asalto Tempest',
       'Tempest con compensador, cargador medio ampliado y empuñadura vertical. Listo para la superficie.'
from ins
union all
select id, 'en', 'Tempest Assault Kit',
       'Tempest with compensator, extended medium mag and vertical grip. Ready for topside.'
from ins;
