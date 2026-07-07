import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const CW_BASE    = process.env.CHATWOOT_BASE_URL    || 'https://chatwoot-production-d486.up.railway.app'
const CW_TOKEN   = process.env.CHATWOOT_ADMIN_TOKEN!
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

// Find the WhatsApp / Twilio inbox in Chatwoot.
// Pin a specific inbox by setting CHATWOOT_WHATSAPP_INBOX_ID env var.
async function getWhatsAppInbox(): Promise<CWInbox | null> {
  const pinned = process.env.CHATWOOT_WHATSAPP_INBOX_ID
  const inboxes = await getAllInboxes()
  console.log('[whatsapp-chat] available inboxes:', JSON.stringify(inboxes.map(i => ({ id: i.id, name: i.name, channel_type: i.channel_type }))))
  if (pinned) {
    const found = inboxes.find(i => i.id === Number(pinned))
    if (found) { console.log('[whatsapp-chat] using pinned inbox:', found); return found }
  }
  const inbox = inboxes.find(i =>
    i.channel_type === 'Channel::TwilioSms' ||
    i.channel_type === 'Channel::Whatsapp'  ||
    i.name.toLowerCase().includes('whatsapp') ||
    i.name.toLowerCase().includes('twilio')
  )
  console.log('[whatsapp-chat] auto-detected inbox:', inbox)
  return inbox ?? null
}

// GET /api/admin/whatsapp-chat — list all Chatwoot inboxes for diagnostics
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const inboxes = await getAllInboxes()
  const pinned  = process.env.CHATWOOT_WHATSAPP_INBOX_ID
  return NextResponse.json({ inboxes, pinned: pinned ?? null })
}

// Find or create a Chatwoot contact by phone number
// Returns [contactId, errorMessage]
async function findOrCreateContact(name: string, phone: string): Promise<[number | null, string | null]> {
  // Normalise phone: strip non-digits, handle local formats
  let digits = phone.replace(/\D/g, '')
  // Strip leading trunk prefix (0) only if not already an international number
  // e.g. "08138666875" → "2348138666875" is caller's responsibility via the UI
  // Just ensure we have a + prefix
  const normalised = `+${digits}`

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
    // Chatwoot may nest the id several ways
    const id = (raw.id as number | undefined)
      ?? ((raw.payload as Record<string, unknown> | undefined)?.id as number | undefined)
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
// Creates a new Chatwoot WhatsApp conversation for a portal application
export async function POST(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    applicationId: string
    clientName:    string
    clientPhone:   string
    refNumber?:    string
  }

  const { applicationId, clientName, clientPhone, refNumber } = body
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

  // Get WhatsApp inbox
  const inbox = await getWhatsAppInbox()
  if (!inbox) {
    return NextResponse.json({ error: 'No WhatsApp inbox found in Chatwoot. Set CHATWOOT_WHATSAPP_INBOX_ID or connect a Twilio/WhatsApp inbox.' }, { status: 422 })
  }
  const inboxId = inbox.id

  // Find or create Chatwoot contact
  const [contactId, contactErr] = await findOrCreateContact(clientName, clientPhone)
  if (!contactId) {
    return NextResponse.json({ error: contactErr ?? 'Failed to create Chatwoot contact' }, { status: 500 })
  }

  // Check if there is already an open conversation with this contact in the WhatsApp inbox
  const existing = await cw(`/contacts/${contactId}/conversations`)
  if (existing.ok) {
    const ed = await existing.json() as { payload: Array<{ id: number; status: string; inbox_id: number }> }
    const open = ed.payload?.find(c => c.inbox_id === inboxId && c.status === 'open')
    if (open) {
      return NextResponse.json({ conversationId: open.id, contactId, reused: true, inboxId, inboxName: inbox.name, channelType: inbox.channel_type })
    }
  }

  // Create new conversation
  const conv = await cw('/conversations', {
    method: 'POST',
    body: JSON.stringify({
      inbox_id:   inboxId,
      contact_id: contactId,
      additional_attributes: {
        source:    'admin_portal',
        ref:       refNumber ?? applicationId,
      },
    }),
  })
  if (!conv.ok) {
    const err = await conv.json().catch(() => ({})) as { message?: string }
    return NextResponse.json({ error: err.message ?? 'Failed to create conversation' }, { status: 500 })
  }
  const cd = await conv.json() as { id: number }
  return NextResponse.json({ conversationId: cd.id, contactId, reused: false, inboxId, inboxName: inbox.name, channelType: inbox.channel_type })
}
