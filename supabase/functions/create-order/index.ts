// Crea un pedido (con o sin cuenta) y avisa al staff en Discord.
// El navegador solo envía IDs, cantidades, mods elegidos y datos del comprador: el precio y el
// stock se validan y calculan en la función SQL arc_create_guest_order.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'
import { corsHeaders, json } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DISCORD_WEBHOOK_URL = Deno.env.get('ARC_DISCORD_WEBHOOK_URL')

const PLATFORMS = { pc_steam: 'PC (Steam)', pc_epic: 'PC (Epic)', ps5: 'PS5', xbox: 'Xbox' } as const

const Body = z.object({
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        qty: z.int().min(1).max(10),
        modIds: z.array(z.uuid()).max(7).default([]),
      }),
    )
    .min(1)
    .max(20),
  email: z.email().max(254),
  discordUsername: z.string().trim().min(2).max(33),
  embarkId: z.string().trim().regex(/^[^#\s]{2,32}#[0-9]{3,6}$/),
  platform: z.enum(['pc_steam', 'pc_epic', 'ps5', 'xbox']).optional(),
  note: z.string().trim().max(500).optional(),
  saveToProfile: z.boolean().optional(),
  currency: z.enum(['USD', 'ARS']).default('USD'),
})

// Errores de la función SQL → código que la web sabe traducir
function mapError(message: string, code?: string): { status: number; code: string } {
  if (code === '23514') return { status: 400, code: 'invalid_order' } // check_violation (ID de Embark, etc.)
  if (message.startsWith('ARC_OUT_OF_STOCK')) return { status: 409, code: 'out_of_stock' }
  if (message.startsWith('ARC_BLOCKED')) return { status: 403, code: 'blocked' }
  if (message.startsWith('ARC_INVALID_DISCORD')) return { status: 400, code: 'invalid_discord' }
  if (message.startsWith('ARC_INVALID_EMAIL')) return { status: 400, code: 'invalid_email' }
  if (message.startsWith('ARC_USD_DISABLED')) return { status: 400, code: 'usd_disabled' }
  if (message.startsWith('ARC_ARS_DISABLED')) return { status: 400, code: 'ars_disabled' }
  if (message.startsWith('ARC_TOO_MANY_OPEN_ORDERS')) return { status: 429, code: 'too_many_open_orders' }
  if (message.startsWith('ARC_')) return { status: 400, code: 'invalid_order' }
  return { status: 500, code: 'server_error' }
}

const orderNumber = (n: number) => `BX-${String(n).padStart(6, '0')}`
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-AR', {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: currency === 'USD' || cents % 100 !== 0 ? 2 : 0,
    maximumFractionDigits: currency === 'USD' || cents % 100 !== 0 ? 2 : 0,
  }).format(cents / 100)

// Aviso al canal privado del staff con lo necesario para contactar al comprador
async function notifyDiscord(
  admin: SupabaseClient,
  result: { order_id: string; number: number; public_code: string; total_cents: number; currency: string },
  body: z.infer<typeof Body>,
  account: string | null,
  siteOrigin: string | null,
) {
  if (!DISCORD_WEBHOOK_URL) return
  try {
    const { data: items } = await admin
      .from('ARC_order_items')
      .select('id, parent_item_id, names, qty')
      .eq('order_id', result.order_id)

    const name = (i: { names: Record<string, string> }) => i.names?.es ?? Object.values(i.names ?? {})[0] ?? '?'
    const lines = (items ?? [])
      .filter((i) => !i.parent_item_id)
      .map((i) => {
        const mods = (items ?? []).filter((m) => m.parent_item_id === i.id).map(name)
        return `${i.qty > 1 ? `${i.qty} × ` : ''}${name(i)}${mods.length ? ` (+ ${mods.join(', ')})` : ''}`
      })

    const discord = body.discordUsername.replace(/^@/, '').toLowerCase()
    const fields = [
      { name: '👤 Cliente', value: `Discord: **@${discord}**\n${body.email.toLowerCase()}${account ? `\nCuenta: ${account}` : '\nSin cuenta'}`, inline: true },
      { name: '🎮 Jugador', value: `\`${body.embarkId}\`${body.platform ? `\n${PLATFORMS[body.platform]}` : ''}`, inline: true },
      { name: '📦 Productos', value: lines.join('\n').slice(0, 1000) || '—' },
      { name: '💰 Total', value: `${money(result.total_cents, result.currency)} · ${result.currency === 'USD' ? 'esperando pago por PayPal' : 'esperando transferencia y comprobante'}`, inline: false },
    ]
    if (body.note) fields.push({ name: '📝 Nota', value: body.note.slice(0, 500), inline: false })

    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `🛒 **Nueva compra ${orderNumber(result.number)}** · contacta a **@${discord}**`,
        allowed_mentions: { parse: [] }, // no menciona a nadie por accidente
        embeds: [{
          title: `Pedido ${result.public_code}`,
          url: siteOrigin ? `${siteOrigin}/admin/pedidos` : undefined,
          color: 0xd9442a,
          fields,
          timestamp: new Date().toISOString(),
        }],
      }),
    })
  } catch (err) {
    // El aviso es opcional: un fallo de Discord no debe romper el pedido
    console.error('discord notify failed', err)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch {
    return json(req, { error: 'invalid_body' }, 400)
  }

  // Sesión opcional: si hay usuario, el pedido queda en su cuenta; si no, es un pedido de invitado
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: userData } = await userClient.auth.getUser()
  const user = userData?.user ?? null
  let account: string | null = null
  if (user) {
    const { data: profile, error } = await userClient.rpc('arc_ensure_profile')
    if (error || !profile) return json(req, { error: 'server_error' }, 500)
    account = (profile as { username: string }).username
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  // Libera antes el stock de pedidos sin pagar vencidos (no hay tareas programadas en el proyecto)
  await admin.rpc('arc_expire_unpaid_orders')
  const { data: result, error } = await admin.rpc('arc_create_guest_order', {
    p_items: body.items.map((i) => ({ product_id: i.productId, qty: i.qty, mod_ids: i.modIds })),
    p_email: body.email,
    p_discord: body.discordUsername,
    p_embark_id: body.embarkId,
    p_platform: body.platform ?? null,
    p_note: body.note ?? null,
    p_user_id: user?.id ?? null,
    p_currency: body.currency,
  })

  if (error) {
    const mapped = mapError(error.message, error.code)
    if (mapped.status === 500) console.error('arc_create_guest_order failed', error)
    const detail = error.message.startsWith('ARC_OUT_OF_STOCK:') ? error.message.split(':')[1] : undefined
    return json(req, { error: mapped.code, detail }, mapped.status)
  }

  if (user && body.saveToProfile) {
    await admin
      .from('ARC_profiles')
      .update({
        embark_id: body.embarkId,
        discord_username: body.discordUsername.replace(/^@/, '').toLowerCase(),
        ...(body.platform ? { platform: body.platform } : {}),
      })
      .eq('id', user.id)
  }

  await notifyDiscord(admin, result, body, account, req.headers.get('origin'))

  return json(req, result, 201)
})
