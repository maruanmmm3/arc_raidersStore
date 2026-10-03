import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatPrice } from '@/lib/money'
import { ButtonLink } from '@/components/ui/Button'
import { RarityBadge } from '@/components/ui/RarityBadge'
import { ComingSoon, ErrorState, PageLoader } from '@/components/ui/PageLoader'
import { ProductImage } from '@/features/catalog/ProductImage'
import { firstImage } from '@/features/catalog/api'
import { ADMIN_KINDS, esName, useAdminProducts, useToggleVisible } from '@/features/admin/productsApi'

export function ProductsListPage() {
  const { seg } = useParams()
  const config = ADMIN_KINDS[seg]
  const { data, isPending, isError, refetch } = useAdminProducts(config?.kind)
  const toggle = useToggleVisible()
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState('all')

  // Secciones del menú que aún no existen (pedidos, ventas, usuarios…)
  if (!config) return <ComingSoon phase="2" />

  const q = search.trim().toLowerCase()
  const rows = (data ?? []).filter((p) => {
    if (visibility === 'visible' && !p.is_visible) return false
    if (visibility === 'hidden' && p.is_visible) return false
    if (!q) return true
    return p.slug.includes(q) || p.product_translations.some((t) => t.name.toLowerCase().includes(q))
  })

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="font-display text-4xl font-extrabold uppercase">{config.title}</h1>
        <ButtonLink to={`/admin/${seg}/nuevo`} size="sm" className="ml-auto">Nuevo {config.singular}</ButtonLink>
      </header>

      <div className="flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="products-search">Buscar</label>
        <input
          id="products-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o slug"
          className="min-w-64 flex-1 rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-1.5 text-sm text-concrete-50 focus:border-monitor focus:outline-none"
        />
        <label className="sr-only" htmlFor="products-visibility">Visibilidad</label>
        <select
          id="products-visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          className="rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-1.5 text-sm text-concrete-50"
        >
          <option value="all">Todos</option>
          <option value="visible">Visibles</option>
          <option value="hidden">Ocultos</option>
        </select>
      </div>

      {isPending ? (
        <PageLoader />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : rows.length === 0 ? (
        <p className="text-concrete-400">No hay productos con estos filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-carbon-600">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-carbon-800 text-left">
              <tr className="font-mono text-xs uppercase tracking-wider text-concrete-400">
                <th className="w-16 px-3 py-2"><span className="sr-only">Imagen</span></th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Rareza</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="px-3 py-2">Visible</th>
                <th className="px-3 py-2"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-carbon-600 hover:bg-carbon-850">
                  <td className="px-3 py-2">
                    <div className="flex size-12 items-center justify-center rounded-sm bg-carbon-800">
                      <ProductImage image={firstImage(p)} kind={p.kind} alt="" />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Link to={`/admin/${seg}/${p.id}`} className="font-medium text-concrete-50 hover:text-monitor">{esName(p)}</Link>
                    <span className="block font-mono text-xs text-concrete-500">
                      {p.slug}{p.featured_rank != null ? ` · destacado #${p.featured_rank}` : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2"><RarityBadge rarity={p.rarity} /></td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{formatPrice(p.price_cents, 'es')}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {p.stock == null ? '∞' : p.stock - p.reserved}
                    {p.reserved > 0 && <span className="block text-xs text-concrete-500">{p.reserved} reservadas</span>}
                  </td>
                  <td className="px-3 py-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={p.is_visible}
                        disabled={toggle.isPending}
                        onChange={(e) => toggle.mutate({ id: p.id, is_visible: e.target.checked })}
                        className="size-4 accent-signal"
                      />
                      <span className="sr-only">Visible en la tienda</span>
                    </label>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link to={`/admin/${seg}/${p.id}`} className="label hover:text-concrete-50">Editar</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
