import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLang } from '@/lib/useLang'
import { formatMoney, plainAmount } from '@/lib/money'
import { formatDateTime, orderNumber } from '@/lib/dates'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Field'
import { CopyText } from '@/components/ui/CopyText'
import { ErrorState, PageLoader } from '@/components/ui/PageLoader'
import { itemName, nestItems, useConfirmDeliveryPublic, useOrderPublic } from '@/features/orders/api'

// Estado de cada paso según el pedido: done | current | pending
function stepStates(order) {
  const paid = ['paid_manual', 'paid_online', 'not_required'].includes(order.payment_status)
  if (order.status === 'cancelled') return ['done', 'pending', 'pending', 'pending']
  if (order.status === 'delivered') return ['done', 'done', 'done', 'done']
  if (paid) return ['done', 'done', 'done', 'current']
  return ['done', 'current', 'current', 'pending']
}

function Step({ n, title, state, children }) {
  const tone = {
    done: 'border-valve/60',
    current: 'border-signal',
    pending: 'border-carbon-600 opacity-60',
  }[state]
  return (
    <section className={`flex flex-col gap-3 rounded-sm border-l-4 bg-carbon-800 p-5 ${tone}`} aria-current={state === 'current' ? 'step' : undefined}>
      <h2 className="flex items-center gap-3 font-display text-2xl font-semibold uppercase">
        <span className={`flex size-8 items-center justify-center rounded-full font-mono text-sm ${state === 'done' ? 'bg-valve text-carbon-950' : state === 'current' ? 'bg-signal text-carbon-950' : 'border border-carbon-500'}`}>
          {state === 'done' ? '✓' : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-dashed border-carbon-500 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="label">{label}</dt>
      <dd className="text-concrete-50 sm:text-right">{children}</dd>
    </div>
  )
}

function DeliveryConfirmation({ order, code }) {
  const { t } = useTranslation('orders')
  const lang = useLang()
  const confirm = useConfirmDeliveryPublic()
  const [checked, setChecked] = useState(false)

  if (order.buyer_confirmed_at) {
    return (
      <p role="status" className="rounded-sm border border-valve/60 bg-valve/10 px-4 py-3 text-concrete-50">
        {t('ticket.confirmed', { date: formatDateTime(order.buyer_confirmed_at, lang) })}
      </p>
    )
  }
  if (!order.can_confirm) return null
  return (
    <section className="flex flex-col gap-4 rounded-sm border border-valve/60 bg-carbon-800 p-5">
      <h2 className="font-display text-2xl font-semibold uppercase">{t('ticket.confirmTitle')}</h2>
      <p className="text-concrete-300">{t('ticket.confirmText')}</p>
      <label className="flex items-start gap-2.5 text-sm text-concrete-200">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-4 accent-signal" />
        {t('ticket.confirmCheck')}
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => confirm.mutate(code)} disabled={!checked || confirm.isPending}>{t('ticket.confirmButton')}</Button>
        <Link to="/terminos#s5" className="text-sm text-monitor hover:text-concrete-50">{t('ticket.claimLink')}</Link>
      </div>
      {confirm.isError && <Alert>{t('ticket.confirmError')}</Alert>}
    </section>
  )
}

export function OrderPage() {
  const { code } = useParams()
  const { t } = useTranslation(['orders', 'checkout'])
  const lang = useLang()
  const { data: order, isPending, isError, refetch } = useOrderPublic(code)

  if (isPending) return <PageLoader />
  if (isError) return <ErrorState onRetry={refetch} />
  if (!order) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-concrete-300">{t('orderPage.notFound')}</p>
        <Link to="/tienda" className="label text-monitor">{t('checkout:empty')}</Link>
      </div>
    )
  }

  const pay = order.payment ?? {}
  const [s1, s2, s3, s4] = stepStates(order)
  const statusText = {
    requested: order.payment_status === 'unpaid' ? t('orderPage.awaitingPayment') : t('orderPage.paidWaitingDelivery'),
    scheduled: t('orderPage.paidWaitingDelivery'),
    delivering: t('orderPage.delivering'),
    delivered: t('orderPage.delivered'),
    cancelled: t('orderPage.cancelled'),
  }[order.status]
  const number = orderNumber(order.number)
  const isUsd = order.currency === 'USD'
  const hasPaymentData = isUsd ? Boolean(pay.paypal_email) : Boolean(pay.payment_cbu || pay.payment_alias)
  const total = formatMoney(order.total_cents, order.currency, lang)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-3">
        <p className="label">{t('orderPage.eyebrow')}</p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-display text-5xl font-extrabold uppercase">{number}</h1>
          <span className="font-mono text-2xl tabular-nums text-concrete-100">{total}</span>
        </div>
        <p className={`self-start rounded-sm px-3 py-1.5 text-sm font-medium ${order.status === 'cancelled' ? 'bg-carbon-600 text-concrete-300' : order.status === 'delivered' ? 'bg-valve text-carbon-950' : 'bg-ember text-carbon-950'}`}>
          {t('orderPage.statusLabel')}: {statusText}
        </p>
        <p className="text-sm text-concrete-400">{t('orderPage.saveLink', { code: order.public_code })}</p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <CopyText text={order.public_code} label={t('orderPage.copy')} className="text-concrete-100" />
          <CopyText text={window.location.href} label={t('orderPage.copyLink')} className="text-concrete-500 [&>span:first-child]:hidden" />
        </div>
      </header>

      <Step n={1} title={t('checkout:steps.details')} state={s1}>
        <p className="text-concrete-300">{t('orderPage.step1Done', { discord: order.discord_username })}</p>
        <details className="text-sm">
          <summary className="cursor-pointer text-concrete-400">{t('orderPage.itemsTitle')}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {nestItems(order.items).map((i) => (
              <li key={i.id} className="text-concrete-100">
                {i.qty > 1 && `${i.qty} × `}{itemName(i, lang)}
                {i.mods.length > 0 && <span className="text-concrete-400"> + {i.mods.map((m) => itemName(m, lang)).join(', ')}</span>}
              </li>
            ))}
          </ul>
        </details>
      </Step>

      <Step n={2} title={t('orderPage.step2Title')} state={s2}>
        {hasPaymentData ? (
          <>
            <p className="text-concrete-300">{isUsd ? t('orderPage.paypalLead') : t('orderPage.step2Lead')}</p>
            <dl>
              {isUsd ? (
                <Row label={t('orderPage.paypal')}><CopyText text={pay.paypal_email} label={t('orderPage.copy')} /></Row>
              ) : (
                <>
                  {pay.payment_holder && <Row label={t('orderPage.holder')}>{pay.payment_holder}</Row>}
                  {pay.payment_bank && <Row label={t('orderPage.bank')}>{pay.payment_bank}</Row>}
                  {pay.payment_cbu && <Row label={t('orderPage.cbu')}><CopyText text={pay.payment_cbu} label={t('orderPage.copy')} /></Row>}
                  {pay.payment_alias && <Row label={t('orderPage.alias')}><CopyText text={pay.payment_alias} label={t('orderPage.copy')} /></Row>}
                </>
              )}
              <Row label={t('orderPage.amount')}>
                <span className="font-display text-2xl">{total}</span>{' '}
                <CopyText text={plainAmount(order.total_cents, order.currency)} label={t('orderPage.copy')} className="text-sm text-concrete-400" />
              </Row>
              <Row label={isUsd ? t('orderPage.paypalNote') : t('orderPage.reference')}><CopyText text={number} label={t('orderPage.copy')} /></Row>
            </dl>
            <p className="rounded-sm border border-ember/60 bg-ember/10 px-4 py-3 text-sm font-medium text-concrete-50">
              {isUsd ? t('orderPage.paypalWarning') : t('orderPage.transferWarning')}
            </p>
          </>
        ) : (
          <Alert>{t('orderPage.holderMissing')}</Alert>
        )}
      </Step>

      <Step n={3} title={t('orderPage.step3Title')} state={s3}>
        <p className="text-concrete-300">
          {t('orderPage.step3Lead', { channel: pay.discord_delivery_channel || '#entregas', number })}
        </p>
        {pay.discord_invite_url ? (
          <a href={pay.discord_invite_url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'discord', className: 'self-start' })}>
            {t('orderPage.joinDiscord')}
          </a>
        ) : (
          <p className="text-sm text-concrete-500">{t('orderPage.discordMissing')}</p>
        )}
      </Step>

      <Step n={4} title={t('orderPage.step4Title')} state={s4}>
        <p className="text-concrete-300">{t('orderPage.step4Lead')}</p>
        <p className="text-sm text-concrete-400">{t('ticket.step4')}</p>
      </Step>

      <DeliveryConfirmation order={order} code={order.public_code} />
    </div>
  )
}
