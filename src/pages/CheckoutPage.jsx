import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useLang } from '@/lib/useLang'
import { formatPrice } from '@/lib/money'
import { browserTimeZone, formatDateTime, formatTime } from '@/lib/dates'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Alert, Field, Input, Select } from '@/components/ui/Field'
import { useAuth } from '@/features/auth/AuthContext'
import { useCart } from '@/features/cart/CartContext'
import { pickTranslation } from '@/features/catalog/api'
import { usePublicSettings } from '@/features/settings/useSettings'
import { SlotPicker } from '@/features/booking/SlotPicker'
import { OrderError, createOrder } from '@/features/orders/api'

const PLATFORMS = ['pc_steam', 'pc_epic', 'ps5', 'xbox']
const REGIONS = ['latam', 'na', 'eu', 'asia', 'oce']
const DISCORD_RE = /^@?(?!.*\.\.)[a-z0-9_.]{2,32}$/

const detailsSchema = z.object({
  embarkId: z.string().trim().regex(/^[^#\s]{2,32}#[0-9]{3,6}$/, 'embarkId'),
  // Usuario de Discord actual: minúsculas, números, "_" y "." (sin "..")
  discordUsername: z.string().trim().toLowerCase().regex(DISCORD_RE, 'discord'),
  platform: z.enum(PLATFORMS, 'platform'),
  region: z.enum(REGIONS),
  note: z.string().trim().max(500),
  paymentMode: z.enum(['discord', 'online']),
  saveToProfile: z.boolean(),
  acceptTerms: z.literal(true, 'terms'),
})

function DetailsStep({ form, setForm, onNext, onlineEnabled }) {
  const { t } = useTranslation(['checkout', 'account'])
  const [errors, setErrors] = useState({})
  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = (e) => {
    e.preventDefault()
    const result = detailsSchema.safeParse(form)
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message])))
      return
    }
    setErrors({})
    onNext()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label={t('details.embarkId')} hint={t('details.embarkIdHint')} error={errors.embarkId && t('details.errors.embarkId')}>
        {(p) => <Input {...p} value={form.embarkId} onChange={set('embarkId')} placeholder="Raider#1234" autoComplete="off" />}
      </Field>
      <Field label={t('details.discord')} hint={t('details.discordHint')} error={errors.discordUsername && t('details.errors.discord')}>
        {(p) => <Input {...p} value={form.discordUsername} onChange={set('discordUsername')} placeholder="raider_pe" autoComplete="off" autoCapitalize="none" />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('details.platform')} error={errors.platform && t('details.errors.platform')}>
          {(p) => (
            <Select {...p} value={form.platform} onChange={set('platform')}>
              <option value="">{t('details.choosePlatform')}</option>
              {PLATFORMS.map((pl) => <option key={pl} value={pl}>{t(`account:platform.${pl}`)}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t('details.region')}>
          {(p) => (
            <Select {...p} value={form.region} onChange={set('region')}>
              {REGIONS.map((r) => <option key={r} value={r}>{t(`details.regions.${r}`)}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <Field label={t('details.note')}>
        {(p) => (
          <textarea
            {...p}
            rows={3}
            maxLength={500}
            value={form.note}
            onChange={set('note')}
            placeholder={t('details.notePlaceholder')}
            className="w-full rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-2.5 text-concrete-50 placeholder:text-concrete-500 focus:border-monitor focus:outline-none"
          />
        )}
      </Field>
      <label className="flex items-center gap-2.5 text-sm text-concrete-300">
        <input type="checkbox" checked={form.saveToProfile} onChange={set('saveToProfile')} className="size-4 accent-signal" />
        {t('details.saveToProfile')}
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-concrete-300">{t('details.paymentMode')}</legend>
        {[
          { value: 'discord', label: t('details.payDiscord'), hint: t('details.payDiscordHint'), disabled: false },
          { value: 'online', label: t('details.payOnline'), hint: t('details.payOnlineHint'), disabled: !onlineEnabled },
        ].map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 rounded-sm border p-3 ${form.paymentMode === opt.value ? 'border-signal bg-signal/5' : 'border-carbon-500'} ${opt.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          >
            <input
              type="radio"
              name="paymentMode"
              value={opt.value}
              checked={form.paymentMode === opt.value}
              disabled={opt.disabled}
              onChange={set('paymentMode')}
              className="mt-1 accent-signal"
            />
            <span className="flex flex-col">
              <span className="font-medium text-concrete-50">{opt.label}</span>
              <span className="text-sm text-concrete-400">{opt.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="rounded-sm border border-ember/50 bg-ember/10 px-4 py-3 text-sm text-concrete-100">
        {t('details.recordingNotice')}
      </p>

      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2.5 text-sm text-concrete-300">
          <input type="checkbox" checked={form.acceptTerms} onChange={set('acceptTerms')} className="mt-0.5 size-4 accent-signal" />
          {t('details.acceptTerms')}
        </label>
        {errors.acceptTerms && <p className="text-sm text-signal-hover">{t('details.errors.terms')}</p>}
      </div>

      <Button type="submit" size="lg" className="self-start">{t('details.continue')}</Button>
    </form>
  )
}

export function CheckoutPage() {
  const { t } = useTranslation(['checkout', 'cart'])
  const lang = useLang()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const cart = useCart()
  const { data: settings } = usePublicSettings()
  const storeTz = settings?.store_timezone || 'America/Lima'

  const [step, setStep] = useState('details')
  const [form, setForm] = useState(() => ({
    embarkId: profile?.embark_id ?? '',
    // El nombre que trae el login de Discord puede ser el visible (con espacios): solo se usa si es un usuario válido
    discordUsername: DISCORD_RE.test(profile?.discord_username ?? '') ? profile.discord_username : '',
    platform: profile?.platform ?? '',
    region: 'latam',
    note: '',
    paymentMode: 'discord',
    saveToProfile: !profile?.embark_id || !profile?.discord_username,
    acceptTerms: false,
  }))
  const [slot, setSlot] = useState(null)
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

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await createOrder({
        items: cart.lines.map((l) => ({ productId: l.productId, qty: l.qty, modIds: l.mods.map((m) => m.id) })),
        embarkId: form.embarkId.trim(),
        discordUsername: form.discordUsername.trim().replace(/^@/, '').toLowerCase(),
        platform: form.platform,
        region: form.region,
        note: form.note.trim() || undefined,
        paymentMode: form.paymentMode,
        slotStart: slot.start,
        saveToProfile: form.saveToProfile,
      })
      cart.clear()
      queryClient.invalidateQueries({ queryKey: ['slots'] })
      queryClient.invalidateQueries({ queryKey: ['my-orders'] })
      if (form.saveToProfile) queryClient.invalidateQueries({ queryKey: ['profile'] })
      navigate(`/cita/${result.ticket_code}`, { replace: true })
    } catch (err) {
      const code = err instanceof OrderError ? err.code : 'generic'
      setError({ code, detail: err.detail })
      if (code === 'slot_taken') {
        setSlot(null)
        queryClient.invalidateQueries({ queryKey: ['slots'] })
      }
      setBusy(false)
    }
  }

  const steps = ['details', 'slot']

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-5xl font-extrabold uppercase">{t('title')}</h1>
      <ol className="flex gap-6" aria-label={t('title')}>
        {steps.map((s, i) => (
          <li key={s} aria-current={step === s ? 'step' : undefined} className={`flex items-center gap-2 ${step === s ? 'text-concrete-50' : 'text-concrete-500'}`}>
            <span className={`flex size-7 items-center justify-center rounded-full font-mono text-sm ${step === s ? 'bg-signal text-carbon-950' : 'border border-carbon-500'}`}>{i + 1}</span>
            <span className="font-display text-lg font-semibold uppercase">{t(`steps.${s}`)}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-5">
          {step === 'details' ? (
            <DetailsStep form={form} setForm={setForm} onNext={() => setStep('slot')} onlineEnabled={settings?.online_payment_enabled === true} />
          ) : (
            <>
              <h2 className="font-display text-3xl font-semibold uppercase">{t('slot.title')}</h2>
              <SlotPicker value={slot?.start} onChange={(start, end) => setSlot({ start, end })} />
              {error && (
                <Alert>{t(`errors.${error.code}`, { detail: error.detail, defaultValue: t('errors.generic') })}</Alert>
              )}
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => setStep('details')} disabled={busy}>{t('slot.back')}</Button>
                <Button size="lg" onClick={confirm} disabled={!slot || busy}>
                  {busy ? t('slot.confirming') : t('slot.confirm')}
                </Button>
              </div>
            </>
          )}
        </section>

        <aside className="flex h-fit flex-col gap-4 rounded-sm bg-carbon-800 p-5">
          <h2 className="label">{t('slot.summary')}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {cart.lines.map((l) => (
              <li key={l.key} className="flex justify-between gap-3">
                <span>
                  {l.qty > 1 && `${l.qty} × `}{pickTranslation(l.translations, lang).name}
                  {l.mods.length > 0 && (
                    <span className="block text-xs text-concrete-400">+ {l.mods.map((m) => pickTranslation(m.translations, lang).name).join(', ')}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {slot && (
            <div className="border-t border-carbon-600 pt-3">
              <p className="label">{t('slot.selected')}</p>
              <p className="mt-1 text-concrete-50">{formatDateTime(slot.start, lang)}</p>
              {storeTz !== browserTimeZone() && (
                <p className="text-xs text-concrete-400">
                  {t('slot.storeTime', { time: formatTime(slot.start, lang, storeTz), tz: storeTz })}
                </p>
              )}
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-carbon-600 pt-3">
            <span className="text-concrete-300">{t('slot.total')}</span>
            <span className="font-mono text-2xl tabular-nums">{formatPrice(cart.subtotalCents, lang)}</span>
          </div>
          <p className="text-xs text-concrete-500">{t('slot.totalNote')}</p>
        </aside>
      </div>
    </div>
  )
}
