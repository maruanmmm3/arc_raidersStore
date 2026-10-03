import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { RARITIES, SORTS, WEAPON_TYPES, fetchCompatibleMods, fetchFeatured, fetchProductBySlug, fetchProducts } from './api'

function toNumber(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// Los filtros viven en la URL: se pueden compartir, recargar y usar con atrás/adelante
export function useCatalogFilters(kind) {
  const [params, setParams] = useSearchParams()

  const filters = useMemo(() => {
    const rarities = (params.get('rareza') ?? '').split(',').filter((r) => RARITIES.includes(r))
    const type = params.get('tipo')
    const sort = params.get('orden')
    return {
      kind,
      // Sin trim aquí para no borrar el espacio mientras se escribe; api.js lo recorta
      q: params.get('q') ?? '',
      rarities,
      type: kind === 'weapon' && WEAPON_TYPES.includes(type) ? type : null,
      min: toNumber(params.get('min')),
      max: toNumber(params.get('max')),
      sort: SORTS.includes(sort) ? sort : 'featured',
      page: Math.max(1, Number.parseInt(params.get('pagina') ?? '1', 10) || 1),
    }
  }, [params, kind])

  const update = useCallback(
    (changes) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(changes)) {
            if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) next.delete(key)
            else next.set(key, Array.isArray(value) ? value.join(',') : String(value))
          }
          // Cualquier cambio de filtro vuelve a la primera página
          if (!('pagina' in changes)) next.delete('pagina')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const clear = useCallback(() => setParams({}, { replace: true }), [setParams])

  return { filters, update, clear }
}

export function useProducts(filters) {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: () => fetchProducts(filters),
    placeholderData: keepPreviousData,
  })
}

export function useFeatured() {
  return useQuery({ queryKey: ['products', 'featured'], queryFn: fetchFeatured })
}

export function useProduct(slug) {
  return useQuery({ queryKey: ['product', slug], queryFn: () => fetchProductBySlug(slug) })
}

export function useCompatibleMods(weaponId) {
  return useQuery({
    queryKey: ['compatible-mods', weaponId],
    queryFn: () => fetchCompatibleMods(weaponId),
    enabled: Boolean(weaponId),
  })
}
