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
import { saveJadeSession, loadJadeSession, markHandover, markResumed } from '@/lib/jade-session'

export const dynamic = 'force-dynamic'

const CHATWOOT_BASE   = 'https://chat.walztravels.com'
const CHATWOOT_TOKEN  = process.env.CHATWOOT_API_TOKEN ?? ''
const ACCOUNT_ID      = '1'

// ── Signature verification ────────────────────────────────────────────────────
async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  // Simple token check (X-Chatwoot-Token header)
  const tokenSecret = process.env.CHATWOOT_WEBHOOK_TOKEN
  if (tokenSecret) {
    const provided = req.headers.get('x-chatwoot-token')
    if (provided === tokenSecret) return true
  }

  // HMAC fallback (x-chatwoot-signature)
  const hmacSecret = process.env.CHATWOOT_WEBHOOK_SECRET
  if (hmacSecret) {
    const sig = req.headers.get('x-chatwoot-signature')
    if (!sig) return false
    const [algo, hex] = sig.split('=')
    if (algo !== 'sha256' || !hex) return false
    const expected = createHmac('sha256', hmacSecret).update(rawBody).digest('hex')
    try {
      return timingSafeEqual(Buffer.from(hex), Buffer.from(expected))
    } catch {
      return false
    }
  }

  return true // no secret configured → allow (dev)
}

// ── Resolve Instagram/Facebook PSID for a Chatwoot conversation ─────────────
// Chatwoot's message_created payload frequently omits contact_inbox.source_id
// when the agent replies via the custom admin inbox. This function tries the
// webhook payload first (fast, no network), then falls back to the Chatwoot
// REST API (slow path, ~1 extra request) so jadeSilencedAt is reliably written.
async function getSourceId(payload: CWPayload, convId: number): Promise<string | null> {
  // Fast path: source_id already present in the webhook payload
  const fromPayload = payload.conversation?.contact_inbox?.source_id
    ?? payload.meta?.sender?.identifier

  if (fromPayload) {
    console.log('[chatwoot-webhook] getSourceId: resolved from payload —', fromPayload)
    return fromPayload
  }

  // Slow path: fetch full conversation object from Chatwoot API
  if (!CHATWOOT_TOKEN) {
    console.warn('[chatwoot-webhook] getSourceId: CHATWOOT_API_TOKEN missing — API fallback disabled')
    return null
  }

  const ac = new AbortController()
  const t  = setTimeout(() => ac.abort(), 5000)

  try {
    const res = await fetch(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${convId}`,
      { headers: { 'Content-Type': 'application/json', api_access_token: CHATWOOT_TOKEN }, signal: ac.signal },
    )
    clearTimeout(t)

    if (!res.ok) {
      console.warn('[chatwoot-webhook] getSourceId: Chatwoot API fallback failed —', res.status)
      return null
    }

    const data = await res.json() as {
      channel?:       string
      contact_inbox?: { source_id?: string }
      meta?: {
        channel?: string
        sender?:  { identifier?: string }
      }
    }

    const channel = (data?.meta?.channel ?? data?.channel ?? '').toLowerCase()
    if (!channel.includes('instagram') && !channel.includes('facebook')) {
      // Not an IG/FB conversation — no Prisma Lead to silence
      return null
    }

    const resolved = data?.contact_inbox?.source_id
      ?? data?.meta?.sender?.identifier
      ?? null

    if (resolved) {
      console.log('[chatwoot-webhook] getSourceId: resolved via API fallback —', resolved)
    } else {
      console.warn('[chatwoot-webhook] getSourceId: API fallback returned no source_id for conv', convId)
    }

    return resolved
  } catch (err) {
    clearTimeout(t)
    console.error('[chatwoot-webhook] getSourceId fallback error:', err)
    return null
  }
}

// ── Send a message to a Chatwoot conversation ─────────────────────────────────
async function cwSendMessage(conversationId: number, content: string): Promise<void> {
  if (!CHATWOOT_TOKEN) return
  try {
    await fetch(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', api_access_token: CHATWOOT_TOKEN },
      body:    JSON.stringify({ content, message_type: 'outgoing', private: false }),
    })
  } catch {}
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
      case 'conversation_status_changed':
        await onConversationStatusChanged(payload)
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

async function onConversationStatusChanged(payload: CWPayload) {
  const convId = payload.id
  if (!convId) return
  const convKey = String(convId)

  // 'pending' = human agent taking over — silence Jade immediately
  if (payload.status === 'pending') {
    const session = await loadJadeSession(convKey)
    const silencedState = {
      intent:              session?.intent ?? null,
      lastMessage:         session?.lastMessage ?? '',
      conversationHistory: session?.conversationHistory ?? [],
      bookingContext:      session?.bookingContext ?? null,
      groupContext:        session?.groupContext ?? null,
      agentActive:         true,
    }
    await saveJadeSession(convKey, silencedState)
    await markHandover(convKey)

    // Also silence IG/FB Jade via Prisma (catches agent takeovers before first reply)
    const igSourceId = await getSourceId(payload, convId)
    const silenceKey = igSourceId ?? payload.conversation?.id?.toString() ?? null
    if (igSourceId) {
      await prisma.lead.updateMany({
        where: { sourceId: igSourceId },
        data:  { jadeSilencedAt: new Date(), jadeResumedAt: null },
      }).catch(() => {})
    }
    console.log('[chatwoot-webhook] status→pending — agent takeover logged:', {
      conversationId:        convId,
      sourceIdFromPayload:   payload.conversation?.contact_inbox?.source_id ?? null,
      sourceIdResolved:      igSourceId,
      silenceKeyUsed:        silenceKey,
      jadeSilencedAt:        new Date().toISOString(),
    })
    return
  }

  // 'open' = agent handing back to Jade — clear the silence flag
  if (payload.status === 'open') {
    const session = await loadJadeSession(convKey)
    await markResumed(convKey)

    if (!session) return

    const intent = session.intent
    let context = 'your enquiry'
    if (intent === 'booking' && session.bookingContext?.searchParams) {
      const sp = session.bookingContext.searchParams
      context  = `finding a flight from **${sp.origin}** to **${sp.destination}**`
    } else if (intent === 'group_trip' && session.groupContext?.sessionName) {
      context = `planning your group trip **${session.groupContext.sessionName}**`
    }

    await cwSendMessage(
      convId,
      `Welcome back — I'm Jade 👋 I can see we were discussing ${context}. Shall we continue from where we left off?`,
    )

    // Save session with agentActive cleared so Jade can respond again
    await saveJadeSession(convKey, { ...session, agentActive: false })
  }
}

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

  // Human agent reply → silence Jade across all channels
  // message_type 1 = outgoing; sender.type 'bot' = Jade herself (ignore)
  if (payload.message_type === 1 && payload.sender?.type !== 'bot') {
    const convKey = String(convId)

    // 1. Silence website Jade via JadeSession (most reliable — doesn't depend on
    //    chatwoot_conversation_id being linked to a Supabase lead yet)
    const session = await loadJadeSession(convKey).catch(() => null)
    const silencedState = {
      intent:              session?.intent ?? null,
      lastMessage:         session?.lastMessage ?? '',
      conversationHistory: session?.conversationHistory ?? [],
      bookingContext:      session?.bookingContext ?? null,
      groupContext:        session?.groupContext ?? null,
      agentActive:         true,
    }
    await saveJadeSession(convKey, silencedState).catch(() => {})

    // 2. Silence website Jade via Supabase leads table (legacy path)
    await supabase
      .from('leads')
      .update({ jade_silenced_at: new Date().toISOString() })
      .eq('chatwoot_conversation_id', convId)

    // 3. Silence IG/FB Jade (Prisma) — get PSID from payload or API fallback
    const igSourceId = await getSourceId(payload, convId)
    const silenceKey = igSourceId ?? payload.conversation?.id?.toString() ?? null

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

    console.log('[chatwoot-webhook] Agent message processed:', {
      conversationId:      convId,
      jadeSessionSilenced: true,
      sourceIdFromPayload: payload.conversation?.contact_inbox?.source_id ?? null,
      sourceIdResolved:    igSourceId,
      silenceKeyUsed:      silenceKey,
      via:                 payload.conversation?.contact_inbox?.source_id ? 'payload' : 'API fallback',
      jadeSilencedAt:      new Date().toISOString(),
    })
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
  identifier?:   string | null  // Instagram/Facebook PSID stored here
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
