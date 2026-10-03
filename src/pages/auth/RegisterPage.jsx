import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/useLang'
import { Button } from '@/components/ui/Button'
import { Alert, Field, Input } from '@/components/ui/Field'
import { safeNext } from '@/lib/safeNext'
import { AuthCard, DiscordButton } from '@/features/auth/AuthCard'
import { fieldErrors, registerSchema } from '@/features/auth/schemas'

export function RegisterPage() {
  const { t } = useTranslation('auth')
  const lang = useLang()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '', acceptTerms: false })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [checkEmail, setCheckEmail] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const result = registerSchema.safeParse(form)
    setErrors(fieldErrors(result))
    setFormError(null)
    if (!result.success) return

    setBusy(true)
    const { username, email, password } = result.data
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // El trigger handle_new_user lee estos datos para crear el perfil
        data: { username, locale: lang },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    setBusy(false)

    if (error) {
      setFormError(error.code === 'user_already_exists' ? 'errors.userExists' : 'errors.generic')
      return
    }
    if (data.session) navigate(next, { replace: true })
    else setCheckEmail(true) // Confirmación de email activada
  }

  if (checkEmail) {
    return (
      <AuthCard title={t('register.title')}>
        <Alert tone="success">{t('register.checkEmail')}</Alert>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={t('register.title')}
      footer={
        <>
          {t('register.hasAccount')}{' '}
          <Link to="/login" className="text-monitor hover:text-concrete-50">{t('register.toLogin')}</Link>
        </>
      }
    >
      <DiscordButton next={next} />
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('fields.username')} error={errors.username && t(errors.username)}>
          {(p) => <Input {...p} autoComplete="username" value={form.username} onChange={set('username')} />}
        </Field>
        <Field label={t('fields.email')} error={errors.email && t(errors.email)}>
          {(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={set('email')} />}
        </Field>
        <Field label={t('fields.password')} error={errors.password && t(errors.password)}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />}
        </Field>
        <Field label={t('fields.confirmPassword')} error={errors.confirmPassword && t(errors.confirmPassword)}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} />}
        </Field>
        <div className="flex flex-col gap-1">
          <label className="flex items-start gap-2.5 text-sm text-concrete-300">
            <input type="checkbox" checked={form.acceptTerms} onChange={set('acceptTerms')} className="mt-0.5 size-4 accent-signal" />
            <span>{t('register.acceptTerms')}</span>
          </label>
          {errors.acceptTerms && <p className="text-sm text-signal-hover">{t(errors.acceptTerms)}</p>}
        </div>
        {formError && <Alert>{t(formError)}</Alert>}
        <Button type="submit" disabled={busy}>{t('register.submit')}</Button>
      </form>
    </AuthCard>
  )
}
