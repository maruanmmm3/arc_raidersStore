import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const tabs = [
  { to: '/cuenta', key: 'profile', end: true },
  { to: '/cuenta/pedidos', key: 'orders' },
  { to: '/cuenta/citas', key: 'appointments' },
]

export function AccountLayout() {
  const { t } = useTranslation('account')
  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-5xl font-extrabold uppercase">{t('title')}</h1>
      <nav className="flex gap-1 border-b border-carbon-600" aria-label={t('title')}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-4 py-2 font-display text-lg font-semibold uppercase ${isActive ? 'border-signal text-concrete-50' : 'border-transparent text-concrete-400 hover:text-concrete-50'}`
            }
          >
            {t(`nav.${tab.key}`)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
