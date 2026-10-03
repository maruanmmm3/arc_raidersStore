import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { LANGUAGES } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'
import { Alert, Field, Input, Select } from '@/components/ui/Field'
import { PageLoader } from '@/components/ui/PageLoader'
import { useAuth } from '@/features/auth/AuthContext'

const PLATFORMS = ['pc_steam', 'pc_epic', 'ps5', 'xbox']

// Mismas reglas que los checks de la tabla profiles
// Usuario de Discord actual: minúsculas, números, "_" y "." (sin "..")
const DISCORD_RE = /^@?(?!.*\.\.)[a-z0-9_.]{2,32}$/

const profileSchema = z.object({
  username: z.string().regex(/^[A-Za-z0-9_]{3,32}$/, 'username'),
  embark_id: z
    .string()
    .trim()
    .regex(/^[^#\s]{2,32}#[0-9]{3,6}$/, 'embarkId')
    .or(z.literal('')),
  platform: z.enum(PLATFORMS).or(z.literal('')),
  discord_username: z.string().trim().toLowerCase().regex(DISCORD_RE, 'discord').or(z.literal('')),
  locale: z.enum(LANGUAGES),
})

function ProfileForm({ profile }) {
  const { t } = useTranslation(['account', 'auth'])
  const { refreshProfile, changeLanguage } = useAuth()
  const [form, setForm] = useState({
    username: profile.username ?? '',
    embark_id: profile.embark_id ?? '',
    platform: profile.platform ?? '',
    discord_username: profile.discord_username ?? '',
    locale: profile.locale ?? 'es',
  })
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null) // 'saved' | 'taken' | 'error'
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setStatus(null)
    const result = profileSchema.safeParse(form)
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message])))
      return
    }
    setErrors({})
    setBusy(true)
    const values = result.data
    const { error } = await supabase
      .from('ARC_profiles')
      .update({
        username: values.username,
        embark_id: values.embark_id || null,
        platform: values.platform || null,
        discord_username: values.discord_username.replace(/^@/, '') || null,
        locale: values.locale,
      })
      .eq('id', profile.id)
    setBusy(false)
    if (error) {
      setStatus(error.code === '23505' ? 'taken' : 'error') // 23505 = unique_violation
      return
    }
    if (values.locale !== profile.locale) await changeLanguage(values.locale)
    refreshProfile()
    setStatus('saved')
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-lg flex-col gap-5">
      <Field label={t('profile.username')} error={errors.username && t('auth:errors.username')}>
        {(p) => <Input {...p} value={form.username} onChange={set('username')} autoComplete="username" />}
      </Field>
      <Field
        label={t('profile.embarkId')}
        hint={t('profile.embarkIdHint')}
        error={errors.embark_id && t('profile.errors.embarkId')}
      >
        {(p) => <Input {...p} value={form.embark_id} onChange={set('embark_id')} placeholder="Raider#1234" />}
      </Field>
      <Field label={t('profile.platform')}>
        {(p) => (
          <Select {...p} value={form.platform} onChange={set('platform')}>
            <option value="">{t('profile.noPlatform')}</option>
            {PLATFORMS.map((pl) => <option key={pl} value={pl}>{t(`platform.${pl}`)}</option>)}
          </Select>
        )}
      </Field>
      <Field label={t('profile.language')}>
        {(p) => (
          <Select {...p} value={form.locale} onChange={set('locale')}>
            <option value="es">Español</option>
            <option value="en">English</option>
          </Select>
        )}
      </Field>
      <Field
        label={t('profile.discord')}
        hint={profile.discord_id ? t('profile.discordLinkedHint') : t('profile.discordHint')}
        error={errors.discord_username && t('profile.errors.discord')}
      >
        {(p) => <Input {...p} value={form.discord_username} onChange={set('discord_username')} placeholder="raider_pe" autoCapitalize="none" />}
      </Field>
      {status === 'saved' && <Alert tone="success">{t('profile.saved')}</Alert>}
      {status === 'taken' && <Alert>{t('profile.errors.usernameTaken')}</Alert>}
      {status === 'error' && <Alert>{t('auth:errors.generic')}</Alert>}
      <Button type="submit" disabled={busy} className="self-start">{t('profile.save')}</Button>
    </form>
  )
}

export function ProfilePage() {
  const { profile, loading } = useAuth()
  if (loading || !profile) return <PageLoader />
  return <ProfileForm key={profile.id} profile={profile} />
}
