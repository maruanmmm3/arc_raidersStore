// Conversión entre la fila de la BD y el estado del formulario (todo texto, como los inputs)

export const STAT_KEYS = ['damage', 'fire_rate', 'range', 'stability', 'magazine']
export const STAT_LABELS = { damage: 'Daño', fire_rate: 'Cadencia', range: 'Alcance', stability: 'Estabilidad', magazine: 'Cargador' }
export const SLOT_ORDER = ['muzzle', 'optic', 'barrel', 'underbarrel', 'magazine', 'stock', 'tech']
export const SLOT_LABELS = {
  muzzle: 'Bocacha', optic: 'Mira', barrel: 'Cañón', underbarrel: 'Bajo cañón', magazine: 'Cargador', stock: 'Culata', tech: 'Tecnología',
}
export const WEAPON_TYPE_LABELS = {
  assault_rifle: 'Fusil de asalto', battle_rifle: 'Fusil de batalla', smg: 'Subfusil', shotgun: 'Escopeta', pistol: 'Pistola',
  hand_cannon: 'Revólver', lmg: 'Ametralladora ligera', sniper: 'Francotirador', special: 'Especial',
}
export const RARITY_LABELS = { common: 'Común', uncommon: 'Poco común', rare: 'Raro', epic: 'Épico', legendary: 'Legendario' }

const one = (rel) => (Array.isArray(rel) ? rel[0] ?? null : rel ?? null)
const centsToText = (c) => (c == null ? '' : (c / 100).toFixed(2))
const numText = (n) => (n == null ? '' : String(n))

export function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function toFormState(product, kind) {
  const tr = (locale) => product?.product_translations?.find((t) => t.locale === locale)
  const weapon = one(product?.weapon_details)
  const mod = one(product?.mod_details)
  const blueprint = one(product?.blueprint_details)
  return {
    kind,
    slug: product?.slug ?? '',
    slugTouched: Boolean(product),
    rarity: product?.rarity ?? 'common',
    price: centsToText(product?.price_cents),
    compareAt: centsToText(product?.compare_at_cents),
    stock: numText(product?.stock),
    isVisible: product?.is_visible ?? false,
    featuredRank: numText(product?.featured_rank),
    lowStock: numText(product?.low_stock_threshold),
    tr: Object.fromEntries(
      ['es', 'en'].map((l) => [l, { name: tr(l)?.name ?? '', description: tr(l)?.description ?? '', effect: tr(l)?.effect ?? '' }]),
    ),
    weapon: {
      weapon_type: weapon?.weapon_type ?? '',
      tier: numText(weapon?.tier ?? 1),
      stats: Object.fromEntries(STAT_KEYS.map((k) => [k, numText(weapon?.stats?.[k])])),
    },
    compatibleModIds: (product?.compat ?? []).map((c) => c.mod_id),
    mod: { slot: mod?.slot ?? '' },
    blueprint: { tier: numText(blueprint?.tier ?? 1), unlocks_product_id: blueprint?.unlocks_product_id ?? '' },
    bundleItems: (product?.bundle_items ?? []).map((b) => ({ product_id: b.product_id, qty: String(b.qty) })),
  }
}

const toCents = (text) => (text.trim() === '' ? null : Math.round(Number(text.replace(',', '.')) * 100))
const toInt = (text) => (String(text).trim() === '' ? null : Number(text))

// Valida y construye el JSON que espera arc_admin_save_product. Devuelve { errors } o { data }
export function toPayload(f) {
  const errors = {}
  const price = toCents(f.price)
  const compareAt = toCents(f.compareAt)
  const stock = toInt(f.stock)

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug)) errors.slug = 'Solo minúsculas, números y guiones (ej. tempest-mk2).'
  if (price == null || !Number.isFinite(price) || price < 0) errors.price = 'Indica un precio válido.'
  if (compareAt != null && (!Number.isFinite(compareAt) || compareAt <= (price ?? 0)))
    errors.compareAt = 'Debe ser mayor que el precio (es el precio tachado).'
  if (stock != null && (!Number.isInteger(stock) || stock < 0)) errors.stock = 'Número entero o vacío para ilimitado.'
  if (!f.tr.es.name.trim()) errors.nameEs = 'Obligatorio.'
  if (!f.tr.en.name.trim()) errors.nameEn = 'Obligatorio.'
  const featured = toInt(f.featuredRank)
  if (featured != null && (!Number.isInteger(featured) || featured < 1)) errors.featuredRank = 'Entero desde 1, o vacío.'
  const lowStock = toInt(f.lowStock)
  if (lowStock != null && (!Number.isInteger(lowStock) || lowStock < 0)) errors.lowStock = 'Entero desde 0, o vacío.'

  if (f.kind === 'weapon' && !f.weapon.weapon_type) errors.weaponType = 'Elige el tipo de arma.'
  if (f.kind === 'mod' && !f.mod.slot) errors.slot = 'Elige la ranura.'
  if (f.kind === 'bundle') {
    const items = f.bundleItems.filter((b) => b.product_id)
    if (!items.length) errors.bundle = 'Añade al menos un producto al pack.'
    if (new Set(items.map((b) => b.product_id)).size !== items.length) errors.bundle = 'Hay productos repetidos en el pack.'
  }

  if (Object.keys(errors).length) return { errors }

  const data = {
    kind: f.kind,
    slug: f.slug,
    rarity: f.rarity,
    price_cents: price,
    compare_at_cents: compareAt,
    stock,
    is_visible: f.isVisible,
    featured_rank: featured,
    low_stock_threshold: lowStock,
    translations: Object.fromEntries(
      ['es', 'en'].map((l) => [l, {
        name: f.tr[l].name.trim(),
        description: f.tr[l].description.trim(),
        effect: f.kind === 'mod' ? f.tr[l].effect.trim() : '',
      }]),
    ),
  }
  if (f.kind === 'weapon') {
    data.weapon = {
      weapon_type: f.weapon.weapon_type,
      tier: Number(f.weapon.tier),
      stats: Object.fromEntries(
        STAT_KEYS.filter((k) => f.weapon.stats[k] !== '').map((k) => [k, Number(f.weapon.stats[k])]),
      ),
    }
    data.compatible_mod_ids = f.compatibleModIds
  }
  if (f.kind === 'mod') data.mod = { slot: f.mod.slot }
  if (f.kind === 'blueprint') {
    data.blueprint = { tier: Number(f.blueprint.tier), unlocks_product_id: f.blueprint.unlocks_product_id || null }
  }
  if (f.kind === 'bundle') {
    data.bundle_items = f.bundleItems
      .filter((b) => b.product_id)
      .map((b) => ({ product_id: b.product_id, qty: Math.max(1, Number(b.qty) || 1) }))
  }
  return { data }
}
