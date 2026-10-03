import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLang } from '@/lib/useLang'
import { useCurrency } from '@/features/currency/CurrencyContext'
import { Button } from '@/components/ui/Button'
import { ErrorState, PageLoader } from '@/components/ui/PageLoader'
import { RarityBadge } from '@/components/ui/RarityBadge'
import { rarityBorder } from '@/components/ui/styles'
import { availableStock, firstImage, one, pickTranslation, productSubtitle, tierOf, SEGMENT_BY_KIND } from '@/features/catalog/api'
import { useCompatibleMods, useProduct } from '@/features/catalog/hooks'
import { ModPicker } from '@/features/catalog/ModPicker'
import { ProductImage } from '@/features/catalog/ProductImage'
import { StockBadge } from '@/features/catalog/ProductCard'
import { useCart } from '@/features/cart/CartContext'

const STAT_KEYS = ['damage', 'fire_rate', 'range', 'stability', 'magazine']
// Valor de referencia para dibujar las barras (no es un límite del juego)
const STAT_MAX = { damage: 120, fire_rate: 1000, range: 100, stability: 100, magazine: 60 }

function StatBlock({ stats }) {
  const { t } = useTranslation('catalog')
  const rows = STAT_KEYS.filter((k) => stats?.[k] != null)
  if (!rows.length) return null
  return (
    <dl className="grid gap-3">
      {rows.map((k) => (
        <div key={k} className="grid grid-cols-[110px_1fr_48px] items-center gap-3">
          <dt className="text-sm text-concrete-400">{t(`stats.${k}`)}</dt>
          <dd className="h-2 overflow-hidden rounded-full bg-carbon-700" aria-hidden="true">
            <div className="h-full bg-concrete-300" style={{ width: `${Math.min(100, (stats[k] / STAT_MAX[k]) * 100)}%` }} />
          </dd>
          <dd className="text-right font-mono text-sm tabular-nums text-concrete-50">{stats[k]}</dd>
        </div>
      ))}
    </dl>
  )
}

// key = slug para que el selector de mods se reinicie al cambiar de producto
export function ProductRoute() {
  const { slug } = useParams()
  return <ProductPage key={slug} slug={slug} />
}

function ProductPage({ slug }) {
  const { t } = useTranslation('catalog')
  const lang = useLang()
  const { data: product, isPending, isError, refetch } = useProduct(slug)
  const weapon = one(product?.weapon_details)
  const mods = useCompatibleMods(weapon ? product.id : null)
  const cart = useCart()
  const { price } = useCurrency()
  const [selected, setSelected] = useState({})
  const [added, setAdded] = useState(false)

  if (isPending) return <PageLoader />
  if (isError) return <ErrorState onRetry={refetch} />
  if (!product) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-concrete-300">{t('detail.notFound')}</p>
        <Link to="/tienda" className="label text-monitor">{t('detail.back')}</Link>
      </div>
    )
  }

  const tr = pickTranslation(product.product_translations, lang)
  const tier = tierOf(product)
  const blueprint = one(product.blueprint_details)
  const chosenMods = Object.values(selected).filter(Boolean)
  const totalCents = product.price_cents + chosenMods.reduce((s, m) => s + m.price_cents, 0)
  const soldOut = availableStock(product) === 0

  const addToCart = () => {
    cart.add(product, chosenMods)
    setAdded(true)
    setTimeout(() => setAdded(false), 2500)
  }

  return (
    <div className="flex flex-col gap-10">
      <Link to={`/tienda/${SEGMENT_BY_KIND[product.kind]}`} className="label self-start hover:text-concrete-50">
        ← {t('detail.back')}
      </Link>

      <div className="grid gap-10 lg:grid-cols-2">
        <div className={`flex aspect-square items-center justify-center rounded-sm border-t-4 bg-carbon-800 ${rarityBorder[product.rarity]}`}>
          <ProductImage image={firstImage(product)} kind={product.kind} alt={tr.name} />
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <RarityBadge rarity={product.rarity} />
              {tier && <span className="font-mono text-xs text-concrete-400">{t('tier', { tier })}</span>}
              <span className="font-mono text-xs uppercase text-concrete-400">{productSubtitle(product, t)}</span>
            </div>
            <h1 className="font-display text-6xl font-extrabold uppercase leading-none">{tr.name}</h1>
            {tr.description && <p className="max-w-prose text-concrete-300">{tr.description}</p>}
            {tr.effect && <p className="max-w-prose text-concrete-300">{tr.effect}</p>}
          </div>

          {weapon && <StatBlock stats={weapon.stats} />}

          {blueprint?.unlocks && (
            <p className="text-sm text-concrete-300">
              <span className="label mr-2">{t('detail.unlocks')}</span>
              <Link to={`/producto/${blueprint.unlocks.slug}`} className="text-monitor hover:text-concrete-50">
                {pickTranslation(blueprint.unlocks.product_translations, lang).name}
              </Link>
            </p>
          )}

          {product.bundle_items?.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="label">{t('detail.includes')}</span>
              <ul className="flex flex-col gap-1">
                {product.bundle_items.map(({ qty, item }) => (
                  <li key={item.slug} className="text-sm">
                    <Link to={`/producto/${item.slug}`} className="text-concrete-100 hover:text-monitor">
                      {qty > 1 ? `${qty} × ` : ''}{pickTranslation(item.product_translations, lang).name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {weapon && mods.data && <ModPicker mods={mods.data} selected={selected} onChange={setSelected} />}

          <div className="flex flex-col gap-4 border-t border-carbon-600 pt-6">
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col">
                {chosenMods.length > 0 && <span className="label">{t('detail.total')}</span>}
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-3xl font-medium tabular-nums">{price(totalCents)}</span>
                  {product.compare_at_cents && chosenMods.length === 0 && (
                    <s className="font-mono text-lg tabular-nums text-concrete-500">{price(product.compare_at_cents)}</s>
                  )}
                </div>
              </div>
              <StockBadge product={product} />
            </div>
            <Button size="lg" onClick={addToCart} disabled={soldOut}>
              {t('detail.addToCart')}
            </Button>
            <p role="status" className="min-h-5 text-sm text-valve">{added ? t('detail.added') : ''}</p>
            <p className="text-sm text-concrete-400">{t('detail.deliveryNote')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
