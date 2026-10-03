import { useCallback, useMemo, useState } from 'react'
import { BASE_CURRENCY, convertFromBase, formatMoney } from '@/lib/money'
import { useLang } from '@/lib/useLang'
import { usePublicSettings } from '@/features/settings/useSettings'
import { CurrencyContext } from './CurrencyContext'

const STORAGE_KEY = 'botin-currency'

function loadCurrency() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'USD' ? 'USD' : BASE_CURRENCY
  } catch {
    return BASE_CURRENCY
  }
}

// Moneda en la que el comprador ve y paga. USD solo está disponible si el admin configuró
// el tipo de cambio y el email de PayPal en /admin/ajustes.
export function CurrencyProvider({ children }) {
  const lang = useLang()
  const { data: settings } = usePublicSettings()
  const [chosen, setChosen] = useState(loadCurrency)

  const usdRate = Number(settings?.usd_rate) || 0
  const usdEnabled = usdRate > 0 && Boolean(settings?.paypal_email)
  const currency = chosen === 'USD' && usdEnabled ? 'USD' : BASE_CURRENCY

  const setCurrency = useCallback((value) => {
    setChosen(value)
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Sin almacenamiento: la elección dura esta visita
    }
  }, [])

  const value = useMemo(() => {
    const convert = (arsCents) => convertFromBase(arsCents, currency, usdRate)
    return {
      currency,
      setCurrency,
      usdEnabled,
      usdRate,
      convert,
      // Precio base (ARS) mostrado en la moneda elegida
      price: (arsCents) => formatMoney(convert(arsCents), currency, lang),
    }
  }, [currency, setCurrency, usdEnabled, usdRate, lang])

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}
