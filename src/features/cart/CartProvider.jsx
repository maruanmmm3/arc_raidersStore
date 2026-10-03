import { useCallback, useEffect, useMemo, useState } from 'react'
import { CartContext } from './CartContext'

const STORAGE_KEY = 'speranza-cart-v1'
const MAX_QTY = 10

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Misma arma con distintos mods = líneas distintas
function lineKey(productId, mods) {
  return [productId, ...mods.map((m) => m.id).sort()].join('|')
}

// Los precios del carrito son solo orientativos para la UI. El servidor
// (Edge Function create-order) recalcula todo desde la base de datos.
export function CartProvider({ children }) {
  const [lines, setLines] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      // Navegación privada o almacenamiento lleno: el carrito sigue en memoria
    }
  }, [lines])

  const add = useCallback((product, mods = [], qty = 1) => {
    const key = lineKey(product.id, mods)
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key)
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l))
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          slug: product.slug,
          kind: product.kind,
          rarity: product.rarity,
          translations: product.product_translations.map(({ locale, name }) => ({ locale, name })),
          priceCents: product.price_cents,
          qty: Math.min(MAX_QTY, qty),
          mods: mods.map((m) => ({
            id: m.id,
            translations: m.product_translations.map(({ locale, name }) => ({ locale, name })),
            priceCents: m.price_cents,
          })),
        },
      ]
    })
  }, [])

  const setQty = useCallback((key, qty) => {
    setLines((prev) =>
      qty <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, qty) } : l)),
    )
  }, [])

  const remove = useCallback((key) => setLines((prev) => prev.filter((l) => l.key !== key)), [])
  const clear = useCallback(() => setLines([]), [])

  const value = useMemo(() => {
    const count = lines.reduce((n, l) => n + l.qty, 0)
    const subtotalCents = lines.reduce(
      (sum, l) => sum + l.qty * (l.priceCents + l.mods.reduce((s, m) => s + m.priceCents, 0)),
      0,
    )
    return { lines, count, subtotalCents, add, setQty, remove, clear, maxQty: MAX_QTY }
  }, [lines, add, setQty, remove, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
