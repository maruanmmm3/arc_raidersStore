import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Field'

export function AuthCard({ title, children, footer }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 py-8">
      <h1 className="font-display text-5xl font-extrabold uppercase">{title}</h1>
      <div className="flex flex-col gap-5 rounded-sm bg-carbon-800 p-6">{children}</div>
      {footer && <p className="text-center text-sm text-concrete-400">{footer}</p>}
    </div>
  )
}

export function DiscordButton({ next = '/' }) {
  const { t } = useTranslation('auth')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const signIn = async () => {
    setBusy(true)
    setError(false)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: `${window.location.origin}${next}` },
    })
    // Si todo va bien, el navegador ya está saliendo hacia Discord
    if (err) {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button variant="discord" onClick={signIn} disabled={busy}>
        {t('discord')}
      </Button>
      {error && <Alert>{t('errors.generic')}</Alert>}
      <div className="flex items-center gap-3 text-xs uppercase text-concrete-500">
        <span className="h-px flex-1 bg-carbon-600" />
        {t('or')}
        <span className="h-px flex-1 bg-carbon-600" />
      </div>
    </div>
  )
}
