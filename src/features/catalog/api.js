import { supabase } from '@/lib/supabase'

export const PAGE_SIZE = 24

// Segmentos de URL en español → valores del enum arc_product_kind
export const KIND_BY_SEGMENT = { armas: 'weapon', planos: 'blueprint', mods: 'mod', packs: 'bundle' }
export const SEGMENT_BY_KIND = Object.fromEntries(Object.entries(KIND_BY_SEGMENT).map(([s, k]) => [k, s]))

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary']
export const WEAPON_TYPES = [
  'assault_rifle', 'battle_rifle', 'smg', 'shotgun', 'pistol', 'hand_cannon', 'lmg', 'sniper', 'special',
]
export const SORTS = ['featured', 'price_asc', 'price_desc', 'rarity_desc', 'newest']

// Las tablas se llaman ARC_* en la base de datos (compartida con otras apps).
// Los alias "nombre:ARC_tabla" mantienen nombres cortos en el resto del código.
// !arc_..._fk indica qué clave foránea usar cuando hay varias hacia ARC_products.
const CARD_FIELDS = `
  id, slug, kind, rarity, price_cents, compare_at_cents, stock, reserved, featured_rank, created_at,
  product_translations:ARC_product_translations!inner ( locale, name, description ),
  weapon_details:ARC_weapon_details ( weapon_type, tier ),
  mod_details:ARC_mod_details ( slot ),
  blueprint_details:ARC_blueprint_details!arc_blueprint_product_fk ( tier ),
  product_images:ARC_product_images ( storage_path, alt, sort )
`

// Elige la traducción del idioma activo; si falta, la española
export function pickTranslation(translations, lang) {
  if (!translations?.length) return { name: '', description: '' }
  return translations.find((t) => t.locale === lang) ?? translations.find((t) => t.locale === 'es') ?? translations[0]
}

// PostgREST devuelve las relaciones 1:1 como objeto o como array según el caso
export function one(rel) {
  return Array.isArray(rel) ? rel[0] ?? null : rel ?? null
}

export function availableStock(p) {
  return p.stock == null ? Infinity : Math.max(0, p.stock - (p.reserved ?? 0))
}

export function tierOf(p) {
  return one(p.weapon_details)?.tier ?? one(p.blueprint_details)?.tier ?? null
}

// Tipo de arma, ranura del mod o categoría, ya traducido (t del namespace "catalog")
export function productSubtitle(p, t) {
  const weapon = one(p.weapon_details)
  const mod = one(p.mod_details)
  if (weapon) return t(`weaponType.${weapon.weapon_type}`)
  if (mod) return t(`slot.${mod.slot}`)
  return t(`kind.${p.kind}`)
}

export function firstImage(p) {
  return [...(p.product_images ?? [])].sort((a, b) => a.sort - b.sort)[0] ?? null
}

export async function fetchProducts(filters) {
  const { kind, rarities, type, min, max, sort, page } = filters
  const q = filters.q.trim()

  // El filtro por tipo de arma necesita un join interno con los detalles del arma
  const fields = type
    ? CARD_FIELDS.replace('weapon_details:ARC_weapon_details (', 'weapon_details:ARC_weapon_details!inner (')
    : CARD_FIELDS

  let query = supabase.from('ARC_products').select(fields, { count: 'exact' }).eq('is_visible', true)

  if (kind) query = query.eq('kind', kind)
  if (type) query = query.eq('weapon_details.weapon_type', type)
  if (rarities.length) query = query.in('rarity', rarities)
  if (min != null) query = query.gte('price_cents', Math.round(min * 100))
  if (max != null) query = query.lte('price_cents', Math.round(max * 100))
  // Busca en los dos idiomas; pickTranslation muestra luego el correcto
  if (q) query = query.ilike('product_translations.name', `%${q.replace(/[%_]/g, '')}%`)

  switch (sort) {
    case 'price_asc':
      query = query.order('price_cents', { ascending: true })
      break
    case 'price_desc':
      query = query.order('price_cents', { ascending: false })
      break
    case 'rarity_desc':
      query = query.order('rarity', { ascending: false }).order('price_cents', { ascending: false })
      break
    case 'newest':
      query = query.order('created_at', { ascending: false })
      break
    default:
      query = query.order('featured_rank', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
  }

  const from = (page - 1) * PAGE_SIZE
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1)
  if (error) throw error
  return { items: data, count: count ?? 0 }
}

export async function fetchFeatured() {
  const { data, error } = await supabase
    .from('ARC_products')
    .select(CARD_FIELDS)
    .eq('is_visible', true)
    .not('featured_rank', 'is', null)
    .order('featured_rank', { ascending: true })
    .limit(8)
  if (error) throw error
  return data
}

export async function fetchProductBySlug(slug) {
  const { data, error } = await supabase
    .from('ARC_products')
    .select(`
      id, slug, kind, rarity, price_cents, compare_at_cents, stock, reserved,
      product_translations:ARC_product_translations ( locale, name, description, effect ),
      weapon_details:ARC_weapon_details ( weapon_type, tier, stats ),
      mod_details:ARC_mod_details ( slot ),
      blueprint_details:ARC_blueprint_details!arc_blueprint_product_fk (
        tier,
        unlocks:ARC_products!arc_blueprint_unlocks_fk (
          slug, kind, product_translations:ARC_product_translations ( locale, name )
        )
      ),
      product_images:ARC_product_images ( storage_path, alt, sort ),
      bundle_items:ARC_bundle_items!arc_bundle_items_bundle_fk (
        qty,
        item:ARC_products!arc_bundle_items_product_fk (
          slug, kind, rarity, product_translations:ARC_product_translations ( locale, name )
        )
      )
    `)
    .eq('slug', slug)
    .eq('is_visible', true)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchCompatibleMods(weaponId) {
  const { data, error } = await supabase
    .from('ARC_weapon_mod_compat')
    .select(`
      mod:ARC_products!arc_compat_mod_fk (
        id, slug, rarity, price_cents, stock, reserved, is_visible,
        product_translations:ARC_product_translations ( locale, name, effect ),
        mod_details:ARC_mod_details ( slot )
      )
    `)
    .eq('weapon_id', weaponId)
  if (error) throw error
  return data.map((row) => row.mod).filter((m) => m && m.is_visible)
}
