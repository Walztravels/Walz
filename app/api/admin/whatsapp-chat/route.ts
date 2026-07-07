import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { sendWhatsAppViaTwilio, twilioConfigured, twilioTemplateConfigured, isNigeriaPhone, normalisePhone } from '@/lib/twilio-whatsapp'

export const dynamic = 'force-dynamic'

const CW_BASE    = process.env.CHATWOOT_BASE_URL    || 'https://chat.walztravels.com'
const CW_TOKEN   = process.env.CHATWOOT_ADMIN_TOKEN || process.env.CHATWOOT_API_TOKEN || '1rnd6Rp9GNVKtbJ8238Vg2S1'
const CW_ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID  || '1'

function cw(path: string, opts?: RequestInit) {
  return fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', api_access_token: CW_TOKEN, ...(opts?.headers ?? {}) },
  })
}

type CWInbox = { id: number; name: string; channel_type: string }

async function getAllInboxes(): Promise<CWInbox[]> {
  const res = await cw('/inboxes')
  if (!res.ok) return []
  const data = await res.json() as { payload: CWInbox[] }
  return data.payload ?? []
}

// Real inbox IDs (verified from Chatwoot):
//   27 — "Nigeria Whatsapp"      Channel::TwilioSms  whatsapp:+2347077691701
//   26 — "Walz Whatsapp"         Channel::TwilioSms  whatsapp:+12317902336
// Override via env vars: CHATWOOT_WHATSAPP_INBOX_ID_NG / _INTL
const DEFAULT_NG_INBOX   = 27
const DEFAULT_INTL_INBOX = 26

async function getWhatsAppInbox(clientPhone?: string): Promise<CWInbox | null> {
  const inboxes = await getAllInboxes()

  let pinnedId: number
  if (clientPhone && isNigeriaPhone(clientPhone)) {
    pinnedId = Number(process.env.CHATWOOT_WHATSAPP_INBOX_ID_NG ?? DEFAULT_NG_INBOX)
  } else {
    // International clients, or no phone provided → use INTL inbox
    pinnedId = Number(
      process.env.CHATWOOT_WHATSAPP_INBOX_ID_INTL ??
      process.env.CHATWOOT_WHATSAPP_INBOX_ID ??
      DEFAULT_INTL_INBOX,
    )
  }

  const pinned = inboxes.find(i => i.id === pinnedId)
  if (pinned) return pinned

  // Fallback: auto-detect by channel type matching Twilio WhatsApp
  return inboxes.find(i =>
    (i.channel_type === 'Channel::TwilioSms' || i.channel_type === 'Channel::Whatsapp') &&
    (i.name.toLowerCase().includes('whatsapp') || i.name.toLowerCase().includes('twilio'))
  ) ?? null
}

// GET /api/admin/whatsapp-chat — list all Chatwoot inboxes + Twilio config status
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const inboxes = await getAllInboxes()
  const pinned  = process.env.CHATWOOT_WHATSAPP_INBOX_ID
  return NextResponse.json({
    inboxes,
    pinned:            pinned ?? null,
    twilioConfigured:  twilioConfigured(),
    templateConfigured: twilioTemplateConfigured(),
    twilioNumber:      process.env.TWILIO_WHATSAPP_NUMBER || '+2347077691701',
  })
}

// Find or create a Chatwoot contact by phone number
// Returns [contactId, errorMessage]
async function findOrCreateContact(name: string, phone: string): Promise<[number | null, string | null]> {
  // Normalise to E.164 (handles local Nigerian 08x numbers → +234...)
  const normalised = normalisePhone(phone)
  const digits     = normalised.replace(/\D/g, '')

  // Search by phone number first (handles both payload shapes Chatwoot uses)
  const search = await cw(`/contacts/search?q=${encodeURIComponent(normalised)}&include_contacts=true`)
  if (search.ok) {
    const sd = await search.json() as {
      payload?: Array<{ id: number; phone_number: string }> | { contacts?: Array<{ id: number; phone_number: string }> }
    }
    const list = Array.isArray(sd.payload)
      ? sd.payload
      : (sd.payload as { contacts?: Array<{ id: number; phone_number: string }> })?.contacts ?? []
    const match = list.find((c: { phone_number: string }) => c.phone_number === normalised)
    if (match) return [match.id, null]
  }

  // Attempt to create
  const create = await cw('/contacts', {
    method: 'POST',
    body: JSON.stringify({ name, phone_number: normalised }),
  })

  if (create.ok) {
    const raw = await create.json() as Record<string, unknown>
    console.log('[whatsapp-chat] contact create response:', JSON.stringify(raw))
    // Chatwoot nests the id several ways; check all known shapes
    const payload = raw.payload as Record<string, unknown> | undefined
    const id = (raw.id as number | undefined)
      ?? (payload?.id as number | undefined)
      ?? ((payload?.contact as Record<string, unknown> | undefined)?.id as number | undefined)
      ?? ((raw.contact as Record<string, unknown> | undefined)?.id as number | undefined)
      ?? null
    return [id, id ? null : `Contact created but id not found in response: ${JSON.stringify(raw)}`]
  }

  // 422 usually means phone already taken — try searching again with just digits
  if (create.status === 422) {
    const retry = await cw(`/contacts/search?q=${encodeURIComponent(digits)}&include_contacts=true`)
    if (retry.ok) {
      const rd = await retry.json() as {
        payload?: Array<{ id: number; phone_number: string }> | { contacts?: Array<{ id: number; phone_number: string }> }
      }
      const list = Array.isArray(rd.payload)
        ? rd.payload
        : (rd.payload as { contacts?: Array<{ id: number; phone_number: string }> })?.contacts ?? []
      const match = list.find((c: { phone_number: string }) =>
        c.phone_number === normalised || c.phone_number?.replace(/\D/g, '') === digits
      )
      if (match) return [match.id, null]
    }
    const errText = await create.text().catch(() => '')
    return [null, `Phone may already exist but could not be found. Chatwoot: ${errText.slice(0, 200)}`]
  }

  const errText = await create.text().catch(() => '')
  return [null, `Chatwoot contact creation failed (${create.status}): ${errText.slice(0, 200)}`]
}

// POST /api/admin/whatsapp-chat
// Creates (or reopens) a Chatwoot WhatsApp conversation, then fires a Twilio
// direct message to ensure the client receives the first contact even when the
// 24-hour WhatsApp session has expired (requires TWILIO_CONTENT_TEMPLATE_SID).
export async function POST(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    applicationId?: string
    clientName:     string
    clientPhone:    string
    refNumber?:     string
    firstMessage?:  string  // optional custom first message body
  }

  const { applicationId, clientName, clientPhone, refNumber, firstMessage } = body
  if (!clientName || !clientPhone) {
    return NextResponse.json({ error: 'clientName and clientPhone required' }, { status: 400 })
  }

  // Persist phone number on the portal application (only when applicationId provided)
  if (applicationId) {
    await prisma.portalApplication.update({
      where: { id: applicationId },
      data:  { whatsappNumber: clientPhone },
    }).catch(() => null)
  }

  // ── 1. Get WhatsApp inbox (Nigeria clients → NG inbox, others → INTL inbox) ─
  const inbox = await getWhatsAppInbox(clientPhone)
  if (!inbox) {
    return NextResponse.json({
      error: 'No WhatsApp inbox found in Chatwoot. Set CHATWOOT_WHATSAPP_INBOX_ID or connect a Twilio/WhatsApp inbox.',
    }, { status: 422 })
  }
  const inboxId = inbox.id

  // ── 2. Find or create Chatwoot contact ────────────────────────────────────
  const [contactId, contactErr] = await findOrCreateContact(clientName, clientPhone)
  if (!contactId) {
    return NextResponse.json({ error: contactErr ?? 'Failed to create Chatwoot contact' }, { status: 500 })
  }

  // ── 3. Find existing open conversation or create one ──────────────────────
  let conversationId: number | null = null
  let reused = false

  const existing = await cw(`/contacts/${contactId}/conversations`)
  if (existing.ok) {
    const ed = await existing.json() as { payload: Array<{ id: number; status: string; inbox_id: number }> }
    // Prefer open conversation in this inbox; fall back to most recent resolved one
    const open = ed.payload?.find(c => c.inbox_id === inboxId && c.status === 'open')
    if (open) {
      conversationId = open.id
      reused         = true
    }
  }

  if (!conversationId) {
    const conv = await cw('/conversations', {
      method: 'POST',
      body:   JSON.stringify({
        inbox_id:   inboxId,
        contact_id: contactId,
        additional_attributes: { source: 'admin_portal', ref: refNumber ?? applicationId },
      }),
    })
    if (!conv.ok) {
      const err = await conv.json().catch(() => ({})) as { message?: string }
      return NextResponse.json({ error: err.message ?? 'Failed to create conversation' }, { status: 500 })
    }
    const cd = await conv.json() as { id: number }
    conversationId = cd.id
  }

  // ── 4. Send via Twilio directly (bypasses WhatsApp session restriction) ────
  // This runs alongside Chatwoot. Twilio delivers even for new/expired sessions
  // when TWILIO_CONTENT_TEMPLATE_SID is configured.
  const ref        = refNumber ?? applicationId ?? 'N/A'
  const msgBody    = firstMessage
    ?? `Hello ${clientName}, this is Walz Travels. Your visa application (Ref: ${ref}) is being processed. How can we help? 🌍`

  let twilioResult: { ok: boolean; sid?: string; status?: string; error?: string; usedTemplate: boolean } | null = null
  if (!reused) {
    // Only send the initiation message for new (not reused) conversations
    twilioResult = await sendWhatsAppViaTwilio(clientPhone, clientName, ref, msgBody)
    if (!twilioResult.ok) {
      console.warn('[whatsapp-chat] Twilio send failed (continuing with Chatwoot only):', twilioResult.error)
    }
  }

  return NextResponse.json({
    conversationId,
    contactId,
    reused,
    inboxId,
    inboxName:         inbox.name,
    channelType:       inbox.channel_type,
    twilioConfigured:  twilioConfigured(),
    templateConfigured: twilioTemplateConfigured(),
    twilioSent:        twilioResult?.ok ?? null,
    twilioUsedTemplate: twilioResult?.usedTemplate ?? null,
    twilioError:       twilioResult?.ok === false ? twilioResult.error : null,
  })
}
