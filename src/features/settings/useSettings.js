import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Configuración pública (enlace de Discord, zona horaria, pago online…) como { clave: valor }
export function usePublicSettings() {
  return useQuery({
    queryKey: ['settings', 'public'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ARC_settings').select('key, value').eq('is_public', true)
      if (error) throw error
      return Object.fromEntries(data.map((row) => [row.key, row.value]))
    },
    staleTime: 5 * 60_000,
  })
}
