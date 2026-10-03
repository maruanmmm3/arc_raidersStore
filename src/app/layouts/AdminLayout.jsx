import { Link, NavLink, Outlet } from 'react-router-dom'
import { NewOrdersAlert } from '@/features/admin/NewOrdersAlert'

// Textos del admin en español por ahora; el namespace "admin" de i18n llega en la fase 2
const sections = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/agenda', label: 'Agenda' },
  { to: '/admin/pedidos', label: 'Pedidos' },
  { to: '/admin/ventas', label: 'Ventas' },
  { to: '/admin/armas', label: 'Armas' },
  { to: '/admin/mods', label: 'Mods' },
  { to: '/admin/planos', label: 'Planos' },
  { to: '/admin/packs', label: 'Packs' },
  { to: '/admin/usuarios', label: 'Usuarios' },
  { to: '/admin/cupones', label: 'Cupones' },
  { to: '/admin/disponibilidad', label: 'Disponibilidad' },
  { to: '/admin/salas', label: 'Salas' },
  { to: '/admin/ajustes', label: 'Ajustes' },
  { to: '/admin/actividad', label: 'Actividad' },
]

export function AdminLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-carbon-950 md:flex-row">
      <aside className="border-b border-carbon-600 bg-carbon-900 md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="stripe" />
        <div className="flex items-center justify-between px-4 py-4">
          <Link to="/" className="font-display text-xl font-extrabold uppercase">El Botín · Admin</Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible" aria-label="Administración">
          {sections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-sm px-3 py-2 text-sm ${isActive ? 'bg-carbon-700 font-semibold text-concrete-50' : 'text-concrete-400 hover:bg-carbon-800 hover:text-concrete-50'}`
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-8 md:px-8">
        <NewOrdersAlert />
        <Outlet />
      </main>
    </div>
  )
}
