/**
 * Twilio WhatsApp helper — sends messages directly via Twilio REST API.
 *
 * Why this exists: Chatwoot's outbound channel (Channel::TwilioSms) cannot
 * initiate a new WhatsApp conversation to a client who has never messaged us,
 * because Meta requires a pre-approved template for business-initiated messages.
 * Sending via Twilio directly lets us attach a ContentSid (template) for first
 * contact, while still keeping the conversation tracked inside Chatwoot.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID          — from Twilio console
 *   TWILIO_AUTH_TOKEN           — from Twilio console
 *   TWILIO_WHATSAPP_NUMBER      — e.g. +2347077691701 (the Nigeria WhatsApp number)
 *
 * Optional (for business-initiated / new-client messages):
 *   TWILIO_CONTENT_TEMPLATE_SID — Content SID of an approved WhatsApp template,
 *                                  e.g. HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *                                  Create at console.twilio.com → Messaging → Content Template Builder
 *                                  Recommended template (Category: UTILITY):
 *                                    "Hello {{1}}, your visa application with Walz Travels
 *                                     (Ref: {{2}}) is being processed. How can we help? 🌍"
 */

const TWILIO_SID      = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN    = process.env.TWILIO_AUTH_TOKEN
const TWILIO_WA_FROM  = process.env.TWILIO_WHATSAPP_NUMBER || '+2347077691701'
const TEMPLATE_SID    = process.env.TWILIO_CONTENT_TEMPLATE_SID

export function twilioConfigured(): boolean {
  return !!(TWILIO_SID && TWILIO_TOKEN)
}

export function twilioTemplateConfigured(): boolean {
  return !!(TWILIO_SID && TWILIO_TOKEN && TEMPLATE_SID)
}

export interface TwilioSendResult {
  ok:        boolean
  sid?:      string
  status?:   string   // 'queued', 'sent', 'delivered', 'failed', etc.
  error?:    string
  usedTemplate: boolean
}

/**
 * Send a WhatsApp message via Twilio.
 *
 * - If TWILIO_CONTENT_TEMPLATE_SID is configured: sends the approved template
 *   with {{1}}=clientName, {{2}}=refNumber — works for new clients.
 * - Else: sends free-form body — only works if the client has an open 24-hour
 *   session (they messaged us within the last 24 hours).
 *
 * The `body` is used as the free-form fallback content and also appears as the
 * first Chatwoot message when we sync it there.
 */
export async function sendWhatsAppViaTwilio(
  toPhone:    string,
  clientName: string,
  refNumber:  string,
  body:       string,
): Promise<TwilioSendResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    return { ok: false, error: 'Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing)', usedTemplate: false }
  }

  // Normalise phone to E.164
  const digits = toPhone.replace(/\D/g, '')
  const to     = digits.startsWith('0') ? `+234${digits.slice(1)}` : `+${digits}`

  const params = new URLSearchParams()
  params.set('From', `whatsapp:${TWILIO_WA_FROM}`)
  params.set('To',   `whatsapp:${to}`)

  const usedTemplate = !!TEMPLATE_SID
  if (usedTemplate) {
    // Business-initiated: attach approved template + variables
    params.set('ContentSid', TEMPLATE_SID!)
    params.set('ContentVariables', JSON.stringify({ '1': clientName, '2': refNumber }))
    // MessagingServiceSid can be added here if needed
  } else {
    // Session-based (only works within 24h of client's last message)
    params.set('Body', body)
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  )

  const data = await res.json() as { sid?: string; status?: string; message?: string; error_message?: string }

  if (!res.ok) {
    console.error('[twilio-wa] send failed:', res.status, JSON.stringify(data))
    return {
      ok:    false,
      error: data.message ?? data.error_message ?? `Twilio ${res.status}`,
      usedTemplate,
    }
  }

  console.log('[twilio-wa] sent:', data.sid, data.status, usedTemplate ? '(template)' : '(free-form)')
  return { ok: true, sid: data.sid, status: data.status, usedTemplate }
}
