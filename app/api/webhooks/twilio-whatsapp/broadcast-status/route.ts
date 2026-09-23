/**
 * app/api/webhooks/twilio-whatsapp/broadcast-status/route.ts
 *
 * WhatsApp Broadcast V1.2.1 — Twilio delivery-status callback for
 * Broadcast sends specifically. A SEPARATE endpoint from the existing
 * app/api/webhooks/twilio-whatsapp/status/route.ts (which updates
 * VisaApplicationMessage) — kept separate rather than overloaded so
 * neither feature's callback logic has to branch on which kind of send
 * produced the event. lib/whatsapp/broadcast/sender.ts passes this exact
 * route's URL as the `StatusCallback` param on every broadcast send, so
 * Twilio calls it back regardless of the account's default number-level
 * callback configuration.
 *
 * Shell (auth, form-parsing) mirrors the proven design of the sibling
 * .../status/route.ts exactly; the recipient-update logic itself lives in
 * lib/whatsapp/broadcast/status-callbacks.ts's
 * applyTwilioBroadcastStatusCallback(), which reuses the SAME forward-
 * progress + recompute-counts discipline already proven for the legacy
 * Meta version of this feature.
 */

import { NextRequest } from 'next/server'
import { verifyTwilioSignature, externalWebhookUrl } from '@/lib/webhooks/verify'
import { applyTwilioBroadcastStatusCallback } from '@/lib/whatsapp/broadcast/status-callbacks'

export const dynamic = 'force-dynamic'

// POST — Twilio message status callback for Broadcast sends.
export async function POST(req: NextRequest) {
  // Authentication (INBOX-0S.4) — same X-Twilio-Signature scheme as every
  // other Twilio webhook in this codebase; FAIL CLOSED without an auth
  // token. An unsigned or badly-signed callback is REJECTED before any
  // recipient row is ever read or written.
  const authToken = (process.env.TWILIO_AUTH_TOKEN ?? process.env.TWILIO_WEBHOOK_AUTH_TOKEN ?? '').trim()
  if (!authToken) {
    console.error('[twilio-broadcast-status] BLOCKED: TWILIO_AUTH_TOKEN not configured — failing closed')
    return new Response('', { status: 403 })
  }

  let form: URLSearchParams
  try {
    form = new URLSearchParams(await req.text())
  } catch {
    return new Response('', { status: 400 })
  }

  const url = externalWebhookUrl(
    process.env.TWILIO_BROADCAST_STATUS_WEBHOOK_URL,
    req.headers,
    '/api/webhooks/twilio-whatsapp/broadcast-status',
  )
  const params: Record<string, string> = {}
  form.forEach((v, k) => { params[k] = v })
  if (!url || !verifyTwilioSignature(url, params, req.headers.get('x-twilio-signature'), authToken)) {
    console.warn('[twilio-broadcast-status] BLOCKED: invalid X-Twilio-Signature')
    return new Response('', { status: 403 })
  }

  const messageSid = form.get('MessageSid')
  const status = form.get('MessageStatus') // queued|sent|delivered|read|failed|undelivered
  const errorCode = form.get('ErrorCode')
  const errorMessage = form.get('ErrorMessage')

  if (messageSid && status) {
    await applyTwilioBroadcastStatusCallback({
      messageSid,
      status,
      errorCode: errorCode || undefined,
      errorMessage: errorMessage || undefined,
    }).catch((e: unknown) => {
      // Never let a broadcast-status failure change the response Twilio
      // receives — it would only cause pointless retries.
      console.warn('[twilio-broadcast-status] apply failed:', e instanceof Error ? e.message : e)
    })
  }

  return new Response('', { status: 200 })
}
