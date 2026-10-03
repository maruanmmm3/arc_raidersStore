import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLang } from '@/lib/useLang'
import { formatMoney } from '@/lib/money'
import { formatDate, formatDateTime, orderNumber } from '@/lib/dates'
import { ButtonLink } from '@/components/ui/Button'
import { ErrorState, PageLoader } from '@/components/ui/PageLoader'
import { itemName, nestItems, useMyAppointments, useMyOrders } from '@/features/orders/api'

const orderTone = {
  requested: 'text-ember',
  scheduled: 'text-monitor',
  delivering: 'text-ember',
  delivered: 'text-valve',
  cancelled: 'text-concrete-500',
}

export function OrdersPage() {
  const { t } = useTranslation(['orders', 'cart'])
  const lang = useLang()
  const { data: orders, isPending, isError, refetch } = useMyOrders()

  if (isPending) return <PageLoader />
  if (isError) return <ErrorState onRetry={refetch} />
  if (!orders.length) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-concrete-400">{t('list.empty')}</p>
        <ButtonLink to="/tienda">{t('cart:goShop')}</ButtonLink>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {orders.map((o) => {
        // La cita más reciente del pedido (puede haber varias si hubo un "no presentado")
        const appt = [...(o.appointments ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
        return (
          <li key={o.id} className="flex flex-col gap-3 rounded-sm bg-carbon-800 p-4 md:flex-row md:items-center">
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-mono text-concrete-50">{orderNumber(o.number)}</span>
                <span className={`font-mono text-xs uppercase ${orderTone[o.status]}`}>{t(`orderStatus.${o.status}`)}</span>
                <span className="font-mono text-xs uppercase text-concrete-400">{t(`paymentStatus.${o.payment_status}`)}</span>
                {o.status === 'delivered' && !o.buyer_confirmed_at && (
                  <span className="font-mono text-xs uppercase text-ember">{t('ticket.confirmTitle')}</span>
                )}
              </div>
              <p className="text-sm text-concrete-300">
                {nestItems(o.items).map((i) => `${i.qty > 1 ? `${i.qty} × ` : ''}${itemName(i, lang)}`).join(' · ')}
              </p>
              <p className="text-xs text-concrete-500">
                {t('list.createdAt', { date: formatDate(o.created_at, lang) })}
                {appt && ` · ${formatDateTime(appt.slot_start, lang, { dateStyle: 'medium' })}`}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono tabular-nums">{formatMoney(o.total_cents, o.currency, lang)}</span>
              {(o.public_code || appt) && (
                <Link
                  to={o.public_code ? `/pedido/${o.public_code}` : `/cita/${appt.ticket_code}`}
                  className="label text-monitor hover:text-concrete-50"
                >
                  {t('list.viewTicket')}
                </Link>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function AppointmentList({ items, empty }) {
  const { t } = useTranslation('orders')
  const lang = useLang()
  if (!items.length) return <p className="text-sm text-concrete-500">{empty}</p>
  return (
    <ul className="flex flex-col gap-2">
      {items.map((a) => (
        <li key={a.ticket_code}>
          <Link to={`/cita/${a.ticket_code}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm bg-carbon-800 p-4 hover:bg-carbon-700">
            <span className="font-mono tracking-widest text-concrete-50">{a.ticket_code}</span>
            <span className="flex-1 text-concrete-300">{formatDateTime(a.slot_start, lang)}</span>
            <span className="font-mono text-xs uppercase text-concrete-400">{t(`appointmentStatus.${a.status}`)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function AppointmentsPage() {
  const { t } = useTranslation('orders')
  const { data, isPending, isError, refetch } = useMyAppointments()
  // Momento de referencia fijado al abrir la página, para que el render sea estable
  const [now] = useState(() => Date.now())
  if (isPending) return <PageLoader />
  if (isError) return <ErrorState onRetry={refetch} />

  const upcoming = data.filter((a) => ['booked', 'checked_in', 'held'].includes(a.status) && new Date(a.slot_end).getTime() > now)
  const past = data.filter((a) => !upcoming.includes(a)).reverse()

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-semibold uppercase">{t('list.upcoming')}</h2>
        <AppointmentList items={upcoming} empty={t('list.noUpcoming')} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-semibold uppercase">{t('list.past')}</h2>
        <AppointmentList items={past} empty={t('list.noPast')} />
      </section>
    </div>
  )
}
