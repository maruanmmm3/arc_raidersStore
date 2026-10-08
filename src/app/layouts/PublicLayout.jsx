import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/AuthContext'
import { useCart } from '@/features/cart/CartContext'
import { CurrencySwitch, LanguageSwitch } from './LanguageSwitch'

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true'

const navItems = [
  { to: '/tienda/armas', key: 'weapons' },
  { to: '/tienda/planos', key: 'blueprints' },
  { to: '/tienda/mods', key: 'mods' },
  { to: '/tienda/packs', key: 'bundles' },
  { to: '/discord', key: 'discord' },
]

function navClass({ isActive }) {
  return `font-display text-lg font-semibold uppercase tracking-wide ${isActive ? 'text-concrete-50' : 'text-concrete-400 hover:text-concrete-50'}`
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2" />
      <circle cx="9.5" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </svg>
  )
}

function Header() {
  const { t } = useTranslation()
  const { user, isAdmin, signOut } = useAuth()
  const { count } = useCart()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const [lastPath, setLastPath] = useState(location.pathname)

  // Cierra el menú móvil al navegar
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setOpen(false)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-carbon-600 bg-carbon-900/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Link to="/" className="font-display text-2xl font-extrabold uppercase tracking-wide text-concrete-50">
          {t('brand')}
        </Link>

        <nav className="hidden items-center gap-5 lg:flex" aria-label="Principal">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass}>
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <LanguageSwitch />
          <CurrencySwitch />
          <Link to="/carrito" className="relative p-2 text-concrete-300 hover:text-concrete-50" aria-label={t('nav.cart')}>
            <CartIcon />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-signal font-mono text-[11px] font-medium text-carbon-950">
                {count}
              </span>
            )}
          </Link>
          <div className="hidden items-center gap-4 lg:flex">
            {isAdmin && <NavLink to="/admin" className={navClass}>{t('nav.admin')}</NavLink>}
            {user ? (
              <>
                <NavLink to="/cuenta" className={navClass}>{t('nav.account')}</NavLink>
                <button type="button" onClick={signOut} className="label hover:text-concrete-50">{t('nav.logout')}</button>
              </>
            ) : (
              <NavLink to="/login" className={navClass}>{t('nav.login')}</NavLink>
            )}
          </div>
          <button
            type="button"
            className="label rounded-sm border border-carbon-500 px-2.5 py-1.5 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {t('nav.menu')}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" className="flex flex-col gap-3 border-t border-carbon-600 px-4 py-4 lg:hidden" aria-label="Principal">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass}>{t(`nav.${item.key}`)}</NavLink>
          ))}
          <hr className="border-carbon-600" />
          {isAdmin && <NavLink to="/admin" className={navClass}>{t('nav.admin')}</NavLink>}
          {user ? (
            <>
              <NavLink to="/cuenta" className={navClass}>{t('nav.account')}</NavLink>
              <button type="button" onClick={signOut} className="label self-start hover:text-concrete-50">{t('nav.logout')}</button>
            </>
          ) : (
            <NavLink to="/login" className={navClass}>{t('nav.login')}</NavLink>
          )}
        </nav>
      )}
    </header>
  )
}

function Footer() {
  const { t } = useTranslation()
  const links = [
    ['/como-funciona', 'howItWorks'],
    ['/faq', 'faq'],
    ['/terminos', 'terms'],
    ['/reembolsos', 'refunds'],
    ['/privacidad', 'privacy'],
    ['/contacto', 'contact'],
  ]
  return (
    <footer className="mt-24 border-t border-carbon-600 bg-carbon-950">
      <div className="stripe" />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10">
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Legal">
          {links.map(([to, key]) => (
            <Link key={to} to={to} className="text-sm text-concrete-400 hover:text-concrete-50">{t(`footer.${key}`)}</Link>
          ))}
        </nav>
        <p className="max-w-2xl text-xs text-concrete-500">{t('footer.notAffiliated')}</p>
      </div>
    </footer>
  )
}

export function PublicLayout() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="stripe" />
      {DEMO && (
        <p className="bg-ember px-4 py-1.5 text-center font-mono text-xs font-medium text-carbon-950">{t('demoBanner')}</p>
      )}
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
