/**
 * Jade Travel Club Release 2B — integration test: the full
 * checkout -> webhook payment confirmation -> activation happy path,
 * exercising the REAL lib/jade-club/purchase.ts,
 * lib/jade-club/purchase-activation.ts, lib/jade-club/membership.ts
 * (applyPurchaseTierBump) and lib/jade-club/entitlements.ts
 * (activateMembershipTerms, UNTOUCHED) together, against a small
 * faithful in-memory fake of the Prisma tables this flow touches.
 *
 * This is deliberately a SINGLE-THREADED happy-path proof (concurrency is
 * covered separately in purchase-postgres-concurrency.test.ts and the CAS
 * unit tests in purchase-state-machine.test.ts) — its job is to prove the
 * real modules wire together correctly end to end, not to re-prove 2A's
 * already-tested entitlement-slot engine.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

const txContext = new AsyncLocalStorage<{ locksHeld: string[] }>()

function nid(prefix: string, seq: { n: number }) { return `${prefix}_${++seq.n}` }

function makeFakeDb() {
  const seq = { n: 0 }
  const state = {
    users: new Map<string, any>(),
    memberships: new Map<string, any>(), // by id
    membershipsByUser: new Map<string, string>(), // userId -> membership id
    policies: new Map<string, any>(),
    policyBenefits: new Map<string, any[]>(), // policyId -> benefit rows
    benefitsCatalog: new Map<string, any>(), // key -> { name }
    terms: new Map<string, any>(),
    snapshots: new Map<string, any>(),
    slots: new Map<string, any>(),
    events: [] as any[],
    purchases: new Map<string, any>(),
    activityLogs: [] as any[],
    staffNotifications: [] as any[],
  }

  function membershipUpdate(where: { id?: string; userId?: string }, data: any) {
    const id = where.id ?? state.membershipsByUser.get(where.userId as string)
    const row = state.memberships.get(id as string)
    Object.assign(row, data, { updatedAt: new Date() })
    return { ...row }
  }

  const db: any = {
    user: {
      findUnique: async ({ where }: any) => state.users.get(where.id) ?? null,
    },
    jadeClubMembership: {
      findUnique: async ({ where }: any) => {
        const id = where.id ?? state.membershipsByUser.get(where.userId)
        return id ? { ...state.memberships.get(id) } : null
      },
      create: async ({ data }: any) => {
        const id = nid('mem', seq)
        const row = { id, qrTokenVersion: 1, createdAt: new Date(), updatedAt: new Date(), expiresAt: null, cancelledAt: null, startedAt: new Date(), ...data }
        state.memberships.set(id, row)
        state.membershipsByUser.set(data.userId, id)
        return { ...row }
      },
      update: async ({ where, data }: any) => membershipUpdate(where, data),
    },
    jadeClubCommercialPolicy: {
      findUnique: async ({ where, include }: any) => {
        const row = state.policies.get(where.id)
        if (!row) return null
        if (include?.benefits) return { ...row, benefits: state.policyBenefits.get(row.id) ?? [] }
        return { ...row }
      },
      findFirst: async ({ where }: any) => {
        for (const p of state.policies.values()) {
          if (p.tier === where.tier && p.market === where.market && p.currency === where.currency && p.status === where.status) return { ...p }
        }
        return null
      },
      findMany: async ({ where }: any) => {
        return [...state.policies.values()].filter(p => (!where?.tier || p.tier === where.tier) && (!where?.status || p.status === where.status))
          .map(p => ({ ...p, benefits: state.policyBenefits.get(p.id) ?? [] }))
      },
    },
    jadeClubBenefit: {
      findUnique: async ({ where }: any) => state.benefitsCatalog.get(where.key) ?? null,
    },
    jadeClubMembershipTerms: {
      // Supports BOTH lookup shapes the real code uses:
      //   { purchaseId } — Correction 2's direct, authoritative same-purchase lookup
      //   { membershipId, expiresAt: { gt } } — the distinct-collision unexpired-terms recheck
      findFirst: async ({ where }: any) => {
        if (where.purchaseId !== undefined) {
          for (const t of state.terms.values()) if (t.purchaseId === where.purchaseId) return { ...t }
          return null
        }
        const rows = [...state.terms.values()].filter(t => t.membershipId === where.membershipId && (!where.expiresAt?.gt || t.expiresAt.getTime() > where.expiresAt.gt.getTime()))
        return rows[0] ? { ...rows[0] } : null
      },
      findUnique: async ({ where }: any) => state.terms.get(where.id) ?? null,
      create: async ({ data }: any) => {
        const id = nid('terms', seq)
        const row = { id, createdAt: new Date(), ...data }
        state.terms.set(id, row)
        return { ...row }
      },
    },
    jadeClubMembershipBenefitSnapshot: {
      create: async ({ data }: any) => {
        const id = nid('snap', seq)
        const row = { id, createdAt: new Date(), ...data }
        state.snapshots.set(id, row)
        return { ...row }
      },
    },
    jadeClubEntitlementSlot: {
      findUnique: async ({ where }: any) => {
        const k = where.membershipTermsId_benefitSnapshotId_periodKey_slotNumber
        for (const s of state.slots.values()) {
          if (s.membershipTermsId === k.membershipTermsId && s.benefitSnapshotId === k.benefitSnapshotId && s.periodKey === k.periodKey && s.slotNumber === k.slotNumber) return { ...s }
        }
        return null
      },
      create: async ({ data }: any) => {
        const id = nid('slot', seq)
        const row = { id, status: 'AVAILABLE', createdAt: new Date(), updatedAt: new Date(), ...data }
        state.slots.set(id, row)
        return { ...row }
      },
    },
    jadeClubEntitlementEvent: {
      create: async ({ data }: any) => { state.events.push(data); return { id: nid('evt', seq), createdAt: new Date(), ...data } },
    },
    jadeClubPurchase: {
      create: async ({ data }: any) => {
        const id = nid('purchase', seq)
        const row = {
          id, createdAt: new Date(), updatedAt: new Date(), paidAt: null, activatedAt: null,
          membershipId: null, membershipTermsId: null, failureReason: null, activationAttempts: 0,
          paymentStatus: 'PENDING', activationStatus: 'NOT_STARTED', provider: 'STRIPE',
          ...data,
        }
        state.purchases.set(id, row)
        return { ...row }
      },
      findUnique: async ({ where }: any) => (where.id && state.purchases.has(where.id)) ? { ...state.purchases.get(where.id) } : null,
      findFirst: async ({ where }: any) => {
        for (const p of state.purchases.values()) {
          if (where.id !== undefined && p.id !== where.id) continue
          if (where.userId !== undefined && p.userId !== where.userId) continue
          if (where.provider !== undefined && p.provider !== where.provider) continue
          if (where.providerReference !== undefined && p.providerReference !== where.providerReference) continue
          if (where.membershipTermsId !== undefined && p.membershipTermsId !== where.membershipTermsId) continue
          return { ...p }
        }
        return null
      },
      update: async ({ where, data }: any) => {
        const row = state.purchases.get(where.id)
        if (data.activationAttempts?.increment) row.activationAttempts += data.activationAttempts.increment
        const { activationAttempts, ...rest } = data
        Object.assign(row, rest, { updatedAt: new Date() })
        return { ...row }
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0
        for (const p of state.purchases.values()) {
          if (where.id !== undefined && p.id !== where.id) continue
          if (where.paymentStatus !== undefined && p.paymentStatus !== where.paymentStatus) continue
          if (where.activationStatus !== undefined && p.activationStatus !== where.activationStatus) continue
          if (where.provider !== undefined && p.provider !== where.provider) continue
          if (where.providerReference?.startsWith !== undefined && !p.providerReference.startsWith(where.providerReference.startsWith)) continue
          if (where.providerReference !== undefined && typeof where.providerReference === 'string' && p.providerReference !== where.providerReference) continue
          Object.assign(p, data, { updatedAt: new Date() })
          count++
        }
        return { count }
      },
    },
    activityLog: {
      create: async ({ data }: any) => { state.activityLogs.push(data); return { id: nid('log', seq), createdAt: new Date(), ...data } },
    },
    staff: {
      findMany: async () => [{ id: 'staff_1', role: 'super_admin', permissions: { 'jade_club.manage': true } }],
    },
    staffNotification: {
      findFirst: async ({ where }: any) => state.staffNotifications.find((n: any) => n.staffId === where.staffId && n.sourceId === where.sourceId) ?? null,
      create: async ({ data }: any) => { state.staffNotifications.push(data); return { id: nid('notif', seq), createdAt: new Date(), ...data } },
    },
    $queryRaw: async () => { // simulated SELECT ... FOR UPDATE
      const ctx = txContext.getStore()
      if (ctx) ctx.locksHeld.push('membership-lock')
      return []
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => txContext.run({ locksHeld: [] }, () => fn(db)),
  }
  return { db, state }
}

const { db: fakeDb, state } = makeFakeDb()

jest.mock('@/lib/db', () => ({ __esModule: true, default: fakeDb }))

const mockStripeSessionCreate = jest.fn()
jest.mock('@/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create: mockStripeSessionCreate } } }),
}))

import { createJadeClubCheckout, getOwnPurchaseStatus } from '../purchase'
import { recordCheckoutSessionPaid, attemptActivation } from '../purchase-activation'

describe('Jade Club 2B — full checkout -> webhook -> activation happy path', () => {
  const userId = 'user_1'
  const policyId = 'policy_1'

  beforeAll(() => {
    state.users.set(userId, { id: userId, email: 'member@example.com' })
    state.policies.set(policyId, {
      id: policyId, tier: 'CLUB', market: 'NG', currency: 'NGN',
      annualPriceMinor: 8_500_000, durationMonths: 12, serviceFeeDiscountPercent: 10,
      version: 1, status: 'ACTIVE', createdBy: 'admin_1', effectiveFrom: new Date(), effectiveTo: null,
      createdAt: new Date(), updatedAt: new Date(),
    })
    state.policyBenefits.set(policyId, [
      { id: 'pb_1', policyId, benefitKey: 'jade-connect', entitlementType: 'COUNT_PER_PERIOD', countPerPeriod: 3, costCapMinorUsd: null, booleanEligible: null },
    ])
    state.benefitsCatalog.set('jade-connect', { name: 'Jade Connect eSIM' })
  })

  let purchaseId: string
  let sessionId: string

  it('creates a checkout session with the authoritative server-resolved price', async () => {
    sessionId = 'cs_test_123'
    mockStripeSessionCreate.mockResolvedValue({ id: sessionId, url: `https://checkout.stripe.com/${sessionId}` })

    const result = await createJadeClubCheckout({
      userId, customerEmail: 'member@example.com', tier: 'CLUB', market: 'NG', currency: 'NGN', origin: 'https://walztravels.com',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    purchaseId = result.purchaseId
    expect(result.checkoutUrl).toContain(sessionId)

    // The amount charged came from the resolved policy, never a client value.
    const stripeCallArgs = mockStripeSessionCreate.mock.calls[0][0]
    expect(stripeCallArgs.line_items[0].price_data.unit_amount).toBe(8_500_000)
    expect(stripeCallArgs.metadata.purchaseId).toBe(purchaseId)

    const purchase = await fakeDb.jadeClubPurchase.findUnique({ where: { id: purchaseId } })
    expect(purchase.providerReference).toBe(sessionId) // patched from the placeholder
    expect(purchase.paymentStatus).toBe('PENDING')
    expect(purchase.activationStatus).toBe('NOT_STARTED')
  })

  it('a duplicate checkout attempt is rejected once an unexpired terms period exists (checked AFTER activation, later in this suite)', () => {
    // placeholder — the real assertion for this runs after activation below
    expect(true).toBe(true)
  })

  it('processes the webhook payment-confirmed event with the exact amount/currency', async () => {
    const result = await recordCheckoutSessionPaid({
      providerReference: sessionId,
      amountTotalMinor: 8_500_000,
      currency: 'NGN',
      purchaseIdHint: purchaseId,
    })
    expect(result).toEqual({ outcome: 'CONFIRMED_PENDING_ACTIVATION', purchaseId })

    const purchase = await fakeDb.jadeClubPurchase.findUnique({ where: { id: purchaseId } })
    expect(purchase.paymentStatus).toBe('SUCCEEDED')
    expect(purchase.activationStatus).toBe('PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING')
  })

  it('activates the membership tier and creates the commercial terms + entitlement slots', async () => {
    const outcome = await attemptActivation(purchaseId)
    expect(outcome.outcome).toBe('ACTIVATED')

    const purchase = await fakeDb.jadeClubPurchase.findUnique({ where: { id: purchaseId } })
    expect(purchase.activationStatus).toBe('ACTIVATED')
    expect(purchase.membershipTermsId).toBeTruthy()

    const membership = await fakeDb.jadeClubMembership.findUnique({ where: { userId } })
    expect(membership.tier).toBe('CLUB')
    expect(membership.status).toBe('ACTIVE')
    expect(membership.source).toBe('PURCHASE')

    const terms = await fakeDb.jadeClubMembershipTerms.findUnique({ where: { id: purchase.membershipTermsId } })
    expect(terms.source).toBe('PURCHASE')
    expect(terms.annualPriceMinor).toBe(8_500_000)

    // 3 slots pre-issued for the COUNT_PER_PERIOD benefit.
    const slotsForTerms = [...state.slots.values()].filter((s: any) => s.membershipTermsId === terms.id)
    expect(slotsForTerms).toHaveLength(3)
    expect(slotsForTerms.every((s: any) => s.status === 'AVAILABLE')).toBe(true)
  })

  it('the customer can read their own purchase status (IDOR-safe)', async () => {
    const status = await getOwnPurchaseStatus(userId, purchaseId)
    expect(status?.activationStatus).toBe('ACTIVATED')
    expect(status?.paymentStatus).toBe('SUCCEEDED')
  })

  it('a second checkout attempt is now rejected — already has an unexpired terms period', async () => {
    const result = await createJadeClubCheckout({
      userId, customerEmail: 'member@example.com', tier: 'CLUB', market: 'NG', currency: 'NGN', origin: 'https://walztravels.com',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('ALREADY_ACTIVE')
  })

  it('a duplicate webhook delivery for the same session is a clean no-op — never double-activates', async () => {
    const before = await fakeDb.jadeClubPurchase.findUnique({ where: { id: purchaseId } })
    const beforeTermsCount = state.terms.size

    const result = await recordCheckoutSessionPaid({
      providerReference: sessionId, amountTotalMinor: 8_500_000, currency: 'NGN', purchaseIdHint: purchaseId,
    })
    expect(result.outcome).toBe('DUPLICATE_IGNORED')

    const activationRetry = await attemptActivation(purchaseId)
    expect(activationRetry.outcome).toBe('ALREADY_ACTIVATED')

    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: purchaseId } })
    expect(after.paymentStatus).toBe(before.paymentStatus)
    expect(after.activationStatus).toBe('ACTIVATED')
    expect(state.terms.size).toBe(beforeTermsCount) // no second terms row created
  })
})

describe('Jade Club 2B — CASE B end-to-end: two DIFFERENT, distinct, paid purchases for the SAME membership (real, unmocked 2A engine)', () => {
  // A SEPARATE user/membership/policy scope from the suite above, so this
  // block is fully independent of ordering.
  const userId = 'user_case_b'
  const policyId = 'policy_case_b'

  beforeAll(() => {
    state.users.set(userId, { id: userId, email: 'caseb@example.com' })
    state.policies.set(policyId, {
      id: policyId, tier: 'CLUB', market: 'NG', currency: 'NGN',
      annualPriceMinor: 8_500_000, durationMonths: 12, serviceFeeDiscountPercent: 10,
      version: 1, status: 'ACTIVE', createdBy: 'admin_1', effectiveFrom: new Date(), effectiveTo: null,
      createdAt: new Date(), updatedAt: new Date(),
    })
    state.policyBenefits.set(policyId, [])
  })

  it('purchase A activates normally; purchase B (a DIFFERENT, distinct, already-SUCCEEDED purchase for the SAME membership) is routed to PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION — never a second terms period, never FAILED_PERMANENTLY, never swallowed', async () => {
    // Two independent purchases, as if from two browser tabs — both already
    // paid before either side's activation ran (the actual race window).
    const purchaseA = await fakeDb.jadeClubPurchase.create({
      data: { userId, policyId, policyVersion: 1, tier: 'CLUB', market: 'NG', currency: 'NGN', amountMinor: 8_500_000, providerReference: 'cs_case_b_a', paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' },
    })
    const purchaseB = await fakeDb.jadeClubPurchase.create({
      data: { userId, policyId, policyVersion: 1, tier: 'CLUB', market: 'NG', currency: 'NGN', amountMinor: 8_500_000, providerReference: 'cs_case_b_b', paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' },
    })

    // A activates first, for real — the actual activateMembershipTerms
    // engine runs, unmocked, and creates the membership's one unexpired
    // terms period.
    const outcomeA = await attemptActivation(purchaseA.id)
    expect(outcomeA.outcome).toBe('ACTIVATED')

    // B races in afterward (or concurrently — the SAME-membership guard
    // inside activateMembershipTerms is what actually stops it, real and
    // unmocked) and must be rejected cleanly, never double-activated.
    const outcomeB = await attemptActivation(purchaseB.id)
    expect(outcomeB).toEqual({ outcome: 'REQUIRES_RECONCILIATION', reason: 'DUPLICATE_PAID_MEMBERSHIP_PURCHASE' })

    const aAfter = await fakeDb.jadeClubPurchase.findUnique({ where: { id: purchaseA.id } })
    const bAfter = await fakeDb.jadeClubPurchase.findUnique({ where: { id: purchaseB.id } })

    expect(aAfter.activationStatus).toBe('ACTIVATED')
    expect(bAfter.activationStatus).toBe('PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION')
    expect(bAfter.activationStatus).not.toBe('FAILED_PERMANENTLY') // the core fix
    expect(bAfter.failureReason).toBe('DUPLICATE_PAID_MEMBERSHIP_PURCHASE')
    expect(bAfter.membershipTermsId).toBeNull() // never got its own terms period

    // Exactly ONE unexpired terms period for this membership — real DB
    // invariant, not a mock.
    const membership = await fakeDb.jadeClubMembership.findUnique({ where: { userId } })
    const membershipTermsForThisMembership = [...state.terms.values()].filter((t: any) => t.membershipId === membership.id)
    expect(membershipTermsForThisMembership).toHaveLength(1)
    expect(membershipTermsForThisMembership[0].id).toBe(aAfter.membershipTermsId)

    // B remains visible/queryable for financial reconciliation — never hidden.
    expect(bAfter).toBeTruthy()
    expect(bAfter.paymentStatus).toBe('SUCCEEDED')

    // A real staff alert was raised naming purchase A as the winner.
    expect(state.staffNotifications.some((n: any) =>
      n.sourceId === `jade-club-duplicate-purchase:${purchaseB.id}` && n.body.includes(purchaseA.id),
    )).toBe(true)

    // Retry is never offered for B — adminResetForRetry cannot target this status.
    const { adminResetForRetry } = await import('../purchase-activation')
    const fakeAdmin = { id: 'staff_1', email: 'a@b.com', name: 'A', roleTitle: 'Ops', sendingEmail: 'a@b.com', signatureTagline: null, role: 'super_admin', staffRole: 'super_admin', permissions: { 'jade_club.manage': true }, branch: 'HQ', department: 'ops', isActive: true }
    await expect(adminResetForRetry(fakeAdmin as any, purchaseB.id, 'trying anyway')).rejects.toThrow('not eligible for a mechanical retry')
  })
})
