import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '@/lib/i18n'
import { useLang } from '@/lib/useLang'
import { useAuth } from '@/features/auth/AuthContext'
import { useCurrency } from '@/features/currency/CurrencyContext'
import { CURRENCIES } from '@/lib/money'

export function LanguageSwitch() {
  const { t } = useTranslation()
  const lang = useLang()
  const { changeLanguage } = useAuth()

  return (
    <div role="group" aria-label={t('language')} className="flex rounded-sm border border-carbon-500 font-mono text-xs">
      {LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => changeLanguage(l)}
          aria-pressed={lang === l}
          className={`px-2 py-1 uppercase ${lang === l ? 'bg-concrete-100 text-carbon-900' : 'text-concrete-400 hover:text-concrete-50'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

// Moneda en la que se ven los precios y se paga. Solo aparece si el USD está activado.
export function CurrencySwitch() {
  const { t } = useTranslation()
  const { currency, setCurrency, usdEnabled } = useCurrency()
  if (!usdEnabled) return null
  return (
    <div role="group" aria-label={t('currency')} className="flex rounded-sm border border-carbon-500 font-mono text-xs">
      {CURRENCIES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setCurrency(c)}
          aria-pressed={currency === c}
          className={`px-2 py-1 ${currency === c ? 'bg-concrete-100 text-carbon-900' : 'text-concrete-400 hover:text-concrete-50'}`}
        >
          {c}
        </button>
      ))}
    </div>
  )
}
