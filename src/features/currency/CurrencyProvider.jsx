import { useCallback, useMemo, useState } from 'react'
import { BASE_CURRENCY, convertFromBase, formatMoney } from '@/lib/money'
import { useLang } from '@/lib/useLang'
import { usePublicSettings } from '@/features/settings/useSettings'
import { CurrencyContext } from './CurrencyContext'

const STORAGE_KEY = 'botin-currency'

function loadCurrency() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'ARS' ? 'ARS' : BASE_CURRENCY
  } catch {
    return BASE_CURRENCY
  }
}

// Moneda en la que el comprador ve los precios (base USD). Los pesos están disponibles si el admin
// configuró el tipo de cambio. Cada forma de pago necesita sus datos en /admin/ajustes:
// USD → email de PayPal; ARS → tipo de cambio y CBU o alias.
export function CurrencyProvider({ children }) {
  const lang = useLang()
  const { data: settings } = usePublicSettings()
  const [chosen, setChosen] = useState(loadCurrency)

  const usdRate = Number(String(settings?.usd_rate ?? '').replace(',', '.')) || 0
  const arsAvailable = usdRate > 0
  const currency = chosen === 'ARS' && arsAvailable ? 'ARS' : BASE_CURRENCY

  const setCurrency = useCallback((value) => {
    setChosen(value)
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Sin almacenamiento: la elección dura esta visita
    }
  }, [])

  const value = useMemo(() => {
    const convert = (usdCents) => convertFromBase(usdCents, currency, usdRate)
    return {
      currency,
      setCurrency,
      usdRate,
      // El selector USD/ARS solo aparece si hay tipo de cambio
      showSwitch: arsAvailable,
      canPay: {
        USD: Boolean(settings?.paypal_email),
        ARS: arsAvailable && Boolean(settings?.payment_cbu || settings?.payment_alias),
      },
      convert,
      // Precio base (USD) mostrado en la moneda elegida
      price: (usdCents) => formatMoney(convert(usdCents), currency, lang),
    }
  }, [currency, setCurrency, usdRate, arsAvailable, settings, lang])

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}
