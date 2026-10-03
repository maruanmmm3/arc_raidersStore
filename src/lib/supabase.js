import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

// La clave anon es pública por diseño: lo que protege los datos son las políticas RLS.
export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null

export function publicImageUrl(path) {
  if (!path) return null
  return supabase.storage.from('arc-product-images').getPublicUrl(path).data.publicUrl
}
