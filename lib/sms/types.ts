/**
 * A2P CUSTOMER_CARE SMS V1 — shared contracts.
 *
 * SMS is a SEPARATE transport from WhatsApp: To = "+1…", never "whatsapp:+1…".
 * Nothing in lib/sms may import lib/twilio-whatsapp.ts.
 */

/** The ONLY class this V1 sender will carry. */
export const SMS_CUSTOMER_CARE = 'SMS_CUSTOMER_CARE' as const
export type SmsClassification = typeof SMS_CUSTOMER_CARE

/**
 * Classes that must NEVER go through the Customer Care sender. Compared
 * case-insensitively after trimming. Anything that is not exactly
 * SMS_CUSTOMER_CARE is rejected anyway; this list exists so the rejection
 * reason is explicit and so tests pin the invariant.
 */
export const FORBIDDEN_SMS_CLASSIFICATIONS = [
  'SMS_MARKETING',
  'MARKETING',
  'PROMOTIONAL',
  'BROADCAST',
] as const

export type SmsDirection = 'INBOUND' | 'OUTBOUND'

export type SmsOutboundStatus =
  | 'pending'      // row reserved (idempotency), Twilio not yet called / result unknown
  | 'queued'
  | 'accepted'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'undelivered'
  | 'failed'
export type SmsStatus = SmsOutboundStatus | 'received'

/** Why a send was refused BEFORE any Twilio call. */
export type SmsRefusalReason =
  | 'FORBIDDEN_CLASSIFICATION'
  | 'INVALID_CLASSIFICATION'
  | 'INVALID_NUMBER'
  | 'EMPTY_MESSAGE'
  | 'MESSAGE_TOO_LONG'
  | 'MISSING_IDEMPOTENCY_KEY'
  | 'IDEMPOTENCY_KEY_CONFLICT'
  | 'CONFIG_MISSING'
  | 'NO_CONSENT'
  | 'CONSENT_REVOKED'
  | 'CONSENT_NOT_GRANTED'
  | 'CONSENT_WRONG_PURPOSE'
  | 'CONSENT_LOOKUP_FAILED'

export type SmsSendResult =
  | { ok: true; messageId: string; twilioMessageSid: string; status: SmsStatus; duplicate: false }
  | { ok: true; messageId: string; twilioMessageSid: string | null; status: SmsStatus; duplicate: true }
  | { ok: false; refused: true; reason: SmsRefusalReason }
  | { ok: false; refused: false; reason: 'PROVIDER_ERROR'; messageId: string; errorCode: string | null }

export interface SendCustomerCareSmsInput {
  /** As supplied by the caller; normalised + validated server-side. */
  recipient: string
  message: string
  /** Must be exactly 'SMS_CUSTOMER_CARE'. Typed string on purpose (trust boundary). */
  classification: string
  /** Business reference, e.g. 'booking:WZ-1234'. Audit only. */
  contextRef?: string | null
  /** Existing Walz client id when the caller already resolved one. */
  clientId?: string | null
  /** Caller-chosen, stable per logical message. Same key => one provider send. */
  idempotencyKey: string
}

/** Twilio's standard English opt-out / opt-in / help keyword classes. */
export type SmsKeywordClass = 'STOP' | 'START' | 'HELP' | 'OTHER'
