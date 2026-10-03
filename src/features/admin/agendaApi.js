import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Mensajes para los errores que lanzan las funciones SQL de admin
const ADMIN_ERRORS = {
  ARC_NOTE_REQUIRED: 'Escribe una nota para cancelar.',
  ARC_UNPAID_NEEDS_NOTE: 'El pedido no está pagado: explica en la nota por qué se entrega igualmente.',
  ARC_REFERENCE_REQUIRED: 'Indica la referencia del pago (operación, captura, etc.).',
  ARC_INVALID_TRANSITION: 'Ese cambio no es posible desde el estado actual. Recarga la agenda.',
  ARC_FORBIDDEN: 'Tu cuenta no tiene permisos de admin.',
  ARC_NOT_FOUND: 'No se ha encontrado el pedido.',
}

export function adminErrorMessage(error) {
  const key = Object.keys(ADMIN_ERRORS).find((k) => error?.message?.includes(k))
  return key ? ADMIN_ERRORS[key] : 'No se ha podido guardar. Inténtalo de nuevo.'
}

async function run(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

export function useAgenda(fromIso, toIso) {
  return useQuery({
    queryKey: ['admin', 'agenda', fromIso, toIso],
    queryFn: () =>
      run(
        supabase
          .from('ARC_appointments')
          .select(`
            id, ticket_code, slot_start, slot_end, status,
            room:ARC_discord_rooms ( name ),
            admin:ARC_profiles!arc_appointments_admin_fk ( username, discord_username ),
            order:ARC_orders!arc_appointments_order_fk (
              id, number, status, payment_status, total_cents, embark_id, platform, region,
              availability_note, discord_username, payment_reference, buyer_confirmed_at, guest_email, public_code, currency,
              buyer:ARC_profiles!arc_orders_user_fk ( username, discord_username ),
              items:ARC_order_items ( id, parent_item_id, names, qty )
            )
          `)
          .gte('slot_start', fromIso)
          .lt('slot_start', toIso)
          .order('slot_start', { ascending: true }),
      ),
    refetchInterval: 30_000,
  })
}

export function useAgendaAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ action, orderId, value, text }) => {
      if (action === 'status') {
        return run(supabase.rpc('arc_admin_set_order_status', { p_order_id: orderId, p_status: value, p_note: text || null }))
      }
      if (action === 'no_show') {
        return run(supabase.rpc('arc_admin_mark_no_show', { p_order_id: orderId, p_note: text || null }))
      }
      if (action === 'paid') {
        return run(supabase.rpc('arc_admin_mark_paid', { p_order_id: orderId, p_status: value, p_reference: text || null }))
      }
      throw new Error('acción desconocida')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'agenda'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
    },
  })
}

// --- Pedidos (con o sin cita) ---------------------------------------------

export function useAdminOrders() {
  return useQuery({
    queryKey: ['admin', 'orders'],
    queryFn: async () => {
      // Cancela los pedidos sin pagar con más de 48 h antes de listar (libera su stock)
      await supabase.rpc('arc_expire_unpaid_orders')
      return run(
        supabase
          .from('ARC_orders')
          .select(`
            id, number, public_code, status, payment_status, total_cents, currency, base_total_cents, payment_method, embark_id, platform,
            availability_note, discord_username, guest_email, payment_reference, buyer_confirmed_at, created_at,
            buyer:ARC_profiles!arc_orders_user_fk ( username ),
            items:ARC_order_items ( id, parent_item_id, names, qty ),
            appointments:ARC_appointments ( id, status, slot_start )
          `)
          .order('created_at', { ascending: false })
          .limit(300),
      )
    },
    refetchInterval: 30_000,
  })
}

// --- Salas ---------------------------------------------------------------

export function useRooms() {
  return useQuery({
    queryKey: ['admin', 'rooms'],
    queryFn: () => run(supabase.from('ARC_discord_rooms').select('*').order('sort').order('name')),
  })
}

export function useSaveRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...values }) =>
      run(id ? supabase.from('ARC_discord_rooms').update(values).eq('id', id) : supabase.from('ARC_discord_rooms').insert(values)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'rooms'] }),
  })
}

// --- Disponibilidad ------------------------------------------------------

export function useStaff() {
  return useQuery({
    queryKey: ['admin', 'staff'],
    queryFn: () =>
      run(supabase.from('ARC_profiles').select('id, username, discord_username').eq('role', 'admin').order('username')),
  })
}

export function useRules() {
  return useQuery({
    queryKey: ['admin', 'rules'],
    queryFn: () =>
      run(
        supabase
          .from('ARC_availability_rules')
          .select('*, admin:ARC_profiles!arc_rules_admin_fk ( username )')
          .order('weekday')
          .order('start_time'),
      ),
  })
}

export function useExceptions() {
  return useQuery({
    queryKey: ['admin', 'exceptions'],
    queryFn: () =>
      run(
        supabase
          .from('ARC_availability_exceptions')
          .select('*, admin:ARC_profiles!arc_exceptions_admin_fk ( username )')
          .gte('ends_at', new Date().toISOString())
          .order('starts_at'),
      ),
  })
}

// Inserta, actualiza o borra en una tabla de la agenda y refresca su lista
export function useAgendaTable(table, key) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ op, id, values }) => {
      const q = supabase.from(table)
      if (op === 'insert') return run(q.insert(values))
      if (op === 'update') return run(q.update(values).eq('id', id))
      if (op === 'delete') return run(q.delete().eq('id', id))
      throw new Error('operación desconocida')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', key] })
      queryClient.invalidateQueries({ queryKey: ['slots'] })
    },
  })
}
