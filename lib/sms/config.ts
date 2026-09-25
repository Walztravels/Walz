/**
 * SMS configuration — FAIL CLOSED, no hardcoded SIDs, no silent fallback to
 * TWILIO_MESSAGING_SERVICE_SID (that variable belongs to WhatsApp).
 * Readiness reports PRESENT / MISSING / INVALID only — never a value.
 */

export const SMS_MESSAGING_SERVICE_ENV = 'TWILIO_SMS_CUSTOMER_CARE_MESSAGING_SERVICE_SID'

/** Canonical production URLs (must match the Twilio console byte for byte). */
export const SMS_INBOUND_WEBHOOK_URL_DEFAULT = 'https://www.walztravels.com/api/webhooks/twilio-sms'
export const SMS_STATUS_WEBHOOK_URL_DEFAULT = 'https://www.walztravels.com/api/webhooks/twilio-sms/status'

const MG_SID = /^MG[0-9a-fA-F]{32}$/

function env(name: string): string {
  return (process.env[name] ?? '').trim()
}

export interface SmsConfig {
  accountSid: string
  authToken: string
  messagingServiceSid: string
  statusCallbackUrl: string
}

export type SmsConfigResult =
  | { ok: true; config: SmsConfig }
  | { ok: false; missing: string[] }

/** Twilio auth token used for API calls AND webhook signature validation. */
export function getSmsAuthToken(): string {
  return env('TWILIO_AUTH_TOKEN') || env('TWILIO_WEBHOOK_AUTH_TOKEN')
}

/**
 * Exact URL Twilio signs for the inbound webhook. Env override wins;
 * otherwise the canonical production URL — never derived from request headers,
 * so a wrong Host header cannot change what is verified.
 */
export function getSmsInboundWebhookUrl(): string {
  return env('TWILIO_SMS_WEBHOOK_URL') || SMS_INBOUND_WEBHOOK_URL_DEFAULT
}

export function getSmsStatusWebhookUrl(): string {
  return env('TWILIO_SMS_STATUS_WEBHOOK_URL') || SMS_STATUS_WEBHOOK_URL_DEFAULT
}

export function getSmsConfig(): SmsConfigResult {
  const accountSid = env('TWILIO_ACCOUNT_SID')
  const authToken = env('TWILIO_AUTH_TOKEN')
  const messagingServiceSid = env(SMS_MESSAGING_SERVICE_ENV)
  const missing: string[] = []
  if (!accountSid) missing.push('TWILIO_ACCOUNT_SID')
  if (!authToken) missing.push('TWILIO_AUTH_TOKEN')
  if (!messagingServiceSid || !MG_SID.test(messagingServiceSid)) missing.push(SMS_MESSAGING_SERVICE_ENV)
  if (missing.length) return { ok: false, missing }
  return {
    ok: true,
    config: { accountSid, authToken, messagingServiceSid, statusCallbackUrl: getSmsStatusWebhookUrl() },
  }
}

export type Presence = 'PRESENT' | 'MISSING' | 'INVALID'

export interface SmsReadiness {
  ready: boolean
  twilioAccountSid: Presence
  twilioAuthToken: Presence
  messagingServiceSid: Presence
  /** Informational: whether the webhook URL env overrides are set (canonical default otherwise). */
  webhookUrlOverride: Presence
  statusWebhookUrlOverride: Presence
}

export function getSmsReadiness(): SmsReadiness {
  const p = (v: string): Presence => (v ? 'PRESENT' : 'MISSING')
  const sid = env(SMS_MESSAGING_SERVICE_ENV)
  const messagingServiceSid: Presence = !sid ? 'MISSING' : MG_SID.test(sid) ? 'PRESENT' : 'INVALID'
  const twilioAccountSid = p(env('TWILIO_ACCOUNT_SID'))
  const twilioAuthToken = p(getSmsAuthToken())
  return {
    ready:
      twilioAccountSid === 'PRESENT' &&
      env('TWILIO_AUTH_TOKEN') !== '' &&
      messagingServiceSid === 'PRESENT',
    twilioAccountSid,
    twilioAuthToken,
    messagingServiceSid,
    webhookUrlOverride: p(env('TWILIO_SMS_WEBHOOK_URL')),
    statusWebhookUrlOverride: p(env('TWILIO_SMS_STATUS_WEBHOOK_URL')),
  }
}
