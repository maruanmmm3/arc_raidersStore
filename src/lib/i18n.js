import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import esCommon from '@/locales/es/common.json'
import esCatalog from '@/locales/es/catalog.json'
import esAuth from '@/locales/es/auth.json'
import esCart from '@/locales/es/cart.json'
import esAccount from '@/locales/es/account.json'
import enCommon from '@/locales/en/common.json'
import enCatalog from '@/locales/en/catalog.json'
import enAuth from '@/locales/en/auth.json'
import enCart from '@/locales/en/cart.json'
import enAccount from '@/locales/en/account.json'
import esCheckout from '@/locales/es/checkout.json'
import enCheckout from '@/locales/en/checkout.json'
import esOrders from '@/locales/es/orders.json'
import enOrders from '@/locales/en/orders.json'
import esLegal from '@/locales/es/legal.json'
import enLegal from '@/locales/en/legal.json'

export const LANGUAGES = ['es', 'en']

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: {
        common: esCommon, catalog: esCatalog, auth: esAuth, cart: esCart, account: esAccount,
        checkout: esCheckout, orders: esOrders, legal: esLegal,
      },
      en: {
        common: enCommon, catalog: enCatalog, auth: enAuth, cart: enCart, account: enAccount,
        checkout: enCheckout, orders: enOrders, legal: enLegal,
      },
    },
    supportedLngs: LANGUAGES,
    nonExplicitSupportedLngs: true, // es-PE → es, en-US → en
    fallbackLng: 'es',
    ns: ['common', 'catalog', 'auth', 'cart', 'account', 'checkout', 'orders', 'legal'],
    defaultNS: 'common',
    detection: {
      // 1º lo que eligió el usuario, 2º el idioma del navegador
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'lang',
    },
    interpolation: { escapeValue: false },
  })

// Idioma base sin región ("es-PE" → "es"), que es lo que usan la BD y los formatos
export function currentLang() {
  return (i18n.resolvedLanguage || 'es').slice(0, 2)
}

i18n.on('languageChanged', () => {
  document.documentElement.lang = currentLang()
})

export default i18n
