import prisma from '@/lib/db'
import { maskId } from '@/lib/webhooks/verify'
import { getSmsConfig } from '@/lib/sms/config'
import { hasSmsCustomerCareConsent, revokeSmsCustomerCare, type SmsConsentReason } from '@/lib/sms/consent'
import { isProviderOptOutErrorCode, safeSmsErrorMessage } from '@/lib/sms/errors'
import { normalizeSmsNumber } from '@/lib/sms/normalize'
import {
  FORBIDDEN_SMS_CLASSIFICATIONS,
  SMS_CUSTOMER_CARE,
  type SendCustomerCareSmsInput,
  type SmsRefusalReason,
  type SmsSendResult,
  type SmsStatus,
} from '@/lib/sms/types'

/**
 * A2P CUSTOMER_CARE outbound SMS — SERVER-ONLY. Not exposed by any route.
 *
 * Every refusal happens BEFORE any Twilio call. The SmsMessage row is reserved
 * first (unique idempotencyKey) so a retried logical message is at-most-once.
 * SMS is a separate transport from WhatsApp: To is a bare E.164 number, the
 * Messaging Service picks the sender (no From), and nothing here imports the
 * WhatsApp module. Raw provider bodies / message text / tokens / full numbers
 * are never logged or persisted.
 */

const ALLOWED_PROVIDER_STATUSES = new Set(['queued', 'accepted', 'sending', 'sent', 'delivered', 'undelivered', 'failed'])
const TIMEOUT_MS = 15_000
const MAX_MESSAGE_LENGTH = 1600
const MAX_KEY_LENGTH = 200

const CONSENT_REFUSAL: Record<SmsConsentReason, SmsRefusalReason> = {
  OK: 'NO_CONSENT', // unreachable: OK is handled before this map is used
  NO_RECORD: 'NO_CONSENT',
  NUMBER_MISMATCH: 'NO_CONSENT',
  REVOKED: 'CONSENT_REVOKED',
  NOT_GRANTED: 'CONSENT_NOT_GRANTED',
  WRONG_PURPOSE: 'CONSENT_WRONG_PURPOSE',
  LOOKUP_FAILED: 'CONSENT_LOOKUP_FAILED',
  INVALID_NUMBER: 'INVALID_NUMBER',
}

function refuse(reason: SmsRefusalReason): SmsSendResult {
  return { ok: false, refused: true, reason }
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'P2002'
}

function logCode(tag: string, code: string | null | undefined) {
  console.error(`[sms/sender] ${tag}`, code ?? 'unknown')
}

export async function sendCustomerCareSms(input: SendCustomerCareSmsInput): Promise<SmsSendResult> {
  // (a) classification
  const cls = typeof input.classification === 'string' ? input.classification.trim() : ''
  if (cls !== SMS_CUSTOMER_CARE) {
    const upper = cls.toUpperCase()
    return refuse(
      (FORBIDDEN_SMS_CLASSIFICATIONS as readonly string[]).includes(upper)
        ? 'FORBIDDEN_CLASSIFICATION'
        : 'INVALID_CLASSIFICATION',
    )
  }
  // (b) idempotency key
  const key = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : ''
  if (!key || key.length > MAX_KEY_LENGTH) return refuse('MISSING_IDEMPOTENCY_KEY')
  // (c) message
  const message = typeof input.message === 'string' ? input.message : ''
  if (!message.trim()) return refuse('EMPTY_MESSAGE')
  if (message.length > MAX_MESSAGE_LENGTH) return refuse('MESSAGE_TOO_LONG')
  // (d) recipient — no default country: national-format numbers are refused
  const n = normalizeSmsNumber(input.recipient)
  if (!n.ok) return refuse('INVALID_NUMBER')
  const e164 = n.e164
  // (e) config, fail closed
  const cfgRes = getSmsConfig()
  if (!cfgRes.ok) return refuse('CONFIG_MISSING')
  const cfg = cfgRes.config
  // (f) consent
  const consent = await hasSmsCustomerCareConsent(e164)
  if (!consent.allowed) return refuse(CONSENT_REFUSAL[consent.reason])

  // (g) reserve the row FIRST
  let row: { id: string; twilioMessageSid: string | null; status: string }
  try {
    row = await prisma.smsMessage.create({
      data: {
        direction: 'OUTBOUND',
        status: 'pending',
        classification: SMS_CUSTOMER_CARE,
        consentPurpose: SMS_CUSTOMER_CARE,
        phone: e164,
        body: message,
        contextRef: input.contextRef ?? null,
        clientId: input.clientId ?? null,
        idempotencyKey: key,
      },
      select: { id: true, twilioMessageSid: true, status: true },
    })
  } catch (e) {
    if (isUniqueViolation(e)) {
      const existing = await prisma.smsMessage.findUnique({
        where: { idempotencyKey: key },
        select: { id: true, twilioMessageSid: true, status: true, phone: true, body: true },
      })
      // Same key, DIFFERENT recipient or body = a caller bug, not a replay:
      // refuse loudly instead of claiming the new message was queued.
      if (existing && (existing.phone !== e164 || existing.body !== message)) {
        return { ok: false, refused: true, reason: 'IDEMPOTENCY_KEY_CONFLICT' }
      }
      if (existing) {
        return {
          ok: true,
          duplicate: true,
          messageId: existing.id,
          twilioMessageSid: existing.twilioMessageSid,
          status: existing.status as SmsStatus,
        }
      }
    }
    logCode('reserve failed', (e as { code?: string } | null)?.code)
    throw e
  }

  // (h) the only Twilio call
  const params = new URLSearchParams()
  params.set('To', e164)
  params.set('MessagingServiceSid', cfg.messagingServiceSid)
  params.set('Body', message)
  params.set('StatusCallback', cfg.statusCallbackUrl)

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  let providerErrorCode: string | null = null
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: ac.signal,
      },
    )
    let json: { sid?: unknown; status?: unknown; code?: unknown } | null = null
    try { json = await res.json() } catch { json = null }

    if (res.ok && typeof json?.sid === 'string') {
      // Twilio may answer with a status outside our CHECK set (e.g. 'scheduled');
      // clamp it so an ACCEPTED message is never mis-recorded as failed.
      const returned = typeof json.status === 'string' ? json.status.toLowerCase() : 'queued'
      const status = (ALLOWED_PROVIDER_STATUSES.has(returned) ? returned : 'queued') as SmsStatus
      await prisma.smsMessage.update({
        where: { id: row.id },
        data: { twilioMessageSid: json.sid, status, statusUpdatedAt: new Date() },
      })
      return { ok: true, duplicate: false, messageId: row.id, twilioMessageSid: json.sid, status }
    }
    providerErrorCode = json?.code !== undefined && json?.code !== null ? String(json.code) : `HTTP_${res.status}`
  } catch (e) {
    providerErrorCode = (e as { name?: string } | null)?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR'
  } finally {
    clearTimeout(timer)
  }

  // (i) failure bookkeeping — codes and masked ids only
  logCode(`provider error to ${maskId(e164)}`, providerErrorCode)
  try {
    await prisma.smsMessage.update({
      where: { id: row.id },
      data: {
        status: 'failed',
        errorCode: providerErrorCode,
        errorMessageSafe: safeSmsErrorMessage(providerErrorCode) ?? 'Delivery error',
        statusUpdatedAt: new Date(),
      },
    })
  } catch (e) {
    logCode('failed-row update failed', (e as { code?: string } | null)?.code)
  }
  if (isProviderOptOutErrorCode(providerErrorCode)) {
    try {
      await revokeSmsCustomerCare({
        e164,
        providerMessageSid: `provider_error_21610:${row.id}`,
        source: 'twilio_error_21610',
      })
    } catch (e) {
      logCode('21610 revoke mirror failed', (e as { code?: string } | null)?.code)
    }
  }
  return { ok: false, refused: false, reason: 'PROVIDER_ERROR', messageId: row.id, errorCode: providerErrorCode }
}
