// Los precios base se guardan en centavos de USD. El comprador puede ver y pagar en ARS:
// el importe se calcula con el tipo de cambio de ARC_settings.usd_rate (pesos por 1 dólar).
export const BASE_CURRENCY = 'USD'
export const CURRENCIES = ['USD', 'ARS']

const formatters = new Map()

function formatter(currency, lang, decimals) {
  const key = `${currency}-${lang}-${decimals}`
  if (!formatters.has(key)) {
    // Español: "US$ 4,99" (dólares) y "$ 4.990" (pesos). Inglés: "$4.99" y "ARS 4,990".
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

// Importe (en centavos) en una moneda concreta. Dólares siempre con 2 decimales; pesos redondos sin decimales.
export function formatMoney(cents, currency = BASE_CURRENCY, lang = 'es') {
  const value = cents ?? 0
  const decimals = currency === 'USD' || value % 100 !== 0 ? 2 : 0
  return formatter(currency, lang, decimals).format(value / 100)
}

// Precio base en dólares (panel de admin)
export function formatPrice(cents, lang = 'es') {
  return formatMoney(cents, BASE_CURRENCY, lang)
}

// Centavos de USD → centavos de la moneda indicada. En pesos se redondea hacia arriba al peso
// entero, igual que el servidor (arc_create_guest_order).
export function convertFromBase(usdCents, currency, usdRate) {
  if (currency !== 'ARS') return usdCents
  return Math.ceil(((usdCents ?? 0) * usdRate) / 100) * 100
}

// Monto para pegar en la app de pago: USD "4.99"; ARS "4990" / "4990,50"
export function plainAmount(cents, currency = BASE_CURRENCY) {
  const value = cents ?? 0
  if (currency === 'USD') return (value / 100).toFixed(2)
  return value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2).replace('.', ',')
}
