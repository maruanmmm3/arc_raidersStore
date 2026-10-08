import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useLang } from '@/lib/useLang'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Alert, Field, Input, Select } from '@/components/ui/Field'
import { useAuth } from '@/features/auth/AuthContext'
import { useCart } from '@/features/cart/CartContext'
import { useCurrency } from '@/features/currency/CurrencyContext'
import { convertFromBase, formatMoney } from '@/lib/money'
import { pickTranslation } from '@/features/catalog/api'
import { OrderError, createOrder, rememberOrder } from '@/features/orders/api'

const PLATFORMS = ['pc_steam', 'pc_epic', 'ps5', 'xbox']
// Usuario de Discord actual: minúsculas, números, "_" y "." (sin "..")
const DISCORD_RE = /^@?(?!.*\.\.)[a-z0-9_.]{2,32}$/

const schema = z.object({
  discordUsername: z.string().trim().toLowerCase().regex(DISCORD_RE, 'discord'),
  email: z.email('email'),
  embarkId: z.string().trim().regex(/^[^#\s]{2,32}#[0-9]{3,6}$/, 'embarkId'),
  platform: z.enum(PLATFORMS).or(z.literal('')),
  note: z.string().trim().max(500),
  saveToProfile: z.boolean(),
  acceptTerms: z.literal(true, 'terms'),
})

const STEPS = ['details', 'transfer', 'discord', 'receive']

export function CheckoutPage() {
  const { t } = useTranslation(['checkout', 'cart', 'account'])
  const lang = useLang()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, profile } = useAuth()
  const cart = useCart()
  const { currency, setCurrency, canPay, usdRate, price } = useCurrency()

  const [form, setForm] = useState(() => ({
    // El nombre que trae el login de Discord puede ser el visible: solo se usa si es un usuario válido
    discordUsername: DISCORD_RE.test(profile?.discord_username ?? '') ? profile.discord_username : '',
    email: user?.email ?? '',
    embarkId: profile?.embark_id ?? '',
    platform: profile?.platform ?? '',
    note: '',
    saveToProfile: Boolean(user),
    acceptTerms: false,
  }))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!cart.lines.length) {
    return (
      <div className="flex flex-col items-center gap-6 py-20 text-center">
        <h1 className="font-display text-5xl font-extrabold uppercase">{t('title')}</h1>
        <p className="text-concrete-400">{t('empty')}</p>
        <ButtonLink to="/tienda">{t('cart:goShop')}</ButtonLink>
      </div>
    )
  }

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    const result = schema.safeParse(form)
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message])))
      return
    }
    setErrors({})
    setBusy(true)
    const v = result.data
    try {
      const order = await createOrder({
        items: cart.lines.map((l) => ({ productId: l.productId, qty: l.qty, modIds: l.mods.map((m) => m.id) })),
        discordUsername: v.discordUsername.replace(/^@/, ''),
        email: v.email,
        embarkId: v.embarkId,
        platform: v.platform || undefined,
        note: v.note || undefined,
        saveToProfile: Boolean(user) && v.saveToProfile,
        currency,
      })
      rememberOrder(order.public_code)
      cart.clear()
      queryClient.invalidateQueries({ queryKey: ['my-orders'] })
      if (user && v.saveToProfile) queryClient.invalidateQueries({ queryKey: ['profile'] })
      navigate(`/pedido/${order.public_code}`, { replace: true })
    } catch (err) {
      setError({ code: err instanceof OrderError ? err.code : 'generic', detail: err.detail })
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-5xl font-extrabold uppercase">{t('title')}</h1>
        {!user && (
          <p className="text-concrete-400">
            {t('noAccount')}
          </p>
        )}
      </header>

      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={t('title')}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === 0 ? 'step' : undefined} className={`flex items-center gap-2 ${i === 0 ? 'text-concrete-50' : 'text-concrete-500'}`}>
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-sm ${i === 0 ? 'bg-signal text-carbon-950' : 'border border-carbon-500'}`}>{i + 1}</span>
            <span className="font-display text-lg font-semibold uppercase leading-tight">{t(`steps.${s}`)}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <Field label={t('details.discord')} hint={t('details.discordHint')} error={errors.discordUsername && t('details.errors.discord')}>
            {(p) => <Input {...p} value={form.discordUsername} onChange={set('discordUsername')} placeholder="raider_pe" autoComplete="off" autoCapitalize="none" />}
          </Field>
          <Field label={t('details.email')} hint={t('details.emailHint')} error={errors.email && t('details.errors.email')}>
            {(p) => <Input {...p} type="email" value={form.email} onChange={set('email')} placeholder="tu@correo.com" autoComplete="email" />}
          </Field>
          <Field label={t('details.embarkId')} hint={t('details.embarkIdHint')} error={errors.embarkId && t('details.errors.embarkId')}>
            {(p) => <Input {...p} value={form.embarkId} onChange={set('embarkId')} placeholder="Raider#1234" autoComplete="off" />}
          </Field>
          <Field label={t('details.platform')}>
            {(p) => (
              <Select {...p} value={form.platform} onChange={set('platform')}>
                <option value="">{t('details.choosePlatform')}</option>
                {PLATFORMS.map((pl) => <option key={pl} value={pl}>{t(`account:platform.${pl}`)}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t('details.note')}>
            {(p) => (
              <textarea
                {...p}
                rows={2}
                maxLength={500}
                value={form.note}
                onChange={set('note')}
                placeholder={t('details.notePlaceholder')}
                className="w-full rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-2.5 text-concrete-50 placeholder:text-concrete-500 focus:border-monitor focus:outline-none"
              />
            )}
          </Field>
          {user && (
            <label className="flex items-center gap-2.5 text-sm text-concrete-300">
              <input type="checkbox" checked={form.saveToProfile} onChange={set('saveToProfile')} className="size-4 accent-signal" />
              {t('details.saveToProfile')}
            </label>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-concrete-300">{t('details.payWith')}</legend>
            {[
              { value: 'USD', label: t('details.payUsd'), hint: t('details.payUsdHint') },
              { value: 'ARS', label: t('details.payArs'), hint: t('details.payArsHint') },
            ].map((opt) => {
              const disabled = !canPay[opt.value]
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-sm border p-3 ${currency === opt.value && !disabled ? 'border-signal bg-signal/5' : 'border-carbon-500'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    name="currency"
                    value={opt.value}
                    checked={currency === opt.value && !disabled}
                    disabled={disabled}
                    onChange={() => setCurrency(opt.value)}
                    className="mt-1 accent-signal"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium text-concrete-50">
                      {opt.label}
                      {(opt.value === 'USD' || usdRate > 0) &&
                        ` · ${formatMoney(convertFromBase(cart.subtotalCents, opt.value, usdRate), opt.value, lang)}`}
                    </span>
                    <span className="text-sm text-concrete-400">{disabled ? t('details.payUnavailable') : opt.hint}</span>
                  </span>
                </label>
              )
            })}
          </fieldset>
          {!canPay[currency] && (
            <Alert>{canPay.USD || canPay.ARS ? t('details.payChooseOther') : t('details.payNotConfigured')}</Alert>
          )}

          <p className="rounded-sm border border-ember/50 bg-ember/10 px-4 py-3 text-sm text-concrete-100">
            {t('details.recordingNotice')}
          </p>

          <div className="flex flex-col gap-1">
            <label className="flex items-start gap-2.5 text-sm text-concrete-300">
              <input type="checkbox" checked={form.acceptTerms} onChange={set('acceptTerms')} className="mt-0.5 size-4 accent-signal" />
              <span>
                {t('details.acceptTerms')} (<Link to="/terminos" target="_blank" className="text-monitor">↗</Link>)
              </span>
            </label>
            {errors.acceptTerms && <p className="text-sm text-signal-hover">{t('details.errors.terms')}</p>}
          </div>

          {error && <Alert>{t(`errors.${error.code}`, { detail: error.detail, defaultValue: t('errors.generic') })}</Alert>}

          <Button type="submit" size="lg" className="self-start" disabled={busy || !canPay[currency]}>
            {busy ? t('details.submitting') : t('details.submit')}
          </Button>
        </form>

        <aside className="flex h-fit flex-col gap-4 rounded-sm bg-carbon-800 p-5">
          <h2 className="label">{t('summary.title')}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {cart.lines.map((l) => (
              <li key={l.key}>
                {l.qty > 1 && `${l.qty} × `}{pickTranslation(l.translations, lang).name}
                {l.mods.length > 0 && (
                  <span className="block text-xs text-concrete-400">+ {l.mods.map((m) => pickTranslation(m.translations, lang).name).join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between border-t border-carbon-600 pt-3">
            <span className="text-concrete-300">{t('summary.total')}</span>
            <span className="font-mono text-2xl tabular-nums">{price(cart.subtotalCents)}</span>
          </div>
          <p className="text-xs text-concrete-500">{t('summary.totalNote')}</p>
        </aside>
      </div>
    </div>
  )
}
