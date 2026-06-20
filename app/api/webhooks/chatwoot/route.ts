/**
 * app/api/webhooks/chatwoot/route.ts
 *
 * Receives webhook events from Chatwoot and syncs them into the
 * Supabase messages table so they appear in /admin/inbox.
 *
 * Register in Chatwoot: Settings → Integrations → Webhooks → Add
 *   URL:   https://www.walztravels.com/api/webhooks/chatwoot
 *   Events: message_created, conversation_created, conversation_updated, conversation_resolved
 *
 * Required SQL (run once in Supabase SQL Editor):
 *   ALTER TABLE leads ADD COLUMN IF NOT EXISTS chatwoot_conversation_id bigint;
 *   ALTER TABLE leads ADD COLUMN IF NOT EXISTS chatwoot_contact_id bigint;
 *   CREATE INDEX IF NOT EXISTS idx_leads_chatwoot_conv ON leads(chatwoot_conversation_id);
 *
 * Optional env vars (for sending replies via Chatwoot API):
 *   CHATWOOT_BASE_URL      — e.g. https://chatwoot-production-d486.up.railway.app
 *   CHATWOOT_ACCOUNT_ID    — e.g. 1
 *   CHATWOOT_API_ACCESS_TOKEN — agent API token from Chatwoot → Profile → Access Token
 */

import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ── Signature verification ────────────────────────────────────────────────────
async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = process.env.CHATWOOT_WEBHOOK_SECRET
  if (!secret) return true // no secret configured → allow (dev / first setup)

  const sig = req.headers.get('x-chatwoot-signature') // format: sha256=<hex>
  if (!sig) return false

  const [algo, hex] = sig.split('=')
  if (algo !== 'sha256' || !hex) return false

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(hex), Buffer.from(expected))
  } catch {
    return false
  }
}

// ── POST — receive Chatwoot events ───────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const rawBody = await req.text()

    if (!await verifySignature(req, rawBody)) {
      return new Response('Forbidden', { status: 403 })
    }

    const payload = JSON.parse(rawBody) as CWPayload
    const supabase = getSupabaseAdmin()

    switch (payload.event) {
      case 'conversation_created':
        await onConversationCreated(payload, supabase)
        break
      case 'conversation_updated':
        await onConversationUpdated(payload, supabase)
        break
      case 'conversation_resolved':
        await onConversationResolved(payload, supabase)
        break
      case 'message_created':
        await onMessageCreated(payload, supabase)
        break
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[chatwoot-webhook] Error:', err)
    return NextResponse.json({ ok: true }) // always 200 — Chatwoot retries on non-200
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────
async function onConversationCreated(payload: CWPayload, supabase: SupabaseAdmin) {
  const contact = payload.contact ?? payload.meta?.sender
  if (!contact) return

  await findOrCreateLead({
    supabase,
    name:                   contact.name ?? 'Unknown',
    phone:                  contact.phone_number,
    email:                  contact.email,
    channel:                detectChannel(payload),
    chatwootConversationId: payload.id,
    chatwootContactId:      contact.id,
  })
}

async function onConversationUpdated(payload: CWPayload, supabase: SupabaseAdmin) {
  if (!payload.id) return

  const statusMap: Record<string, string> = {
    open:     'Contacted',
    resolved: 'Closed',
    pending:  'New',
  }
  const newStatus = payload.status ? statusMap[payload.status] : undefined

  if (newStatus) {
    await supabase
      .from('leads')
      .update({ status: newStatus })
      .eq('chatwoot_conversation_id', payload.id)
  }
}

async function onConversationResolved(payload: CWPayload, supabase: SupabaseAdmin) {
  if (!payload.id) return
  await supabase
    .from('leads')
    .update({ status: 'Closed' })
    .eq('chatwoot_conversation_id', payload.id)
}

async function onMessageCreated(payload: CWPayload, supabase: SupabaseAdmin) {
  // Skip private notes and activity messages (type 2)
  if (payload.private) return
  if (payload.message_type === 2) return // activity / template

  const convId = payload.conversation?.id ?? payload.id
  if (!convId) return

  // Human agent reply → silence Jade for RESUME_AFTER_MINUTES
  // message_type 1 = outgoing; sender.type 'bot' = Jade herself (ignore)
  if (payload.message_type === 1 && payload.sender?.type !== 'bot') {
    // Silence website Jade (Supabase)
    await supabase
      .from('leads')
      .update({ jade_silenced_at: new Date().toISOString() })
      .eq('chatwoot_conversation_id', convId)

    // Silence IG/FB Jade (Prisma) — match by Instagram PSID from Chatwoot contact_inbox
    const igSourceId = payload.conversation?.contact_inbox?.source_id
    if (igSourceId) {
      try {
        await prisma.lead.updateMany({
          where: { sourceId: igSourceId },
          data:  { jadeSilencedAt: new Date(), jadeResumedAt: null },
        })
      } catch (e) {
        console.error('[chatwoot-webhook] Prisma silence error:', e)
      }
    }
  }

  // Deduplicate by external_id
  const externalId = `cw_msg_${payload.id}`
  const { data: dup } = await supabase
    .from('messages')
    .select('id')
    .eq('external_id', externalId)
    .maybeSingle()
  if (dup) return

  // Resolve lead from conversation
  let leadId: string | null = null

  const { data: leadByConv } = await supabase
    .from('leads')
    .select('id, unread_count')
    .eq('chatwoot_conversation_id', convId)
    .maybeSingle()

  if (leadByConv) {
    leadId = leadByConv.id
  } else {
    // Fallback: find or create via contact info
    const sender = payload.sender ?? payload.contact
    const phone  = sender?.phone_number ?? payload.conversation?.contact_inbox?.source_id
    const email  = sender?.email

    if (phone || email) {
      leadId = await findOrCreateLead({
        supabase,
        name:                   sender?.name ?? 'Unknown',
        phone,
        email,
        channel:                detectChannel(payload),
        chatwootConversationId: convId,
        chatwootContactId:      sender?.id,
      })
    }
  }

  if (!leadId) return

  // message_type: 0 = incoming, 1 = outgoing from agent
  const direction = payload.message_type === 0 ? 'inbound' : 'outbound'
  const body      = payload.content ?? ''
  const now       = new Date().toISOString()

  await supabase.from('messages').insert({
    lead_id:     leadId,
    channel:     detectChannel(payload),
    direction,
    body,
    external_id: externalId,
    attachments: payload.attachments?.length ? payload.attachments : undefined,
  })

  // Update lead metadata
  const updatePayload: Record<string, unknown> = {
    last_message_at:      now,
    last_message_preview: direction === 'inbound'
      ? body.substring(0, 80)
      : `Agent: ${body.substring(0, 75)}`,
  }

  if (direction === 'inbound') {
    const currentUnread = leadByConv ? ((leadByConv as { unread_count?: number }).unread_count ?? 0) : 0
    updatePayload.unread_count = currentUnread + 1
  } else {
    updatePayload.last_staff_reply_at = now
  }

  await supabase.from('leads').update(updatePayload).eq('id', leadId)
}

// ── Lead helper ───────────────────────────────────────────────────────────────
async function findOrCreateLead({
  supabase, name, phone, email, channel,
  chatwootConversationId, chatwootContactId,
}: {
  supabase: SupabaseAdmin
  name: string
  phone?: string | null
  email?: string | null
  channel: string
  chatwootConversationId?: number
  chatwootContactId?: number
}): Promise<string | null> {
  const normalizedPhone = phone?.replace(/\D/g, '') || null

  // 1. By chatwoot_conversation_id
  if (chatwootConversationId) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('chatwoot_conversation_id', chatwootConversationId)
      .maybeSingle()
    if (data) return data.id
  }

  // 2. By whatsapp_number
  if (normalizedPhone) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('whatsapp_number', normalizedPhone)
      .maybeSingle()
    if (data) {
      if (chatwootConversationId) {
        await supabase.from('leads').update({
          chatwoot_conversation_id: chatwootConversationId,
          chatwoot_contact_id:      chatwootContactId,
        }).eq('id', data.id)
      }
      return data.id
    }
  }

  // 3. By email
  if (email) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (data) {
      if (chatwootConversationId) {
        await supabase.from('leads').update({
          chatwoot_conversation_id: chatwootConversationId,
          chatwoot_contact_id:      chatwootContactId,
        }).eq('id', data.id)
      }
      return data.id
    }
  }

  // 4. Create new lead
  const { data: newLead, error } = await supabase
    .from('leads')
    .insert({
      name:                     name || 'Unknown',
      whatsapp_number:          normalizedPhone,
      whatsapp:                 normalizedPhone ? '+' + normalizedPhone : null,
      phone:                    normalizedPhone,
      email,
      channel,
      source:                   `chatwoot_${channel}`,
      service:                  'Other',
      status:                   'New',
      jadeActive:               false,
      isRead:                   false,
      chatwoot_conversation_id: chatwootConversationId,
      chatwoot_contact_id:      chatwootContactId,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[chatwoot-webhook] Lead insert error:', error)
    return null
  }

  return newLead.id
}

// ── Channel detection ─────────────────────────────────────────────────────────
function detectChannel(payload: CWPayload): string {
  const ch = (
    payload.channel ??
    payload.meta?.channel ??
    payload.conversation?.channel ??
    ''
  ).toLowerCase()
  if (ch.includes('whatsapp')) return 'whatsapp'
  if (ch.includes('instagram')) return 'instagram'
  if (ch.includes('web')) return 'web'
  return 'chatwoot'
}

// ── Types ─────────────────────────────────────────────────────────────────────
type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

interface CWContact {
  id?:           number
  name?:         string
  email?:        string | null
  phone_number?: string | null
}

interface CWConversation {
  id?:      number
  status?:  string
  channel?: string
  contact_inbox?: {
    source_id?: string
    contact_id?: number
  }
}

interface CWPayload {
  event:        string
  id?:          number
  status?:      string
  channel?:     string
  content?:     string
  message_type?: number // 0=incoming, 1=outgoing, 2=activity
  private?:     boolean
  attachments?: Array<{ type: string; data_url?: string; file_name?: string }>
  contact?:     CWContact
  sender?:      CWContact & { type?: string }
  conversation?: CWConversation
  meta?: {
    sender?: CWContact
    channel?: string
  }
}
