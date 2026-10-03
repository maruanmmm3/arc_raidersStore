import { useTranslation } from 'react-i18next'

// Idioma activo sin región: 'es' | 'en'
export function useLang() {
  const { i18n } = useTranslation()
  return (i18n.resolvedLanguage || 'es').slice(0, 2)
}
