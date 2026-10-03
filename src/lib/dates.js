// Las horas se guardan en UTC (timestamptz) y se muestran en la zona horaria de quien mira.

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export function formatDateTime(iso, lang, options = {}) {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeStyle: 'short', ...options }).format(new Date(iso))
}

export function formatTime(iso, lang, timeZone) {
  return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso))
}

export function formatDate(iso, lang, options = { dateStyle: 'medium' }) {
  return new Intl.DateTimeFormat(lang, options).format(new Date(iso))
}

// Clave de día local (YYYY-MM-DD) para agrupar huecos
export function localDayKey(iso, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(new Date(iso))
}

export function orderNumber(n) {
  return `BX-${String(n).padStart(6, '0')}`
}
