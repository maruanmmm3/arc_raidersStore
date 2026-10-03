import { useTranslation } from 'react-i18next'

export function PageLoader() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status">
      <span className="label animate-pulse">{t('loading')}</span>
    </div>
  )
}

export function ErrorState({ onRetry }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center" role="alert">
      <p className="text-concrete-300">{t('error.generic')}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="label text-monitor hover:text-concrete-50">
          {t('error.retry')}
        </button>
      )}
    </div>
  )
}

export function ComingSoon({ phase }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <p className="label">{t('comingSoon.title')}</p>
      <p className="mt-3 text-concrete-300">{t('comingSoon.text', { phase })}</p>
    </div>
  )
}
