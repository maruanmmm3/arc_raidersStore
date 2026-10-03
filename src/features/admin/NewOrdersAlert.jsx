import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/money'
import { orderNumber } from '@/lib/dates'
import { Button } from '@/components/ui/Button'
import { CopyText } from '@/components/ui/CopyText'

const SEEN_KEY = 'botin-admin-orders-seen'
const canNotify = typeof window !== 'undefined' && 'Notification' in window

function readSeen() {
  try {
    const saved = localStorage.getItem(SEEN_KEY)
    if (saved) return saved
    const now = new Date().toISOString()
    localStorage.setItem(SEEN_KEY, now) // primera visita: sin avisos de compras antiguas
    return now
  } catch {
    return new Date().toISOString()
  }
}

// Banner de compras nuevas en el panel de admin (consulta cada 20 s mientras el panel está abierto)
export function NewOrdersAlert() {
  const [seenAt, setSeenAt] = useState(readSeen)
  const [permission, setPermission] = useState(canNotify ? Notification.permission : 'denied')
  const notified = useRef(new Set())

  const { data: orders = [] } = useQuery({
    queryKey: ['admin', 'new-orders', seenAt],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ARC_orders')
        .select('id, number, created_at, discord_username, embark_id, total_cents, appointments:ARC_appointments ( ticket_code, slot_start )')
        .gt('created_at', seenAt)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data
    },
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
  })

  // Notificación del navegador por cada compra nueva (una sola vez por pedido)
  useEffect(() => {
    if (permission !== 'granted') return
    for (const o of orders) {
      if (notified.current.has(o.id)) continue
      notified.current.add(o.id)
      new Notification(`Nueva compra ${orderNumber(o.number)}`, {
        body: `Discord: @${o.discord_username ?? '—'} · ${formatPrice(o.total_cents, 'es')}`,
        tag: o.id,
      })
    }
  }, [orders, permission])

  // Contador en la pestaña: "(2) El Botín · Admin"
  useEffect(() => {
    const base = 'El Botín · Admin'
    document.title = orders.length ? `(${orders.length}) ${base}` : base
    return () => { document.title = 'El Botín Express' }
  }, [orders.length])

  const markSeen = () => {
    const latest = orders[0]?.created_at ?? new Date().toISOString()
    try {
      localStorage.setItem(SEEN_KEY, latest)
    } catch {
      // Almacenamiento bloqueado: se marca solo en esta sesión
    }
    setSeenAt(latest)
  }

  const enableNotifications = async () => {
    setPermission(await Notification.requestPermission())
  }

  return (
    <div className="flex flex-col gap-3">
      {canNotify && permission === 'default' && (
        <div className="flex flex-wrap items-center gap-3 rounded-sm border border-carbon-600 px-4 py-2 text-sm text-concrete-300">
          Recibe una notificación del navegador cuando entre una compra.
          <Button size="sm" variant="secondary" onClick={enableNotifications}>Activar avisos</Button>
        </div>
      )}

      {orders.length > 0 && (
        <section role="status" className="flex flex-col gap-3 rounded-sm border border-signal bg-signal/10 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-semibold uppercase">
              🛒 {orders.length === 1 ? 'Nueva compra' : `${orders.length} compras nuevas`}
            </h2>
            <span className="text-sm text-concrete-300">Contacta al cliente por Discord para coordinar la entrega.</span>
            <Button size="sm" variant="secondary" className="ml-auto" onClick={markSeen}>Marcar como visto</Button>
          </div>
          <ul className="flex flex-col gap-2">
            {orders.map((o) => {
              const appt = o.appointments?.[0]
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-sm bg-carbon-900/60 px-3 py-2 text-sm">
                  <span className="font-mono text-concrete-50">{orderNumber(o.number)}</span>
                  {o.discord_username ? (
                    <CopyText text={`@${o.discord_username}`} label="Copiar Discord" className="text-monitor" />
                  ) : (
                    <span className="text-concrete-500">Sin Discord</span>
                  )}
                  <span className="font-mono text-concrete-300">{o.embark_id}</span>
                  <span className="font-mono tabular-nums">{formatPrice(o.total_cents, 'es')}</span>
                  {appt && (
                    <span className="text-concrete-400">
                      Cita: {new Date(appt.slot_start).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  )}
                  {appt && (
                    <Link to={`/cita/${appt.ticket_code}`} className="label ml-auto text-monitor hover:text-concrete-50">
                      Ver ticket
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
