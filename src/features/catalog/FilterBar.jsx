import { useEffect, useEffectEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RARITIES, SORTS, WEAPON_TYPES } from './api'
import { rarityBg } from '@/components/ui/styles'

const control =
  'w-full rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-2 text-sm text-concrete-50 placeholder:text-concrete-500 focus:border-monitor focus:outline-none'

// Escribe en la URL 300 ms después de la última tecla.
// Si la URL cambia desde fuera (limpiar filtros, atrás), el borrador se resetea en el render.
function useDebouncedValue(value, onCommit, delay = 300) {
  const [state, setState] = useState({ draft: value, base: value })
  if (state.base !== value) setState({ draft: value, base: value })

  const commit = useEffectEvent(onCommit)
  const { draft } = state
  useEffect(() => {
    if (String(draft) === String(value)) return
    const id = setTimeout(() => commit(draft), delay)
    return () => clearTimeout(id)
  }, [draft, value, delay])

  return [draft, (next) => setState((s) => ({ ...s, draft: next }))]
}

export function FilterBar({ filters, update, clear }) {
  const { t } = useTranslation('catalog')
  const [q, setQ] = useDebouncedValue(filters.q, (v) => update({ q: v }))
  const [min, setMin] = useDebouncedValue(filters.min ?? '', (v) => update({ min: v }))
  const [max, setMax] = useDebouncedValue(filters.max ?? '', (v) => update({ max: v }))

  const toggleRarity = (r) => {
    const next = filters.rarities.includes(r) ? filters.rarities.filter((x) => x !== r) : [...filters.rarities, r]
    update({ rareza: next })
  }

  const hasFilters = filters.q || filters.rarities.length || filters.type || filters.min != null || filters.max != null

  return (
    <aside className="flex flex-col gap-6" aria-label={t('filters.title')}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="filter-q" className="label">{t('filters.search')}</label>
        <input id="filter-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} className={control} />
      </div>

      {filters.kind === 'weapon' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-type" className="label">{t('filters.type')}</label>
          <select id="filter-type" value={filters.type ?? ''} onChange={(e) => update({ tipo: e.target.value })} className={control}>
            <option value="">{t('filters.anyType')}</option>
            {WEAPON_TYPES.map((wt) => (
              <option key={wt} value={wt}>{t(`weaponType.${wt}`)}</option>
            ))}
          </select>
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-2">{t('filters.rarity')}</legend>
        {RARITIES.map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-2.5 text-sm text-concrete-300 hover:text-concrete-50">
            <input
              type="checkbox"
              checked={filters.rarities.includes(r)}
              onChange={() => toggleRarity(r)}
              className="size-4 accent-signal"
            />
            <span className={`size-2 rotate-45 ${rarityBg[r]}`} aria-hidden="true" />
            {t(`rarity.${r}`)}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-2">{t('filters.price')}</legend>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number" min="0" step="1" inputMode="decimal" placeholder={t('filters.min')} aria-label={t('filters.min')}
            value={min} onChange={(e) => setMin(e.target.value)} className={control}
          />
          <input
            type="number" min="0" step="1" inputMode="decimal" placeholder={t('filters.max')} aria-label={t('filters.max')}
            value={max} onChange={(e) => setMax(e.target.value)} className={control}
          />
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="filter-sort" className="label">{t('filters.sort')}</label>
        <select id="filter-sort" value={filters.sort} onChange={(e) => update({ orden: e.target.value === 'featured' ? '' : e.target.value })} className={control}>
          {SORTS.map((s) => (
            <option key={s} value={s}>{t(`sort.${s}`)}</option>
          ))}
        </select>
      </div>

      {hasFilters && (
        <button type="button" onClick={clear} className="label self-start text-monitor hover:text-concrete-50">
          {t('filters.clear')}
        </button>
      )}
    </aside>
  )
}
