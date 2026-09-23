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
  /**
   * True only when a Broadcast can actually be dispatched via Twilio —
   * account credentials AND the explicit primary sender (see
   * TWILIO_WHATSAPP_PRIMARY_FROM's doc comment in lib/twilio-whatsapp.ts:
   * without it, sendBroadcastTemplate() fails closed rather than falling
   * back to Twilio's own Messaging-Service sender-pool selection).
   * Deliberately independent of the OTP Content SID — Broadcast never
   * needs it, so a missing OTP config must never show as Broadcast being
   * unavailable (see canSendOtp below).
   */
  canSend: boolean
  /** True only when Twilio status callbacks can be authenticated. */
  canReceiveStatusCallbacks: boolean
  /**
   * True only when the WhatsApp marketing-preferences OTP flow
   * (/whatsapp/preferences) can actually deliver a code — everything
   * canSend requires, PLUS the approved OTP Content Template. A missing
   * OTP Content SID makes ONLY this false; it never affects canSend.
   */
  canSendOtp: boolean
  /** PRESENT / MISSING per variable — never the value. */
  checks: {
    twilioAccountSid: 'PRESENT' | 'MISSING'
    twilioAuthToken: 'PRESENT' | 'MISSING'
    primarySender: 'PRESENT' | 'MISSING'
    otpContentSid: 'PRESENT' | 'MISSING'
  }
  /** Names of the variables that still need setting, for the admin banner. */
  missing: string[]
}

const present = (v: string | undefined): boolean => typeof v === 'string' && v.trim().length > 0

/**
 * PRESENT/MISSING capability report for the admin readiness banner.
 * Deliberately boolean-only — see the security note above. Distinguishes
 * three independent configuration facts (account credentials, the
 * explicit primary WhatsApp sender, and the OTP Content Template) so the
 * UI can tell "Broadcast can't send at all" apart from "Broadcast is fine
 * but OTP verification specifically is unavailable" — these are NOT the
 * same failure and must never be reported as if they were.
 */
export function getWhatsAppReadiness(): WhatsAppReadiness {
  const accountSid = present(process.env.TWILIO_ACCOUNT_SID)
  const authToken = present(process.env.TWILIO_AUTH_TOKEN)
  const primarySender = present(process.env.TWILIO_WHATSAPP_PRIMARY_FROM)
  const otpContentSid = present(process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID)

  const missing: string[] = []
  if (!accountSid) missing.push('TWILIO_ACCOUNT_SID')
  if (!authToken) missing.push('TWILIO_AUTH_TOKEN')
  if (!primarySender) missing.push('TWILIO_WHATSAPP_PRIMARY_FROM')
  if (!otpContentSid) missing.push('TWILIO_WHATSAPP_OTP_CONTENT_SID')

  const canSend = accountSid && authToken && primarySender

  return {
    canSend,
    // Twilio signs status callbacks with the SAME Auth Token used to send
    // (X-Twilio-Signature, see lib/webhooks/verify.ts's verifyTwilioSignature) —
    // unlike Meta's separate access-token/app-secret split, there is no
    // second credential to check here.
    canReceiveStatusCallbacks: authToken,
    // OTP needs everything Broadcast needs, plus its own approved
    // Content Template — never the other way around.
    canSendOtp: canSend && otpContentSid,
    checks: {
      twilioAccountSid: accountSid ? 'PRESENT' : 'MISSING',
      twilioAuthToken: authToken ? 'PRESENT' : 'MISSING',
      primarySender: primarySender ? 'PRESENT' : 'MISSING',
      otpContentSid: otpContentSid ? 'PRESENT' : 'MISSING',
    },
    missing,
  }
}
