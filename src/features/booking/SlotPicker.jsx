import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLang } from '@/lib/useLang'
import { browserTimeZone, formatTime, localDayKey } from '@/lib/dates'
import { ErrorState } from '@/components/ui/PageLoader'
import { useAvailableSlots } from '@/features/orders/api'

// Tira de días + rejilla de horas libres, en la zona horaria del navegador
export function SlotPicker({ value, onChange }) {
  const { t } = useTranslation('checkout')
  const lang = useLang()
  const tz = browserTimeZone()
  const { data: slots, isPending, isError, refetch } = useAvailableSlots(14)

  const days = useMemo(() => {
    const map = new Map()
    for (const s of slots ?? []) {
      const key = localDayKey(s.slot_start, tz)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(s)
    }
    return [...map.entries()].map(([key, items]) => ({ key, items, first: items[0].slot_start }))
  }, [slots, tz])

  const [dayKey, setDayKey] = useState(null)
  const activeDay = days.find((d) => d.key === (dayKey ?? (value ? localDayKey(value, tz) : null))) ?? days[0]

  if (isError) return <ErrorState onRetry={refetch} />
  if (isPending) {
    return <div className="h-48 animate-pulse rounded-sm bg-carbon-800" role="status" aria-label={t('slot.title')} />
  }
  if (!days.length) return <p className="rounded-sm bg-carbon-800 p-6 text-concrete-300">{t('slot.none')}</p>

  return (
    <div className="flex flex-col gap-4">
      <p className="label">{t('slot.yourTimezone', { tz })}</p>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t('slot.title')}>
        {days.map((d) => {
          const date = new Date(d.first)
          const active = d.key === activeDay?.key
          return (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setDayKey(d.key)}
              className={`flex min-w-16 flex-col items-center rounded-sm border px-3 py-2 ${active ? 'border-signal bg-signal/10 text-concrete-50' : 'border-carbon-500 text-concrete-300 hover:border-concrete-400'}`}
            >
              <span className="font-mono text-xs uppercase">
                {new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: tz }).format(date)}
              </span>
              <span className="font-display text-2xl font-semibold">
                {new Intl.DateTimeFormat(lang, { day: 'numeric', timeZone: tz }).format(date)}
              </span>
              <span className="font-mono text-[10px] uppercase text-concrete-500">
                {new Intl.DateTimeFormat(lang, { month: 'short', timeZone: tz }).format(date)}
              </span>
            </button>
          )
        })}
      </div>

      {activeDay && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" role="radiogroup" aria-label={t('slot.title')}>
          {activeDay.items.map((s) => {
            const selected = value === s.slot_start
            return (
              <button
                key={s.slot_start}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(s.slot_start, s.slot_end)}
                className={`rounded-sm border py-2.5 font-mono text-sm tabular-nums ${selected ? 'border-signal bg-signal text-carbon-950' : 'border-carbon-500 text-concrete-100 hover:border-concrete-300'}`}
              >
                {formatTime(s.slot_start, lang, tz)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
