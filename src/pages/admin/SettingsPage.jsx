import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Field'
import { ErrorState, PageLoader } from '@/components/ui/PageLoader'

// Ajustes de texto que ve el comprador. Se guardan en ARC_settings (jsonb)
const GROUPS = [
  {
    title: 'Datos de pago',
    hint: 'Aparecen en el paso 2 de cada pedido. Deja vacío lo que no uses.',
    fields: [
      { key: 'payment_holder', label: 'Titular de la cuenta', placeholder: 'Nombre y apellido' },
      { key: 'payment_bank', label: 'Banco o billetera', placeholder: 'Mercado Pago' },
      { key: 'payment_cbu', label: 'CBU / CVU', placeholder: '22 dígitos', pattern: /^\d{22}$/, error: 'El CBU/CVU tiene 22 dígitos.' },
      { key: 'payment_alias', label: 'Alias', placeholder: 'botin.express.mp', pattern: /^[A-Za-z0-9.-]{6,20}$/, error: 'Entre 6 y 20 caracteres: letras, números, "." o "-".' },
    ],
  },
  {
    title: 'Tipo de cambio y PayPal',
    hint: 'Los precios se cargan en dólares. Con el tipo de cambio, la tienda muestra el selector USD/ARS y acepta pagos en pesos por transferencia (con el CBU o alias de arriba). Con el email de PayPal, acepta pagos en dólares.',
    fields: [
      { key: 'usd_rate', label: 'Tipo de cambio (pesos por 1 USD)', placeholder: '1000', pattern: /^\d+([.,]\d{1,4})?$/, error: 'Escribe un número, por ejemplo 1000 o 1250,50.', numeric: true },
      { key: 'paypal_email', label: 'Email de PayPal', placeholder: 'pagos@…', pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, error: 'Escribe un email válido.' },
    ],
  },
  {
    title: 'Discord',
    hint: 'Paso 3 del pedido y páginas de contacto.',
    fields: [
      { key: 'discord_invite_url', label: 'Enlace de invitación', placeholder: 'https://discord.gg/…', pattern: /^https:\/\/(discord\.gg|discord\.com\/invite)\//, error: 'Debe empezar por https://discord.gg/ o https://discord.com/invite/' },
      { key: 'discord_delivery_channel', label: 'Canal de entregas', placeholder: '#entregas' },
    ],
  },
  {
    title: 'Contacto',
    fields: [
      { key: 'contact_email', label: 'Email de contacto', placeholder: 'soporte@…', pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, error: 'Escribe un email válido.' },
    ],
  },
]

const KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.key))

function SettingsForm({ initial }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(initial)
  const [saved, setSaved] = useState(false)
  const fields = GROUPS.flatMap((g) => g.fields)
  const invalid = fields.filter((f) => f.pattern && form[f.key] && !f.pattern.test(form[f.key].trim()))

  const save = useMutation({
    mutationFn: async () => {
      const changed = KEYS.filter((k) => (form[k] ?? '').trim() !== (initial[k] ?? ''))
      for (const key of changed) {
        const field = GROUPS.flatMap((g) => g.fields).find((f) => f.key === key)
        const value = field?.numeric ? form[key].trim().replace(',', '.') : form[key].trim()
        const { error } = await supabase.from('ARC_settings').update({ value }).eq('key', key)
        if (error) throw error
      }
    },
    onSuccess: () => {
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
      queryClient.invalidateQueries({ queryKey: ['settings', 'public'] })
      queryClient.invalidateQueries({ queryKey: ['order-public'] })
    },
  })

  return (
    <form
      className="flex max-w-2xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        setSaved(false)
        if (!invalid.length) save.mutate()
      }}
    >
      {GROUPS.map((g) => (
        <section key={g.title} className="flex flex-col gap-4 rounded-sm bg-carbon-800 p-5">
          <div>
            <h2 className="font-display text-2xl font-semibold uppercase">{g.title}</h2>
            {g.hint && <p className="text-sm text-concrete-400">{g.hint}</p>}
          </div>
          {g.fields.map((f) => {
            const bad = invalid.includes(f)
            return (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wider text-concrete-400">{f.label}</span>
                <input
                  value={form[f.key] ?? ''}
                  placeholder={f.placeholder}
                  aria-invalid={bad || undefined}
                  onChange={(e) => {
                    setSaved(false)
                    setForm({ ...form, [f.key]: e.target.value })
                  }}
                  className="rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-2 font-mono text-sm text-concrete-50 placeholder:text-concrete-500 focus:border-monitor focus:outline-none aria-[invalid=true]:border-signal"
                />
                {bad && <span className="text-xs text-signal-hover">{f.error}</span>}
              </label>
            )
          })}
        </section>
      ))}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={save.isPending || invalid.length > 0}>Guardar ajustes</Button>
        {saved && <span role="status" className="text-sm text-valve">Guardado.</span>}
      </div>
      {save.isError && <Alert>No se han podido guardar los ajustes.</Alert>}
    </form>
  )
}

export function SettingsPage() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ARC_settings').select('key, value').in('key', KEYS)
      if (error) throw error
      return Object.fromEntries(KEYS.map((k) => [k, String(data.find((r) => r.key === k)?.value ?? '')]))
    },
  })

  if (isPending) return <PageLoader />
  if (isError) return <ErrorState onRetry={refetch} />
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-4xl font-extrabold uppercase">Ajustes</h1>
      <SettingsForm initial={data} />
    </div>
  )
}
