/**
 * WhatsApp Broadcast V1.2.1 — the Twilio Content Template sender.
 *
 * Replaces the V1/V1.1 direct Meta Cloud API sender (which called
 * graph.facebook.com directly) after a provider audit found the rest of
 * Walz's WhatsApp infrastructure — the staff-facing Inbox channel, visa
 * application threads, the chat drawer, quotes, eSIM and recovery
 * messages — already runs through Twilio, not Meta. Broadcast now reuses
 * that SAME infrastructure via lib/twilio-whatsapp.ts's
 * sendWhatsAppContentTemplate() — a single additional function on the
 * existing file, not a second independent Twilio implementation.
 *
 * ON NOT CREATING A NEW SEND HELPER FROM SCRATCH. sendWhatsAppContentTemplate()
 * already reuses the exact TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/Messaging
 * Service credentials every other Twilio WhatsApp send in this codebase
 * uses — this file is only responsible for Broadcast-specific error
 * classification (retry vs. permanent) and status-callback wiring.
 */

import { sendWhatsAppContentTemplate, twilioConfigured } from '@/lib/twilio-whatsapp'

/**
 * Where Twilio reports delivery status for a broadcast message. Per-message
 * (passed as the StatusCallback param on each send), not a number-level
 * Twilio Console setting — so this works regardless of how the account's
 * default WhatsApp sender is otherwise configured. Configurable so a
 * non-production environment can point elsewhere; defaults to the real
 * production route this release adds
 * (app/api/webhooks/twilio-whatsapp/broadcast-status/route.ts).
 */
const BROADCAST_STATUS_CALLBACK_URL =
  (process.env.TWILIO_BROADCAST_STATUS_WEBHOOK_URL ?? '').trim() ||
  'https://www.walztravels.com/api/webhooks/twilio-whatsapp/broadcast-status'

export type SendOutcome =
  | { ok: true; providerMessageId: string }
  /** Retrying may succeed — network blip, 429, 5xx, Twilio rate limit. */
  | { ok: false; kind: 'TRANSIENT'; code: string; reason: string }
  /** Retrying can never succeed — bad number, unapproved template, 401. */
  | { ok: false; kind: 'PERMANENT'; code: string; reason: string }

/**
 * Twilio error codes that are PERMANENT for THIS recipient/template.
 * Everything not listed is treated as transient and retried, because
 * losing a message to an unrecognised transient error is worse than one
 * extra attempt — and attempts are hard-capped anyway (matches the V1/V1.1
 * Meta sender's same fail-safe default).
 *
 * DISCLOSED LIMITATION: this list is built from Twilio's publicly
 * documented WhatsApp/Messaging error codes, not from a live account —
 * this environment has no network access to Twilio's error-code reference
 * at build time. Treat this as a best-effort classification to refine
 * against real production error codes as they're observed, not as an
 * exhaustive authority.
 *
 *   21211  invalid 'To' phone number
 *   21610  recipient has opted out at the CARRIER/WHATSAPP level (distinct
 *          from our own WhatsAppConsent — see the opt-out doc in
 *          app/api/webhooks/twilio-whatsapp/route.ts for why local
 *          suppression must never contradict provider-level suppression)
 *   21614  'To' number is not a valid WhatsApp-reachable number
 *   63003  channel/number not enabled for this recipient's country
 *   63005  channel policy violation
 *   63007  sender/number not registered for this channel
 *   63013  channel policy violation (business-initiated without template)
 *   63015  template body does not match the approved Content Template
 *   63016  outside the 24h window and no valid approved Content Template used
 *   63024  message rejected by WhatsApp for policy reasons
 *   63032  Content Template not found / not approved
 *   20003  authentication failed (bad Account SID/Auth Token)
 *   20404  resource not found (e.g. invalid ContentSid)
 */
const PERMANENT_TWILIO_CODES = new Set([
  '20003', '20404',
  '21211', '21610', '21614',
  '63003', '63005', '63007', '63013', '63015', '63016', '63024', '63032',
])

/** Twilio codes that explicitly mean "slow down". Always transient. */
const RATE_LIMIT_CODES = new Set(['20429', '21611'])

export function classifyTwilioError(input: {
  httpStatus: number
  code?: string | number | null
  message?: string | null
}): { kind: 'TRANSIENT' | 'PERMANENT'; code: string; reason: string } {
  const code = input.code === undefined || input.code === null ? '' : String(input.code)
  const reason = (input.message ?? '').slice(0, 300) || `HTTP ${input.httpStatus}`

  if (RATE_LIMIT_CODES.has(code)) return { kind: 'TRANSIENT', code, reason }
  if (PERMANENT_TWILIO_CODES.has(code)) return { kind: 'PERMANENT', code, reason }

  // 429 and 5xx are always worth another attempt; 401/403 are not.
  if (input.httpStatus === 429 || input.httpStatus >= 500) return { kind: 'TRANSIENT', code, reason }
  if (input.httpStatus === 401 || input.httpStatus === 403) return { kind: 'PERMANENT', code, reason }

  // Unknown 4xx with an unknown code: bias to transient, bounded by
  // MAX_SEND_ATTEMPTS rather than by guessing Twilio's full taxonomy.
  return { kind: 'TRANSIENT', code, reason }
}

/**
 * Dispatch ONE approved Content Template message via Twilio.
 *
 * There is no free-text branch and no fallback: if the template is
 * rejected, this returns a failure and the recipient is recorded as
 * failed. Nothing is ever sent as a free-form Body.
 */
export async function sendBroadcastTemplate(input: {
  waId: string
  contentSid: string
  contentVariables: Record<string, string>
  /** Twilio calls this URL with delivery status updates for this message. */
  statusCallbackUrl?: string
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}): Promise<SendOutcome> {
  if (!twilioConfigured()) {
    return {
      ok: false,
      kind: 'PERMANENT',
      code: 'NOT_CONFIGURED',
      reason: 'WhatsApp send credentials are not configured on the server.',
    }
  }

  const result = await sendWhatsAppContentTemplate({
    // waId is the number without its leading '+' (see audience-multi.ts's
    // dedup/eligibility layer, unchanged by this release); Twilio needs
    // "whatsapp:+E164", which normalisePhone() inside
    // sendWhatsAppContentTemplate reconstructs from this same digit string.
    toPhone: `+${input.waId}`,
    contentSid: input.contentSid,
    contentVariables: input.contentVariables,
    statusCallbackUrl: input.statusCallbackUrl ?? BROADCAST_STATUS_CALLBACK_URL,
    fetchImpl: input.fetchImpl,
  })

  if (!result.ok) {
    return {
      ok: false,
      ...classifyTwilioError({
        httpStatus: result.httpStatus ?? 0,
        code: result.errorCode,
        message: result.errorMessage,
      }),
    }
  }

  if (!result.sid) {
    // A 200 with no message SID is not a send we can track or deduplicate.
    return { ok: false, kind: 'TRANSIENT', code: 'NO_MESSAGE_ID', reason: 'Twilio returned no message SID.' }
  }

  return { ok: true, providerMessageId: result.sid }
}
