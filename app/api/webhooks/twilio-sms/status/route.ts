import { NextRequest } from 'next/server'
import { verifyTwilioSignature, maskId } from '@/lib/webhooks/verify'
import { getSmsAuthToken, getSmsStatusWebhookUrl } from '@/lib/sms/config'
import { applySmsStatusUpdate } from '@/lib/sms/status'

export const dynamic = 'force-dynamic'

// POST — Twilio status callback for CUSTOMER_CARE SMS. FAIL CLOSED; verifies
// against the canonical configured URL (never request headers). The shared
// Messaging Service also carries WhatsApp: those callbacks are ignored here.
export async function POST(req: NextRequest) {
  const authToken = getSmsAuthToken()
  if (!authToken) {
    console.error('[sms-status] BLOCKED: auth token not configured')
    return new Response('', { status: 403 })
  }

  let form: URLSearchParams
  try {
    form = new URLSearchParams(await req.text())
  } catch {
    return new Response('', { status: 400 })
  }
  const params: Record<string, string> = {}
  form.forEach((v, k) => { params[k] = v })

  if (!verifyTwilioSignature(getSmsStatusWebhookUrl(), params, req.headers.get('x-twilio-signature'), authToken)) {
    console.warn('[sms-status] BLOCKED: invalid signature')
    return new Response('', { status: 403 })
  }

  const sid = params.MessageSid
  const status = params.MessageStatus
  if (!sid || !status) return new Response('', { status: 400 })

  const isWhatsApp = (v: string | undefined) => (v ?? '').trim().toLowerCase().startsWith('whatsapp:')
  if (isWhatsApp(params.To) || isWhatsApp(params.From)) {
    return new Response('', { status: 200 })
  }

  try {
    await applySmsStatusUpdate({ messageSid: sid, status, errorCode: params.ErrorCode || null })
  } catch {
    console.error('[sms-status] DB failure', maskId(sid))
    return new Response('', { status: 500 })
  }
  return new Response('', { status: 200 })
}
