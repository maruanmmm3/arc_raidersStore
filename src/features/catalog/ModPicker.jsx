import { useTranslation } from 'react-i18next'
import { useLang } from '@/lib/useLang'
import { useCurrency } from '@/features/currency/CurrencyContext'
import { rarityText } from '@/components/ui/styles'
import { availableStock, one, pickTranslation } from './api'

const SLOT_ORDER = ['muzzle', 'optic', 'barrel', 'underbarrel', 'magazine', 'stock', 'tech']

// Una ranura = un grupo de radios; "Ninguna" deja la ranura vacía
export function ModPicker({ mods, selected, onChange }) {
  const { t } = useTranslation('catalog')
  const lang = useLang()
  const { price } = useCurrency()

  const bySlot = new Map()
  for (const mod of mods) {
    const slot = one(mod.mod_details)?.slot
    if (!slot) continue
    if (!bySlot.has(slot)) bySlot.set(slot, [])
    bySlot.get(slot).push(mod)
  }
  const slots = SLOT_ORDER.filter((s) => bySlot.has(s))
  if (!slots.length) return null

  return (
    <section className="flex flex-col gap-4" aria-labelledby="mods-title">
      <div>
        <h2 id="mods-title" className="font-display text-2xl font-semibold uppercase">{t('detail.mods')}</h2>
        <p className="text-sm text-concrete-400">{t('detail.modsHint')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {slots.map((slot) => (
          <fieldset key={slot} className="flex flex-col gap-1 rounded-sm border border-carbon-600 p-3">
            <legend className="label px-1">{t(`slot.${slot}`)}</legend>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-concrete-400 hover:bg-carbon-700">
              <input
                type="radio"
                name={`slot-${slot}`}
                checked={!selected[slot]}
                onChange={() => onChange({ ...selected, [slot]: null })}
                className="accent-signal"
              />
              {t('detail.none')}
            </label>
            {bySlot.get(slot).map((mod) => {
              const tr = pickTranslation(mod.product_translations, lang)
              const out = availableStock(mod) === 0
              return (
                <label
                  key={mod.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-sm px-2 py-1.5 text-sm hover:bg-carbon-700 ${out ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <input
                    type="radio"
                    name={`slot-${slot}`}
                    disabled={out}
                    checked={selected[slot]?.id === mod.id}
                    onChange={() => onChange({ ...selected, [slot]: mod })}
                    className="mt-1 accent-signal"
                  />
                  <span className="flex flex-1 flex-col">
                    <span className={`font-medium ${rarityText[mod.rarity]}`}>{tr.name}</span>
                    {tr.effect && <span className="text-xs text-concrete-400">{tr.effect}</span>}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-concrete-300">
                    {out ? t('stock.out') : `+${price(mod.price_cents)}`}
                  </span>
                </label>
              )
            })}
          </fieldset>
        ))}
      </div>
    </section>
  )
}
