import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime, localDayKey, orderNumber } from '@/lib/dates'
import { ErrorState, PageLoader } from '@/components/ui/PageLoader'
import { useAgenda } from '@/features/admin/agendaApi'
import { OrderActions } from '@/features/admin/OrderActions'
import { OrderSummary } from '@/features/admin/OrderSummary'

const LANG = 'es' // el admin está en español por ahora

const RANGES = {
  today: { label: 'Hoy', from: 0, to: 1 },
  week: { label: 'Próximos 7 días', from: 0, to: 7 },
  past: { label: 'Últimos 7 días', from: -7, to: 0 },
}

function dayStart(offsetDays) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString()
}

const apptTone = {
  booked: 'border-monitor',
  checked_in: 'border-ember',
  completed: 'border-valve',
  no_show: 'border-signal',
  cancelled: 'border-carbon-500',
  held: 'border-carbon-500',
  rescheduled: 'border-carbon-500',
}

function AppointmentCard({ appt }) {
  const { t } = useTranslation(['orders', 'account'])
  const order = appt.order
  const isActive = ['booked', 'checked_in'].includes(appt.status)

  return (
    <li className={`flex flex-col gap-3 rounded-sm border-l-4 bg-carbon-800 p-4 ${apptTone[appt.status]}`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-lg text-concrete-50">{formatTime(appt.slot_start, LANG)}</span>
        <span className="font-mono tracking-widest text-concrete-100">{appt.ticket_code}</span>
        <span className="text-sm text-concrete-400">{appt.room?.name} · {appt.admin?.discord_username || appt.admin?.username}</span>
        <span className="ml-auto font-mono text-xs uppercase text-concrete-300">{t(`appointmentStatus.${appt.status}`)}</span>
      </div>

      <OrderSummary order={order} />

      {isActive || order.status === 'requested' ? (
        <div className="border-t border-carbon-600 pt-3">
          <OrderActions order={order} hasAppointment={isActive} idKey={appt.id} />
        </div>
      ) : null}
    </li>
  )
}

export function AgendaPage() {
  const [range, setRange] = useState('week')
  const [onlyActive, setOnlyActive] = useState(true)
  const [search, setSearch] = useState('')
  const { from, to } = RANGES[range]
  const fromIso = useMemo(() => dayStart(from), [from])
  const toIso = useMemo(() => dayStart(to), [to])
  const { data, isPending, isError, refetch } = useAgenda(fromIso, toIso)

  const filtered = (data ?? []).filter((a) => {
    if (onlyActive && !['booked', 'checked_in'].includes(a.status)) return false
    const q = search.trim().toUpperCase()
    if (!q) return true
    return a.ticket_code.includes(q) || orderNumber(a.order.number).includes(q) || a.order.embark_id.toUpperCase().includes(q)
  })

  const byDay = new Map()
  for (const a of filtered) {
    const key = localDayKey(a.slot_start)
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(a)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <h1 className="font-display text-4xl font-extrabold uppercase">Agenda</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-sm border border-carbon-500" role="group" aria-label="Rango">
            {Object.entries(RANGES).map(([key, r]) => (
              <button
                key={key}
                type="button"
                aria-pressed={range === key}
                onClick={() => setRange(key)}
                className={`px-3 py-1.5 text-sm ${range === key ? 'bg-concrete-100 text-carbon-900' : 'text-concrete-300 hover:text-concrete-50'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-concrete-300">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} className="accent-signal" />
            Solo pendientes
          </label>
          <label className="sr-only" htmlFor="agenda-search">Buscar</label>
          <input
            id="agenda-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Código de ticket, nº de pedido o ID de Embark"
            className="min-w-64 flex-1 rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-1.5 text-sm text-concrete-50 focus:border-monitor focus:outline-none"
          />
        </div>
      </header>

      {isPending ? (
        <PageLoader />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : byDay.size === 0 ? (
        <p className="text-concrete-400">No hay citas en este rango.</p>
      ) : (
        [...byDay.entries()].map(([key, items]) => (
          <section key={key} className="flex flex-col gap-3">
            <h2 className="label">
              {new Intl.DateTimeFormat(LANG, { dateStyle: 'full' }).format(new Date(items[0].slot_start))} · {items.length}
            </h2>
            <ul className="flex flex-col gap-3">
              {items.map((a) => <AppointmentCard key={a.id} appt={a} />)}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
