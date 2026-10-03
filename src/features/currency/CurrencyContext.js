import { createContext, useContext } from 'react'

export const CurrencyContext = createContext(null)

// { currency, setCurrency, usdEnabled, usdRate, convert(arsCents), price(arsCents) }
export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency debe usarse dentro de <CurrencyProvider>')
  return ctx
}
