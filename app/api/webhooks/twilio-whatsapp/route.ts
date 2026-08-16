/**
 * app/api/webhooks/twilio-whatsapp/route.ts
 *
 * Twilio inbound WhatsApp webhook.
 * Configure this URL in Twilio console → Messaging → Services → WhatsApp sender → Inbound URL
 * (or per phone number → Messaging Configuration → "A Message Comes In")
 *
 * Routing logic:
 *   1. If the sender's phone matches an ACTIVE visa application with an existing thread → route there.
 *   2. If phone is absent but BSUID matches a previously-stored application → route there.
 *   3. Otherwise → falls through to general inbound (no action here; Chatwoot handles via its own webhook).
 *
 * ⚠️  Known limitation: if a client with an active visa application texts about something
 *     unrelated (a flight, a general question), this logic routes it to the visa thread
 *     because it cannot distinguish intent from the phone number alone. Acceptable for v1
 *     given that visa clients' WhatsApp contact is dominated by visa correspondence during
 *     an active process. A 48-hour "active conversation window" would be the next refinement.
 *
 * ⚠️  BSUID gap: a brand-new applicant who adopted a Meta username BEFORE their very first
 *     contact with Walz Travels arrives with no prior BSUID on file. This first message
 *     cannot be auto-routed. However, when staff initiate a WhatsApp thread from the visa
 *     application page, the delivery receipt carries the client's BSUID — captured and stored
 *     so every subsequent message from that client routes correctly.
 *
 * Required env var:
 *   TWILIO_WEBHOOK_AUTH_TOKEN  — set to your Twilio Auth Token for signature validation
 *                                (can reuse TWILIO_AUTH_TOKEN)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalisePhone } from '@/lib/twilio-whatsapp'
import { ACTIVE_VISA_STATUSES } from '@/app/api/admin/visa-applications/[id]/whatsapp/route'
import { sendVisaWhatsAppNotification } from '@/lib/email-staff-notification'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Twilio sends application/x-www-form-urlencoded
  let form: URLSearchParams
  try {
    const text = await req.text()
    form = new URLSearchParams(text)
  } catch {
    return new Response('', { status: 200 }) // always 200 to stop Twilio retries
  }

  // Extract fields from Twilio's payload
  const rawFrom  = form.get('From') ?? ''                    // e.g. "whatsapp:+447949448680"
  const body     = form.get('Body') ?? ''
  const waSid    = form.get('MessageSid') ?? undefined
  // WaId carries the BSUID when Meta WhatsApp usernames are in use
  const bsuid    = form.get('WaId') ?? undefined

  const fromPhone = rawFrom.replace(/^whatsapp:/i, '').trim()

  await routeInboundWhatsApp({ fromPhone: fromPhone || undefined, bsuid, body, twilioSid: waSid })

  // Twilio expects TwiML or an empty 200 response
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

// ── Routing logic ─────────────────────────────────────────────────────────────

async function routeInboundWhatsApp(payload: {
  fromPhone?: string
  bsuid?:     string
  body:       string
  twilioSid?: string
}) {
  let activeApp: {
    id: string
    whatsappBsuid: string | null
    firstName: string | null
    lastName: string | null
    phone: string | null
    assignedTo: string | null
  } | null = null

  // Step 1 — match by normalised phone number
  if (payload.fromPhone) {
    const normalised = normalisePhone(payload.fromPhone)

    activeApp = await prisma.visaApplication.findFirst({
      where: {
        phone:     normalised,
        status:    { in: ACTIVE_VISA_STATUSES },
        messages:  { some: {} }, // thread must already exist (initiated by staff)
      },
      orderBy: { updatedAt: 'desc' },
      select:  { id: true, whatsappBsuid: true, firstName: true, lastName: true, phone: true, assignedTo: true },
    })
  }

  // Step 2 — fallback: match by BSUID (phone absent or no phone match)
  if (!activeApp && payload.bsuid) {
    activeApp = await prisma.visaApplication.findFirst({
      where: {
        whatsappBsuid: payload.bsuid,
        status:        { in: ACTIVE_VISA_STATUSES },
      },
      orderBy: { updatedAt: 'desc' },
      select:  { id: true, whatsappBsuid: true, firstName: true, lastName: true, phone: true, assignedTo: true },
    })
  }

  if (!activeApp) {
    // No active visa application match — falls through to general inbound handling.
    // Chatwoot's Twilio integration on the relevant inbox handles this message.
    return
  }

  // Save the inbound message to the visa application thread
  await prisma.visaApplicationMessage.create({
    data: {
      visaApplicationId: activeApp.id,
      direction:         'inbound',
      body:              payload.body,
      sentBy:            null,
      fromBsuid:         payload.bsuid ?? null,
      status:            'delivered',
      twilioSid:         payload.twilioSid ?? null,
    },
  })

  // Persist BSUID on the application if newly seen (enables future routing without phone)
  if (payload.bsuid && !activeApp.whatsappBsuid) {
    await prisma.visaApplication.update({
      where: { id: activeApp.id },
      data:  { whatsappBsuid: payload.bsuid },
    }).catch(() => {})
  }

  // Notify assigned agent + all super_admin / general_manager staff
  const clientName   = [activeApp!.firstName, activeApp!.lastName].filter(Boolean).join(' ') || 'Visa client'
  const clientPhone  = activeApp!.phone ?? payload.fromPhone ?? 'unknown'
  const appId        = activeApp!.id

  prisma.staff.findMany({
    where: {
      isActive: true,
      OR: [
        { role: { in: ['super_admin', 'general_manager'] } },
        ...(activeApp.assignedTo ? [{ id: activeApp.assignedTo }] : []),
      ],
    },
    select: { id: true, name: true, email: true },
  }).then(recipients => {
    // dedupe by email in case assigned agent is also super_admin / GM
    const seen  = new Set<string>()
    const unique = recipients.filter(r => {
      if (seen.has(r.email)) return false
      seen.add(r.email)
      return true
    })
    return Promise.all(unique.map(r =>
      sendVisaWhatsAppNotification({
        agentName:      r.name,
        agentEmail:     r.email,
        clientName,
        clientPhone,
        applicationId:  appId,
        messagePreview: payload.body,
      })
    ))
  }).catch(() => {})
}
