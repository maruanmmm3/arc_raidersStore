import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const BUCKET = 'arc-product-images'
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

// Segmentos de URL del admin ↔ tipo de producto
export const ADMIN_KINDS = {
  armas: { kind: 'weapon', title: 'Armas', singular: 'arma' },
  planos: { kind: 'blueprint', title: 'Planos', singular: 'plano' },
  mods: { kind: 'mod', title: 'Modificaciones', singular: 'mod' },
  packs: { kind: 'bundle', title: 'Packs', singular: 'pack' },
}

const PRODUCT_ERRORS = {
  ARC_TRANSLATIONS_REQUIRED: 'El nombre es obligatorio en español y en inglés.',
  ARC_KIND_IMMUTABLE: 'No se puede cambiar el tipo de un producto existente.',
  ARC_FORBIDDEN: 'Tu cuenta no tiene permisos de admin.',
  ARC_NOT_FOUND: 'El producto ya no existe.',
  arc_products_reserved_le_stock: 'El stock no puede ser menor que las unidades reservadas en pedidos abiertos.',
}

export function productErrorMessage(error) {
  if (!error) return null
  const key = Object.keys(PRODUCT_ERRORS).find((k) => error.message?.includes(k))
  if (key) return PRODUCT_ERRORS[key]
  if (error.code === '23505') return 'Ya existe un producto con ese slug.'
  if (error.code === '23503') return 'No se puede borrar: está en pedidos o en un pack. Ocúltalo en su lugar.'
  if (error.code === '23514') return 'Algún valor no es válido (slug, precios, stock o nivel). Revisa el formulario.'
  if (error.code === '23502') return 'Falta un campo obligatorio (tipo de arma, ranura…).'
  return 'No se ha podido guardar. Inténtalo de nuevo.'
}

async function run(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

export function esName(p) {
  const tr = p.product_translations ?? []
  return (tr.find((t) => t.locale === 'es') ?? tr[0])?.name ?? p.slug
}

export function useAdminProducts(kind) {
  return useQuery({
    queryKey: ['admin', 'products', kind],
    enabled: Boolean(kind),
    queryFn: () =>
      run(
        supabase
          .from('ARC_products')
          .select(`
            id, slug, kind, rarity, price_cents, stock, reserved, is_visible, featured_rank, updated_at,
            product_translations:ARC_product_translations ( locale, name ),
            product_images:ARC_product_images ( storage_path, sort )
          `)
          .eq('kind', kind)
          .order('updated_at', { ascending: false }),
      ),
  })
}

export function useAdminProduct(id) {
  return useQuery({
    queryKey: ['admin', 'product', id],
    enabled: Boolean(id),
    queryFn: () =>
      run(
        supabase
          .from('ARC_products')
          .select(`
            *,
            product_translations:ARC_product_translations ( locale, name, description, effect ),
            weapon_details:ARC_weapon_details ( weapon_type, tier, stats ),
            mod_details:ARC_mod_details ( slot ),
            blueprint_details:ARC_blueprint_details!arc_blueprint_product_fk ( tier, unlocks_product_id ),
            compat:ARC_weapon_mod_compat!arc_compat_weapon_fk ( mod_id ),
            bundle_items:ARC_bundle_items!arc_bundle_items_bundle_fk ( product_id, qty ),
            product_images:ARC_product_images ( id, storage_path, alt, sort )
          `)
          .eq('id', id)
          .maybeSingle(),
      ),
  })
}

// Lista ligera de todos los productos para selectores (mods compatibles, qué desbloquea, contenido de packs)
export function useProductOptions() {
  return useQuery({
    queryKey: ['admin', 'product-options'],
    queryFn: () =>
      run(
        supabase
          .from('ARC_products')
          .select(`
            id, slug, kind, rarity, price_cents, is_visible,
            product_translations:ARC_product_translations ( locale, name ),
            mod_details:ARC_mod_details ( slot )
          `)
          .order('slug'),
      ),
    staleTime: 60_000,
  })
}

function invalidateCatalog(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
  queryClient.invalidateQueries({ queryKey: ['admin', 'product'] })
  queryClient.invalidateQueries({ queryKey: ['admin', 'product-options'] })
  queryClient.invalidateQueries({ queryKey: ['products'] })
  queryClient.invalidateQueries({ queryKey: ['product'] })
  queryClient.invalidateQueries({ queryKey: ['compatible-mods'] })
}

export function useSaveProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => run(supabase.rpc('arc_admin_save_product', { p_id: id ?? null, p_data: data })),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useToggleVisible() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, is_visible }) => run(supabase.from('ARC_products').update({ is_visible }).eq('id', id)),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, imagePaths }) => {
      // Primero la fila: si tiene pedidos, falla y las imágenes siguen intactas
      await run(supabase.from('ARC_products').delete().eq('id', id))
      if (imagePaths.length) await supabase.storage.from(BUCKET).remove(imagePaths)
    },
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

// --- Imágenes ------------------------------------------------------------

export function useUploadImage(productId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, alt, sort }) => {
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type]
      const path = `${productId}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      try {
        await run(supabase.from('ARC_product_images').insert({ product_id: productId, storage_path: path, alt: alt || null, sort }))
      } catch (err) {
        await supabase.storage.from(BUCKET).remove([path]) // no dejar archivos huérfanos
        throw err
      }
    },
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useImageActions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ op, image, values }) => {
      if (op === 'update') return run(supabase.from('ARC_product_images').update(values).eq('id', image.id))
      if (op === 'delete') {
        await run(supabase.from('ARC_product_images').delete().eq('id', image.id))
        await supabase.storage.from(BUCKET).remove([image.storage_path])
      }
    },
    onSuccess: () => invalidateCatalog(queryClient),
  })
}
