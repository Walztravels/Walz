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

import { BUSINESS } from '@/lib/config/business'

const TWILIO_SID      = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN    = process.env.TWILIO_AUTH_TOKEN
const TEMPLATE_SID    = process.env.TWILIO_CONTENT_TEMPLATE_SID
// Messaging Service SID — both WhatsApp senders are registered under this service.
// Use MessagingServiceSid instead of From so Twilio routes via the correct WhatsApp sender.
const MESSAGING_SVC   = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MGd179b68a408e4fea5a366a8505030401'

const NG_FROM   = process.env.TWILIO_WHATSAPP_NUMBER_NG   || `+${BUSINESS.contacts.nigeriaWhatsapp.e164}`
const INTL_FROM = process.env.TWILIO_WHATSAPP_NUMBER_INTL || `+${BUSINESS.contacts.globalWhatsapp.e164}`
// Dedicated UK number for visa application threads
export const VISA_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER_VISA || '+447949448680'

// ── WhatsApp Broadcast V1.2.1 / OTP P1 fix ─────────────────────────────────
// The approved Content SID used ONLY for the WhatsApp marketing-preferences
// OTP (a fixed, single AUTHENTICATION-category template — never Broadcast's
// per-campaign template, which is chosen per-broadcast from the server-side
// catalogue instead). Unset by default: sendOtpViaTwilio() fails closed.
const OTP_CONTENT_SID = (process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID ?? '').trim() || null

export function twilioOtpConfigured(): boolean {
  return !!(TWILIO_SID && TWILIO_TOKEN && OTP_CONTENT_SID)
}

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
/**
 * Send a free-form WhatsApp message — no template, always uses Body.
 * Supports an optional mediaUrl for image attachments (e.g. QR code image).
 * Only reaches clients who have messaged us within 24 h, or when using a
 * business-initiated template window is not required (post-purchase context).
 */
export async function sendWhatsAppBody(
  toPhone:      string,
  body:         string,
  mediaUrl?:    string,
  fromOverride?: string, // pass VISA_WHATSAPP_NUMBER to force a specific sender
): Promise<TwilioSendResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    return { ok: false, error: 'Twilio credentials not configured', usedTemplate: false }
  }

  const to         = normalisePhone(toPhone)
  const fromNumber = fromOverride ?? getWhatsAppSender(toPhone)

  const params = new URLSearchParams()
  if (fromOverride) {
    // When a specific sender is required, bypass the Messaging Service and set From directly
    params.set('From', `whatsapp:${fromNumber}`)
  } else if (MESSAGING_SVC) {
    params.set('MessagingServiceSid', MESSAGING_SVC)
  } else {
    params.set('From', `whatsapp:${fromNumber}`)
  }
  params.set('To',   `whatsapp:${to}`)
  params.set('Body', body)
  if (mediaUrl) params.set('MediaUrl', mediaUrl)

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  )

  const data = await res.json() as { sid?: string; status?: string; message?: string; error_message?: string }

  if (!res.ok) {
    console.error('[twilio-wa] sendWhatsAppBody failed:', res.status, JSON.stringify(data))
    return { ok: false, error: data.message ?? data.error_message ?? `Twilio error ${res.status}`, usedTemplate: false, fromNumber }
  }

  console.log('[twilio-wa] body sent:', data.sid, data.status, `from ${fromNumber}`)
  return { ok: true, sid: data.sid, status: data.status, usedTemplate: false, fromNumber }
}

export async function sendWhatsAppViaTwilio(
  toPhone:      string,
  clientName:   string,
  refNumber:    string,
  body:         string,
  fromOverride?: string, // force a specific sender (e.g. VISA_WHATSAPP_NUMBER)
): Promise<TwilioSendResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    return {
      ok:           false,
      error:        'Twilio credentials not configured — add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to Vercel env vars',
      usedTemplate: false,
    }
  }

  const to         = normalisePhone(toPhone)
  const fromNumber = fromOverride ?? getWhatsAppSender(toPhone)

  const params = new URLSearchParams()
  if (fromOverride) {
    // When a specific sender is required, set From directly — bypass MessagingServiceSid
    // so Twilio uses exactly the number requested, not the service's routing logic.
    params.set('From', `whatsapp:${fromNumber}`)
  } else if (MESSAGING_SVC) {
    // Use MessagingServiceSid — both WhatsApp senders live inside this service.
    // Sending with From: directly causes error 63049 for business-initiated messages.
    params.set('MessagingServiceSid', MESSAGING_SVC)
  } else {
    params.set('From', `whatsapp:${fromNumber}`)
  }
  params.set('To', `whatsapp:${to}`)

  const usedTemplate = !!TEMPLATE_SID
  if (usedTemplate) {
    params.set('ContentSid', TEMPLATE_SID!)
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

// ── WhatsApp Broadcast V1.2.1: generic Content Template sender ────────────
//
// A SINGLE additional function, not a second Twilio implementation — reuses
// the exact same module-level credentials/Messaging Service Twilio setup
// above. Unlike sendWhatsAppViaTwilio() (which sends one fixed template
// with two fixed named variables for the visa-greeting use case), this
// takes an arbitrary approved Content SID and an arbitrary variable map, so
// Broadcast (any staff-selected approved template) and OTP (a different,
// fixed approved template) can both use it without a third implementation.
//
// NEVER falls back to free text: there is no `body` branch here at all —
// only ContentSid + ContentVariables. If a template SID is invalid, Twilio
// itself rejects the send (surfaced as a PERMANENT-classified error by the
// caller), never silently downgraded.
export interface ContentTemplateSendResult {
  ok: boolean
  sid?: string
  status?: string
  errorCode?: string
  errorMessage?: string
  httpStatus?: number
}

export async function sendWhatsAppContentTemplate(input: {
  toPhone: string
  contentSid: string
  contentVariables: Record<string, string>
  /** Force a specific sender (e.g. VISA_WHATSAPP_NUMBER); otherwise NG/INTL routing + Messaging Service. */
  fromOverride?: string
  /** Twilio calls this URL with delivery status updates for this specific message. */
  statusCallbackUrl?: string
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}): Promise<ContentTemplateSendResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    return { ok: false, errorMessage: 'Twilio credentials not configured' }
  }

  const to         = normalisePhone(input.toPhone)
  const fromNumber = input.fromOverride ?? getWhatsAppSender(input.toPhone)

  const params = new URLSearchParams()
  if (input.fromOverride) {
    params.set('From', `whatsapp:${fromNumber}`)
  } else if (MESSAGING_SVC) {
    params.set('MessagingServiceSid', MESSAGING_SVC)
  } else {
    params.set('From', `whatsapp:${fromNumber}`)
  }
  params.set('To', `whatsapp:${to}`)
  params.set('ContentSid', input.contentSid)
  params.set('ContentVariables', JSON.stringify(input.contentVariables))
  if (input.statusCallbackUrl) params.set('StatusCallback', input.statusCallbackUrl)

  const doFetch = input.fetchImpl ?? fetch
  let res: Response
  try {
    res = await doFetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
  } catch (e) {
    return { ok: false, errorMessage: (e as Error)?.message?.slice(0, 300) ?? 'fetch failed' }
  }

  const data = await res.json().catch(() => ({})) as { sid?: string; status?: string; code?: number; message?: string }

  if (!res.ok) {
    // Never log the destination number or the resolved variable VALUES —
    // only the masked sid/status/error, matching this file's existing
    // console.error convention above.
    console.error('[twilio-wa] content template send failed:', res.status, data.code, data.message)
    return { ok: false, httpStatus: res.status, errorCode: data.code != null ? String(data.code) : undefined, errorMessage: data.message }
  }

  return { ok: true, sid: data.sid, status: data.status }
}

// ── WhatsApp Broadcast V1.2.1: approved Content Template catalogue ────────
//
// Lets staff pick a broadcast template from a server-side list of approved
// Content Templates rather than hand-typing a Content SID — the UI must
// never imply that typing a name/SID makes it approved (Twilio, and
// beneath it Meta/WhatsApp, owns approval; nothing client-side can verify
// it). Investigated: Twilio's Content API DOES expose this safely with the
// EXISTING TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN (Basic Auth, same as every
// send in this file) — GET https://content.twilio.com/v1/Content lists an
// account's Content Templates, and GET .../Content/{sid}/ApprovalRequests
// reports each one's per-channel (whatsapp) approval status. Credentials
// never leave the server: this function returns only sid/name/category/
// variable-key metadata, called from
// app/api/admin/marketing/whatsapp-broadcast/templates/route.ts.
//
// DISCLOSED LIMITATION: this environment has no live Twilio account to
// verify the exact current response shape of either endpoint against, so
// this is a best-effort integration built from Twilio's publicly
// documented Content API — verify the parsed fields (approvalRequests[].
// whatsapp.status, content.types keys) against a real response before
// relying on this in production, and adjust the parsing below if Twilio's
// actual shape differs.
export interface ApprovedContentTemplate {
  contentSid: string
  friendlyName: string
  category: string | null
  /** The variable keys this template's body declares (e.g. ["1"] or ["1","2"]). */
  variableKeys: string[]
}

const CONTENT_API_BASE = 'https://content.twilio.com/v1'

export async function listApprovedWhatsAppContentTemplates(
  fetchImpl?: typeof fetch,
): Promise<{ ok: true; templates: ApprovedContentTemplate[] } | { ok: false; error: string }> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    return { ok: false, error: 'Twilio credentials not configured' }
  }
  const doFetch = fetchImpl ?? fetch
  const authHeader = { Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}` }

  let listRes: Response
  try {
    listRes = await doFetch(`${CONTENT_API_BASE}/Content?PageSize=50`, { headers: authHeader })
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'fetch failed' }
  }
  if (!listRes.ok) return { ok: false, error: `Twilio Content API returned ${listRes.status}` }

  const listData = await listRes.json().catch(() => ({})) as {
    contents?: Array<{ sid: string; friendly_name: string; types?: Record<string, { body?: string }> }>
  }
  const contents = listData.contents ?? []

  // One ApprovalRequests lookup per template — run concurrently rather
  // than sequentially awaited in a loop, since each is an independent,
  // read-only lookup keyed by its own sid; nothing serializes them.
  const resolved = await Promise.all(contents.map(async (c): Promise<ApprovedContentTemplate | null> => {
    // Only WhatsApp-channel-approved templates belong in a Broadcast catalogue.
    let approved = false
    let category: string | null = null
    try {
      const approvalRes = await doFetch(`${CONTENT_API_BASE}/Content/${c.sid}/ApprovalRequests`, { headers: authHeader })
      if (approvalRes.ok) {
        const approvalData = await approvalRes.json().catch(() => ({})) as {
          whatsapp?: { status?: string; category?: string }
        }
        approved = approvalData.whatsapp?.status === 'approved'
        category = approvalData.whatsapp?.category ?? null
      }
    } catch {
      // A single template's approval-status lookup failing must not break
      // the whole catalogue — it is simply excluded (fails closed: an
      // unverifiable template is never offered).
      return null
    }
    if (!approved) return null

    // Variable keys: Twilio content bodies use {{1}}, {{2}}, … placeholders
    // regardless of content type; extract them from whichever type's body
    // is present.
    const body = Object.values(c.types ?? {})[0]?.body ?? ''
    const variableKeys = Array.from(new Set(Array.from(body.matchAll(/\{\{(\w+)\}\}/g)).map(m => m[1])))

    return { contentSid: c.sid, friendlyName: c.friendly_name, category, variableKeys }
  }))

  return { ok: true, templates: resolved.filter((t): t is ApprovedContentTemplate => t !== null) }
}

/**
 * OTP delivery via Twilio (WhatsApp Broadcast V1.2.1 P1 fix, transport
 * only — the OTP security engine itself, in lib/whatsapp/consent-otp.ts,
 * is unchanged). Fails closed when TWILIO_WHATSAPP_OTP_CONTENT_SID is not
 * set — never falls back to free text.
 *
 * The approved OTP Content Template must declare exactly one body
 * variable, keyed "1" (Twilio's default numbered-variable convention),
 * whose value is the 6-digit code.
 */
export async function sendOtpViaTwilio(
  toPhone: string,
  code: string,
  fetchImpl?: typeof fetch,
): Promise<ContentTemplateSendResult> {
  if (!OTP_CONTENT_SID) {
    return { ok: false, errorMessage: 'OTP Content SID not configured' }
  }
  return sendWhatsAppContentTemplate({
    toPhone,
    contentSid: OTP_CONTENT_SID,
    contentVariables: { '1': code },
    fetchImpl,
  })
}
