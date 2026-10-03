import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLang } from '@/lib/useLang'
import { useCurrency } from '@/features/currency/CurrencyContext'
import { ButtonLink } from '@/components/ui/Button'
import { rarityBorder } from '@/components/ui/styles'
import { pickTranslation } from '@/features/catalog/api'
import { useCart } from '@/features/cart/CartContext'

export function CartPage() {
  const { t } = useTranslation('cart')
  const lang = useLang()
  const { lines, count, subtotalCents, setQty, remove, maxQty } = useCart()
  const { price } = useCurrency()

  if (!lines.length) {
    return (
      <div className="flex flex-col items-center gap-6 py-20 text-center">
        <h1 className="font-display text-5xl font-extrabold uppercase">{t('title')}</h1>
        <p className="text-concrete-400">{t('empty')}</p>
        <ButtonLink to="/tienda">{t('goShop')}</ButtonLink>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-5xl font-extrabold uppercase">{t('title')}</h1>
        <span className="label">{t('items', { count })}</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ul className="flex flex-col gap-3">
          {lines.map((line) => {
            const unit = line.priceCents + line.mods.reduce((s, m) => s + m.priceCents, 0)
            return (
              <li key={line.key} className={`flex flex-col gap-3 rounded-sm border-l-4 bg-carbon-800 p-4 sm:flex-row sm:items-center ${rarityBorder[line.rarity]}`}>
                <div className="flex flex-1 flex-col gap-1">
                  <Link to={`/producto/${line.slug}`} className="font-display text-2xl font-semibold uppercase hover:text-monitor">
                    {pickTranslation(line.translations, lang).name}
                  </Link>
                  {line.mods.length > 0 && (
                    <p className="text-sm text-concrete-400">
                      {t('withMods')} {line.mods.map((m) => pickTranslation(m.translations, lang).name).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-concrete-400">
                    {t('qty')}
                    <select
                      value={line.qty}
                      onChange={(e) => setQty(line.key, Number(e.target.value))}
                      className="rounded-sm border border-carbon-500 bg-carbon-850 px-2 py-1 font-mono text-concrete-50"
                    >
                      {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <span className="w-24 text-right font-mono tabular-nums">{price(unit * line.qty)}</span>
                  <button type="button" onClick={() => remove(line.key)} className="label hover:text-signal-hover">
                    {t('remove')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>

        <aside className="flex h-fit flex-col gap-4 rounded-sm bg-carbon-800 p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-concrete-300">{t('subtotal')}</span>
            <span className="font-mono text-2xl tabular-nums">{price(subtotalCents)}</span>
          </div>
          <p className="text-xs text-concrete-500">{t('estimateNote')}</p>
          <ButtonLink to="/checkout" size="lg">{t('checkout')}</ButtonLink>
        </aside>
      </div>
    </div>
  )
}
