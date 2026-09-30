// lib/jade-club/purchase-reconciliation.ts — Jade Travel Club Release 2B:
// public maintenance entry point for stuck purchase activations.
//
// Mirrors lib/jade-club/entitlements.ts::releaseExpiredReservations's
// shape: a public, cron-friendly, idempotent scan-and-retry function that
// tests can also call directly to simulate a scheduled run deterministically.
//
// Scans activationStatus = 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' rows
// and retries attemptActivation() for each. A row that hits
// MAX_ACTIVATION_ATTEMPTS is marked FAILED_PERMANENTLY by attemptActivation
// itself (with a staff-visible ActivityLog entry) — this function never
// retries a row forever silently.

import prisma from '@/lib/db'
import { attemptActivation, type AttemptActivationOutcome } from './purchase-activation'

export interface ReconciliationSummary {
  scanned: number
  activated: number
  stillPending: number
  failedPermanently: number
  alreadyDone: number
}

/**
 * Scans and retries every PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING purchase.
 * Intended for a scheduled job (e.g. a cron route); also called directly by
 * tests. Processes rows one at a time (not in a single transaction) so one
 * row's failure never blocks the rest of the batch.
 */
export async function reconcilePendingActivations(limit = 200): Promise<ReconciliationSummary> {
  const pending = await prisma.jadeClubPurchase.findMany({
    where: { activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  })

  const summary: ReconciliationSummary = { scanned: pending.length, activated: 0, stillPending: 0, failedPermanently: 0, alreadyDone: 0 }

  for (const row of pending) {
    let outcome: AttemptActivationOutcome
    try {
      outcome = await attemptActivation(row.id)
    } catch (err) {
      console.error('[jade-club/purchase-reconciliation] unexpected error retrying', row.id, err)
      summary.stillPending++
      continue
    }

    switch (outcome.outcome) {
      case 'ACTIVATED': summary.activated++; break
      case 'ALREADY_ACTIVATED': summary.alreadyDone++; break
      case 'FAILED_PERMANENTLY': summary.failedPermanently++; break
      case 'FAILED_RETRYABLE':
      case 'NOT_READY':
      default: summary.stillPending++; break
    }
  }

  return summary
}
