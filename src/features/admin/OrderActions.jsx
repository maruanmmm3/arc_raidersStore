import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Field'
import { adminErrorMessage, useAgendaAction } from './agendaApi'

// Acciones posibles según el estado del pedido. needsText: nota o referencia obligatoria
function actionsFor(order, { hasAppointment }) {
  const list = []
  const unpaid = ['unpaid', 'awaiting'].includes(order.payment_status)
  if (unpaid && order.status !== 'cancelled') {
    list.push({ id: 'paid', label: 'Registrar pago', action: 'paid', value: 'paid_manual', needsText: true, placeholder: 'Referencia del comprobante (nº de operación)' })
    list.push({ id: 'free', label: 'Sin coste', action: 'paid', value: 'not_required', needsText: false, placeholder: 'Nota opcional' })
  }
  if (['requested', 'scheduled'].includes(order.status)) {
    list.push({ id: 'start', label: 'Iniciar entrega', action: 'status', value: 'delivering', primary: !unpaid })
  }
  if (order.status === 'scheduled' && hasAppointment) {
    list.push({ id: 'noshow', label: 'No se presentó', action: 'no_show', needsText: false, placeholder: 'Nota opcional' })
  }
  if (order.status === 'delivering') {
    list.push({ id: 'done', label: 'Entregado', action: 'status', value: 'delivered', primary: true, needsText: unpaid, placeholder: unpaid ? 'Sin pago registrado: explica por qué' : 'Nota opcional' })
    list.push({
      id: 'retry', label: 'Falló, reintentar', action: 'status', value: hasAppointment ? 'scheduled' : 'requested',
      needsText: false, placeholder: 'Qué pasó (opcional)',
    })
  }
  if (['requested', 'scheduled', 'delivering'].includes(order.status)) {
    list.push({ id: 'cancel', label: 'Cancelar pedido', action: 'status', value: 'cancelled', needsText: true, placeholder: 'Motivo de la cancelación' })
  }
  return list
}

export function OrderActions({ order, hasAppointment = false, idKey }) {
  const mutation = useAgendaAction()
  const [pending, setPending] = useState(null) // acción que espera texto
  const [text, setText] = useState('')
  const actions = actionsFor(order, { hasAppointment })
  if (!actions.length) return null

  const execute = (a, value = '') => {
    mutation.mutate(
      { action: a.action, orderId: order.id, value: a.value, text: value.trim() },
      { onSuccess: () => { setPending(null); setText('') } },
    )
  }

  const onClick = (a) => {
    mutation.reset()
    if (a.placeholder) {
      setPending(a)
      setText('')
    } else {
      execute(a)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {pending ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            execute(pending, text)
          }}
        >
          <label className="sr-only" htmlFor={`note-${idKey}`}>{pending.placeholder}</label>
          <input
            id={`note-${idKey}`}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={pending.placeholder}
            required={pending.needsText}
            maxLength={300}
            className="flex-1 rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-2 text-sm text-concrete-50 focus:border-monitor focus:outline-none"
          />
          <Button type="submit" size="sm" disabled={mutation.isPending || (pending.needsText && !text.trim())}>
            {pending.label}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Volver</Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.id} size="sm" variant={a.primary ? 'primary' : 'secondary'} disabled={mutation.isPending} onClick={() => onClick(a)}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
      {mutation.isError && <Alert>{adminErrorMessage(mutation.error)}</Alert>}
    </div>
  )
}
