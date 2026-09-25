import prisma from '@/lib/db'
import { maskId } from '@/lib/webhooks/verify'
import { classifySmsKeyword } from '@/lib/sms/keywords'
import { normalizeSmsNumber } from '@/lib/sms/normalize'
import { revokeSmsCustomerCare, recordProviderSmsEvent } from '@/lib/sms/consent'
import { SMS_CUSTOMER_CARE, type SmsKeywordClass } from '@/lib/sms/types'
import { findCredibleDuplicate } from '@/lib/inbox/client-identity'

/**
 * Inbound SMS processing (A2P CUSTOMER_CARE V1).
 *
 * - The message row is deduped on the unique twilioMessageSid, but keyword
 *   effects are ALWAYS attempted afterwards: a crash between the two writes
 *   must never lose a STOP. The effects are idempotent via the
 *   (providerMessageSid, eventType) unique on ConsentEvent.
 * - START/HELP only record provider events. START NEVER creates or restores
 *   GRANTED consent (fail-closed until valid web consent exists).
 * - The body is stored (may hold PII) but never logged; numbers are masked.
 */

export interface ProcessInboundSmsInput {
  messageSid: string
  from: string
  body: string
  optOutType?: string | null
  /** Test seam; defaults to the exact-match identity resolver below. */
  resolveClientId?: (e164: string) => Promise<string | null>
}

export type ProcessInboundSmsResult =
  | { ok: true; ignored: false; keywordClass: SmsKeywordClass; duplicate: boolean; e164: string }
  | { ok: false; ignored: true; reason: 'NOT_AN_SMS_NUMBER' }

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'P2002'
}

/**
 * Exact E.164 match via the EXISTING identity infrastructure
 * (findCredibleDuplicate). Only a single, unambiguous registered User match
 * sets clientId (User.id); leads/applications/accounts/ambiguity => null.
 * Never creates anything; any error => null (non-fatal).
 */
export async function resolveClientIdByPhone(e164: string): Promise<string | null> {
  try {
    const r = await findCredibleDuplicate({ phone: e164 })
    if (r.status === 'found' && r.candidate.type === 'user') return r.candidate.id
    return null
  } catch {
    return null
  }
}

export async function processInboundSms(input: ProcessInboundSmsInput): Promise<ProcessInboundSmsResult> {
  const n = normalizeSmsNumber(input.from)
  if (!n.ok) return { ok: false, ignored: true, reason: 'NOT_AN_SMS_NUMBER' }
  const e164 = n.e164

  const keywordClass = classifySmsKeyword(input.body, input.optOutType)
  const resolve = input.resolveClientId ?? resolveClientIdByPhone
  // Identity lookup (4 queries) only for ordinary messages: it must never
  // delay a STOP/START/HELP mirror toward Twilio's webhook timeout.
  const clientId = keywordClass === 'OTHER' ? await resolve(e164).catch(() => null) : null

  let duplicate = false
  try {
    await prisma.smsMessage.create({
      data: {
        direction: 'INBOUND',
        phone: e164,
        body: input.body,
        classification: SMS_CUSTOMER_CARE,
        status: 'received',
        twilioMessageSid: input.messageSid,
        keywordClass,
        clientId,
      },
    })
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    duplicate = true
  }

  // Effects run even for a duplicate row (crash-between-writes safety).
  if (keywordClass === 'STOP') {
    await revokeSmsCustomerCare({ e164, providerMessageSid: input.messageSid, source: 'inbound_sms_stop' })
  } else if (keywordClass === 'START') {
    await recordProviderSmsEvent({ e164, type: 'PROVIDER_START', providerMessageSid: input.messageSid })
  } else if (keywordClass === 'HELP') {
    await recordProviderSmsEvent({ e164, type: 'PROVIDER_HELP', providerMessageSid: input.messageSid })
  }

  if (process.env.NODE_ENV !== 'test') {
    console.info(`[twilio-sms] inbound ${keywordClass} from ${maskId(e164)} sid ${maskId(input.messageSid)}${duplicate ? ' (retry)' : ''}`)
  }
  return { ok: true, ignored: false, keywordClass, duplicate, e164 }
}
