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
import { routeConversation, applyRouting } from '@/lib/conversation-router'
import { getResend } from '@/lib/resend'

export const dynamic = 'force-dynamic'

const CHATWOOT_BASE      = 'https://chat.walztravels.com'
const CHATWOOT_TOKEN     = process.env.CHATWOOT_API_TOKEN ?? '1rnd6Rp9GNVKtbJ8238Vg2S1'
// Bot token (Chatwoot → Settings → Bots → edit Jade) — makes Jade post as agent_bot, not as a human agent
const CHATWOOT_BOT_TOKEN = process.env.CHATWOOT_BOT_TOKEN ?? CHATWOOT_TOKEN
const ACCOUNT_ID         = '1'

// Fallback: explicit Jade agent ID in case CHATWOOT_BOT_TOKEN is not yet set
const JADE_AGENT_ID = process.env.JADE_CHATWOOT_AGENT_ID
  ? Number(process.env.JADE_CHATWOOT_AGENT_ID)
  : null

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
  // Fast path: source_id already present in the webhook payload.
  // NOTE: payload.meta?.sender is the message SENDER — for outgoing agent messages
  // that's the agent, not the customer. Use payload.contact (= the conversation's
  // customer contact) instead.
  const fromPayload = payload.conversation?.contact_inbox?.source_id
    ?? payload.contact?.identifier

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
  try {
    await fetch(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', api_access_token: CHATWOOT_BOT_TOKEN },
      body:    JSON.stringify({
        content,
        message_type:       'outgoing',
        private:            false,
        content_attributes: { jade_ai: true },
      }),
    })
  } catch {}
}

// ── POST — receive Chatwoot events ───────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    console.log('[cw-hook] RECV', rawBody.slice(0, 2000))

    if (!await verifySignature(req, rawBody)) {
      console.warn('[cw-hook] BLOCKED: signature mismatch')
      return new Response('Forbidden', { status: 403 })
    }

    const payload = JSON.parse(rawBody) as CWPayload

    console.log('[cw-hook] IN', {
      event:      payload.event,
      id:         payload.id,
      convId:     payload.conversation?.id,
      status:     payload.status,
      assigneeId: payload.conversation?.meta?.assignee?.id ?? null,
      sourceId:   payload.conversation?.meta?.sender?.identifier
                  ?? payload.conversation?.contact_inbox?.source_id ?? null,
      sender:     payload.sender?.type ?? null,
    })

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
  const convId      = payload.id
  const assigneeCwId = payload.conversation?.meta?.assignee?.id ?? null
  const senderPhone  = payload.conversation?.meta?.sender?.phone_number ?? null
  const sourceId     = payload.conversation?.contact_inbox?.source_id ?? null

  console.log('[cw-hook] conv_updated entry', {
    convId, status: payload.status, assigneeCwId, senderPhone, sourceId,
  })

  if (!convId) {
    console.warn('[cw-hook] conv_updated exit: no payload.id')
    return
  }

  const statusMap: Record<string, string> = {
    open:     'Contacted',
    resolved: 'Closed',
    pending:  'New',
  }
  const newStatus = payload.status ? statusMap[payload.status] : undefined
  if (!newStatus) {
    console.log('[cw-hook] conv_updated exit: status not mapped →', payload.status)
    return
  }

  const update: Record<string, unknown> = { status: newStatus }

  // Resolve staff from Chatwoot assignee
  let staffId: string | null = null
  if (newStatus === 'Contacted') {
    update.lastContactedAt = new Date().toISOString()
    if (assigneeCwId) {
      const staff = await prisma.staff.findFirst({
        where:  { chatwootAgentId: assigneeCwId },
        select: { id: true, name: true },
      })
      staffId = staff?.id ?? null
      if (staffId) update.assignedToId = staffId
      console.log('[cw-hook] assign staff lookup', {
        assigneeCwId, staffId, staffName: staff?.name ?? null,
      })
    } else {
      console.warn('[cw-hook] assign: no assignee in payload')
    }
  }

  // ── Primary lookup: chatwoot_conversation_id (fast path for linked leads) ─
  let { data: updatedRows, error } = await supabase
    .from('leads')
    .update(update)
    .eq('chatwoot_conversation_id', convId)
    .select('id')

  console.log('[cw-hook] primary lookup', {
    convId, leadsUpdated: updatedRows?.length ?? 0, error: error?.message ?? null,
  })

  // ── Fallback: match by phone / PSID, then backfill chatwoot_conversation_id ─
  // Existing leads created before this column was populated have it NULL.
  // They must be found by whatsapp number (WhatsApp channel) or PSID
  // (Instagram/Facebook channel, stored with a leading '+' in the whatsapp column).
  if (!updatedRows?.length) {
    const phoneNorm = senderPhone ? ('+' + senderPhone.replace(/\D/g, '')) : null
    const psidKey   = sourceId    ? ('+' + sourceId)                        : null
    let fallbackId: string | null = null

    for (const candidate of [senderPhone, phoneNorm, psidKey].filter(Boolean) as string[]) {
      const { data } = await supabase
        .from('leads')
        .select('id')
        .eq('whatsapp', candidate)
        .maybeSingle()
      if (data?.id) { fallbackId = data.id; break }
    }

    console.log('[cw-hook] fallback lookup', {
      senderPhone, phoneNorm, psidKey, fallbackId: fallbackId ?? 'NO_LEAD',
    })

    if (fallbackId) {
      // Write chatwoot_conversation_id so future events use the fast path
      const { data: fallbackRows, error: fErr } = await supabase
        .from('leads')
        .update({ ...update, chatwoot_conversation_id: convId })
        .eq('id', fallbackId)
        .select('id')
      updatedRows = fallbackRows
      console.log('[cw-hook] fallback update', {
        leadId: fallbackId, leadsUpdated: fallbackRows?.length ?? 0, error: fErr?.message ?? null,
      })
    }
  }

  // Set a default +2-day follow-up for newly Contacted leads that have none
  if (newStatus === 'Contacted' && updatedRows?.length) {
    const { data: existing } = await supabase
      .from('leads')
      .select('nextFollowUpAt')
      .eq('id', updatedRows[0].id)
      .single()
    if (existing && !existing.nextFollowUpAt) {
      const d = new Date()
      d.setDate(d.getDate() + 2)
      d.setHours(9, 0, 0, 0)
      await supabase.from('leads')
        .update({ nextFollowUpAt: d.toISOString() })
        .eq('id', updatedRows[0].id)
    }
  }

  // ── Mirror assignment to Prisma "Lead" table ─────────────────────────────
  // The Supabase 'leads' table (above) is the pre-Prisma original; "Lead" is the
  // Prisma-managed table the admin panel reads. Both exist independently.
  // When a staff assignment is made, write it to "Lead" as well so the admin
  // panel sees it — matching by phone number since "Lead" has no chatwoot_conversation_id.
  if (staffId || newStatus) {
    const phoneNorm = senderPhone ? ('+' + senderPhone.replace(/\D/g, '')) : null
    if (phoneNorm) {
      const prismaUpdate: Parameters<typeof prisma.lead.updateMany>[0]['data'] = {
        status: newStatus,
      }
      if (staffId)                     prismaUpdate.assignedToId   = staffId
      if (newStatus === 'Contacted')   prismaUpdate.lastContactedAt = new Date()

      try {
        const result = await prisma.lead.updateMany({
          where: { whatsapp: { in: [phoneNorm, senderPhone ?? ''].filter(Boolean) } },
          data:  prismaUpdate,
        })
        console.log('[cw-hook] prisma mirror', {
          phone: phoneNorm, updated: result.count, staffId, newStatus,
        })
      } catch (e) {
        console.warn('[cw-hook] prisma mirror failed (non-blocking):', e instanceof Error ? e.message : e)
      }
    }
  }

  console.log('[cw-hook] resolve', {
    event:        'conversation_updated',
    convId,
    newStatus,
    assigneeCwId,
    staffFound:   staffId ?? 'NO_STAFF',
    leadFound:    updatedRows?.length ? updatedRows[0].id : 'NO_LEAD',
    leadsUpdated: updatedRows?.length ?? 0,
  })
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

  // ── Auto-routing: assign new inbound conversations to the right agent ──────
  if (payload.message_type === 0 && payload.sender?.type === 'contact') {
    const conversationId  = convId.toString()
    const alreadyAssigned = payload.conversation?.meta?.assignee

    if (!alreadyAssigned) {
      try {
        const decision = await routeConversation(
          conversationId,
          payload.content ?? '',
          payload.conversation?.channel ?? '',
        )
        if (decision) {
          await applyRouting(
            conversationId,
            decision,
            payload.content ?? '',
            payload.conversation?.channel ?? '',
          )
        }
      } catch (e) {
        console.error('[router] Routing error (non-fatal):', e)
      }
    }

    // ── Clear whisper re-engagement state on genuine inbound reply ────────────
    // whisperStage / whisperCount live inside JadeSession.state JSON.
    // If a client sends a real message, they've re-engaged — any pending
    // scheduled whisper must not fire. Clearing here is the earliest possible
    // point after the chatwootConversationId is known and the message type is
    // confirmed as a real client message (not a receipt, note, or agent send).
    try {
      const convKey   = String(convId)
      const jSession  = await prisma.jadeSession.findUnique({
        where: { chatwootConversationId: convKey },
      })
      if (jSession) {
        const state = (jSession.state as Record<string, unknown>) ?? {}
        if (state.whisperStage !== undefined) {
          const { whisperStage: _ws, whisperCount: _wc, ...rest } = state
          await prisma.jadeSession.update({
            where: { chatwootConversationId: convKey },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data:  { state: rest as any },
          })
          console.log('[cw-hook] whisper state cleared on client reply', {
            convId, removedStage: _ws, removedCount: _wc,
          })
        }
      }
    } catch (e) {
      console.warn('[cw-hook] whisper clear failed (non-blocking):', e instanceof Error ? e.message : e)
    }
    // ── End whisper clear ─────────────────────────────────────────────────────
  }
  // ── End routing ─────────────────────────────────────────────────────────────

  // Outgoing message — check if it's a REAL human agent or Jade herself.
  // Jade uses a Chatwoot user token (sender.type = 'user', NOT 'bot') so we
  // must compare sender.id against Jade's own profile ID to exclude her messages.
  if (payload.message_type === 1 && payload.sender?.type !== 'bot') {
    const convKey = String(convId)

    // Detect Jade's own echoed messages so we don't silence ourselves.
    // When CHATWOOT_BOT_TOKEN is set, Jade posts as sender.type='agent_bot' — definitive.
    // Fallback 1: content_attributes.jade_ai tag stamped on every Jade message.
    // Fallback 2: JADE_CHATWOOT_AGENT_ID env var (explicit numeric ID).
    const isJade =
      payload.sender?.type === 'agent_bot'
      || payload.content_attributes?.jade_ai === true
      || (JADE_AGENT_ID !== null && payload.sender?.id === JADE_AGENT_ID)

    if (isJade) {
      console.log('[chatwoot-webhook] Skipping Jade own-message echo for conv', convId)
    } else {
      // Real human agent sent a message
      const agentName = payload.sender?.name ?? 'Agent'
      const content   = payload.content ?? ''

      // 1. Silence Jade + buffer message so website visitor can poll for it
      const session = await loadJadeSession(convKey).catch(() => null)
      const pendingMessages = [
        ...(session?.agentMessages ?? []),
        ...(content ? [{ content, agentName, timestamp: new Date().toISOString() }] : []),
      ]
      const silencedState = {
        intent:              session?.intent ?? null,
        lastMessage:         session?.lastMessage ?? '',
        conversationHistory: session?.conversationHistory ?? [],
        bookingContext:      session?.bookingContext ?? null,
        groupContext:        session?.groupContext ?? null,
        agentActive:         true,
        agentMessages:       pendingMessages,
      }
      await saveJadeSession(convKey, silencedState).catch(() => {})

      // 2. Silence via Supabase leads table (legacy website path)
      await supabase
        .from('leads')
        .update({ jade_silenced_at: new Date().toISOString() })
        .eq('chatwoot_conversation_id', convId)

      // 3. Silence IG/FB Jade via Prisma (customer PSID lookup)
      const igSourceId = await getSourceId(payload, convId)
      if (igSourceId) {
        try {
          await prisma.lead.updateMany({
            where: { sourceId: igSourceId },
            data:  { jadeSilencedAt: new Date(), jadeResumedAt: null },
          })
        } catch (e) {
          console.error('[chatwoot-webhook] Prisma silence error:', e)
        }

        // Write shared JadeSession signal so the Meta webhook also detects agent-active
        try {
          const igSession = await loadJadeSession(`ig_${igSourceId}`)
          await saveJadeSession(`ig_${igSourceId}`, {
            intent:              igSession?.intent ?? null,
            lastMessage:         igSession?.lastMessage ?? '',
            conversationHistory: igSession?.conversationHistory ?? [],
            bookingContext:      igSession?.bookingContext ?? null,
            groupContext:        igSession?.groupContext ?? null,
            agentActive:         true,
            agentMessages: [
              ...(igSession?.agentMessages ?? []),
              ...(content ? [{ content, agentName, timestamp: new Date().toISOString() }] : []),
            ],
          })
        } catch (e) {
          console.error('[chatwoot-webhook] IG JadeSession silence error:', e)
        }
      }

      console.log('[chatwoot-webhook] Human agent message processed:', {
        conversationId:      convId,
        agentName,
        jadeSessionSilenced: true,
        messageBuffered:     !!content,
        sourceIdFromPayload: payload.conversation?.contact_inbox?.source_id ?? null,
        sourceIdResolved:    igSourceId,
      })
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

  // ── Offline-staff alert: notify the assigned agent by email when they are ──
  // inactive and a client messages them. Only fires on inbound messages.
  // Non-blocking — a failure here must never interrupt the webhook response.
  if (direction === 'inbound') {
    const OFFLINE_THRESHOLD_MS   = 5  * 60 * 1000  // 5 minutes with no admin activity
    const DEDUP_WINDOW_MS        = 30 * 60 * 1000  // suppress repeat alerts for 30 min

    const BASE_URL = process.env.NEXTAUTH_URL || 'https://walztravels.com'

    void (async () => {
      try {
        // Find the Prisma Lead by phone number to get assignedToId
        const sender      = payload.sender ?? payload.contact
        const rawPhone    = sender?.phone_number
          ?? payload.conversation?.contact_inbox?.source_id
        if (!rawPhone) return

        const normalizedPhone = rawPhone.replace(/\D/g, '')
        const prismaLead = await prisma.lead.findFirst({
          where: {
            OR: [
              { whatsapp: rawPhone },
              { whatsapp: normalizedPhone },
              { whatsapp: { endsWith: normalizedPhone.slice(-9) } },
            ],
            assignedToId: { not: null },
          },
          select: {
            id:                   true,
            name:                 true,
            lastOfflineNotifiedAt: true,
            assignedToId:         true,
          },
        })
        if (!prismaLead?.assignedToId) return

        // De-duplicate: skip if we already notified for this lead within 30 min
        const alreadyNotified = prismaLead.lastOfflineNotifiedAt
          && (Date.now() - prismaLead.lastOfflineNotifiedAt.getTime()) < DEDUP_WINDOW_MS
        if (alreadyNotified) return

        // Check if the assigned staff member is currently active
        const assignedStaff = await prisma.staff.findUnique({
          where:  { id: prismaLead.assignedToId },
          select: { id: true, name: true, email: true, isActive: true, lastActiveAt: true },
        })
        if (!assignedStaff?.isActive || !assignedStaff.email) return

        const isOffline = !assignedStaff.lastActiveAt
          || (Date.now() - assignedStaff.lastActiveAt.getTime()) > OFFLINE_THRESHOLD_MS
        if (!isOffline) return

        // All checks passed — send the alert
        const clientName    = sender?.name ?? prismaLead.name ?? 'A client'
        const messagePreview = (payload.content ?? '').slice(0, 120)
        const staffFirstName = assignedStaff.name.split(' ')[0]
        const followUpUrl    = `${BASE_URL}/admin/my-followups`

        await getResend().emails.send({
          from:    'Walz Staff <contact@walztravels.com>',
          to:      assignedStaff.email,
          subject: `💬 ${clientName} just messaged you on WhatsApp`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0B1F3A;padding:32px;border-radius:12px">
              <p style="color:#C9A84C;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px">Walz Travels</p>
              <h2 style="color:#ffffff;font-size:20px;font-weight:600;margin:0 0 8px">
                New message, ${staffFirstName}
              </h2>
              <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 8px">
                <strong style="color:#f8fafc">${clientName}</strong> just sent you a WhatsApp message while you were away:
              </p>
              ${messagePreview ? `
              <div style="background:#0d2442;border-left:3px solid #C9A84C;padding:12px 16px;border-radius:4px;margin:0 0 24px">
                <p style="color:#cbd5e1;font-size:14px;margin:0;font-style:italic">"${messagePreview}${(payload.content ?? '').length > 120 ? '…' : ''}"</p>
              </div>` : ''}
              <a href="${followUpUrl}"
                 style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">
                View My Leads →
              </a>
              <p style="color:#475569;font-size:12px;margin:24px 0 0">
                This is an automated notification. Replies go to contact@walztravels.com
              </p>
            </div>
          `,
        })

        // Stamp the lead so duplicates within the next 30 min are suppressed
        await prisma.lead.update({
          where: { id: prismaLead.id },
          data:  { lastOfflineNotifiedAt: new Date() },
        })

        console.log('[cw-hook] offline-alert sent to', assignedStaff.email, 'for lead', prismaLead.id)
      } catch (e) {
        console.error('[cw-hook] offline-alert failed (non-blocking):', e instanceof Error ? e.message : e)
      }
    })()
  }
  // ── End offline-staff alert ───────────────────────────────────────────────
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
  id?:             number
  status?:         string
  channel?:        string
  messages_count?: number
  contact_inbox?: {
    source_id?:  string
    contact_id?: number
  }
  meta?: {
    sender?:   CWContact
    channel?:  string
    assignee?: { id?: number; name?: string } | null
  }
}

interface CWPayload {
  event:              string
  id?:                number
  status?:            string
  channel?:           string
  content?:           string
  message_type?:      number // 0=incoming, 1=outgoing, 2=activity
  private?:           boolean
  content_attributes?: Record<string, unknown>  // jade_ai:true marks Jade's own messages
  attachments?:       Array<{ type: string; data_url?: string; file_name?: string }>
  contact?:           CWContact
  sender?:            CWContact & { type?: string }
  conversation?:      CWConversation
  meta?: {
    sender?:  CWContact
    channel?: string
  }
}
