/**
 * WhatsApp Broadcast V1.2.1 — server-side Twilio readiness reporting.
 *
 * A provider audit found that WhatsApp Broadcast (and its V1.2 OTP flow)
 * had been built against direct Meta Cloud API credentials while the rest
 * of Walz's WhatsApp infrastructure — the staff Inbox channel, visa
 * application threads, the chat drawer, quotes, eSIM and recovery
 * messages — already runs through Twilio (see lib/twilio-whatsapp.ts).
 * This module now reports readiness against THAT infrastructure instead.
 *
 * The Meta-specific helpers this file used to export (getMetaSendCredentials,
 * getMetaAppSecret, getOtpTemplateConfig) had zero callers left once
 * Broadcast and OTP delivery moved to Twilio, so they were removed rather
 * than kept as dead code — this is distinct from
 * app/api/webhooks/whatsapp/route.ts and app/api/admin/messages/send/
 * route.ts, which still serve a separate, real, Meta-based custom leads/
 * messages feature and are deliberately UNTOUCHED and un-migrated by this
 * release (see that files' own headers).
 *
 * SECURITY. Nothing here ever returns, logs or serialises a secret VALUE —
 * only PRESENT/MISSING booleans.
 */

export interface WhatsAppReadiness {
  /** True only when a broadcast can actually be dispatched via Twilio. */
  canSend: boolean
  /** True only when Twilio status callbacks can be authenticated. */
  canReceiveStatusCallbacks: boolean
  /** PRESENT / MISSING per variable — never the value. */
  checks: {
    twilioAccountSid: 'PRESENT' | 'MISSING'
    twilioAuthToken: 'PRESENT' | 'MISSING'
  }
  /** Names of the variables that still need setting, for the admin banner. */
  missing: string[]
}

const present = (v: string | undefined): boolean => typeof v === 'string' && v.trim().length > 0

/**
 * PRESENT/MISSING capability report for the admin readiness banner.
 * Deliberately boolean-only — see the security note above.
 */
export function getWhatsAppReadiness(): WhatsAppReadiness {
  const accountSid = present(process.env.TWILIO_ACCOUNT_SID)
  const authToken = present(process.env.TWILIO_AUTH_TOKEN)

  const missing: string[] = []
  if (!accountSid) missing.push('TWILIO_ACCOUNT_SID')
  if (!authToken) missing.push('TWILIO_AUTH_TOKEN')

  return {
    canSend: accountSid && authToken,
    // Twilio signs status callbacks with the SAME Auth Token used to send
    // (X-Twilio-Signature, see lib/webhooks/verify.ts's verifyTwilioSignature) —
    // unlike Meta's separate access-token/app-secret split, there is no
    // second credential to check here.
    canReceiveStatusCallbacks: authToken,
    checks: {
      twilioAccountSid: accountSid ? 'PRESENT' : 'MISSING',
      twilioAuthToken: authToken ? 'PRESENT' : 'MISSING',
    },
    missing,
  }
}
