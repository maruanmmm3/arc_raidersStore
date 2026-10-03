import { useState } from 'react'
import { formatPrice } from '@/lib/money'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Field'
import { ErrorState, PageLoader } from '@/components/ui/PageLoader'
import { useAuth } from '@/features/auth/AuthContext'
import { usePublicSettings } from '@/features/settings/useSettings'
import { roleErrorMessage, useAdminUsers, useSetRole } from '@/features/admin/usersApi'

const PLATFORM = { pc_steam: 'PC Steam', pc_epic: 'PC Epic', ps5: 'PS5', xbox: 'Xbox' }

function RoleBadge({ user }) {
  if (user.is_owner) return <span className="rounded-sm bg-signal px-2 py-0.5 font-mono text-xs uppercase text-carbon-950">Admin principal</span>
  if (user.role === 'admin') return <span className="rounded-sm bg-monitor px-2 py-0.5 font-mono text-xs uppercase text-carbon-950">Admin</span>
  return <span className="font-mono text-xs uppercase text-concrete-400">Usuario</span>
}

// Botones de rol: solo los ve el admin principal
function RoleActions({ user, adminsFull, setRole }) {
  const [confirming, setConfirming] = useState(false)
  if (user.is_owner) return null

  if (user.role === 'admin') {
    return confirming ? (
      <div className="flex flex-col items-end gap-2">
        {user.pending_appointments > 0 && (
          <span className="max-w-56 text-right text-xs text-ember">
            Tiene {user.pending_appointments} citas pendientes. Seguirán asignadas a él: reasígnalas o cancélalas en la agenda.
          </span>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>No</Button>
          <Button size="sm" disabled={setRole.isPending} onClick={() => setRole.mutate({ userId: user.id, role: 'user' })}>
            Sí, quitar admin
          </Button>
        </div>
      </div>
    ) : (
      <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>Quitar admin</Button>
    )
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={adminsFull || user.is_blocked || setRole.isPending}
      title={adminsFull ? 'Ya está el máximo de admins' : undefined}
      onClick={() => setRole.mutate({ userId: user.id, role: 'admin' })}
    >
      Hacer admin
    </Button>
  )
}

export function UsersPage() {
  const { isOwner } = useAuth()
  const { data: users, isPending, isError, refetch } = useAdminUsers()
  const { data: settings } = usePublicSettings()
  const setRole = useSetRole()
  const [search, setSearch] = useState('')
  const [onlyAdmins, setOnlyAdmins] = useState(false)

  if (isPending) return <PageLoader />
  if (isError) return <ErrorState onRetry={refetch} />

  const maxAdmins = Number(settings?.max_admins ?? 2)
  const adminCount = users.filter((u) => u.role === 'admin').length
  const adminsFull = adminCount >= maxAdmins

  const q = search.trim().toLowerCase()
  const rows = users.filter((u) => {
    if (onlyAdmins && u.role !== 'admin') return false
    if (!q) return true
    return [u.username, u.email, u.discord_username, u.embark_id].some((v) => v?.toLowerCase().includes(q))
  })

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-4xl font-extrabold uppercase">Usuarios</h1>
          <p className="text-sm text-concrete-400">
            Aparecen las cuentas que han entrado al menos una vez en la tienda.
            {isOwner ? ' Como admin principal, puedes dar o quitar el rol admin.' : ' Solo el admin principal puede cambiar roles.'}
          </p>
        </div>
        <p className={`ml-auto rounded-sm border px-3 py-1.5 font-mono text-sm ${adminsFull ? 'border-ember text-ember' : 'border-carbon-500 text-concrete-300'}`}>
          Admins: {adminCount} / {maxAdmins}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="users-search">Buscar</label>
        <input
          id="users-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Usuario, email, Discord o ID de Embark"
          className="min-w-64 flex-1 rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-1.5 text-sm text-concrete-50 focus:border-monitor focus:outline-none"
        />
        <label className="flex items-center gap-2 text-sm text-concrete-300">
          <input type="checkbox" checked={onlyAdmins} onChange={(e) => setOnlyAdmins(e.target.checked)} className="accent-signal" />
          Solo admins
        </label>
      </div>

      {setRole.isError && <Alert>{roleErrorMessage(setRole.error)}</Alert>}

      {rows.length === 0 ? (
        <p className="text-concrete-400">No hay usuarios con estos filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-carbon-600">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-carbon-800 text-left">
              <tr className="font-mono text-xs uppercase tracking-wider text-concrete-400">
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Juego</th>
                <th className="px-3 py-2 text-right">Pedidos</th>
                <th className="px-3 py-2 text-right">Gastado</th>
                <th className="px-3 py-2">Alta</th>
                <th className="px-3 py-2">Rol</th>
                {isOwner && <th className="px-3 py-2"><span className="sr-only">Acciones</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t border-carbon-600 align-top hover:bg-carbon-850">
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-concrete-50">{u.username}</span>
                    {u.is_blocked && <span className="ml-2 font-mono text-xs uppercase text-signal-hover">Bloqueado</span>}
                    <span className="block text-xs text-concrete-400">{u.email}</span>
                    {u.discord_username && <span className="block text-xs text-concrete-500">Discord: {u.discord_username}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-concrete-200">{u.embark_id ?? '—'}</span>
                    {u.platform && <span className="block text-xs text-concrete-500">{PLATFORM[u.platform]}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{u.orders_count}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatPrice(u.spent_cents, 'es')}</td>
                  <td className="px-3 py-2.5 text-concrete-400">{new Date(u.created_at).toLocaleDateString('es')}</td>
                  <td className="px-3 py-2.5"><RoleBadge user={u} /></td>
                  {isOwner && (
                    <td className="px-3 py-2.5 text-right">
                      <RoleActions key={`${u.id}-${u.role}`} user={u} adminsFull={adminsFull} setRole={setRole} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
