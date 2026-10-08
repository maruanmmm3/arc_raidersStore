import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { formatPrice } from '@/lib/money'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Field'
import { ComingSoon, ErrorState, PageLoader } from '@/components/ui/PageLoader'
import { ImageManager } from '@/features/admin/ImageManager'
import {
  ADMIN_KINDS, esName, productErrorMessage, useAdminProduct, useDeleteProduct, useProductOptions, useSaveProduct,
} from '@/features/admin/productsApi'
import {
  RARITY_LABELS, SLOT_LABELS, SLOT_ORDER, STAT_KEYS, STAT_LABELS, WEAPON_TYPE_LABELS, slugify, toFormState, toPayload,
} from '@/features/admin/productForm'

const control =
  'w-full rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-2 text-sm text-concrete-50 placeholder:text-concrete-500 focus:border-monitor focus:outline-none aria-[invalid=true]:border-signal'

function F({ label, error, hint, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium uppercase tracking-wider text-concrete-400">{label}</span>
      {children}
      {error ? <span className="text-xs text-signal-hover">{error}</span> : hint ? <span className="text-xs text-concrete-500">{hint}</span> : null}
    </label>
  )
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-4 rounded-sm bg-carbon-800 p-5">
      <h2 className="font-display text-2xl font-semibold uppercase">{title}</h2>
      {children}
    </section>
  )
}

const one = (rel) => (Array.isArray(rel) ? rel[0] ?? null : rel ?? null)

// "Se verá como US$ 5,00": confirma el importe al cargar precios
function pricePreview(text, fallback) {
  const value = Number(String(text).trim().replace(',', '.'))
  if (!String(text).trim() || !Number.isFinite(value) || value < 0) return fallback
  return `Se verá como ${formatPrice(Math.round(value * 100), 'es')}`
}

function ProductForm({ seg, product, options }) {
  const config = ADMIN_KINDS[seg]
  const navigate = useNavigate()
  const save = useSaveProduct()
  const remove = useDeleteProduct()
  const [f, setF] = useState(() => toFormState(product, config.kind))
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (patch) => {
    setSaved(false)
    setF((prev) => ({ ...prev, ...patch }))
  }
  const setTr = (locale, key, value) => {
    setSaved(false)
    setF((prev) => {
      const next = { ...prev, tr: { ...prev.tr, [locale]: { ...prev.tr[locale], [key]: value } } }
      // El slug sigue al nombre en español hasta que lo editas a mano
      if (locale === 'es' && key === 'name' && !prev.slugTouched) next.slug = slugify(value)
      return next
    })
  }

  const submit = (e) => {
    e.preventDefault()
    const result = toPayload(f)
    if (result.errors) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    save.mutate(
      { id: product?.id, data: result.data },
      {
        onSuccess: (id) => {
          if (product) setSaved(true)
          else navigate(`/admin/${seg}/${id}`, { replace: true, state: { created: true } })
        },
      },
    )
  }

  const mods = options.filter((o) => o.kind === 'mod')
  const unlockable = options.filter((o) => o.kind === 'weapon' || o.kind === 'mod')
  const bundleable = options.filter((o) => o.kind !== 'bundle')
  const priceOf = (id) => options.find((o) => o.id === id)?.price_cents ?? 0
  const bundleValue = f.bundleItems.reduce((s, b) => s + priceOf(b.product_id) * (Number(b.qty) || 1), 0)

  const toggleMod = (id) =>
    set({ compatibleModIds: f.compatibleModIds.includes(id) ? f.compatibleModIds.filter((x) => x !== id) : [...f.compatibleModIds, id] })

  return (
    <form onSubmit={submit} noValidate className="flex max-w-5xl flex-col gap-5">
      <Section title="Textos">
        <div className="grid gap-5 md:grid-cols-2">
          {['es', 'en'].map((l) => (
            <fieldset key={l} className="flex flex-col gap-3">
              <legend className="label mb-2">{l === 'es' ? 'Español' : 'English'}</legend>
              <F label="Nombre" error={l === 'es' ? errors.nameEs : errors.nameEn}>
                <input className={control} value={f.tr[l].name} maxLength={120} aria-invalid={Boolean(l === 'es' ? errors.nameEs : errors.nameEn) || undefined} onChange={(e) => setTr(l, 'name', e.target.value)} />
              </F>
              <F label="Descripción">
                <textarea className={control} rows={4} value={f.tr[l].description} onChange={(e) => setTr(l, 'description', e.target.value)} />
              </F>
              {f.kind === 'mod' && (
                <F label="Efecto" hint="Ej.: Reduce el retroceso vertical.">
                  <input className={control} value={f.tr[l].effect} onChange={(e) => setTr(l, 'effect', e.target.value)} />
                </F>
              )}
            </fieldset>
          ))}
        </div>
      </Section>

      <Section title="Precio, stock y visibilidad">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <F label="Slug (URL)" error={errors.slug} hint={`/producto/${f.slug || '…'}`} className="sm:col-span-2">
            <input className={`${control} font-mono`} value={f.slug} aria-invalid={Boolean(errors.slug) || undefined} onChange={(e) => set({ slug: e.target.value.toLowerCase(), slugTouched: true })} />
          </F>
          <F label="Rareza">
            <select className={control} value={f.rarity} onChange={(e) => set({ rarity: e.target.value })}>
              {Object.entries(RARITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </F>
          <F label="Precio en dólares (USD)" error={errors.price} hint={pricePreview(f.price, 'En dólares: 4.99 = cuatro con noventa y nueve')}>
            <input className={`${control} font-mono`} inputMode="decimal" value={f.price} placeholder="4.99" aria-invalid={Boolean(errors.price) || undefined} onChange={(e) => set({ price: e.target.value })} />
          </F>
          <F label="Precio tachado (USD)" error={errors.compareAt} hint={pricePreview(f.compareAt, 'Opcional, para mostrar descuento')}>
            <input className={`${control} font-mono`} inputMode="decimal" value={f.compareAt} onChange={(e) => set({ compareAt: e.target.value })} />
          </F>
          <F label="Stock" error={errors.stock} hint={product?.reserved ? `Vacío = ilimitado · ${product.reserved} reservadas` : 'Vacío = ilimitado'}>
            <input className={`${control} font-mono`} inputMode="numeric" value={f.stock} onChange={(e) => set({ stock: e.target.value })} />
          </F>
          <F label="Aviso de stock bajo" error={errors.lowStock} hint="Vacío = valor global">
            <input className={`${control} font-mono`} inputMode="numeric" value={f.lowStock} onChange={(e) => set({ lowStock: e.target.value })} />
          </F>
          <F label="Destacado (posición)" error={errors.featuredRank} hint="1 = primero en portada. Vacío = no destacado">
            <input className={`${control} font-mono`} inputMode="numeric" value={f.featuredRank} onChange={(e) => set({ featuredRank: e.target.value })} />
          </F>
        </div>
        <label className="flex items-center gap-2.5 text-sm text-concrete-200">
          <input type="checkbox" checked={f.isVisible} onChange={(e) => set({ isVisible: e.target.checked })} className="size-4 accent-signal" />
          Visible en la tienda
        </label>
      </Section>

      {f.kind === 'weapon' && (
        <Section title="Arma">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <F label="Tipo" error={errors.weaponType}>
              <select className={control} value={f.weapon.weapon_type} aria-invalid={Boolean(errors.weaponType) || undefined} onChange={(e) => set({ weapon: { ...f.weapon, weapon_type: e.target.value } })}>
                <option value="">Elige…</option>
                {Object.entries(WEAPON_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </F>
            <F label="Nivel (tier)">
              <select className={control} value={f.weapon.tier} onChange={(e) => set({ weapon: { ...f.weapon, tier: e.target.value } })}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </F>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {STAT_KEYS.map((k) => (
              <F key={k} label={STAT_LABELS[k]}>
                <input className={`${control} font-mono`} inputMode="numeric" value={f.weapon.stats[k]}
                  onChange={(e) => set({ weapon: { ...f.weapon, stats: { ...f.weapon.stats, [k]: e.target.value.replace(/[^0-9.]/g, '') } } })} />
              </F>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="label">Modificaciones compatibles ({f.compatibleModIds.length})</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SLOT_ORDER.map((slot) => {
                const inSlot = mods.filter((m) => one(m.mod_details)?.slot === slot)
                if (!inSlot.length) return null
                return (
                  <fieldset key={slot} className="flex flex-col gap-1 rounded-sm border border-carbon-600 p-3">
                    <legend className="label px-1">{SLOT_LABELS[slot]}</legend>
                    {inSlot.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-sm text-concrete-200">
                        <input type="checkbox" checked={f.compatibleModIds.includes(m.id)} onChange={() => toggleMod(m.id)} className="accent-signal" />
                        {esName(m)}
                        {!m.is_visible && <span className="text-xs text-concrete-500">(oculto)</span>}
                      </label>
                    ))}
                  </fieldset>
                )
              })}
            </div>
          </div>
        </Section>
      )}

      {f.kind === 'mod' && (
        <Section title="Modificación">
          <F label="Ranura" error={errors.slot} className="max-w-xs">
            <select className={control} value={f.mod.slot} aria-invalid={Boolean(errors.slot) || undefined} onChange={(e) => set({ mod: { slot: e.target.value } })}>
              <option value="">Elige…</option>
              {SLOT_ORDER.map((s) => <option key={s} value={s}>{SLOT_LABELS[s]}</option>)}
            </select>
          </F>
          <p className="text-sm text-concrete-400">Las armas compatibles se marcan desde la ficha de cada arma.</p>
        </Section>
      )}

      {f.kind === 'blueprint' && (
        <Section title="Plano">
          <div className="grid gap-4 sm:grid-cols-2">
            <F label="Desbloquea">
              <select className={control} value={f.blueprint.unlocks_product_id} onChange={(e) => set({ blueprint: { ...f.blueprint, unlocks_product_id: e.target.value } })}>
                <option value="">Nada (solo informativo)</option>
                {unlockable.map((o) => <option key={o.id} value={o.id}>{esName(o)} · {o.kind === 'weapon' ? 'arma' : 'mod'}</option>)}
              </select>
            </F>
            <F label="Nivel (tier)">
              <select className={control} value={f.blueprint.tier} onChange={(e) => set({ blueprint: { ...f.blueprint, tier: e.target.value } })}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </F>
          </div>
        </Section>
      )}

      {f.kind === 'bundle' && (
        <Section title="Contenido del pack">
          <ul className="flex flex-col gap-2">
            {f.bundleItems.map((b, i) => (
              <li key={i} className="flex flex-wrap items-end gap-2">
                <F label={`Producto ${i + 1}`} className="min-w-64 flex-1">
                  <select className={control} value={b.product_id}
                    onChange={(e) => set({ bundleItems: f.bundleItems.map((x, j) => (j === i ? { ...x, product_id: e.target.value } : x)) })}>
                    <option value="">Elige…</option>
                    {bundleable.map((o) => <option key={o.id} value={o.id}>{esName(o)} · {formatPrice(o.price_cents, 'es')}</option>)}
                  </select>
                </F>
                <F label="Cantidad" className="w-24">
                  <input className={`${control} font-mono`} inputMode="numeric" value={b.qty}
                    onChange={(e) => set({ bundleItems: f.bundleItems.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x)) })} />
                </F>
                <Button size="sm" variant="ghost" onClick={() => set({ bundleItems: f.bundleItems.filter((_, j) => j !== i) })}>Quitar</Button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="secondary" className="self-start" onClick={() => set({ bundleItems: [...f.bundleItems, { product_id: '', qty: '1' }] })}>
            Añadir producto
          </Button>
          {errors.bundle && <Alert>{errors.bundle}</Alert>}
          {bundleValue > 0 && (
            <p className="text-sm text-concrete-400">
              Por separado costaría {formatPrice(bundleValue, 'es')}. Pon ese valor como “precio tachado” para mostrar el ahorro.
            </p>
          )}
        </Section>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-carbon-600 bg-carbon-950/95 py-4 backdrop-blur">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Guardando…' : product ? 'Guardar cambios' : `Crear ${config.singular}`}</Button>
        <Link to={`/admin/${seg}`} className="label hover:text-concrete-50">Volver a la lista</Link>
        {saved && <span role="status" className="text-sm text-valve">Guardado.</span>}
        {Object.keys(errors).length > 0 && <span role="alert" className="text-sm text-signal-hover">Revisa los campos marcados.</span>}
        {save.isError && <span role="alert" className="text-sm text-signal-hover">{productErrorMessage(save.error)}</span>}
        {product && (
          <div className="ml-auto flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-sm text-concrete-300">¿Borrar definitivamente?</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>No</Button>
                <Button
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(
                      { id: product.id, imagePaths: product.product_images.map((i) => i.storage_path) },
                      { onSuccess: () => navigate(`/admin/${seg}`, { replace: true }) },
                    )
                  }
                >
                  Sí, borrar
                </Button>
              </>
            ) : (
              <button type="button" className="label hover:text-signal-hover" onClick={() => setConfirmDelete(true)}>Borrar producto</button>
            )}
          </div>
        )}
      </div>
      {remove.isError && <Alert>{productErrorMessage(remove.error)}</Alert>}
    </form>
  )
}

export function ProductFormPage() {
  const { seg, id } = useParams()
  const config = ADMIN_KINDS[seg]
  const isNew = id === 'nuevo'
  const product = useAdminProduct(isNew ? null : id)
  const options = useProductOptions()
  const justCreated = Boolean(useLocation().state?.created)

  if (!config) return <ComingSoon phase="2" />
  if ((!isNew && product.isPending) || options.isPending) return <PageLoader />
  if (product.isError || options.isError) return <ErrorState onRetry={() => { product.refetch(); options.refetch() }} />
  if (!isNew && !product.data) return <p className="text-concrete-400">Este producto no existe. <Link to={`/admin/${seg}`} className="text-monitor">Volver</Link></p>
  if (!isNew && product.data.kind !== config.kind) return <Navigate to="/admin" replace />

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link to={`/admin/${seg}`} className="label hover:text-concrete-50">← {config.title}</Link>
        <h1 className="font-display text-4xl font-extrabold uppercase">
          {isNew ? `Nuevo ${config.singular}` : esName(product.data)}
        </h1>
        {!isNew && product.data.is_visible && (
          <Link to={`/producto/${product.data.slug}`} target="_blank" className="text-sm text-monitor hover:text-concrete-50">Ver en la tienda ↗</Link>
        )}
      </header>

      {justCreated && <Alert tone="success">Producto creado. Ahora puedes añadirle imágenes.</Alert>}

      <ProductForm key={id} seg={seg} product={isNew ? null : product.data} options={options.data.filter((o) => o.id !== id)} />

      {!isNew && (
        <section className="flex max-w-5xl flex-col gap-4 rounded-sm bg-carbon-800 p-5">
          <h2 className="font-display text-2xl font-semibold uppercase">Imágenes</h2>
          <ImageManager productId={product.data.id} images={product.data.product_images} />
        </section>
      )}
      {isNew && <p className="text-sm text-concrete-400">Las imágenes se añaden después de crear el producto.</p>}
    </div>
  )
}
