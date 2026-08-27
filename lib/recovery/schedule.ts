// Recovery contact scheduler (Release 3C)
//
// runScheduledRecoveryContacts():
//   Finds all opportunities with nextActionAt <= NOW() and active status.
//   Processes them serially (avoids Resend rate limits) via sendRecoveryMessage().
//
// Initial nextActionAt values (set when opportunity is first created):
//   ABANDONED_CART:  4 hours after detection
//   UNPAID_PROPOSAL: 4 hours after detection
//   FAILED_PAYMENT:  2 hours after detection (single automated message)
//   INCOMPLETE_TRIP: 24 hours after detection
//   SUPPLIER_FAILURE: never (suppressed before send; no nextActionAt set)
//   HOT_LEAD:         never (staff notification only; no nextActionAt set)

import prisma                  from '@/lib/db'
import { sendRecoveryMessage } from './message'

export const INITIAL_CONTACT_DELAY_MS: Record<string, number> = {
  ABANDONED_CART:  4  * 60 * 60 * 1000,
  UNPAID_PROPOSAL: 4  * 60 * 60 * 1000,
  FAILED_PAYMENT:  2  * 60 * 60 * 1000,
  INCOMPLETE_TRIP: 24 * 60 * 60 * 1000,
}

// Called by the detect functions (via opportunity.ts) to set the initial contact time
export function initialNextActionAt(type: string): Date | null {
  const delayMs = INITIAL_CONTACT_DELAY_MS[type]
  if (!delayMs) return null
  return new Date(Date.now() + delayMs)
}

// Run all due scheduled contacts. Called from the recovery-detect cron.
export async function runScheduledRecoveryContacts(): Promise<number> {
  if (
    process.env.RECOVERY_ENGINE_ENABLED !== 'true' ||
    (process.env.RECOVERY_EMAIL_ENABLED !== 'true' && process.env.RECOVERY_WHATSAPP_ENABLED !== 'true')
  ) {
    return 0
  }

  const due = await prisma.recoveryOpportunity.findMany({
    where: {
      nextActionAt: { lte: new Date() },
      status:       { in: ['OPEN', 'CONTACTED'] },
    },
    select: { id: true },
    take:   50,   // process at most 50 per cron run to stay within maxDuration:60
    orderBy: { nextActionAt: 'asc' },
  })

  let processed = 0
  for (const { id } of due) {
    try {
      await sendRecoveryMessage(id)
      processed++
    } catch (err) {
      console.warn('[RecoverySchedule] failed for', id, (err as Error).message)
    }
  }
  return processed
}
