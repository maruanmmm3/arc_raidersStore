import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Error con el código que devuelve la Edge Function ("slot_taken", "out_of_stock"…)
export class OrderError extends Error {
  constructor(code, detail) {
    super(code)
    this.code = code
    this.detail = detail
  }
}

export async function createOrder(payload) {
  const { data, error } = await supabase.functions.invoke('create-order', { body: payload })
  if (error) {
    let body = null
    try {
      body = await error.context?.json()
    } catch {
      // Respuesta sin JSON (red caída, función no desplegada…)
    }
    throw new OrderError(body?.error ?? 'generic', body?.detail)
  }
  return data
}

export function useAvailableSlots(days = 14) {
  return useQuery({
    queryKey: ['slots', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('arc_get_available_slots', { p_days: days })
      if (error) throw error
      return data
    },
    staleTime: 30_000,
    refetchInterval: 60_000, // los huecos cambian cuando otros reservan
  })
}

export function useTicket(code) {
  return useQuery({
    queryKey: ['ticket', code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('arc_get_ticket', { p_code: code })
      if (error) throw error
      return data
    },
    refetchInterval: 30_000, // el estado cambia cuando el admin hace check-in o entrega
  })
}

export function useMyOrders() {
  return useQuery({
    queryKey: ['my-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ARC_orders')
        .select(`
          id, number, status, payment_status, total_cents, created_at, buyer_confirmed_at,
          items:ARC_order_items ( id, parent_item_id, names, qty ),
          appointments:ARC_appointments ( ticket_code, slot_start, slot_end, status, created_at )
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useMyAppointments() {
  return useQuery({
    queryKey: ['my-appointments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ARC_appointments')
        .select('ticket_code, slot_start, slot_end, status, order:ARC_orders ( number, status, payment_status )')
        .order('slot_start', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useCancelMyOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (orderId) => {
      const { error } = await supabase.rpc('arc_cancel_my_order', { p_order_id: orderId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket'] })
      queryClient.invalidateQueries({ queryKey: ['my-orders'] })
      queryClient.invalidateQueries({ queryKey: ['my-appointments'] })
      queryClient.invalidateQueries({ queryKey: ['slots'] })
    },
  })
}

// El comprador da conformidad de que ha recibido el pedido (solo tras "delivered")
export function useConfirmDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (orderId) => {
      const { error } = await supabase.rpc('arc_confirm_delivery', { p_order_id: orderId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket'] })
      queryClient.invalidateQueries({ queryKey: ['my-orders'] })
    },
  })
}

// Mods que cuelgan de su arma: [{ ...item, mods: [...] }]
export function nestItems(items) {
  const roots = items.filter((i) => !i.parent_item_id)
  return roots.map((root) => ({ ...root, mods: items.filter((i) => i.parent_item_id === root.id) }))
}

export function itemName(item, lang) {
  return item.names?.[lang] ?? item.names?.es ?? Object.values(item.names ?? {})[0] ?? ''
}
