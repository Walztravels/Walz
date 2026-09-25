/**
 * Twilio inbound SMS webhook (A2P CUSTOMER_CARE V1). SMS only — no WhatsApp.
 *
 * AUTHORITATIVE RESPONDER: Twilio Advanced Opt-Out (Messaging Service level)
 * sends the STOP / START / HELP replies at provider level. This route NEVER
 * generates a STOP/START confirmation. It mirrors state into Walz (STOP =>
 * consent REVOKED; START/HELP => provider event only, START never grants) and
 * answers 200 with empty TwiML.
 *
 * Optional HELP fallback: only when TWILIO_SMS_APP_HELP_REPLY === '1' does a
 * HELP message get SMS_HELP_REPLY as TwiML. Default OFF so the reply
 * configured in Twilio Advanced Opt-Out is not duplicated.
 *
 * Security: fail closed without an auth token; signature validated against the
 * CANONICAL configured URL (never headers-derived). DB failure => 500 so Twilio
 * retries (idempotent). Never log bodies or full numbers.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyTwilioSignature, maskId } from '@/lib/webhooks/verify'
import { getSmsAuthToken, getSmsInboundWebhookUrl } from '@/lib/sms/config'
import { processInboundSms } from '@/lib/sms/inbound'
import { SMS_HELP_REPLY } from '@/lib/sms/help'

export const dynamic = 'force-dynamic'

function twiml(inner = '', status = 200): NextResponse {
  return new NextResponse(`<Response>${inner}</Response>`, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(req: NextRequest) {
  const authToken = getSmsAuthToken()
  if (!authToken) return new NextResponse('Forbidden', { status: 403 })

  const raw = await req.text()
  const params: Record<string, string> = {}
  try {
    for (const [k, v] of new URLSearchParams(raw)) params[k] = v
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const signature = req.headers.get('x-twilio-signature')
  if (!verifyTwilioSignature(getSmsInboundWebhookUrl(), params, signature, authToken)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const messageSid = (params.MessageSid ?? '').trim()
  const from = (params.From ?? '').trim()
  if (!messageSid || !from) return new NextResponse('Bad Request', { status: 400 })

  try {
    const result = await processInboundSms({
      messageSid,
      from,
      body: params.Body ?? '',
      optOutType: params.OptOutType ?? null,
    })
    if (!result.ok) return twiml() // not an SMS number (e.g. channel-prefixed): nothing persisted
    if (result.keywordClass === 'HELP' && process.env.TWILIO_SMS_APP_HELP_REPLY === '1') {
      return twiml(`<Message>${escapeXml(SMS_HELP_REPLY)}</Message>`)
    }
    return twiml()
  } catch {
    console.error(`[twilio-sms] inbound processing failed sid ${maskId(messageSid)}`)
    return new NextResponse('Server Error', { status: 500 })
  }
}
