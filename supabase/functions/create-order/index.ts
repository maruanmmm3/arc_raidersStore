// Crea un pedido con su cita de entrega.
// El navegador solo envía IDs, cantidades, mods elegidos y datos del jugador: el precio,
// el stock y el hueco se validan y calculan en la función SQL arc_create_order.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'
import { corsHeaders, json } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DISCORD_WEBHOOK_URL = Deno.env.get('DISCORD_WEBHOOK_URL')

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
  embarkId: z.string().trim().regex(/^[^#\s]{2,32}#[0-9]{3,6}$/),
  platform: z.enum(['pc_steam', 'pc_epic', 'ps5', 'xbox']),
  region: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).optional(),
  paymentMode: z.enum(['discord', 'online']),
  slotStart: z.iso.datetime({ offset: true }),
  saveToProfile: z.boolean().optional(),
})

// Errores de arc_create_order → respuesta HTTP con un código que la web sabe traducir
function mapError(message: string): { status: number; code: string } {
  if (message.startsWith('ARC_OUT_OF_STOCK')) return { status: 409, code: 'out_of_stock' }
  if (message.startsWith('ARC_SLOT_TAKEN')) return { status: 409, code: 'slot_taken' }
  if (message.startsWith('ARC_BLOCKED')) return { status: 403, code: 'blocked' }
  if (message.startsWith('ARC_ONLINE_PAYMENT_DISABLED')) return { status: 400, code: 'online_disabled' }
  if (message.startsWith('ARC_')) return { status: 400, code: 'invalid_order' }
  return { status: 500, code: 'server_error' }
}

async function notifyDiscord(admin: ReturnType<typeof createClient>, result: Record<string, unknown>, username: string) {
  if (!DISCORD_WEBHOOK_URL) return
  try {
    const { data: tz } = await admin.from('ARC_settings').select('value').eq('key', 'store_timezone').single()
    const when = new Intl.DateTimeFormat('es', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: (tz?.value as string) || 'America/Lima',
    }).format(new Date(result.slot_start as string))
    const total = ((result.total_cents as number) / 100).toFixed(2)
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `🎟️ **Nueva cita** · Pedido SS-${String(result.number).padStart(6, '0')} · ${username}\n` +
          `📅 ${when} · Ticket \`${result.ticket_code}\` · Total ${total}`,
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

  // 1. ¿Quién llama? Se verifica el JWT contra Supabase Auth
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json(req, { error: 'unauthorized' }, 401)
  const user = userData.user

  // 2. Valida la forma del pedido
  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch {
    return json(req, { error: 'invalid_body' }, 400)
  }

  // 3. Se asegura de que existe el perfil de ARC (usuarios compartidos con otras apps)
  const { data: profile, error: profileError } = await userClient.rpc('arc_ensure_profile')
  if (profileError || !profile) return json(req, { error: 'server_error' }, 500)

  // 4. Crea pedido + cita en una sola transacción
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: result, error } = await admin.rpc('arc_create_order', {
    p_user_id: user.id,
    p_items: body.items.map((i) => ({ product_id: i.productId, qty: i.qty, mod_ids: i.modIds })),
    p_embark_id: body.embarkId,
    p_platform: body.platform,
    p_region: body.region ?? null,
    p_note: body.note ?? null,
    p_payment_mode: body.paymentMode,
    p_slot_start: body.slotStart,
  })

  if (error) {
    // 23514 = check_violation (por ejemplo, ID de Embark con formato inválido)
    const mapped = error.code === '23514' ? { status: 400, code: 'invalid_order' } : mapError(error.message)
    if (mapped.status === 500) console.error('arc_create_order failed', error)
    const detail = error.message.startsWith('ARC_OUT_OF_STOCK:') ? error.message.split(':')[1] : undefined
    return json(req, { error: mapped.code, detail }, mapped.status)
  }

  if (body.saveToProfile) {
    await admin.from('ARC_profiles').update({ embark_id: body.embarkId, platform: body.platform }).eq('id', user.id)
  }

  await notifyDiscord(admin, result, (profile as { username: string }).username)

  return json(req, result, 201)
})
