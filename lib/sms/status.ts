/**
 * Outbound SMS delivery-status persistence (Twilio status callbacks).
 *
 * Monotonic + terminal-sticky, enforced ATOMICALLY in the WHERE clause of a
 * single updateMany (never read-then-write): Twilio retries and delivers
 * callbacks out of order, so two callbacks can race.
 *
 *   pending=0 < queued/accepted=1 < sending=2 < sent=3 < delivered=4
 *   delivered / undelivered / failed are TERMINAL: first terminal wins, a row
 *   in a terminal state is never touched again.
 *
 * Unknown SIDs are a no-op (rows are created only by the sender). Raw
 * payloads are never stored; only the Twilio error code and a safe message.
 */

import { prisma } from '@/lib/db'
import { maskId } from '@/lib/webhooks/verify'
import { safeSmsErrorMessage, isProviderOptOutErrorCode } from '@/lib/sms/errors'
import { revokeSmsCustomerCare } from '@/lib/sms/consent'

const TERMINAL = ['delivered', 'undelivered', 'failed'] as const
const NON_TERMINAL_RANKED = ['pending', 'queued', 'accepted', 'sending', 'sent'] as const

/** Statuses a row may currently hold for the given incoming status to apply. */
const ALLOWED_FROM: Record<string, string[]> = {
  queued: ['pending'],
  accepted: ['pending'],
  sending: ['pending', 'queued', 'accepted'],
  sent: ['pending', 'queued', 'accepted', 'sending'],
  delivered: [...NON_TERMINAL_RANKED],
  undelivered: [...NON_TERMINAL_RANKED],
  failed: [...NON_TERMINAL_RANKED],
}

/** Grace period for a callback that arrives before the SID is written. */
const SID_RACE_RETRY_MS = 500

export type SmsStatusOutcome = 'applied' | 'noop' | 'ignored'

export async function applySmsStatusUpdate(input: {
  messageSid: string
  status: string
  errorCode?: string | null
}): Promise<SmsStatusOutcome> {
  const status = (input.status ?? '').trim().toLowerCase()
  const allowedFrom = ALLOWED_FROM[status]
  if (!allowedFrom || !input.messageSid) return 'ignored'

  const isFailure = status === 'failed' || status === 'undelivered'
  const errorCode = isFailure && input.errorCode ? String(input.errorCode).trim() : ''
  const now = new Date()

  const attempt = () =>
    prisma.smsMessage.updateMany({
      where: {
        twilioMessageSid: input.messageSid,
        direction: 'OUTBOUND',
        AND: [{ status: { notIn: [...TERMINAL] } }, { status: { in: allowedFrom } }],
      },
      data: {
        status,
        statusUpdatedAt: now,
        ...(isFailure && errorCode
          ? { errorCode, errorMessageSafe: safeSmsErrorMessage(errorCode) }
          : {}),
      },
    })
  let result = await attempt()
  if (!result.count) {
    // A callback can beat the sender's write of the SID onto the row. If no
    // row carries this SID yet, wait briefly and try once more; if a row DOES
    // exist the callback was simply stale/duplicate (terminal or regressive).
    const known = await prisma.smsMessage.findFirst({
      where: { twilioMessageSid: input.messageSid, direction: 'OUTBOUND' },
      select: { id: true },
    })
    if (known) return 'noop'
    await new Promise((r) => setTimeout(r, SID_RACE_RETRY_MS))
    result = await attempt()
    if (!result.count) return 'noop'
  }

  // Provider-level opt-out: mirror into Walz consent (best-effort, idempotent).
  if (isFailure && isProviderOptOutErrorCode(errorCode)) {
    try {
      const row = await prisma.smsMessage.findFirst({
        where: { twilioMessageSid: input.messageSid, direction: 'OUTBOUND' },
        select: { phone: true },
      })
      if (row?.phone) {
        await revokeSmsCustomerCare({
          e164: row.phone,
          providerMessageSid: `status_21610:${input.messageSid}`,
          source: 'twilio_status_21610',
        })
      }
    } catch {
      console.error('[sms-status] revoke on 21610 failed', maskId(input.messageSid))
    }
  }
  return 'applied'
}
