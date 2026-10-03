import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const ROLE_ERRORS = {
  ARC_ADMIN_LIMIT: 'Ya está el máximo de admins. Quita el rol a otro antes de darlo.',
  ARC_CANNOT_CHANGE_SELF: 'No puedes cambiar tu propio rol.',
  ARC_FORBIDDEN: 'Solo el admin principal puede cambiar roles.',
  ARC_NOT_FOUND: 'No se ha encontrado el usuario.',
}

export function roleErrorMessage(error) {
  const key = Object.keys(ROLE_ERRORS).find((k) => error?.message?.includes(k))
  return key ? ROLE_ERRORS[key] : 'No se ha podido cambiar el rol. Inténtalo de nuevo.'
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('arc_admin_list_users')
      if (error) throw error
      return data
    },
  })
}

export function useSetRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, role }) => {
      const { error } = await supabase.rpc('arc_owner_set_role', { p_user_id: userId, p_role: role })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] })
      queryClient.invalidateQueries({ queryKey: ['slots'] })
    },
  })
}
