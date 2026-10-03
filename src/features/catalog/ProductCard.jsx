import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLang } from '@/lib/useLang'
import { formatPrice } from '@/lib/money'
import { RarityBadge } from '@/components/ui/RarityBadge'
import { rarityBorder } from '@/components/ui/styles'
import { availableStock, firstImage, pickTranslation, productSubtitle, tierOf } from './api'
import { ProductImage } from './ProductImage'

export function StockBadge({ product, threshold = 3 }) {
  const { t } = useTranslation('catalog')
  const left = availableStock(product)
  if (left === 0) return <span className="font-mono text-xs uppercase text-signal-hover">{t('stock.out')}</span>
  if (left <= threshold) return <span className="font-mono text-xs uppercase text-ember">{t('stock.low', { count: left })}</span>
  return <span className="font-mono text-xs uppercase text-valve">{t('stock.in')}</span>
}

export function ProductCard({ product }) {
  const { t } = useTranslation('catalog')
  const lang = useLang()
  const { name } = pickTranslation(product.product_translations, lang)
  const tier = tierOf(product)
  const soldOut = availableStock(product) === 0

  return (
    <Link
      to={`/producto/${product.slug}`}
      className={`group flex flex-col overflow-hidden rounded-sm border-t-4 bg-carbon-800 transition-colors hover:bg-carbon-700 ${rarityBorder[product.rarity]} ${soldOut ? 'opacity-60' : ''}`}
    >
      <div className="flex aspect-4/3 items-center justify-center bg-carbon-850">
        <ProductImage image={firstImage(product)} kind={product.kind} alt={name} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <RarityBadge rarity={product.rarity} />
          {tier && <span className="font-mono text-xs text-concrete-400">{t('tier', { tier })}</span>}
        </div>
        <h3 className="font-display text-2xl font-semibold uppercase leading-none text-concrete-50 group-hover:text-white">
          {name}
        </h3>
        <p className="text-sm text-concrete-400">{productSubtitle(product, t)}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-lg font-medium tabular-nums text-concrete-50">
              {formatPrice(product.price_cents, lang)}
            </span>
            {product.compare_at_cents && (
              <s className="font-mono text-sm tabular-nums text-concrete-500">{formatPrice(product.compare_at_cents, lang)}</s>
            )}
          </div>
          <StockBadge product={product} />
        </div>
      </div>
    </Link>
  )
}
