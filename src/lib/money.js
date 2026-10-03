// Los precios base se guardan en centavos de ARS. El comprador puede ver y pagar en USD:
// el importe se calcula con el tipo de cambio de ARC_settings.usd_rate (pesos por 1 dólar).
export const BASE_CURRENCY = 'ARS'
export const CURRENCIES = ['ARS', 'USD']

const formatters = new Map()

function formatter(currency, lang, decimals) {
  const key = `${currency}-${lang}-${decimals}`
  if (!formatters.has(key)) {
    // Español: "$ 4.990" (pesos) y "US$ 4,99" (dólares). Inglés: "ARS 4,990" y "$4.99".
    // Nunca el mismo símbolo para las dos monedas en un mismo idioma.
    const locale = lang === 'es' ? 'es-AR' : 'en-US'
    const display = lang === 'es' ? (currency === 'USD' ? 'symbol' : 'narrowSymbol') : currency === 'USD' ? 'narrowSymbol' : 'code'
    formatters.set(
      key,
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: display,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    )
  }
  return formatters.get(key)
}

// Importe (en centavos) en una moneda concreta. Pesos redondos sin decimales; dólares siempre con 2.
export function formatMoney(cents, currency = BASE_CURRENCY, lang = 'es') {
  const value = cents ?? 0
  const decimals = currency === 'USD' || value % 100 !== 0 ? 2 : 0
  return formatter(currency, lang, decimals).format(value / 100)
}

// Precio base en pesos (panel de admin)
export function formatPrice(cents, lang = 'es') {
  return formatMoney(cents, BASE_CURRENCY, lang)
}

// Centavos de ARS → centavos de la moneda indicada (mismo redondeo que el servidor: hacia arriba)
export function convertFromBase(arsCents, currency, usdRate) {
  if (currency !== 'USD') return arsCents
  return Math.ceil((arsCents ?? 0) / usdRate)
}

// Monto para pegar en la app de pago: ARS "4990" / "4990,50"; USD "4.99"
export function plainAmount(cents, currency = BASE_CURRENCY) {
  const value = cents ?? 0
  if (currency === 'USD') return (value / 100).toFixed(2)
  return value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2).replace('.', ',')
}
