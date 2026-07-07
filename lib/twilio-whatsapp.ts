/**
 * Twilio WhatsApp helper — sends messages directly via Twilio REST API.
 *
 * Two-number routing:
 *   Nigeria clients  (+234 / 08x / 07x)  → TWILIO_WHATSAPP_NUMBER_NG  (default +2347077691701)
 *   All other clients                     → TWILIO_WHATSAPP_NUMBER_INTL (default +12317902336)
 *
 * Required env vars (add to Vercel):
 *   TWILIO_ACCOUNT_SID            — from console.twilio.com → Account Info
 *   TWILIO_AUTH_TOKEN             — from console.twilio.com → Account Info
 *
 * Optional (override default numbers):
 *   TWILIO_WHATSAPP_NUMBER_NG     — Nigeria WhatsApp sender (default: +2347077691701)
 *   TWILIO_WHATSAPP_NUMBER_INTL   — International WhatsApp sender (default: +12317902336)
 *
 * Template (enables business-initiated — works for clients who've never messaged us):
 *   TWILIO_CONTENT_TEMPLATE_SID   — HX98c6c9a03dc7155b1b743e09de56b9b2
 *                                    (walz_visa_application_greeting — submitted for approval)
 *                                    Template body:
 *                                    "Hello {{first_name}}, your visa application with Walz Travels
 *                                     (Ref: {{ref_number}}) is being processed. Our team will contact
 *                                     you shortly. How can we help? 🌍"
 *
 * Chatwoot inbox routing (add to Vercel):
 *   CHATWOOT_WHATSAPP_INBOX_ID_NG    — Chatwoot inbox for +2347077691701 (e.g. 132)
 *   CHATWOOT_WHATSAPP_INBOX_ID_INTL  — Chatwoot inbox for +12317902336
 *   CHATWOOT_WHATSAPP_INBOX_ID       — legacy fallback (single inbox mode)
 */

const TWILIO_SID      = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN    = process.env.TWILIO_AUTH_TOKEN
const TEMPLATE_SID    = process.env.TWILIO_CONTENT_TEMPLATE_SID

const NG_FROM   = process.env.TWILIO_WHATSAPP_NUMBER_NG   || '+2347077691701'
const INTL_FROM = process.env.TWILIO_WHATSAPP_NUMBER_INTL || '+12317902336'

/** Returns true if the phone belongs to Nigeria (starts with +234, 234, 0 local) */
export function isNigeriaPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('234') || (digits.length === 11 && digits.startsWith('0'))
}

/** Pick the correct FROM number based on the client's phone country */
export function getWhatsAppSender(clientPhone: string): string {
  return isNigeriaPhone(clientPhone) ? NG_FROM : INTL_FROM
}

/** Normalise any phone to E.164, auto-expanding Nigeria local numbers */
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 11) return `+234${digits.slice(1)}`
  if (digits.startsWith('234')) return `+${digits}`
  return `+${digits}`
}

export function twilioConfigured(): boolean {
  return !!(TWILIO_SID && TWILIO_TOKEN)
}

export function twilioTemplateConfigured(): boolean {
  return !!(TWILIO_SID && TWILIO_TOKEN && TEMPLATE_SID)
}

export interface TwilioSendResult {
  ok:           boolean
  sid?:         string
  status?:      string
  error?:       string
  usedTemplate: boolean
  fromNumber?:  string
}

/**
 * Send a WhatsApp message via Twilio.
 *
 * Automatically picks the Nigeria sender for +234 numbers,
 * the international sender for all others.
 *
 * - Template configured (TWILIO_CONTENT_TEMPLATE_SID set):
 *   sends Meta-approved template → works even for brand-new clients.
 *   Variables: {{first_name}} = clientName, {{ref_number}} = refNumber
 *
 * - No template:
 *   sends free-form `body` → only reaches clients who messaged us within 24h.
 */
export async function sendWhatsAppViaTwilio(
  toPhone:    string,
  clientName: string,
  refNumber:  string,
  body:       string,
): Promise<TwilioSendResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    return {
      ok:           false,
      error:        'Twilio credentials not configured — add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to Vercel env vars',
      usedTemplate: false,
    }
  }

  const to         = normalisePhone(toPhone)
  const fromNumber = getWhatsAppSender(toPhone)

  const params = new URLSearchParams()
  params.set('From', `whatsapp:${fromNumber}`)
  params.set('To',   `whatsapp:${to}`)

  const usedTemplate = !!TEMPLATE_SID
  if (usedTemplate) {
    params.set('ContentSid', TEMPLATE_SID!)
    // Variable names must match the template definition exactly
    params.set('ContentVariables', JSON.stringify({ first_name: clientName, ref_number: refNumber }))
  } else {
    params.set('Body', body)
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method:  'POST',
      headers: {
        Authorization:   `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  )

  const data = await res.json() as { sid?: string; status?: string; message?: string; error_message?: string }

  if (!res.ok) {
    console.error('[twilio-wa] send failed:', res.status, JSON.stringify(data))
    return {
      ok:           false,
      error:        data.message ?? data.error_message ?? `Twilio error ${res.status}`,
      usedTemplate,
      fromNumber,
    }
  }

  console.log('[twilio-wa] sent:', data.sid, data.status, `from ${fromNumber}`, usedTemplate ? '(template)' : '(free-form)')
  return { ok: true, sid: data.sid, status: data.status, usedTemplate, fromNumber }
}
