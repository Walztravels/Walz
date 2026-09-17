/**
 * app/api/webhooks/meta/route.ts
 *
 * Meta Webhook — handles Facebook Messenger and Instagram DM events.
 *
 * GET  — webhook verification (Meta pings this to confirm the endpoint)
 * POST — incoming messages from Facebook pages and Instagram accounts
 *
 * Deploy this first, then register the URL in Meta Developer Console:
 *   https://developers.facebook.com → your app → Webhooks
 *   Callback URL: https://www.walztravels.com/api/webhooks/meta
 *   Verify Token: META_VERIFY_TOKEN env var value
 */

import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getResend } from '@/lib/email-internal'
import { loadJadeSession, saveJadeSession } from '@/lib/jade-session'
import { getSupabaseAdmin } from '@/lib/supabase'
import { resolveInstagramPostContext } from '@/lib/instagram-post'
import { botChatwootOrNull, logChatwootUnconfigured } from '@/lib/chatwoot/config'
import { verifyMetaSignature, maskId } from '@/lib/webhooks/verify'
import { claimWebhookEvent, releaseWebhookEvent } from '@/lib/webhooks/idempotency'

const CHATWOOT_BASE  = 'https://chat.walztravels.com'
const CHATWOOT_TOKEN = botChatwootOrNull()?.token ?? ''   // fail closed (INBOX-0S.1)
const ACCOUNT_ID     = '1'

export const dynamic = 'force-dynamic'

// ── GET — Meta webhook verification ──────────────────────────────────────────
export async function GET(req: Request) {
  const url       = new URL(req.url)
  const mode      = url.searchParams.get('hub.mode')
  const token     = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  console.log('[meta-webhook] Verification attempt:', { mode, token: token?.slice(0, 6) + '…' })

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('[meta-webhook] Verified successfully')
    return new Response(challenge!, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  console.warn('[meta-webhook] Verification FAILED — check META_VERIFY_TOKEN env var')
  return new Response('Forbidden', { status: 403 })
}

// ── POST — Incoming messages ──────────────────────────────────────────────────
export async function POST(req: Request) {
  // ── Authentication (INBOX-0S.4) — X-Hub-Signature-256 over the raw body.
  // FAIL CLOSED: without META_APP_SECRET nothing is processed.
  const rawBody = await req.text()
  const appSecret = (process.env.META_APP_SECRET ?? '').trim()
  if (!appSecret) {
    console.error('[meta-webhook] BLOCKED: META_APP_SECRET not configured — failing closed')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }
  if (!verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret)) {
    console.warn('[meta-webhook] BLOCKED: invalid X-Hub-Signature-256')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: { entry?: Array<{ id?: string; messaging?: MessagePayload[]; changes?: Array<{ field?: string; value?: IGValue }> }> }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })   // permanent
  }

  // Never log the body — it carries client messages and identifiers.
  const supabase = getSupabaseAdmin()
  let transientFailure = false

  // Idempotency (0S.4): each provider message id (mid) is claimed before
  // processing. A Meta retry or concurrent duplicate cannot re-append the
  // message or re-trigger a Jade reply. On a processing failure the claim
  // is released and we return 500 so Meta's retry can safely reprocess.
  const processOnce = async (eventId: string | undefined, kind: string, run: () => Promise<void>) => {
    let claimed = false
    if (eventId) {
      const claim = await claimWebhookEvent(supabase, 'meta', eventId)
      if (claim === 'duplicate') {
        console.log(`[meta-webhook] duplicate ${kind} skipped`, { eventId: maskId(eventId) })
        return
      }
      claimed = claim === 'claimed'
    }
    try {
      await run()
    } catch (error) {
      console.error(`[meta-webhook] ${kind} processing error:`, error instanceof Error ? error.message : error)
      if (claimed && eventId) await releaseWebhookEvent(supabase, 'meta', eventId)
      transientFailure = true
    }
  }

  for (const entry of body.entry ?? []) {

    // ── Facebook Messenger messages ───────────────────────────────────────
    for (const messaging of entry.messaging ?? []) {
      if (messaging.message && !messaging.message.is_echo) {
        await processOnce(messaging.message.mid, 'fb-message', () => handleFacebookMessage(messaging))
      }
    }

    // ── Instagram DM messages ─────────────────────────────────────────────
    for (const change of entry.changes ?? []) {
      if (change.field === 'messages' && change.value?.messages) {
        // entry.id is the Walz IG Business Account ID — always reliable.
        // change.value.id is the same value but typed optional; fall back to entry.id.
        const walzIgId: string | undefined =
          change.value.id ?? entry.id ?? process.env.INSTAGRAM_ACCOUNT_ID
        for (const msg of change.value.messages) {
          const eventId = msg.id ?? msg.mid
          if (walzIgId && msg.from?.id === walzIgId) {
            // Echo: Walz's own IG account sent a DM — human agent replied from IG app
            const value = change.value
            await processOnce(eventId, 'ig-agent-echo', () => silenceJadeOnIgAgent(msg, value))
          } else {
            const value = change.value
            await processOnce(eventId, 'ig-message', () => handleInstagramMessage(msg, value))
          }
        }
      }
    }
  }

  // Transient failures return 500 so Meta retries; idempotency claims make
  // that retry safe. Success and pure-duplicate batches return 200.
  return transientFailure
    ? NextResponse.json({ status: 'retry' }, { status: 500 })
    : NextResponse.json({ status: 'ok' })
}

// ── Facebook Messenger handler ────────────────────────────────────────────────
async function handleFacebookMessage(messaging: MessagePayload) {
  const senderId    = messaging.sender.id
  const messageText = messaging.message?.text ?? '[attachment]'
  const timestamp   = new Date(messaging.timestamp * 1000).toISOString()

  // Fetch sender profile from Graph API
  let senderName = 'Facebook User'
  try {
    const res     = await fetch(
      `https://graph.facebook.com/v18.0/${senderId}?fields=first_name,last_name&access_token=${process.env.META_PAGE_ACCESS_TOKEN}`
    )
    const profile = await res.json() as { first_name?: string; last_name?: string }
    if (profile.first_name) {
      senderName = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
    }
  } catch (e) {
    console.error('[meta-webhook] FB profile fetch error:', e)
  }

  await upsertLead({
    source:    'facebook',
    sourceId:  senderId,
    name:      senderName,
    message:   messageText,
    timestamp,
    platform:  'Facebook',
  })
}

// ── Instagram DM handler ──────────────────────────────────────────────────────
async function handleInstagramMessage(
  msg:   IGMessage,
  value: IGValue,
) {
  const senderId = msg.from?.id
  if (!senderId) return

  const username    = msg.from?.username ?? 'instagram_user'
  const messageText = msg.text ?? '[attachment]'
  const timestamp   = new Date(parseInt(msg.timestamp ?? '0') * 1000).toISOString()

  // Resolve post context from attachment or ad referral (non-blocking, best-effort)
  const postCtx = await resolveInstagramPostContext(
    msg.attachments,
    msg.referral ?? value.referral,
  ).catch(() => null)

  await upsertLead({
    source:            'instagram',
    sourceId:          senderId,
    name:              '@' + username,
    instagramUsername: username,
    message:           messageText,
    timestamp,
    platform:          'Instagram',
    postContext:       postCtx?.summary ?? undefined,
  })
}

// ── Upsert lead + trigger Jade ────────────────────────────────────────────────
async function upsertLead(params: {
  source:             string
  sourceId:           string
  name:               string
  instagramUsername?: string
  message:            string
  timestamp:          string
  platform:           string
  postContext?:       string
}) {
  const { source, sourceId, name, instagramUsername, message, timestamp, platform, postContext } = params

  const newMsg: ConversationMessage = { role: 'client', message, timestamp }

  // Look up by source + sourceId
  const existing = await prisma.lead.findFirst({
    where: { source, sourceId },
  })

  let lead: Awaited<ReturnType<typeof prisma.lead.findFirst>>

  if (existing) {
    const conversation: ConversationMessage[] = [...((existing.conversation as unknown as ConversationMessage[]) ?? []), newMsg]

    lead = await prisma.lead.update({
      where: { id: existing.id },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conversation: conversation as any,
        lastMessage:   message,
        lastMessageAt: new Date(timestamp),
        isRead:        false,
      },
    })

    await sendJadeReply(lead as Lead, message, source, postContext)

  } else {
    lead = await prisma.lead.create({
      data: {
        name,
        source,
        sourceId,
        instagramUsername: instagramUsername ?? null,
        service:           'Other',
        whatsapp:          null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conversation:      [newMsg] as any,
        lastMessage:       message,
        lastMessageAt:     new Date(timestamp),
        isRead:            false,
        jadeActive:        true,
        assignedTo:        'Glory',
        platform,
        status:            'New',
      },
    })

    await sendJadeReply(lead as Lead, message, source, postContext)
  }

  // Admin notification (non-fatal if it fails)
  await prisma.notification
    .create({
      data: {
        type:    `new_${source}_message`,
        title:   `New ${platform} message`,
        message: `${name}: ${message.substring(0, 80)}`,
        read:    false,
      },
    })
    .catch(err => console.error('[meta-webhook] Notification create error:', err))
}

// ── Silence Jade when agent replies from IG app ────────────────────────────────
async function silenceJadeOnIgAgent(msg: IGMessage, value: IGValue) {
  // When Walz sends from IG app, msg.to.data[0].id is the customer's IG ID.
  // value.recipient_id would be Walz's own ID — wrong fallback, so we don't use it.
  const customerId: string | undefined = msg.to?.data?.[0]?.id

  if (!customerId) {
    console.warn('[meta-webhook] silenceJadeOnIgAgent: could not determine customer ID')
    return
  }

  try {
    await prisma.lead.updateMany({
      where: { source: 'instagram', sourceId: customerId },
      data:  { jadeSilencedAt: new Date(), jadeResumedAt: null },
    })
    console.log(`[meta-webhook] Jade silenced — agent replied from IG app to ${maskId(customerId)}`)
  } catch (e) {
    console.error('[meta-webhook] silenceJadeOnIgAgent error:', e)
  }

  // Write a shared JadeSession signal (keyed by ig_<PSID>) so the bot route
  // and Chatwoot webhook can also detect agent-active state without querying Prisma.
  const content = msg.text
  try {
    const existing = await loadJadeSession(`ig_${customerId}`)
    await saveJadeSession(`ig_${customerId}`, {
      intent:              existing?.intent ?? null,
      lastMessage:         existing?.lastMessage ?? '',
      conversationHistory: existing?.conversationHistory ?? [],
      bookingContext:      existing?.bookingContext ?? null,
      groupContext:        existing?.groupContext ?? null,
      agentActive:         true,
      agentMessages: [
        ...(existing?.agentMessages ?? []),
        ...(content ? [{ content, agentName: 'Agent', timestamp: new Date().toISOString() }] : []),
      ],
    })
  } catch (e) {
    console.error('[meta-webhook] silenceJadeOnIgAgent JadeSession error:', e)
  }
}

// ── Check Chatwoot API for human agent activity in this lead's conversation ────
async function hasAgentRepliedInChatwoot(sourceId: string): Promise<boolean> {
  if (!CHATWOOT_TOKEN) { logChatwootUnconfigured('meta-webhook agent check'); return false }
  try {
    // Path 1: look up Chatwoot conversation ID from Supabase leads table.
    // The Chatwoot general webhook stores the PSID in whatsapp_number when
    // it processes Instagram inbox messages (no phone/email → uses source_id as phone).
    const supabase = getSupabaseAdmin()
    const { data: supaLead } = await supabase
      .from('leads')
      .select('chatwoot_conversation_id')
      .eq('whatsapp_number', sourceId)
      .not('chatwoot_conversation_id', 'is', null)
      .maybeSingle()

    const convId = supaLead?.chatwoot_conversation_id
    if (convId) {
      const res = await fetch(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${convId}/messages`,
        { headers: { api_access_token: CHATWOOT_TOKEN }, signal: AbortSignal.timeout(3000) },
      )
      if (res.ok) {
        const data = await res.json() as { payload?: Array<{ message_type?: number; content_attributes?: { jade_ai?: boolean }; sender?: { type?: string } }> }
        const msgs = data.payload ?? []
        if (msgs.some(m => m.message_type === 1 && m.sender?.type === 'user')) {
          return true
        }
      }
    }

    // Path 2: search Chatwoot contacts by identifier (PSID) directly
    const searchRes = await fetch(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search?q=${encodeURIComponent(sourceId)}&page=1`,
      { headers: { api_access_token: CHATWOOT_TOKEN }, signal: AbortSignal.timeout(3000) },
    )
    if (!searchRes.ok) return false

    const searchData = await searchRes.json() as { payload?: { contacts?: Array<{ id: number; identifier?: string }> } }
    const contact = (searchData.payload?.contacts ?? []).find(c => c.identifier === sourceId)
    if (!contact?.id) return false

    const convsRes = await fetch(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/${contact.id}/conversations`,
      { headers: { api_access_token: CHATWOOT_TOKEN }, signal: AbortSignal.timeout(3000) },
    )
    if (!convsRes.ok) return false

    const convsData = await convsRes.json() as { payload?: Array<{ id: number; messages?: Array<{ message_type?: number; content_attributes?: { jade_ai?: boolean }; sender?: { type?: string } }> }> }
    const convs = (convsData.payload ?? []).sort((a, b) => b.id - a.id)
    return convs.slice(0, 1).some(conv =>
      (conv.messages ?? []).some(m =>
        m.message_type === 1 && m.sender?.type === 'user'
      )
    )
  } catch {
    return false
  }
}

// ── Jade auto-reply ───────────────────────────────────────────────────────────
async function sendJadeReply(lead: Lead, userMessage: string, source: string, postContext?: string) {
  if (lead.jadeActive === false) return

  // Check shared JadeSession signal (set by bot route, Chatwoot webhook, or silenceJadeOnIgAgent)
  if (lead.sourceId) {
    const igSession = await loadJadeSession(`ig_${lead.sourceId}`).catch(() => null)
    if (igSession?.agentActive === true) {
      console.log(`[meta-webhook] JadeSession agentActive=true for ig_${maskId(lead.sourceId)} — silenced`)
      return
    }

    // API fallback: check Chatwoot conversation for human agent messages
    const agentActive = await hasAgentRepliedInChatwoot(lead.sourceId)
    if (agentActive) {
      // Cache result in JadeSession so we don't re-check every message
      const igSession2 = await loadJadeSession(`ig_${lead.sourceId}`).catch(() => null)
      await saveJadeSession(`ig_${lead.sourceId}`, {
        intent:              igSession2?.intent ?? null,
        lastMessage:         igSession2?.lastMessage ?? '',
        conversationHistory: igSession2?.conversationHistory ?? [],
        bookingContext:      igSession2?.bookingContext ?? null,
        groupContext:        igSession2?.groupContext ?? null,
        agentActive:         true,
        agentMessages:       igSession2?.agentMessages ?? [],
      }).catch(() => {})
      console.log(`[meta-webhook] Agent detected via Chatwoot API for ig_${maskId(lead.sourceId)} — silenced`)
      return
    }
  }

  // Silence check: human agent took over within last 30 minutes
  if (lead.jadeSilencedAt) {
    const minutesSince = (Date.now() - new Date(lead.jadeSilencedAt).getTime()) / 60000
    if (minutesSince < 30) {
      console.log(`[meta-webhook] Jade silenced on lead ${lead.id} — agent active (jadeSilencedAt)`)
      return
    }
    // Auto-resume: silence window expired
    await prisma.lead.update({
      where: { id: lead.id },
      data:  { jadeResumedAt: new Date() },
    })
    console.log(`[meta-webhook] Jade auto-resumed on lead ${lead.id}`)
  }

  try {
    const { getJadeResponse } = await import('@/lib/jade-messaging')

    const { response, isB2B } = await getJadeResponse(
      userMessage,
      (lead.conversation as ConversationMessage[]) ?? [],
      source === 'instagram' ? 'Instagram' : 'Facebook Messenger',
      lead.name,
      postContext,
    )

    // B2B: tag lead + notify the business development team
    if (isB2B) {
      const platform = source === 'instagram' ? 'Instagram' : 'Facebook'
      const companyMatch =
        userMessage.match(/([A-Z][a-zA-Z ]+(?:Tourism|Travel|Agency|Tours|Corp|Ltd|Inc|LLC|Group))/)?.[1]
        ?? lead.name

      await prisma.lead.update({
        where: { id: lead.id },
        data:  { service: 'Corporate Travel' },
      }).catch(e => console.error('[meta-webhook] B2B tag error:', e))

      getResend().emails.send({
        from:    'Jade AI <contact@walztravels.com>',
        to:      'contact@walztravels.com',
        subject: `🤝 B2B Partnership Inquiry — ${companyMatch} via ${platform}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px">
          <h2 style="color:#0B1F3A">🤝 B2B Partnership Inquiry</h2>
          <p><strong>Company:</strong> ${companyMatch}</p>
          <p><strong>Platform:</strong> ${platform}</p>
          <p><strong>Message:</strong><br><em>${userMessage}</em></p>
          <p>Jade has responded professionally. Log in to Chatwoot or the admin panel to follow up.</p>
          <p style="color:#6B7280;font-size:12px">Lead tagged as: Corporate Travel</p>
        </div>`,
      }).catch(e => console.error('[meta-webhook] B2B email error:', e))
    }

    // Send reply via Graph API
    const accessToken = source === 'instagram'
      ? process.env.INSTAGRAM_ACCESS_TOKEN
      : process.env.META_PAGE_ACCESS_TOKEN

    if (accessToken) {
      const sendRes = await fetch('https://graph.facebook.com/v18.0/me/messages', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          recipient: { id: lead.sourceId },
          message:   { text: response },
        }),
      })

      if (!sendRes.ok) {
        const err = await sendRes.text()
        console.error('[meta-webhook] Graph API send error:', err)
      }
    } else {
      console.warn('[meta-webhook] No access token for', source)
    }

    // Append Jade reply to conversation
    const updatedConv: ConversationMessage[] = [
      ...((lead.conversation as unknown as ConversationMessage[]) ?? []),
      { role: 'jade', message: response, timestamp: new Date().toISOString() },
    ]

    await prisma.lead.update({
      where: { id: lead.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data:  { conversation: updatedConv as any },
    })

  } catch (error) {
    console.error('[meta-webhook] Jade reply error:', error)
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MessagePayload {
  sender:    { id: string }
  recipient: { id: string }
  timestamp: number
  message?: { text?: string; is_echo?: boolean; mid?: string }
}

interface IGMessage {
  id?:          string      // IG message id (dedupe key)
  mid?:         string
  from?:        { id?: string; username?: string }
  to?:          { data?: Array<{ id: string }> }
  text?:        string
  timestamp?:   string
  attachments?: Array<{
    type:    string
    payload: { url?: string; title?: string; id?: string }
  }>
  referral?: {
    ref?:    string
    source?: string
    type?:   string
    ad_id?:  string
    ads_context_data?: {
      photo_url?:    string
      product_name?: string
      ad_title?:     string
    }
  }
}

interface IGValue {
  id?:           string
  recipient_id?: string
  messages?:     IGMessage[]
  referral?: {
    ref?:    string
    source?: string
    type?:   string
    ad_id?:  string
    ads_context_data?: {
      photo_url?:    string
      product_name?: string
      ad_title?:     string
    }
  }
}

interface ConversationMessage {
  role:      'client' | 'jade'
  message:   string
  timestamp: string
}

// Minimal Lead type matching Prisma output
interface Lead {
  id:              string
  name:            string
  sourceId:        string | null
  jadeActive:      boolean
  jadeSilencedAt:  Date | null
  jadeResumedAt:   Date | null
  conversation:    unknown
}
