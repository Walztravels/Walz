/**
 * WhatsApp Broadcast V1 — server-side Meta Cloud API configuration.
 *
 * ONE place that reads the Meta env vars, so the readiness endpoint and the
 * sender can never disagree about what "configured" means.
 *
 * These are the EXACT env vars the working 1:1 Inbox reply path already
 * uses (app/api/admin/messages/send/route.ts, app/api/webhooks/whatsapp/
 * route.ts). This feature introduces NO new env var.
 *
 *   WHATSAPP_PHONE_NUMBER_ID
 *   WHATSAPP_ACCESS_TOKEN
 *   WHATSAPP_APP_SECRET  (falls back to META_APP_SECRET)
 *   WHATSAPP_WEBHOOK_SECRET
 *
 * SECURITY. Nothing here ever returns, logs or serialises a secret VALUE.
 * The only thing that leaves this module is booleans (and, for the sender,
 * the credentials themselves — in-process, never across the wire). The
 * removed NEXT_PUBLIC_WA_TOKEN was a client-readable variable and is gone:
 * an access token must never be exposed through a NEXT_PUBLIC_* name.
 */

export interface WhatsAppReadiness {
  /** True only when a broadcast can actually be dispatched. */
  canSend: boolean
  /** True only when Meta status callbacks can be authenticated. */
  canReceiveStatusCallbacks: boolean
  /** PRESENT / MISSING per variable — never the value. */
  checks: {
    phoneNumberId: 'PRESENT' | 'MISSING'
    accessToken: 'PRESENT' | 'MISSING'
    appSecret: 'PRESENT' | 'MISSING'
    webhookSecret: 'PRESENT' | 'MISSING'
  }
  /** Names of the variables that still need setting, for the admin banner. */
  missing: string[]
}

const present = (v: string | undefined): boolean => typeof v === 'string' && v.trim().length > 0

/**
 * Credentials for an outbound Meta send. Returns null when the send path
 * is not configured — callers MUST treat null as "do not send", never as
 * "send some other way".
 */
export function getMetaSendCredentials(): { phoneNumberId: string; accessToken: string } | null {
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim()
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN ?? '').trim()
  if (!phoneNumberId || !accessToken) return null
  return { phoneNumberId, accessToken }
}

/** The app secret used to verify X-Hub-Signature-256, or '' when unset. */
export function getMetaAppSecret(): string {
  return (process.env.WHATSAPP_APP_SECRET ?? process.env.META_APP_SECRET ?? '').trim()
}

/**
 * WhatsApp Broadcast V1.2 P1 FIX — OTP verification template config.
 *
 * ── WHY THIS EXISTS, AND WHY IT CANNOT BE FREE TEXT ─────────────────────
 * Meta's WhatsApp Cloud API only allows a business-initiated message
 * OUTSIDE the 24-hour customer-service session window (i.e. before the
 * person has ever messaged Walz) to be sent as an approved Message
 * Template — never free-form text. A brand-new /whatsapp/preferences
 * visitor has, by definition, not yet opened a session with Walz's
 * WhatsApp number, so the verification code MUST go out as an approved
 * template, in Meta's dedicated 'AUTHENTICATION' category (see
 * lib/whatsapp/broadcast/sources.ts's TEMPLATE_CATEGORIES). This mirrors
 * exactly why lib/whatsapp/broadcast/sender.ts never has a text fallback
 * for marketing sends — the same platform rule, applied to OTP delivery.
 *
 * ── WHAT THIS CODE COULD NOT VERIFY IN THIS ENVIRONMENT ─────────────────
 * Meta's exact required PAYLOAD SHAPE for an AUTHENTICATION-category
 * template has changed across API versions and Business Manager options:
 * some authentication templates are body-only (one {{1}} placeholder,
 * which is the code); others additionally require a "Copy Code" button
 * component carrying its own code parameter. This module has no live
 * network/documentation access to confirm which shape the ACTUAL template
 * registered in Meta Business Manager will need — that can only be
 * confirmed by whoever creates and gets that template approved. Rather
 * than hardcode a guess, WHATSAPP_OTP_TEMPLATE_HAS_BUTTON below makes the
 * shape configurable; lib/whatsapp/otp-template.ts branches on it. Verify
 * the real approved template's structure against Meta's current docs
 * before setting these variables in production, and keep this flag in
 * sync with whichever structure that template actually has.
 *
 * FAILS CLOSED: returns null when the template name is not configured —
 * callers must treat null as "cannot send a verification code right now",
 * never as "fall back to something else".
 */
export interface OtpTemplateConfig {
  templateName: string
  templateLanguage: string
  /** Whether the approved template has a Copy-Code button component. */
  hasCodeButton: boolean
}

export function getOtpTemplateConfig(): OtpTemplateConfig | null {
  const templateName = (process.env.WHATSAPP_OTP_TEMPLATE_NAME ?? '').trim()
  if (!templateName) return null
  const templateLanguage = (process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE ?? '').trim() || 'en_US'
  const hasCodeButton = (process.env.WHATSAPP_OTP_TEMPLATE_HAS_BUTTON ?? '').trim().toLowerCase() === 'true'
  return { templateName, templateLanguage, hasCodeButton }
}

/**
 * PRESENT/MISSING capability report for the admin readiness banner.
 * Deliberately boolean-only — see the security note above.
 */
export function getWhatsAppReadiness(): WhatsAppReadiness {
  const phoneNumberId = present(process.env.WHATSAPP_PHONE_NUMBER_ID)
  const accessToken = present(process.env.WHATSAPP_ACCESS_TOKEN)
  const appSecret = present(process.env.WHATSAPP_APP_SECRET) || present(process.env.META_APP_SECRET)
  const webhookSecret = present(process.env.WHATSAPP_WEBHOOK_SECRET)

  const missing: string[] = []
  if (!phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID')
  if (!accessToken) missing.push('WHATSAPP_ACCESS_TOKEN')
  if (!appSecret) missing.push('WHATSAPP_APP_SECRET')
  if (!webhookSecret) missing.push('WHATSAPP_WEBHOOK_SECRET')

  return {
    canSend: phoneNumberId && accessToken,
    // Delivery receipts are worthless if the webhook cannot be
    // authenticated — the webhook fails closed without an app secret.
    canReceiveStatusCallbacks: appSecret && webhookSecret,
    checks: {
      phoneNumberId: phoneNumberId ? 'PRESENT' : 'MISSING',
      accessToken: accessToken ? 'PRESENT' : 'MISSING',
      appSecret: appSecret ? 'PRESENT' : 'MISSING',
      webhookSecret: webhookSecret ? 'PRESENT' : 'MISSING',
    },
    missing,
  }
}
