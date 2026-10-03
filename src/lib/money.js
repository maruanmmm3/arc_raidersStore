export const CURRENCY = import.meta.env.VITE_CURRENCY || 'USD'

const formatters = new Map()

// Los importes viajan siempre en céntimos (enteros); solo se convierten al mostrarlos.
export function formatPrice(cents, lang = 'es') {
  const key = `${lang}-${CURRENCY}`
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.NumberFormat(lang, { style: 'currency', currency: CURRENCY }))
  }
  return formatters.get(key).format((cents ?? 0) / 100)
}
