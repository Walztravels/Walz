/**
 * Jade Travel Club Release 2B — reconciliation job.
 * Mirrors the shape of entitlements.test.ts's releaseExpiredReservations
 * coverage: a public, cron-friendly scan that must retry every stuck row
 * and never get stuck retrying one bad row forever.
 */

const mockAttemptActivation = jest.fn()
jest.mock('../purchase-activation', () => ({
  attemptActivation: (...args: any[]) => mockAttemptActivation(...args),
}))

function makeFakeDb() {
  const purchases = new Map<string, any>()
  return {
    db: {
      jadeClubPurchase: {
        findMany: async ({ where }: any) => {
          return [...purchases.values()].filter(p => p.activationStatus === where.activationStatus)
        },
      },
    },
    purchases,
  }
}

const { db: fakeDb, purchases } = makeFakeDb()
jest.mock('@/lib/db', () => ({ __esModule: true, default: fakeDb }))

import { reconcilePendingActivations } from '../purchase-reconciliation'

beforeEach(() => {
  purchases.clear()
  mockAttemptActivation.mockReset()
})

describe('reconcilePendingActivations', () => {
  it('scans every PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING row and retries each one', async () => {
    purchases.set('p1', { id: 'p1', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', createdAt: new Date(1) })
    purchases.set('p2', { id: 'p2', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', createdAt: new Date(2) })
    purchases.set('p3', { id: 'p3', activationStatus: 'ACTIVATED', createdAt: new Date(3) }) // not scanned

    mockAttemptActivation
      .mockResolvedValueOnce({ outcome: 'ACTIVATED', termsId: 't1' })
      .mockResolvedValueOnce({ outcome: 'FAILED_RETRYABLE', error: 'blip' })

    const summary = await reconcilePendingActivations()
    expect(summary.scanned).toBe(2)
    expect(summary.activated).toBe(1)
    expect(summary.stillPending).toBe(1)
    expect(mockAttemptActivation).toHaveBeenCalledWith('p1')
    expect(mockAttemptActivation).toHaveBeenCalledWith('p2')
    expect(mockAttemptActivation).not.toHaveBeenCalledWith('p3')
  })

  it('one row throwing an unexpected error never blocks the rest of the batch', async () => {
    purchases.set('p1', { id: 'p1', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', createdAt: new Date(1) })
    purchases.set('p2', { id: 'p2', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', createdAt: new Date(2) })

    mockAttemptActivation
      .mockRejectedValueOnce(new Error('unexpected'))
      .mockResolvedValueOnce({ outcome: 'ACTIVATED', termsId: 't2' })

    const summary = await reconcilePendingActivations()
    expect(summary.scanned).toBe(2)
    expect(summary.activated).toBe(1)
    expect(summary.stillPending).toBe(1)
  })

  it('counts FAILED_PERMANENTLY outcomes distinctly — a row is never retried forever silently', async () => {
    purchases.set('p1', { id: 'p1', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', createdAt: new Date(1) })
    mockAttemptActivation.mockResolvedValueOnce({ outcome: 'FAILED_PERMANENTLY', reason: 'MAX_RETRIES_EXCEEDED' })

    const summary = await reconcilePendingActivations()
    expect(summary.failedPermanently).toBe(1)
  })

  it('counts REQUIRES_RECONCILIATION outcomes distinctly (Case B of the race-condition remediation) — never conflated with failedPermanently', async () => {
    purchases.set('p1', { id: 'p1', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', createdAt: new Date(1) })
    mockAttemptActivation.mockResolvedValueOnce({ outcome: 'REQUIRES_RECONCILIATION', reason: 'DUPLICATE_PAID_MEMBERSHIP_PURCHASE' })

    const summary = await reconcilePendingActivations()
    expect(summary.requiresReconciliation).toBe(1)
    expect(summary.failedPermanently).toBe(0)
  })
})
