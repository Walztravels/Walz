import prisma from '@/lib/db'
import { normalizeSmsNumber } from '@/lib/sms/normalize'
import { sendCustomerCareSms } from '@/lib/sms/sender'
import { safeSmsErrorMessage } from '@/lib/sms/errors'
import { SMS_CUSTOMER_CARE, type SmsRefusalReason } from '@/lib/sms/types'

/**
 * Owner acceptance-test trigger for the CUSTOMER_CARE SMS service.
 *
 * NOT a composer: one fixed message, one hardcoded classification, one
 * explicitly typed number. It goes through the normal sendCustomerCareSms(),
 * so the production consent gate, config checks and idempotency all apply.
 * Authorization (super_admin) is enforced by the calling route.
 */

export { SMS_ACCEPTANCE_TEST_MESSAGE, maskRecipient, maskSid } from '@/lib/sms/acceptance-test-shared'
import { SMS_ACCEPTANCE_TEST_MESSAGE, maskRecipient, maskSid } from '@/lib/sms/acceptance-test-shared'

export const SMS_ACCEPTANCE_TEST_ACTION = 'SMS_ACCEPTANCE_TEST'
const CONTEXT_PREFIX = 'acceptance_test:'
/** Blast-radius cap per staff member (server-side, DB-backed). */
export const ACCEPTANCE_TEST_MAX_PER_WINDOW = 5
export const ACCEPTANCE_TEST_WINDOW_MS = 10 * 60 * 1000

const CLIENT_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const REFUSAL_TEXT: Record<SmsRefusalReason, string> = {
  FORBIDDEN_CLASSIFICATION: 'Refused: this service carries customer-care messages only.',
  INVALID_CLASSIFICATION: 'Refused: invalid message class.',
  INVALID_NUMBER: 'Refused: not a valid international number. Use the +country-code format, e.g. +12317902336.',
  EMPTY_MESSAGE: 'Refused: empty message.',
  MESSAGE_TOO_LONG: 'Refused: message too long.',
  MISSING_IDEMPOTENCY_KEY: 'Refused: missing request key.',
  IDEMPOTENCY_KEY_CONFLICT: 'Refused: this request key was already used for a different message.',
  CONFIG_MISSING: 'Refused: the SMS service is not fully configured yet (Twilio credentials or the SMS Messaging Service).',
  NO_CONSENT: 'Refused: this number has not given SMS customer-care consent. Opt in at /sms-consent with this number first.',
  CONSENT_REVOKED: 'Refused: this number has opted out (STOP). A revoked number cannot be re-enabled from the website.',
  CONSENT_NOT_GRANTED: 'Refused: this number has not given SMS customer-care consent.',
  CONSENT_WRONG_PURPOSE: 'Refused: consent on file is not for customer-care SMS.',
  CONSENT_LOOKUP_FAILED: 'Refused: consent could not be verified right now. Nothing was sent.',
}

export type AcceptanceTestOutcome =
  | { kind: 'INVALID_INPUT'; message: string }
  | { kind: 'RATE_LIMITED'; message: string }
  | {
      kind: 'RESULT'
      accepted: boolean
      recipientMasked: string
      messageId: string | null
      twilioSidMasked: string | null
      status: string | null
      duplicate: boolean
      reason: string | null
      message: string
    }

export interface AcceptanceTestStaff {
  id: string
  name?: string | null
  email: string
  staffRole: string
}

export async function runSmsAcceptanceTest(input: {
  staff: AcceptanceTestStaff
  /** Only the number and the client-generated attempt key are read from the request. */
  phone: unknown
  clientKey: unknown
  ip?: string | null
  userAgent?: string | null
}): Promise<AcceptanceTestOutcome> {
  const { staff } = input

  if (typeof input.phone !== 'string') return { kind: 'INVALID_INPUT', message: 'Enter a phone number.' }
  if (typeof input.clientKey !== 'string' || !CLIENT_KEY.test(input.clientKey)) {
    return { kind: 'INVALID_INPUT', message: 'Invalid request key. Reload the page and try again.' }
  }
  const n = normalizeSmsNumber(input.phone)
  if (!n.ok) {
    return { kind: 'INVALID_INPUT', message: REFUSAL_TEXT.INVALID_NUMBER }
  }
  const recipientMasked = maskRecipient(n.e164)
  const contextRef = `${CONTEXT_PREFIX}${staff.id}`

  // Server-side cap: a stolen/looping session cannot fan out test sends.
  const recent = await prisma.smsMessage.count({
    where: { contextRef, createdAt: { gte: new Date(Date.now() - ACCEPTANCE_TEST_WINDOW_MS) } },
  })
  if (recent >= ACCEPTANCE_TEST_MAX_PER_WINDOW) {
    return { kind: 'RATE_LIMITED', message: 'Too many test sends in the last 10 minutes. Wait and try again.' }
  }

  // Classification, message and contextRef are HARDCODED here: nothing from
  // the request can override them.
  const res = await sendCustomerCareSms({
    recipient: n.e164,
    message: SMS_ACCEPTANCE_TEST_MESSAGE,
    classification: SMS_CUSTOMER_CARE,
    contextRef,
    idempotencyKey: `acceptance-test:${staff.id}:${input.clientKey.toLowerCase()}`,
  })

  let outcome: Extract<AcceptanceTestOutcome, { kind: 'RESULT' }>
  if (res.ok) {
    outcome = {
      kind: 'RESULT',
      accepted: true,
      recipientMasked,
      messageId: res.messageId,
      twilioSidMasked: maskSid(res.twilioMessageSid),
      status: res.status,
      duplicate: res.duplicate,
      reason: null,
      message: res.duplicate
        ? 'This attempt was already submitted; no second message was sent.'
        : 'Accepted by Twilio. Delivery status will update via the status callback.',
    }
  } else if (res.refused) {
    outcome = {
      kind: 'RESULT', accepted: false, recipientMasked, messageId: null, twilioSidMasked: null,
      status: null, duplicate: false, reason: res.reason, message: REFUSAL_TEXT[res.reason],
    }
  } else {
    outcome = {
      kind: 'RESULT', accepted: false, recipientMasked, messageId: res.messageId, twilioSidMasked: null,
      status: 'failed', duplicate: false, reason: 'PROVIDER_ERROR',
      message: `Twilio rejected the message${res.errorCode ? ` (code ${res.errorCode})` : ''}: ${
        safeSmsErrorMessage(res.errorCode) ?? 'delivery error'
      }.`,
    }
  }

  // Audit: who, when, which SMS record. Masked number only; no secrets.
  await prisma.activityLog
    .create({
      data: {
        staffId: staff.id,
        staffName: staff.name ?? staff.email,
        staffRole: staff.staffRole,
        action: SMS_ACCEPTANCE_TEST_ACTION,
        module: 'settings',
        entityType: 'SmsMessage',
        entityId: outcome.messageId,
        detail: `${outcome.accepted ? 'accepted' : `refused:${outcome.reason}`} to ${recipientMasked}`,
        ipAddress: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
    .catch((e) => console.error('[sms-test] audit write failed:', (e as { code?: string } | null)?.code ?? 'unknown'))

  return outcome
}
