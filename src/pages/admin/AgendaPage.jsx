import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatPrice } from '@/lib/money'
import { formatTime, localDayKey, orderNumber } from '@/lib/dates'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Field'
import { ErrorState, PageLoader } from '@/components/ui/PageLoader'
import { adminErrorMessage, useAgenda, useAgendaAction } from '@/features/admin/agendaApi'
import { itemName, nestItems } from '@/features/orders/api'

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

// Acciones posibles según el estado del pedido. needsText: la nota o referencia es obligatoria
function actionsFor(order) {
  const list = []
  const unpaid = ['unpaid', 'awaiting'].includes(order.payment_status)
  if (unpaid && order.status !== 'cancelled') {
    list.push({ id: 'paid', label: 'Registrar pago', action: 'paid', value: 'paid_manual', needsText: true, placeholder: 'Referencia: Yape 123456, PayPal…' })
    list.push({ id: 'free', label: 'Sin coste', action: 'paid', value: 'not_required', needsText: false, placeholder: 'Nota opcional' })
  }
  if (order.status === 'scheduled') {
    list.push({ id: 'start', label: 'Iniciar entrega', action: 'status', value: 'delivering', primary: true })
    list.push({ id: 'noshow', label: 'No se presentó', action: 'no_show', needsText: false, placeholder: 'Nota opcional' })
  }
  if (order.status === 'delivering') {
    list.push({ id: 'done', label: 'Entregado', action: 'status', value: 'delivered', primary: true, needsText: unpaid, placeholder: unpaid ? 'Sin pago registrado: explica por qué' : 'Nota opcional' })
    list.push({ id: 'retry', label: 'Falló, reintentar', action: 'status', value: 'scheduled', needsText: false, placeholder: 'Qué pasó (opcional)' })
  }
  if (['requested', 'scheduled', 'delivering'].includes(order.status)) {
    list.push({ id: 'cancel', label: 'Cancelar pedido', action: 'status', value: 'cancelled', needsText: true, placeholder: 'Motivo de la cancelación' })
  }
  return list
}

function AppointmentCard({ appt }) {
  const { t } = useTranslation(['orders', 'account'])
  const mutation = useAgendaAction()
  const [pending, setPending] = useState(null) // acción que espera texto
  const [text, setText] = useState('')
  const order = appt.order
  const actions = actionsFor(order)
  const isActive = ['booked', 'checked_in'].includes(appt.status)

  const execute = (a, value = '') => {
    mutation.mutate(
      { action: a.action, orderId: order.id, value: a.value, text: value.trim() },
      { onSuccess: () => { setPending(null); setText('') } },
    )
  }

  const onClick = (a) => {
    mutation.reset()
    if (a.placeholder) {
      setPending(a)
      setText('')
    } else {
      execute(a)
    }
  }

  return (
    <li className={`flex flex-col gap-3 rounded-sm border-l-4 bg-carbon-800 p-4 ${apptTone[appt.status]}`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-lg text-concrete-50">{formatTime(appt.slot_start, LANG)}</span>
        <span className="font-mono tracking-widest text-concrete-100">{appt.ticket_code}</span>
        <span className="text-sm text-concrete-400">{appt.room?.name} · {appt.admin?.discord_username || appt.admin?.username}</span>
        <span className="ml-auto font-mono text-xs uppercase text-concrete-300">{t(`appointmentStatus.${appt.status}`)}</span>
      </div>

      <div className="grid gap-2 text-sm md:grid-cols-3">
        <div>
          <p className="label">Jugador</p>
          <p className="font-mono text-concrete-50">{order.embark_id}</p>
          <p className="text-concrete-400">
            {t(`account:platform.${order.platform}`)}{order.region ? ` · ${order.region}` : ''}
          </p>
          <p className="text-concrete-400">
            {order.buyer?.username}{order.discord_username ? ` · Discord: ${order.discord_username}` : ''}
          </p>
        </div>
        <div>
          <p className="label">{orderNumber(order.number)}</p>
          <ul>
            {nestItems(order.items).map((i) => (
              <li key={i.id} className="text-concrete-100">
                {i.qty > 1 && `${i.qty} × `}{itemName(i, LANG)}
                {i.mods.length > 0 && <span className="text-concrete-400"> + {i.mods.map((m) => itemName(m, LANG)).join(', ')}</span>}
              </li>
            ))}
          </ul>
          {order.availability_note && <p className="mt-1 italic text-concrete-400">“{order.availability_note}”</p>}
        </div>
        <div>
          <p className="label">Pago</p>
          <p className="font-mono text-concrete-50">{formatPrice(order.total_cents, LANG)}</p>
          <p className="text-concrete-400">{t(`paymentStatus.${order.payment_status}`)}{order.payment_reference ? ` · ${order.payment_reference}` : ''}</p>
          <p className="text-concrete-400">Pedido: {t(`orderStatus.${order.status}`)}</p>
          {order.status === 'delivered' && (
            order.buyer_confirmed_at
              ? <p className="text-valve">Cliente conforme · {new Date(order.buyer_confirmed_at).toLocaleString(LANG)}</p>
              : <p className="text-ember">Pendiente de conformidad del cliente</p>
          )}
        </div>
      </div>

      {isActive || order.status === 'requested' ? (
        <div className="flex flex-col gap-2 border-t border-carbon-600 pt-3">
          {pending ? (
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault()
                execute(pending, text)
              }}
            >
              <label className="sr-only" htmlFor={`note-${appt.id}`}>{pending.placeholder}</label>
              <input
                id={`note-${appt.id}`}
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={pending.placeholder}
                required={pending.needsText}
                maxLength={300}
                className="flex-1 rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-2 text-sm text-concrete-50 focus:border-monitor focus:outline-none"
              />
              <Button type="submit" size="sm" disabled={mutation.isPending || (pending.needsText && !text.trim())}>
                {pending.label}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Volver</Button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button key={a.id} size="sm" variant={a.primary ? 'primary' : 'secondary'} disabled={mutation.isPending} onClick={() => onClick(a)}>
                  {a.label}
                </Button>
              ))}
            </div>
          )}
          {mutation.isError && <Alert>{adminErrorMessage(mutation.error)}</Alert>}
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
