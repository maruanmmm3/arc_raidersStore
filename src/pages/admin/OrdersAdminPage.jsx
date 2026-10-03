import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, PageLoader } from '@/components/ui/PageLoader'
import { useAdminOrders } from '@/features/admin/agendaApi'
import { OrderActions } from '@/features/admin/OrderActions'
import { OrderSummary } from '@/features/admin/OrderSummary'

const PAID = ['paid_manual', 'paid_online', 'not_required']
const OPEN = ['requested', 'scheduled', 'delivering']

// Pestañas: lo que el staff tiene que hacer con cada pedido
const TABS = {
  toCollect: { label: 'Por cobrar', match: (o) => OPEN.includes(o.status) && !PAID.includes(o.payment_status) },
  toDeliver: { label: 'Por entregar', match: (o) => OPEN.includes(o.status) && PAID.includes(o.payment_status) },
  delivered: { label: 'Entregados', match: (o) => o.status === 'delivered' },
  cancelled: { label: 'Cancelados', match: (o) => o.status === 'cancelled' },
  all: { label: 'Todos', match: () => true },
}

const tone = {
  requested: 'border-ember',
  scheduled: 'border-monitor',
  delivering: 'border-ember',
  delivered: 'border-valve',
  cancelled: 'border-carbon-500',
}

export function OrdersAdminPage() {
  const { data, isPending, isError, refetch } = useAdminOrders()
  const [tab, setTab] = useState('toCollect')
  const [search, setSearch] = useState('')

  if (isPending) return <PageLoader />
  if (isError) return <ErrorState onRetry={refetch} />

  const q = search.trim().toLowerCase().replace(/^@/, '')
  const rows = data.filter((o) => {
    if (!TABS[tab].match(o)) return false
    if (!q) return true
    return [String(o.number), o.public_code, o.discord_username, o.guest_email, o.embark_id, o.payment_reference]
      .some((v) => v?.toLowerCase().includes(q))
  })

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-4xl font-extrabold uppercase">Pedidos</h1>
        <p className="text-sm text-concrete-400">
          Flujo: el cliente transfiere y envía el comprobante en Discord → <strong>Registrar pago</strong> con el nº de operación →
          le contactas por Discord → <strong>Iniciar entrega</strong> → <strong>Entregado</strong>.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap rounded-sm border border-carbon-500" role="group" aria-label="Filtro">
          {Object.entries(TABS).map(([key, t]) => {
            const count = data.filter(t.match).length
            return (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 text-sm ${tab === key ? 'bg-concrete-100 text-carbon-900' : 'text-concrete-300 hover:text-concrete-50'}`}
              >
                {t.label}{key !== 'all' && count > 0 ? ` (${count})` : ''}
              </button>
            )
          })}
        </div>
        <label className="sr-only" htmlFor="orders-search">Buscar</label>
        <input
          id="orders-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nº, código, Discord, email, ID de Embark o referencia"
          className="min-w-64 flex-1 rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-1.5 text-sm text-concrete-50 focus:border-monitor focus:outline-none"
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-concrete-400">No hay pedidos aquí.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((o) => {
            const activeAppt = (o.appointments ?? []).find((a) => ['booked', 'checked_in'].includes(a.status))
            return (
              <li key={o.id} className={`flex flex-col gap-3 rounded-sm border-l-4 bg-carbon-800 p-4 ${tone[o.status]}`}>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                  <span className="text-concrete-400">{new Date(o.created_at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  {o.public_code && (
                    <Link to={`/pedido/${o.public_code}`} target="_blank" className="label text-monitor hover:text-concrete-50">
                      Ver como el cliente ↗
                    </Link>
                  )}
                  {activeAppt && (
                    <span className="text-concrete-400">
                      Cita: {new Date(activeAppt.slot_start).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  )}
                </div>
                <OrderSummary order={o} />
                <div className="border-t border-carbon-600 pt-3">
                  <OrderActions order={o} hasAppointment={Boolean(activeAppt)} idKey={o.id} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
