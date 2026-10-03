import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ButtonLink } from '@/components/ui/Button'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="font-mono text-sm text-signal">404</p>
      <h1 className="font-display text-5xl font-extrabold uppercase">{t('notFound.title')}</h1>
      <p className="text-concrete-400">{t('notFound.text')}</p>
      <ButtonLink to="/" variant="secondary">{t('notFound.back')}</ButtonLink>
    </div>
  )
}

export function RouteError() {
  const error = useRouteError()
  const { t } = useTranslation()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  console.error(error)
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-carbon-900 p-6 text-center text-concrete-100">
      <h1 className="font-display text-4xl font-extrabold uppercase">{t('error.generic')}</h1>
      <ButtonLink to="/" variant="secondary">{t('notFound.back')}</ButtonLink>
    </div>
  )
}

export function SetupNotice() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center bg-carbon-900 p-6 text-concrete-100">
      <div className="flex max-w-lg flex-col gap-4">
        <div className="stripe" />
        <h1 className="font-display text-4xl font-extrabold uppercase">{t('setup.title')}</h1>
        <p className="text-concrete-300">{t('setup.text')}</p>
      </div>
    </div>
  )
}
