import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Alert, Field, Input } from '@/components/ui/Field'
import { AuthCard } from '@/features/auth/AuthCard'
import { fieldErrors, newPasswordSchema, recoverSchema } from '@/features/auth/schemas'

export function RecoverPage() {
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const result = recoverSchema.safeParse({ email })
    setErrors(fieldErrors(result))
    if (!result.success) return
    setBusy(true)
    await supabase.auth.resetPasswordForEmail(result.data.email, {
      redirectTo: `${window.location.origin}/nueva-contrasena`,
    })
    setBusy(false)
    // Mismo mensaje exista o no el email, para no revelar qué cuentas hay
    setSent(true)
  }

  return (
    <AuthCard title={t('recover.title')}>
      {sent ? (
        <Alert tone="success">{t('recover.sent')}</Alert>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label={t('fields.email')} error={errors.email && t(errors.email)}>
            {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Button type="submit" disabled={busy}>{t('recover.submit')}</Button>
        </form>
      )}
    </AuthCard>
  )
}

// El enlace del email abre esta página con una sesión de recuperación ya iniciada
export function NewPasswordPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [form, setForm] = useState({ password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const result = newPasswordSchema.safeParse(form)
    setErrors(fieldErrors(result))
    setFormError(false)
    if (!result.success) return
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: result.data.password })
    setBusy(false)
    if (error) setFormError(true)
    else navigate('/cuenta', { replace: true })
  }

  return (
    <AuthCard title={t('newPassword.title')}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('fields.password')} error={errors.password && t(errors.password)}>
          {(p) => (
            <Input {...p} type="password" autoComplete="new-password" value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          )}
        </Field>
        <Field label={t('fields.confirmPassword')} error={errors.confirmPassword && t(errors.confirmPassword)}>
          {(p) => (
            <Input {...p} type="password" autoComplete="new-password" value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))} />
          )}
        </Field>
        {formError && <Alert>{t('errors.generic')}</Alert>}
        <Button type="submit" disabled={busy}>{t('newPassword.submit')}</Button>
      </form>
    </AuthCard>
  )
}
