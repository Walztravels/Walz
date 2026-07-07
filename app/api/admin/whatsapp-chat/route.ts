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

// Find the WhatsApp / Twilio inbox in Chatwoot
async function getWhatsAppInboxId(): Promise<number | null> {
  const res  = await cw('/inboxes')
  if (!res.ok) return null
  const data = await res.json() as { payload: Array<{ id: number; name: string; channel_type: string }> }
  const inbox = data.payload?.find(i =>
    i.channel_type === 'Channel::TwilioSms' ||
    i.channel_type === 'Channel::Whatsapp'  ||
    i.name.toLowerCase().includes('whatsapp') ||
    i.name.toLowerCase().includes('twilio')
  )
  return inbox?.id ?? null
}

// Find or create a Chatwoot contact by phone number
async function findOrCreateContact(name: string, phone: string): Promise<number | null> {
  // Normalise phone: ensure it starts with +
  const normalised = phone.startsWith('+') ? phone : `+${phone}`

  // Search first
  const search = await cw(`/contacts/search?q=${encodeURIComponent(normalised)}&include_contacts=true`)
  if (search.ok) {
    const sd = await search.json() as { payload: Array<{ id: number; phone_number: string }> }
    const match = sd.payload?.find(c => c.phone_number === normalised)
    if (match) return match.id
  }

  // Create new contact
  const create = await cw('/contacts', {
    method: 'POST',
    body: JSON.stringify({ name, phone_number: normalised }),
  })
  if (!create.ok) return null
  const cd = await create.json() as { id?: number }
  return cd.id ?? null
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
  const inboxId = await getWhatsAppInboxId()
  if (!inboxId) {
    return NextResponse.json({ error: 'No WhatsApp inbox found in Chatwoot. Connect a Twilio/WhatsApp inbox first.' }, { status: 422 })
  }

  // Find or create Chatwoot contact
  const contactId = await findOrCreateContact(clientName, clientPhone)
  if (!contactId) {
    return NextResponse.json({ error: 'Failed to create Chatwoot contact' }, { status: 500 })
  }

  // Check if there is already an open conversation with this contact in the WhatsApp inbox
  const existing = await cw(`/contacts/${contactId}/conversations`)
  if (existing.ok) {
    const ed = await existing.json() as { payload: Array<{ id: number; status: string; inbox_id: number }> }
    const open = ed.payload?.find(c => c.inbox_id === inboxId && c.status === 'open')
    if (open) {
      return NextResponse.json({ conversationId: open.id, contactId, reused: true })
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
  return NextResponse.json({ conversationId: cd.id, contactId, reused: false })
}
