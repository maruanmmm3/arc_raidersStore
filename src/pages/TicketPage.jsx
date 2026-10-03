import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { useLang } from '@/lib/useLang'
import { formatMoney } from '@/lib/money'
import { browserTimeZone, formatDateTime, formatTime, orderNumber } from '@/lib/dates'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Field'
import { ErrorState, PageLoader } from '@/components/ui/PageLoader'
import { buildIcs, downloadIcs } from '@/features/booking/ics'
import { itemName, nestItems, useCancelMyOrder, useConfirmDelivery, useTicket } from '@/features/orders/api'

const statusTone = {
  booked: 'bg-monitor text-carbon-950',
  checked_in: 'bg-ember text-carbon-950',
  completed: 'bg-valve text-carbon-950',
  no_show: 'bg-signal text-carbon-950',
  cancelled: 'bg-carbon-600 text-concrete-300',
  held: 'bg-carbon-600 text-concrete-100',
  rescheduled: 'bg-carbon-600 text-concrete-100',
}

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-1 border-b border-dashed border-carbon-500 py-3 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="label shrink-0">{label}</dt>
      <dd className="text-concrete-50 sm:text-right">{children}</dd>
    </div>
  )
}

// Conformidad del comprador: aparece cuando el admin marca el pedido como entregado
function DeliveryConfirmation({ ticket }) {
  const { t } = useTranslation('orders')
  const lang = useLang()
  const confirm = useConfirmDelivery()
  const [checked, setChecked] = useState(false)
  const confirmedAt = ticket.order.buyer_confirmed_at

  if (confirmedAt) {
    return (
      <p role="status" className="rounded-sm border border-valve/60 bg-valve/10 px-4 py-3 text-concrete-50">
        {t('ticket.confirmed', { date: formatDateTime(confirmedAt, lang) })}
      </p>
    )
  }
  if (!ticket.can_confirm) return null

  return (
    <section className="flex flex-col gap-4 rounded-sm border border-valve/60 bg-carbon-800 p-5">
      <h2 className="font-display text-2xl font-semibold uppercase">{t('ticket.confirmTitle')}</h2>
      <p className="text-concrete-300">{t('ticket.confirmText')}</p>
      <label className="flex items-start gap-2.5 text-sm text-concrete-200">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-4 accent-signal" />
        {t('ticket.confirmCheck')}
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => confirm.mutate(ticket.order.id)} disabled={!checked || confirm.isPending}>
          {t('ticket.confirmButton')}
        </Button>
        {/* s5 = sección "Grabación de la partida y reclamaciones" de los términos */}
        <Link to="/terminos#s5" className="text-sm text-monitor hover:text-concrete-50">{t('ticket.claimLink')}</Link>
      </div>
      {confirm.isError && <Alert>{t('ticket.confirmError')}</Alert>}
    </section>
  )
}

export function TicketPage() {
  const { code } = useParams()
  const { t } = useTranslation(['orders', 'account'])
  const lang = useLang()
  const { data: ticket, isPending, isError, refetch } = useTicket(code)
  const cancel = useCancelMyOrder()
  const [copied, setCopied] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  if (isPending) return <PageLoader />
  if (isError) return <ErrorState onRetry={refetch} />
  if (!ticket) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-concrete-300">{t('ticket.notFound')}</p>
        <Link to="/cuenta/citas" className="label text-monitor">{t('account:nav.appointments')}</Link>
      </div>
    )
  }

  const tz = browserTimeZone()
  const storeTz = ticket.store_timezone || 'America/Lima'
  const items = nestItems(ticket.items)
  const roomUrl = ticket.room.channel_url || ticket.discord_invite_url
  const active = ['booked', 'checked_in'].includes(ticket.status)

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(ticket.ticket_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sin permiso de portapapeles: el código sigue visible y seleccionable
    }
  }

  const addToCalendar = () => {
    downloadIcs(
      `cita-${ticket.ticket_code}.ics`,
      buildIcs({
        code: ticket.ticket_code,
        start: ticket.slot_start,
        end: ticket.slot_end,
        title: t('ticket.calendarTitle', { code: ticket.ticket_code }),
        description: `${t('ticket.room')}: ${ticket.room.name}\n${t('ticket.code')}: ${ticket.ticket_code}\n${window.location.href}`,
        url: window.location.href,
      }),
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <article className="overflow-hidden rounded-sm bg-carbon-800">
        <div className="stripe" />
        <header className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="label">{t('ticket.eyebrow')} · {orderNumber(ticket.order.number)}</p>
            <p className="font-mono text-4xl font-medium tracking-[0.2em] text-concrete-50 select-all sm:text-5xl">
              {ticket.ticket_code}
            </p>
            <p className="text-sm text-concrete-400">{t('ticket.codeHint')}</p>
          </div>
          <span className={`self-start rounded-sm px-2.5 py-1 font-mono text-xs uppercase tracking-wider ${statusTone[ticket.status]}`}>
            {t(`appointmentStatus.${ticket.status}`)}
          </span>
        </header>

        <div className="grid gap-6 border-t border-carbon-600 p-6 md:grid-cols-[minmax(0,1fr)_auto]">
          <dl>
            <Row label={t('ticket.when')}>
              <span className="block">{formatDateTime(ticket.slot_start, lang)}</span>
              {storeTz !== tz && (
                <span className="block text-sm text-concrete-400">
                  {formatTime(ticket.slot_start, lang, storeTz)} · {storeTz}
                </span>
              )}
            </Row>
            <Row label={t('ticket.room')}>{ticket.room.name}</Row>
            <Row label={t('ticket.admin')}>
              {ticket.admin.discord_username || ticket.admin.username}
            </Row>
            <Row label={t('ticket.player')}>
              <span className="font-mono">{ticket.order.embark_id}</span> · {t(`account:platform.${ticket.order.platform}`)}
            </Row>
            <Row label={t('ticket.items')}>
              <ul className="flex flex-col gap-1">
                {items.map((i) => (
                  <li key={i.id}>
                    {i.qty > 1 && `${i.qty} × `}{itemName(i, lang)}
                    {i.mods.length > 0 && (
                      <span className="block text-sm text-concrete-400">+ {i.mods.map((m) => itemName(m, lang)).join(', ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Row>
            <Row label={t('ticket.total')}>
              <span className="font-mono tabular-nums">{formatMoney(ticket.order.total_cents, ticket.order.currency, lang)}</span>
            </Row>
            <Row label={t('ticket.payment')}>{t(`paymentStatus.${ticket.order.payment_status}`)}</Row>
          </dl>

          <figure className="flex flex-col items-center gap-2 self-start">
            <div className="rounded-sm bg-concrete-50 p-3">
              <QRCodeSVG value={window.location.href} size={140} bgColor="#f5f7f4" fgColor="#111416" level="M" />
            </div>
            <figcaption className="max-w-40 text-center text-xs text-concrete-500">{t('ticket.verify')}</figcaption>
          </figure>
        </div>

        <footer className="flex flex-wrap gap-3 border-t border-carbon-600 p-6">
          {active && roomUrl && (
            <a href={roomUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'discord' })}>
              {ticket.room.channel_url ? t('ticket.goToRoom') : t('ticket.joinDiscord')}
            </a>
          )}
          <Button variant="secondary" onClick={copyCode}>{copied ? t('ticket.copied') : t('ticket.copy')}</Button>
          {active && <Button variant="secondary" onClick={addToCalendar}>{t('ticket.addToCalendar')}</Button>}
        </footer>
      </article>

      <DeliveryConfirmation ticket={ticket} />

      {active && (
        <section className="flex flex-col gap-3 rounded-sm border border-carbon-600 p-5">
          <h2 className="font-display text-2xl font-semibold uppercase">{t('ticket.steps')}</h2>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-concrete-300">
            <li>{t('ticket.step1')}</li>
            <li>{t('ticket.step2')}</li>
            <li>{t('ticket.step3')}</li>
            <li>{t('ticket.step4')}</li>
          </ol>
        </section>
      )}

      {ticket.can_cancel && (
        <section className="flex flex-col gap-3">
          {cancel.isError && <Alert>{t('ticket.cancelError')}</Alert>}
          {confirmCancel ? (
            <div className="flex flex-wrap items-center gap-3 rounded-sm border border-signal/50 p-4">
              <p className="flex-1 text-sm text-concrete-300">{t('ticket.cancelConfirm')}</p>
              <Button variant="secondary" onClick={() => setConfirmCancel(false)} disabled={cancel.isPending}>{t('ticket.cancelNo')}</Button>
              <Button onClick={() => cancel.mutate(ticket.order.id)} disabled={cancel.isPending}>{t('ticket.cancelYes')}</Button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmCancel(true)} className="label self-start hover:text-signal-hover">
              {t('ticket.cancel')}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
