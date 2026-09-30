/**
 * Jade Travel Club Release 2B — the CAS purchase state machine, one test
 * per scenario from docs/jade-2b-purchase-state-machine.md.
 *
 * lib/jade-club/entitlements.ts::activateMembershipTerms and
 * lib/jade-club/membership.ts::applyPurchaseTierBump are mocked here on
 * purpose — this suite's job is to prove
 * lib/jade-club/purchase-activation.ts's OWN CAS transitions and guard
 * clauses are correct in isolation (2A's engine is already exhaustively
 * tested in entitlements.test.ts and is explicitly frozen/untouched; the
 * full real wiring is proven separately in purchase-integration.test.ts).
 */

function nid(prefix: string, seq: { n: number }) { return `${prefix}_${++seq.n}` }

function makeFakeDb() {
  const seq = { n: 0 }
  const purchases = new Map<string, any>()
  const activityLogs: any[] = []

  function seedPurchase(overrides: Partial<any> = {}) {
    const id = overrides.id ?? nid('purchase', seq)
    const row = {
      id, userId: 'user_1', membershipId: null, policyId: 'policy_1', policyVersion: 1,
      tier: 'CLUB', market: 'NG', currency: 'NGN', amountMinor: 8_500_000,
      provider: 'STRIPE', providerReference: `cs_${id}`,
      paymentStatus: 'PENDING', activationStatus: 'NOT_STARTED', activationAttempts: 0,
      membershipTermsId: null, failureReason: null,
      createdAt: new Date(), paidAt: null, activatedAt: null, updatedAt: new Date(),
      ...overrides,
    }
    purchases.set(id, row)
    return row
  }

  const db: any = {
    jadeClubPurchase: {
      create: async ({ data }: any) => seedPurchase(data),
      findUnique: async ({ where }: any) => (where.id && purchases.has(where.id)) ? { ...purchases.get(where.id) } : null,
      findFirst: async ({ where }: any) => {
        for (const p of purchases.values()) {
          if (where.id !== undefined && p.id !== where.id) continue
          if (where.provider !== undefined && p.provider !== where.provider) continue
          if (where.providerReference !== undefined && p.providerReference !== where.providerReference) continue
          return { ...p }
        }
        return null
      },
      update: async ({ where, data }: any) => {
        const row = purchases.get(where.id)
        if (data.activationAttempts?.increment !== undefined) row.activationAttempts += data.activationAttempts.increment
        const { activationAttempts, ...rest } = data
        Object.assign(row, rest, { updatedAt: new Date() })
        return { ...row }
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0
        for (const p of purchases.values()) {
          if (where.id !== undefined && p.id !== where.id) continue
          if (where.paymentStatus !== undefined && p.paymentStatus !== where.paymentStatus) continue
          if (where.activationStatus !== undefined && p.activationStatus !== where.activationStatus) continue
          if (where.provider !== undefined && p.provider !== where.provider) continue
          if (where.providerReference && typeof where.providerReference === 'object' && where.providerReference.startsWith !== undefined) {
            if (!p.providerReference.startsWith(where.providerReference.startsWith)) continue
          } else if (where.providerReference !== undefined) {
            if (p.providerReference !== where.providerReference) continue
          }
          Object.assign(p, data, { updatedAt: new Date() })
          count++
        }
        return { count }
      },
    },
    activityLog: {
      create: async ({ data }: any) => { activityLogs.push(data); return { id: nid('log', seq), createdAt: new Date(), ...data } },
    },
  }
  return { db, purchases, activityLogs, seedPurchase }
}

const { db: fakeDb, purchases, activityLogs, seedPurchase } = makeFakeDb()

jest.mock('@/lib/db', () => ({ __esModule: true, default: fakeDb }))

const mockApplyPurchaseTierBump = jest.fn()
jest.mock('../membership', () => ({
  applyPurchaseTierBump: (...args: any[]) => mockApplyPurchaseTierBump(...args),
}))

const mockActivateMembershipTerms = jest.fn()
jest.mock('../entitlements', () => ({
  activateMembershipTerms: (...args: any[]) => mockActivateMembershipTerms(...args),
}))

import {
  recordCheckoutSessionPaid, recordCheckoutSessionFailed, recordRefund,
  attemptActivation, adminResetForRetry, MAX_ACTIVATION_ATTEMPTS,
} from '../purchase-activation'
import type { AdminSession } from '@/lib/admin-auth'

const FAKE_ADMIN: AdminSession = {
  id: 'staff_1', email: 'a@walztravels.com', name: 'Ada', roleTitle: 'Ops', sendingEmail: 'a@walztravels.com',
  signatureTagline: null, role: 'super_admin', staffRole: 'super_admin', permissions: { 'jade_club.manage': true },
  branch: 'HQ', department: 'ops', isActive: true,
}

beforeEach(() => {
  purchases.clear()
  activityLogs.length = 0
  mockApplyPurchaseTierBump.mockReset()
  mockActivateMembershipTerms.mockReset()
})

// jadeClubMembership.findUnique is needed by attemptActivation but is not
// on the fake db above — add it lazily per test where needed via a simple
// stub attached to fakeDb (kept out of the shared factory to keep it
// minimal for the CAS-focused tests that don't reach that far).
beforeEach(() => {
  (fakeDb as any).jadeClubMembership = { findUnique: async () => ({ id: 'membership_1' }) }
  ;(fakeDb as any).jadeClubCommercialPolicy = { findUnique: async () => ({ id: 'policy_1', status: 'ACTIVE', durationMonths: 12 }) }
})

describe('Scenario 1 — checkout created but abandoned (never completed)', () => {
  it('a PENDING purchase with no webhook delivery is simply inert — attemptActivation is a safe no-op', async () => {
    const p = seedPurchase({ paymentStatus: 'PENDING', activationStatus: 'NOT_STARTED' })
    const outcome = await attemptActivation(p.id)
    expect(outcome.outcome).toBe('NOT_READY')
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.paymentStatus).toBe('PENDING')
    expect(after.activationStatus).toBe('NOT_STARTED')
  })
})

describe('Scenario 2 — payment failed', () => {
  it('checkout.session.expired CAS-transitions PENDING -> FAILED with a safe reason, never touches activationStatus', async () => {
    const p = seedPurchase({ paymentStatus: 'PENDING' })
    await recordCheckoutSessionFailed(p.providerReference, 'SESSION_EXPIRED')
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.paymentStatus).toBe('FAILED')
    expect(after.failureReason).toBe('SESSION_EXPIRED')
    expect(after.activationStatus).toBe('NOT_STARTED')
  })

  it('never retro-fails an already-SUCCEEDED purchase (CAS guard)', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED' })
    await recordCheckoutSessionFailed(p.providerReference, 'SESSION_EXPIRED')
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.paymentStatus).toBe('SUCCEEDED')
  })
})

describe('Scenario 3 — payment confirmed', () => {
  it('CAS-transitions PENDING -> SUCCEEDED and immediately arms PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', async () => {
    const p = seedPurchase({ paymentStatus: 'PENDING', activationStatus: 'NOT_STARTED' })
    const result = await recordCheckoutSessionPaid({ providerReference: p.providerReference, amountTotalMinor: p.amountMinor, currency: p.currency })
    expect(result.outcome).toBe('CONFIRMED_PENDING_ACTIVATION')
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.paymentStatus).toBe('SUCCEEDED')
    expect(after.paidAt).toBeTruthy()
  })
})

describe('Scenario 4 — activation pending', () => {
  it('is a durable, committed intermediate state — reachable and readable independently of activation succeeding', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })
    const before = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(before.activationStatus).toBe('PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING')
  })
})

describe('Scenario 5 — activation succeeded', () => {
  it('calls applyPurchaseTierBump then activateMembershipTerms in that order, then CAS-transitions to ACTIVATED', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })
    mockApplyPurchaseTierBump.mockResolvedValue({ changed: true, membership: { id: 'membership_1' } })
    mockActivateMembershipTerms.mockResolvedValue({ termsId: 'terms_1', expiresAt: new Date(), benefitCount: 1, slotsIssued: 1 })

    const outcome = await attemptActivation(p.id)
    expect(outcome).toEqual({ outcome: 'ACTIVATED', termsId: 'terms_1' })

    const bumpOrder = mockApplyPurchaseTierBump.mock.invocationCallOrder[0]
    const activateOrder = mockActivateMembershipTerms.mock.invocationCallOrder[0]
    expect(bumpOrder).toBeLessThan(activateOrder)

    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.activationStatus).toBe('ACTIVATED')
    expect(after.membershipTermsId).toBe('terms_1')
    expect(after.activatedAt).toBeTruthy()
  })
})

describe('Scenario 6 — activation retry after a transient failure', () => {
  it('a thrown error leaves the row at PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING and reports FAILED_RETRYABLE below the max attempts', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', activationAttempts: 1 })
    mockApplyPurchaseTierBump.mockRejectedValue(new Error('transient DB blip'))

    const outcome = await attemptActivation(p.id)
    expect(outcome.outcome).toBe('FAILED_RETRYABLE')

    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.activationStatus).toBe('PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING')
    expect(after.activationAttempts).toBe(2)
  })

  it('is marked FAILED_PERMANENTLY once MAX_ACTIVATION_ATTEMPTS is reached, with a staff-visible ActivityLog entry', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', activationAttempts: MAX_ACTIVATION_ATTEMPTS - 1 })
    mockApplyPurchaseTierBump.mockRejectedValue(new Error('still failing'))

    const outcome = await attemptActivation(p.id)
    expect(outcome).toEqual({ outcome: 'FAILED_PERMANENTLY', reason: 'MAX_RETRIES_EXCEEDED' })

    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.activationStatus).toBe('FAILED_PERMANENTLY')
    expect(after.failureReason).toBe('MAX_RETRIES_EXCEEDED')
    expect(activityLogs.some(l => l.action === 'JADE_CLUB_PURCHASE_ACTIVATION_FAILED_PERMANENTLY')).toBe(true)
  })
})

describe('Scenario 7 — refund before activation', () => {
  it('a refund landing while PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING stops the NEXT activation attempt cold', async () => {
    const p = seedPurchase({ paymentStatus: 'REFUNDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })
    const outcome = await attemptActivation(p.id)
    expect(outcome).toEqual({ outcome: 'FAILED_PERMANENTLY', reason: 'REFUNDED_BEFORE_ACTIVATION' })
    expect(mockApplyPurchaseTierBump).not.toHaveBeenCalled()
    expect(mockActivateMembershipTerms).not.toHaveBeenCalled()
  })
})

describe('Scenario 8 — refund after activation', () => {
  it('CAS-transitions SUCCEEDED -> REFUNDED without touching activationStatus/membershipTermsId', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'ACTIVATED', membershipTermsId: 'terms_1' })
    await recordRefund(p.providerReference)
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.paymentStatus).toBe('REFUNDED')
    expect(after.activationStatus).toBe('ACTIVATED')
    expect(after.membershipTermsId).toBe('terms_1')
    expect(activityLogs.some(l => l.action === 'JADE_CLUB_PURCHASE_REFUNDED')).toBe(true)
  })
})

describe('Scenario 9 — duplicate webhook delivery', () => {
  it('a second checkout.session.completed for an already-SUCCEEDED purchase is a clean no-op, never an error', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'ACTIVATED' })
    const result = await recordCheckoutSessionPaid({ providerReference: p.providerReference, amountTotalMinor: p.amountMinor, currency: p.currency })
    expect(result.outcome).toBe('DUPLICATE_IGNORED')
  })

  it('a second attemptActivation call for an already-ACTIVATED purchase is a clean no-op', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'ACTIVATED' })
    const outcome = await attemptActivation(p.id)
    expect(outcome).toEqual({ outcome: 'ALREADY_ACTIVATED' })
    expect(mockApplyPurchaseTierBump).not.toHaveBeenCalled()
  })
})

describe('Scenario 10 — concurrent webhook delivery (two workers racing the same purchase)', () => {
  it('exactly one of two simultaneous payment-confirmation CAS attempts wins', async () => {
    const p = seedPurchase({ paymentStatus: 'PENDING' })
    const [r1, r2] = await Promise.all([
      recordCheckoutSessionPaid({ providerReference: p.providerReference, amountTotalMinor: p.amountMinor, currency: p.currency }),
      recordCheckoutSessionPaid({ providerReference: p.providerReference, amountTotalMinor: p.amountMinor, currency: p.currency }),
    ])
    const outcomes = [r1.outcome, r2.outcome].sort()
    expect(outcomes).toEqual(['CONFIRMED_PENDING_ACTIVATION', 'DUPLICATE_IGNORED'])
  })

  it('activateMembershipTerms throwing its own "unexpired terms" guard is treated as non-retryable (DUPLICATE_ACTIVE_TERMS)', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })
    mockApplyPurchaseTierBump.mockResolvedValue({ changed: true, membership: { id: 'membership_1' } })
    mockActivateMembershipTerms.mockRejectedValue(new Error('This membership already has an unexpired commercial terms period — renewal is not implemented in Release 2A'))

    const outcome = await attemptActivation(p.id)
    expect(outcome).toEqual({ outcome: 'FAILED_PERMANENTLY', reason: 'DUPLICATE_ACTIVE_TERMS' })
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.activationStatus).toBe('FAILED_PERMANENTLY')
  })
})

describe('Scenario 11 — provider reference uniqueness', () => {
  it('the webhook looks up the purchase by (provider, providerReference) ONLY — never by a client-echoed purchaseId when a real row already matches', async () => {
    const real = seedPurchase({ paymentStatus: 'PENDING' })
    const attacker = seedPurchase({ paymentStatus: 'PENDING', userId: 'user_evil' })
    // purchaseIdHint points at the attacker's row, but providerReference
    // matches the REAL purchase — the real row must be the one updated.
    const result = await recordCheckoutSessionPaid({
      providerReference: real.providerReference, amountTotalMinor: real.amountMinor, currency: real.currency,
      purchaseIdHint: attacker.id,
    })
    expect(result).toEqual({ outcome: 'CONFIRMED_PENDING_ACTIVATION', purchaseId: real.id })
    const attackerAfter = await fakeDb.jadeClubPurchase.findUnique({ where: { id: attacker.id } })
    expect(attackerAfter.paymentStatus).toBe('PENDING') // untouched
  })

  it('self-heals a crash-window placeholder reference ONLY when it still carries the placeholder prefix', async () => {
    const p = seedPurchase({ paymentStatus: 'PENDING', providerReference: 'pending:abc123' })
    const result = await recordCheckoutSessionPaid({
      providerReference: 'cs_real_session', amountTotalMinor: p.amountMinor, currency: p.currency, purchaseIdHint: p.id,
    })
    expect(result.outcome).toBe('CONFIRMED_PENDING_ACTIVATION')
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.providerReference).toBe('cs_real_session')
  })
})

describe('Scenario 12 — exact currency/amount reconciliation', () => {
  it('an amount mismatch records SUCCEEDED truthfully but blocks activation with a safe, staff-visible reason', async () => {
    const p = seedPurchase({ paymentStatus: 'PENDING', amountMinor: 8_500_000, currency: 'NGN' })
    const result = await recordCheckoutSessionPaid({ providerReference: p.providerReference, amountTotalMinor: 1_000_000, currency: 'NGN' })
    expect(result.outcome).toBe('AMOUNT_MISMATCH')
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.paymentStatus).toBe('SUCCEEDED')
    expect(after.activationStatus).toBe('FAILED_PERMANENTLY')
    expect(after.failureReason).toBe('AMOUNT_MISMATCH')
    expect(activityLogs.some(l => l.action === 'JADE_CLUB_PURCHASE_AMOUNT_MISMATCH')).toBe(true)
  })

  it('a currency mismatch (same amount, different currency) is also blocked, never silently accepted', async () => {
    const p = seedPurchase({ paymentStatus: 'PENDING', amountMinor: 8_500_000, currency: 'NGN' })
    const result = await recordCheckoutSessionPaid({ providerReference: p.providerReference, amountTotalMinor: 8_500_000, currency: 'USD' })
    expect(result.outcome).toBe('AMOUNT_MISMATCH')
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.failureReason).toBe('CURRENCY_MISMATCH')
  })

  it('an exact match on both amount and currency proceeds normally', async () => {
    const p = seedPurchase({ paymentStatus: 'PENDING', amountMinor: 8_500_000, currency: 'NGN' })
    const result = await recordCheckoutSessionPaid({ providerReference: p.providerReference, amountTotalMinor: 8_500_000, currency: 'ngn' })
    expect(result.outcome).toBe('CONFIRMED_PENDING_ACTIVATION')
  })
})

describe('Policy no longer ACTIVE at activation time (policy/version race)', () => {
  it('fails safe as FAILED_PERMANENTLY rather than activating stale/superseded terms', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })
    ;(fakeDb as any).jadeClubCommercialPolicy = { findUnique: async () => ({ id: 'policy_1', status: 'SUPERSEDED', durationMonths: 12 }) }

    const outcome = await attemptActivation(p.id)
    expect(outcome).toEqual({ outcome: 'FAILED_PERMANENTLY', reason: 'POLICY_NO_LONGER_ACTIVE' })
    expect(mockApplyPurchaseTierBump).not.toHaveBeenCalled()
  })
})

describe('Admin retry (reason-required, audited)', () => {
  it('resets a FAILED_PERMANENTLY + SUCCEEDED row back to retryable, with an audit entry', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'FAILED_PERMANENTLY', failureReason: 'MAX_RETRIES_EXCEEDED', activationAttempts: 5 })
    await adminResetForRetry(FAKE_ADMIN, p.id, 'Transient DB outage has been resolved — retrying')
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.activationStatus).toBe('PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING')
    expect(after.failureReason).toBeNull()
    expect(after.activationAttempts).toBe(0)
    expect(activityLogs.some(l => l.action === 'JADE_CLUB_PURCHASE_ACTIVATION_RETRY_RESET' && l.staffId === 'staff_1')).toBe(true)
  })

  it('rejects a missing reason', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'FAILED_PERMANENTLY' })
    await expect(adminResetForRetry(FAKE_ADMIN, p.id, '')).rejects.toThrow('A reason is required')
  })

  it('refuses to retry a REFUNDED purchase (paymentStatus must still be SUCCEEDED)', async () => {
    const p = seedPurchase({ paymentStatus: 'REFUNDED', activationStatus: 'FAILED_PERMANENTLY' })
    await expect(adminResetForRetry(FAKE_ADMIN, p.id, 'please retry')).rejects.toThrow('nothing to retry')
  })
})
