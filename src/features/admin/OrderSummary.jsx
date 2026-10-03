import { useTranslation } from 'react-i18next'
import { formatMoney } from '@/lib/money'
import { orderNumber } from '@/lib/dates'
import { CopyText } from '@/components/ui/CopyText'
import { itemName, nestItems } from '@/features/orders/api'

const LANG = 'es' // el admin está en español por ahora

// Datos de un pedido para el staff: cliente, productos y pago
export function OrderSummary({ order }) {
  const { t } = useTranslation(['orders', 'account'])
  return (
    <div className="grid gap-3 text-sm md:grid-cols-3">
      <div className="flex flex-col gap-0.5">
        <p className="label">Cliente</p>
        {order.discord_username ? (
          <CopyText text={`@${order.discord_username}`} label="Copiar" className="text-monitor" />
        ) : (
          <span className="text-concrete-500">Sin Discord</span>
        )}
        {order.guest_email && <CopyText text={order.guest_email} label="Copiar" className="text-concrete-300" />}
        <span className="text-concrete-400">{order.buyer?.username ? `Cuenta: ${order.buyer.username}` : 'Sin cuenta'}</span>
        <span className="font-mono text-concrete-50">{order.embark_id}</span>
        {order.platform && <span className="text-concrete-400">{t(`account:platform.${order.platform}`)}</span>}
      </div>
      <div>
        <p className="label">{orderNumber(order.number)}{order.public_code ? ` · ${order.public_code}` : ''}</p>
        <ul>
          {nestItems(order.items ?? []).map((i) => (
            <li key={i.id} className="text-concrete-100">
              {i.qty > 1 && `${i.qty} × `}{itemName(i, LANG)}
              {i.mods.length > 0 && <span className="text-concrete-400"> + {i.mods.map((m) => itemName(m, LANG)).join(', ')}</span>}
            </li>
          ))}
        </ul>
        {order.availability_note && <p className="mt-1 italic text-concrete-400">“{order.availability_note}”</p>}
      </div>
      <div>
        <p className="label">Pago</p>
        <p className="font-mono text-concrete-50">{formatMoney(order.total_cents, order.currency, LANG)}</p>
        <p className="text-concrete-400">
          {t(`paymentStatus.${order.payment_status}`)}{order.payment_reference ? ` · ${order.payment_reference}` : ''}
        </p>
        <p className="text-concrete-400">Pedido: {t(`orderStatus.${order.status}`)}</p>
        {order.status === 'delivered' && (
          order.buyer_confirmed_at
            ? <p className="text-valve">Cliente conforme · {new Date(order.buyer_confirmed_at).toLocaleString(LANG)}</p>
            : <p className="text-ember">Pendiente de conformidad del cliente</p>
        )}
      </div>
    </div>
  )
}
