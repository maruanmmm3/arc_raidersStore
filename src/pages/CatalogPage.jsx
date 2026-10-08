import { NavLink, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ErrorState } from '@/components/ui/PageLoader'
import { FilterBar } from '@/features/catalog/FilterBar'
import { ProductCard } from '@/features/catalog/ProductCard'
import { KIND_BY_SEGMENT, PAGE_SIZE } from '@/features/catalog/api'
import { useCatalogFilters, useProducts } from '@/features/catalog/hooks'
import { useCurrency } from '@/features/currency/CurrencyContext'

const kindTabs = [
  { to: '/tienda', key: 'all', end: true },
  { to: '/tienda/armas', key: 'weapon' },
  { to: '/tienda/planos', key: 'blueprint' },
  { to: '/tienda/mods', key: 'mod' },
  { to: '/tienda/packs', key: 'bundle' },
]

export function CatalogPage() {
  const { categoria } = useParams()
  const kind = categoria ? KIND_BY_SEGMENT[categoria] : null
  const { t } = useTranslation('catalog')
  const { filters, update, clear } = useCatalogFilters(kind)
  const { currency, usdRate } = useCurrency()
  // Los filtros de precio se escriben en la moneda elegida; la BD guarda dólares
  const toBase = (v) => (v != null && currency === 'ARS' ? v / usdRate : v)
  const queryFilters = { ...filters, min: toBase(filters.min), max: toBase(filters.max) }
  const { data, isPending, isError, isPlaceholderData, refetch } = useProducts(queryFilters)

  if (categoria && !kind) return <Navigate to="/tienda" replace />

  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <h1 className="font-display text-5xl font-extrabold uppercase md:text-6xl">{t(`title.${kind ?? 'all'}`)}</h1>
        <nav className="flex flex-wrap gap-2" aria-label={t('filters.kind')}>
          {kindTabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `rounded-sm border px-3 py-1.5 font-mono text-xs uppercase tracking-wider ${isActive ? 'border-concrete-100 bg-concrete-100 text-carbon-900' : 'border-carbon-500 text-concrete-300 hover:border-concrete-400'}`
              }
            >
              {tab.key === 'all' ? t('filters.allKinds') : t(`title.${tab.key}`)}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <FilterBar filters={filters} update={update} clear={clear} />

        <section aria-live="polite" aria-busy={isPending || isPlaceholderData} className="flex flex-col gap-6">
          {isError ? (
            <ErrorState onRetry={refetch} />
          ) : isPending ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="aspect-3/4 animate-pulse rounded-sm bg-carbon-800" />
              ))}
            </div>
          ) : (
            <>
              <p className="label">{t('results', { count: data.count })}</p>
              {data.items.length === 0 ? (
                <p className="py-16 text-center text-concrete-400">{t('empty')}</p>
              ) : (
                <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${isPlaceholderData ? 'opacity-60' : ''}`}>
                  {data.items.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              )}
              {pages > 1 && (
                <nav className="flex items-center justify-center gap-4" aria-label={t('page', { page: filters.page, pages })}>
                  <button
                    type="button"
                    disabled={filters.page <= 1}
                    onClick={() => update({ pagina: filters.page - 1 })}
                    className="label hover:text-concrete-50 disabled:opacity-40"
                  >
                    {t('prev')}
                  </button>
                  <span className="font-mono text-sm tabular-nums text-concrete-300">{t('page', { page: filters.page, pages })}</span>
                  <button
                    type="button"
                    disabled={filters.page >= pages}
                    onClick={() => update({ pagina: filters.page + 1 })}
                    className="label hover:text-concrete-50 disabled:opacity-40"
                  >
                    {t('next')}
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
