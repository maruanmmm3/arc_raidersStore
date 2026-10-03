import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Alert, Field, Input } from '@/components/ui/Field'
import { safeNext } from '@/lib/safeNext'
import { AuthCard, DiscordButton } from '@/features/auth/AuthCard'
import { fieldErrors, loginSchema } from '@/features/auth/schemas'

export function LoginPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const result = loginSchema.safeParse(form)
    setErrors(fieldErrors(result))
    setFormError(null)
    if (!result.success) return

    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword(result.data)
    setBusy(false)
    if (error) {
      if (error.code === 'invalid_credentials') setFormError('errors.invalidCredentials')
      else if (error.code === 'email_not_confirmed') setFormError('errors.emailNotConfirmed')
      else setFormError('errors.generic')
      return
    }
    navigate(next, { replace: true })
  }

  return (
    <AuthCard
      title={t('login.title')}
      footer={
        <>
          {t('login.noAccount')}{' '}
          <Link to={`/registro${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-monitor hover:text-concrete-50">
            {t('login.toRegister')}
          </Link>
        </>
      }
    >
      <DiscordButton next={next} />
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('fields.email')} error={errors.email && t(errors.email)}>
          {(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={set('email')} />}
        </Field>
        <Field label={t('fields.password')} error={errors.password && t(errors.password)}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" value={form.password} onChange={set('password')} />}
        </Field>
        {formError && <Alert>{t(formError)}</Alert>}
        <Button type="submit" disabled={busy}>{t('login.submit')}</Button>
        <Link to="/recuperar" className="self-center text-sm text-concrete-400 hover:text-concrete-50">{t('login.forgot')}</Link>
      </form>
    </AuthCard>
  )
}
