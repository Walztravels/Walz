import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyTwilioSignature, externalWebhookUrl } from '@/lib/webhooks/verify'

export const dynamic = 'force-dynamic'

// Delivery statuses only move forward; an out-of-order or retried callback
// must not downgrade e.g. 'read' back to 'sent'. 'failed'/'undelivered'
// always apply (terminal).
const STATUS_RANK: Record<string, number> = { queued: 1, sent: 2, delivered: 3, read: 4 }

// POST — Twilio message status callback
// Updates the status field on VisaApplicationMessage when Twilio reports delivery.
// Set this as the "Status callback URL" in your Twilio number configuration.
export async function POST(req: NextRequest) {
  // Authentication (INBOX-0S.4) — same X-Twilio-Signature scheme as the
  // inbound webhook; FAIL CLOSED without an auth token.
  const authToken = (process.env.TWILIO_AUTH_TOKEN ?? process.env.TWILIO_WEBHOOK_AUTH_TOKEN ?? '').trim()
  if (!authToken) {
    console.error('[twilio-status] BLOCKED: TWILIO_AUTH_TOKEN not configured — failing closed')
    return new Response('', { status: 403 })
  }

  let form: URLSearchParams
  try {
    form = new URLSearchParams(await req.text())
  } catch {
    return new Response('', { status: 400 })
  }

  const url = externalWebhookUrl(process.env.TWILIO_STATUS_WEBHOOK_URL, req.headers, '/api/webhooks/twilio-whatsapp/status')
  const params: Record<string, string> = {}
  form.forEach((v, k) => { params[k] = v })
  if (!url || !verifyTwilioSignature(url, params, req.headers.get('x-twilio-signature'), authToken)) {
    console.warn('[twilio-status] BLOCKED: invalid X-Twilio-Signature')
    return new Response('', { status: 403 })
  }

  const sid    = form.get('MessageSid')
  const status = form.get('MessageStatus') // queued|sent|delivered|read|failed|undelivered

  if (sid && status) {
    const rank = STATUS_RANK[status]
    // Exclude rows already at this rank or beyond (and terminal states) so a
    // late/retried callback can only move a status forward; unknown current
    // values remain updatable. failed/undelivered are terminal: always apply.
    const where = rank
      ? {
          twilioSid: sid,
          status: { notIn: Object.keys(STATUS_RANK).filter(s => STATUS_RANK[s] >= rank).concat('failed', 'undelivered') },
        }
      : { twilioSid: sid }
    await prisma.visaApplicationMessage.updateMany({
      where,
      data:  { status },
    }).catch(() => {})
  }

  return new Response('', { status: 200 })
}
