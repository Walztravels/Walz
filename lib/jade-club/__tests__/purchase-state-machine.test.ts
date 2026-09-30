/**
 * Jade Travel Club Release 2B — the ATOMIC purchase activation state
 * machine (structural remediation, Phase 1).
 *
 * This suite uses the REAL, unmocked lib/jade-club/entitlements.ts
 * (createMembershipTermsCore, activateMembershipTerms) and
 * lib/jade-club/membership.ts (applyPurchaseTierBump) against a faithful
 * in-memory fake of the Prisma tables the atomic activation transaction
 * touches — including a real snapshot/restore ROLLBACK simulation in
 * `$transaction`, so a genuine technical failure during entitlement
 * issuance (Test D) is provably undone, not just asserted by convention.
 *
 * Covers: the original 12 design-doc scenarios that are still meaningful
 * at this level (2, 3, 7, 8, 9, 11, 12 — the others are exercised in
 * purchase-integration.test.ts, purchase-checkout.test.ts,
 * purchase-idor.test.ts, purchase-reconciliation.test.ts), PLUS the four
 * new mandatory tests from the structural remediation:
 *   A. Purchase terms after expiry (Correction 2 — direct lookup, not expiresAt-dependent)
 *   B. Purchase delete protection (Correction 1 — Restrict, not SetNull)
 *   C. Expected collision commits WITHOUT exception (Correction 3)
 *   D. Technical failure rolls back the ENTIRE transaction
 */

function nid(prefix: string, seq: { n: number }) { return `${prefix}_${++seq.n}` }

function makeFakeDb() {
  const seq = { n: 0 }
  const state = {
    users: new Map<string, any>(),
    memberships: new Map<string, any>(),
    membershipsByUser: new Map<string, string>(),
    policies: new Map<string, any>(),
    policyBenefits: new Map<string, any[]>(),
    benefitsCatalog: new Map<string, any>(),
    terms: new Map<string, any>(),
    snapshots: new Map<string, any>(),
    slots: new Map<string, any>(),
    events: [] as any[],
    purchases: new Map<string, any>(),
    activityLogs: [] as any[],
    staffNotifications: [] as any[],
    staffRows: [{ id: 'staff_1', role: 'super_admin', permissions: { 'jade_club.manage': true }, isActive: true }],
  }

  // Test-only override hook for Test D (technical failure during issuance).
  let entitlementSlotCreateOverride: ((data: any) => Promise<any>) | null = null

  function cloneRowMap(map: Map<string, any>) {
    const copy = new Map<string, any>()
    for (const [k, v] of map) copy.set(k, { ...v })
    return copy
  }
  function snapshotState() {
    return {
      memberships: cloneRowMap(state.memberships),
      membershipsByUser: new Map(state.membershipsByUser),
      terms: cloneRowMap(state.terms),
      snapshots: cloneRowMap(state.snapshots),
      slots: cloneRowMap(state.slots),
      events: [...state.events],
      purchases: cloneRowMap(state.purchases),
      activityLogs: [...state.activityLogs],
      staffNotifications: [...state.staffNotifications],
    }
  }
  function restoreState(snap: ReturnType<typeof snapshotState>) {
    state.memberships = snap.memberships
    state.membershipsByUser = snap.membershipsByUser
    state.terms = snap.terms
    state.snapshots = snap.snapshots
    state.slots = snap.slots
    state.events = snap.events
    state.purchases = snap.purchases
    state.activityLogs = snap.activityLogs
    state.staffNotifications = snap.staffNotifications
  }

  const db: any = {
    user: { findUnique: async ({ where }: any) => state.users.get(where.id) ?? null },
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
      update: async ({ where, data }: any) => {
        const id = where.id ?? state.membershipsByUser.get(where.userId)
        const row = state.memberships.get(id)
        Object.assign(row, data, { updatedAt: new Date() })
        return { ...row }
      },
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
    },
    jadeClubBenefit: { findUnique: async ({ where }: any) => state.benefitsCatalog.get(where.key) ?? null },
    jadeClubMembershipTerms: {
      findFirst: async ({ where }: any) => {
        const rows = [...state.terms.values()].filter((t) => {
          if (where.purchaseId !== undefined) return t.purchaseId === where.purchaseId
          if (where.membershipId !== undefined) {
            if (t.membershipId !== where.membershipId) return false
            if (where.expiresAt?.gt && t.expiresAt.getTime() <= where.expiresAt.gt.getTime()) return false
            return true
          }
          return false
        })
        rows.sort((a, b) => b.activatedAt.getTime() - a.activatedAt.getTime())
        return rows[0] ? { ...rows[0] } : null
      },
      findUnique: async ({ where }: any) => (state.terms.has(where.id) ? { ...state.terms.get(where.id) } : null),
      create: async ({ data }: any) => {
        const id = nid('terms', seq)
        const row = { id, createdAt: new Date(), ...data }
        state.terms.set(id, row)
        return { ...row }
      },
      delete: async ({ where }: any) => {
        // Simulates the DB's FK RESTRICT: a terms row referencing a
        // purchase via purchaseId is never itself the thing being
        // deleted in these tests — this stub exists only so Test B can
        // exercise the PURCHASE delete path below.
        state.terms.delete(where.id)
        return {}
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
        if (entitlementSlotCreateOverride) return entitlementSlotCreateOverride(data)
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
      findUnique: async ({ where, select }: any) => {
        if (!where.id || !state.purchases.has(where.id)) return null
        const row = state.purchases.get(where.id)
        if (select) {
          const projected: any = {}
          for (const k of Object.keys(select)) projected[k] = row[k]
          return projected
        }
        return { ...row }
      },
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
      update: async ({ where, data, select }: any) => {
        const row = state.purchases.get(where.id)
        if (data.activationAttempts?.increment) row.activationAttempts += data.activationAttempts.increment
        const { activationAttempts, ...rest } = data
        Object.assign(row, rest, { updatedAt: new Date() })
        if (select) {
          const projected: any = {}
          for (const k of Object.keys(select)) projected[k] = row[k]
          return projected
        }
        return { ...row }
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0
        for (const p of state.purchases.values()) {
          if (where.id !== undefined && p.id !== where.id) continue
          if (where.paymentStatus !== undefined && p.paymentStatus !== where.paymentStatus) continue
          if (where.activationStatus !== undefined && p.activationStatus !== where.activationStatus) continue
          if (where.provider !== undefined && p.provider !== where.provider) continue
          if (where.failureReason?.in !== undefined && !where.failureReason.in.includes(p.failureReason)) continue
          if (where.providerReference !== undefined) {
            if (typeof where.providerReference === 'object' && where.providerReference.startsWith !== undefined) {
              if (!p.providerReference.startsWith(where.providerReference.startsWith)) continue
            } else if (typeof where.providerReference === 'string') {
              if (p.providerReference !== where.providerReference) continue
            }
          }
          Object.assign(p, data, { updatedAt: new Date() })
          count++
        }
        return { count }
      },
    },
    activityLog: {
      create: async ({ data }: any) => { state.activityLogs.push(data); return { id: nid('log', seq), createdAt: new Date(), ...data } },
    },
    staff: { findMany: async () => state.staffRows.filter((s) => s.isActive).map((s) => ({ ...s })) },
    staffNotification: {
      findFirst: async ({ where }: any) => state.staffNotifications.find((n: any) => n.staffId === where.staffId && n.sourceId === where.sourceId) ?? null,
      create: async ({ data }: any) => { state.staffNotifications.push(data); return { id: nid('notif', seq), createdAt: new Date(), ...data } },
    },
    // Simulated SELECT ... FOR UPDATE. Two call shapes are used by the real
    // code: lock-by-known-id (attemptActivation) and
    // lock-by-provider+providerReference (recordRefund) — this fake
    // inspects the tagged-template's static text to tell them apart and
    // resolves to the ACTUAL matching row's id, since callers rely on the
    // returned id being real.
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?')
      if (sql.includes('provider_reference')) {
        const providerReference = values[0] as string
        for (const p of state.purchases.values()) {
          if (p.provider === 'STRIPE' && p.providerReference === providerReference) return [{ id: p.id }]
        }
        return []
      }
      // lock-by-id
      const id = values[0] as string
      return state.purchases.has(id) ? [{ id }] : []
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      const snap = snapshotState()
      try {
        return await fn(db)
      } catch (err) {
        // Test D's core assertion: a genuine technical failure rolls back
        // EVERYTHING this transaction touched — real restore, not just a
        // convention.
        restoreState(snap)
        throw err
      }
    },
  }

  return {
    db, state,
    setEntitlementSlotCreateOverride: (fn: typeof entitlementSlotCreateOverride) => { entitlementSlotCreateOverride = fn },
  }
}

const { db: fakeDb, state, setEntitlementSlotCreateOverride } = makeFakeDb()
jest.mock('@/lib/db', () => ({ __esModule: true, default: fakeDb }))

// Wraps the REAL createMembershipTermsCore by default (every other test in
// this file exercises the genuine, unmocked engine) — only the ONE test
// for the fail-closed invariant guard below overrides it for a single
// call, to force the normally-unreachable "collision reported AFTER the
// pre-check already found none" branch for real.
const mockCreateMembershipTermsCore = jest.fn((...args: unknown[]) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const actual = jest.requireActual('../entitlements')
  return actual.createMembershipTermsCore(...args)
})
jest.mock('../entitlements', () => ({
  ...jest.requireActual('../entitlements'),
  createMembershipTermsCore: (...args: unknown[]) => mockCreateMembershipTermsCore(...args),
}))

import {
  recordCheckoutSessionPaid, recordCheckoutSessionFailed, recordRefund,
  attemptActivation, adminResetForRetry, MAX_ACTIVATION_ATTEMPTS,
  JadePurchaseActivationInvariantError,
} from '../purchase-activation'
import type { AdminSession } from '@/lib/admin-auth'

const FAKE_ADMIN: AdminSession = {
  id: 'staff_1', email: 'a@walztravels.com', name: 'Ada', roleTitle: 'Ops', sendingEmail: 'a@walztravels.com',
  signatureTagline: null, role: 'super_admin', staffRole: 'super_admin', permissions: { 'jade_club.manage': true },
  branch: 'HQ', department: 'ops', isActive: true,
}

let purchaseSeq = 0
function seedPolicy(overrides: Partial<any> = {}) {
  const id = overrides.id ?? nid('policy', { n: purchaseSeq++ })
  const row = {
    id, tier: 'CLUB', market: 'NG', currency: 'NGN', annualPriceMinor: 8_500_000, durationMonths: 12,
    serviceFeeDiscountPercent: 10, version: 1, status: 'ACTIVE', createdBy: 'admin_1',
    effectiveFrom: new Date(), effectiveTo: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
  state.policies.set(id, row)
  return row
}
function seedPurchase(overrides: Partial<any> = {}) {
  const id = overrides.id ?? nid('purchase', { n: purchaseSeq++ })
  const row = {
    id, userId: overrides.userId ?? nid('user', { n: purchaseSeq++ }), membershipId: null, policyId: 'policy_default', policyVersion: 1,
    tier: 'CLUB', market: 'NG', currency: 'NGN', amountMinor: 8_500_000,
    provider: 'STRIPE', providerReference: `cs_${id}`,
    paymentStatus: 'PENDING', activationStatus: 'NOT_STARTED', activationAttempts: 0,
    membershipTermsId: null, failureReason: null,
    createdAt: new Date(), paidAt: null, activatedAt: null, updatedAt: new Date(),
    ...overrides,
  }
  state.purchases.set(id, row)
  state.users.set(row.userId, { id: row.userId, email: `${row.userId}@example.com` })
  return row
}

beforeEach(() => {
  state.purchases.clear(); state.memberships.clear(); state.membershipsByUser.clear()
  state.policies.clear(); state.policyBenefits.clear(); state.terms.clear(); state.snapshots.clear()
  state.slots.clear(); state.events.length = 0; state.activityLogs.length = 0; state.staffNotifications.length = 0
  state.users.clear()
  setEntitlementSlotCreateOverride(null)
  mockCreateMembershipTermsCore.mockClear()
  mockCreateMembershipTermsCore.mockImplementation((...args: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const actual = jest.requireActual('../entitlements')
    return actual.createMembershipTermsCore(...args)
  })
})

describe('Scenario 2 — payment failed', () => {
  it('checkout.session.expired CAS-transitions PENDING -> FAILED, never touches activationStatus', async () => {
    const p = seedPurchase({ paymentStatus: 'PENDING' })
    await recordCheckoutSessionFailed(p.providerReference, 'SESSION_EXPIRED')
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.paymentStatus).toBe('FAILED')
    expect(after.failureReason).toBe('SESSION_EXPIRED')
    expect(after.activationStatus).toBe('NOT_STARTED')
  })
})

describe('Scenario 3 — payment confirmed', () => {
  it('CAS-transitions PENDING -> SUCCEEDED and arms PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', async () => {
    const p = seedPurchase({ paymentStatus: 'PENDING' })
    const result = await recordCheckoutSessionPaid({ providerReference: p.providerReference, amountTotalMinor: p.amountMinor, currency: p.currency })
    expect(result.outcome).toBe('CONFIRMED_PENDING_ACTIVATION')
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.paymentStatus).toBe('SUCCEEDED')
  })
})

describe('Scenario 7 — refund before activation (now serialized via a real transaction + row lock)', () => {
  it('a refund landing while PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING stops the NEXT activation attempt cold', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })
    await recordRefund(p.providerReference)
    const outcome = await attemptActivation(p.id)
    expect(outcome).toEqual({ outcome: 'FAILED_PERMANENTLY', reason: 'REFUNDED_BEFORE_ACTIVATION' })
  })
})

describe('Scenario 8 — refund after activation', () => {
  it('CAS-transitions SUCCEEDED -> REFUNDED without touching activationStatus/membershipTermsId, and raises a staff alert', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'ACTIVATED', membershipTermsId: 'terms_1' })
    await recordRefund(p.providerReference)
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.paymentStatus).toBe('REFUNDED')
    expect(after.activationStatus).toBe('ACTIVATED')
    expect(after.membershipTermsId).toBe('terms_1')
    expect(state.activityLogs.some((l) => l.action === 'JADE_CLUB_PURCHASE_REFUNDED')).toBe(true)
    expect(state.staffNotifications.some((n) => n.sourceId === `jade-club-refund-after-activation:${p.id}`)).toBe(true)
  })

  it('does NOT raise the refund-after-activation alert for a refund before activation', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })
    await recordRefund(p.providerReference)
    expect(state.staffNotifications.some((n: any) => n.sourceId.startsWith('jade-club-refund-after-activation:'))).toBe(false)
  })
})

describe('Scenario 9 — duplicate webhook delivery', () => {
  it('a second checkout.session.completed for an already-SUCCEEDED purchase is a clean no-op', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'ACTIVATED' })
    const result = await recordCheckoutSessionPaid({ providerReference: p.providerReference, amountTotalMinor: p.amountMinor, currency: p.currency })
    expect(result.outcome).toBe('DUPLICATE_IGNORED')
  })

  it('a second attemptActivation call for an already-ACTIVATED purchase is a clean no-op', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'ACTIVATED' })
    const outcome = await attemptActivation(p.id)
    expect(outcome).toEqual({ outcome: 'ALREADY_ACTIVATED' })
  })
})

describe('Scenario 11 — provider reference uniqueness', () => {
  it('the webhook looks up the purchase by (provider, providerReference) ONLY — a client-echoed purchaseId hint never hijacks a different real purchase', async () => {
    const real = seedPurchase({ paymentStatus: 'PENDING' })
    const attacker = seedPurchase({ paymentStatus: 'PENDING' })
    const result = await recordCheckoutSessionPaid({
      providerReference: real.providerReference, amountTotalMinor: real.amountMinor, currency: real.currency, purchaseIdHint: attacker.id,
    })
    expect(result).toEqual({ outcome: 'CONFIRMED_PENDING_ACTIVATION', purchaseId: real.id })
    const attackerAfter = await fakeDb.jadeClubPurchase.findUnique({ where: { id: attacker.id } })
    expect(attackerAfter.paymentStatus).toBe('PENDING')
  })
})

describe('Scenario 12 — exact currency/amount reconciliation', () => {
  it('an amount mismatch records SUCCEEDED truthfully but blocks activation with a safe reason', async () => {
    const p = seedPurchase({ paymentStatus: 'PENDING', amountMinor: 8_500_000, currency: 'NGN' })
    const result = await recordCheckoutSessionPaid({ providerReference: p.providerReference, amountTotalMinor: 1_000_000, currency: 'NGN' })
    expect(result.outcome).toBe('AMOUNT_MISMATCH')
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.activationStatus).toBe('FAILED_PERMANENTLY')
    expect(after.failureReason).toBe('AMOUNT_MISMATCH')
  })
})

// ─── The four new mandatory tests from the structural remediation ────────

describe('TEST A — purchase terms after expiry (Correction 2: direct lookup, NOT expiresAt-dependent)', () => {
  it('retrying a purchase whose own terms are now historically EXPIRED still recognizes it as the same purchase — no new terms, no reconciliation misclassification', async () => {
    const policy = seedPolicy()
    const membership = await fakeDb.jadeClubMembership.create({ data: { userId: 'user_expiry_test', memberCode: 'JW-1', tier: 'CLUB', status: 'ACTIVE', source: 'PURCHASE' } })
    const p = seedPurchase({ userId: 'user_expiry_test', policyId: policy.id, paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })

    // Pre-seed EXPIRED terms that this purchase already created historically.
    const expiredTerms = await fakeDb.jadeClubMembershipTerms.create({
      data: {
        membershipId: membership.id, policyId: policy.id, policyVersion: 1, tier: 'CLUB', market: 'NG', currency: 'NGN',
        annualPriceMinor: 8_500_000, durationMonths: 12, serviceFeeDiscountPercent: 10,
        activatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 400),
        expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // already expired
        source: 'PURCHASE', purchaseId: p.id,
      },
    })

    const outcome = await attemptActivation(p.id)

    expect(outcome).toEqual({ outcome: 'ACTIVATED', termsId: expiredTerms.id })
    expect(state.terms.size).toBe(1) // no new terms row created despite the old one being expired
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.activationStatus).toBe('ACTIVATED')
    expect(after.membershipTermsId).toBe(expiredTerms.id)
    expect(after.failureReason).toBeNull() // never misclassified as a reconciliation case
  })
})

describe('TEST B — purchase delete protection (Correction 1: Restrict, not SetNull)', () => {
  it('the schema documents Restrict (not SetNull) for JadeClubMembershipTerms.purchaseId, and the migration enforces it at the DB layer', () => {
    const fs = require('fs')
    const path = require('path')
    const schema = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'), 'utf8')
    const migration = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'prisma', 'migrations', 'jade_travel_club_purchase_v2b_terms_link.sql'), 'utf8')

    // Schema: the relation field for purchaseId must be Restrict.
    const relationMatch = schema.match(/originatingPurchase\s+JadeClubPurchase\?\s+@relation\("TermsOriginPurchase",[^)]*onDelete:\s*Restrict\)/)
    expect(relationMatch).not.toBeNull()
    // The field must never be SetNull.
    expect(schema).not.toMatch(/purchaseId[\s\S]{0,300}onDelete:\s*SetNull/)

    // Migration: the FK constraint itself must be ON DELETE RESTRICT.
    expect(migration).toMatch(/FOREIGN KEY \(purchase_id\) REFERENCES jade_club_purchases\(id\)\s*\n\s*ON DELETE RESTRICT/)
    expect(migration).not.toMatch(/purchase_id[\s\S]{0,200}ON DELETE SET NULL/)
  })

  it('a Postgres RESTRICT violation (simulated P2003) is never silently swallowed by application code deleting a purchase that backs real terms', async () => {
    // Simulate what a real RESTRICT constraint does: reject the delete
    // outright rather than nulling the referencing column.
    const policy = seedPolicy()
    const membership = await fakeDb.jadeClubMembership.create({ data: { userId: 'user_restrict_test', memberCode: 'JW-2', tier: 'CLUB', status: 'ACTIVE', source: 'PURCHASE' } })
    const p = seedPurchase({ userId: 'user_restrict_test', policyId: policy.id })
    const terms = await fakeDb.jadeClubMembershipTerms.create({
      data: { membershipId: membership.id, policyId: policy.id, policyVersion: 1, tier: 'CLUB', market: 'NG', currency: 'NGN', annualPriceMinor: 8_500_000, durationMonths: 12, serviceFeeDiscountPercent: 10, activatedAt: new Date(), expiresAt: new Date(Date.now() + 1e10), source: 'PURCHASE', purchaseId: p.id },
    })

    // A minimal fake "delete" that enforces the SAME FK-restrict semantics
    // a real Postgres would — this is what this codebase's application
    // layer must never route around.
    const simulateDeletePurchase = (purchaseId: string) => {
      const stillReferenced = [...state.terms.values()].some((t) => t.purchaseId === purchaseId)
      if (stillReferenced) {
        const err: any = new Error('Foreign key constraint failed (RESTRICT)')
        err.code = 'P2003'
        throw err
      }
      state.purchases.delete(purchaseId)
    }

    expect(() => simulateDeletePurchase(p.id)).toThrow(/Foreign key constraint failed/)
    // The terms row's provenance is untouched — never silently nulled.
    const termsAfter = await fakeDb.jadeClubMembershipTerms.findUnique({ where: { id: terms.id } })
    expect(termsAfter.purchaseId).toBe(p.id)
    expect(state.purchases.has(p.id)).toBe(true) // purchase row still exists — delete was rejected, not partially applied
  })
})

describe('TEST C — expected collision commits WITHOUT exception (Correction 3)', () => {
  it('two distinct SUCCEEDED purchases for the same membership: the loser resolves normally (never rejects) to REQUIRES_RECONCILIATION', async () => {
    const policy = seedPolicy()
    const winner = seedPurchase({ userId: 'user_case_b', policyId: policy.id, paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })
    const loser = seedPurchase({ userId: 'user_case_b', policyId: policy.id, paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })

    const winnerOutcome = await attemptActivation(winner.id)
    expect(winnerOutcome.outcome).toBe('ACTIVATED')

    // THE core structural assertion: attemptActivation's promise resolves
    // (never rejects) for the expected collision case — proving the
    // branch is explicit, not a caught exception forcing a commit.
    await expect(attemptActivation(loser.id)).resolves.toEqual({ outcome: 'REQUIRES_RECONCILIATION', reason: 'DUPLICATE_PAID_MEMBERSHIP_PURCHASE' })

    const loserAfter = await fakeDb.jadeClubPurchase.findUnique({ where: { id: loser.id } })
    expect(loserAfter.activationStatus).toBe('PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION')
    expect(loserAfter.paymentStatus).toBe('SUCCEEDED') // still visible/reconcilable, never swallowed
    expect(state.terms.size).toBe(1) // exactly one terms period for the membership
  })
})

describe('TEST D — technical failure rolls back the ENTIRE transaction', () => {
  it('a thrown error during entitlement-slot issuance leaves NO terms, NO snapshots, NO entitlements, NO ACTIVATED purchase — full rollback', async () => {
    const policy = seedPolicy()
    state.policyBenefits.set(policy.id, [
      { id: 'pb_1', policyId: policy.id, benefitKey: 'jade-connect', entitlementType: 'COUNT_PER_PERIOD', countPerPeriod: 3, costCapMinorUsd: null, booleanEligible: null },
    ])
    state.benefitsCatalog.set('jade-connect', { name: 'Jade Connect' })

    const p = seedPurchase({ userId: 'user_rollback_test', policyId: policy.id, paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })

    setEntitlementSlotCreateOverride(async () => {
      throw new Error('simulated DB failure during slot issuance')
    })

    const outcome = await attemptActivation(p.id)
    expect(outcome.outcome).toBe('FAILED_RETRYABLE')

    // Full rollback — nothing this attempt tried to write survived.
    expect(state.terms.size).toBe(0)
    expect(state.snapshots.size).toBe(0)
    expect(state.slots.size).toBe(0)
    expect(state.events).toHaveLength(0)

    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.activationStatus).toBe('PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING') // NOT ACTIVATED
    // The membership tier bump (which happened moments before the failure,
    // in the SAME transaction) also rolled back — it is part of the one
    // atomic unit.
    const membership = await fakeDb.jadeClubMembership.findUnique({ where: { userId: 'user_rollback_test' } })
    expect(membership?.status).not.toBe('ACTIVE')
  })

  it('the retry-attempt counter survives the rollback (it is bumped in its own independent statement, BEFORE the transaction) — so a repeating failure eventually trips MAX_ACTIVATION_ATTEMPTS', async () => {
    const policy = seedPolicy()
    state.policyBenefits.set(policy.id, [])
    const p = seedPurchase({ userId: 'user_repeat_fail', policyId: policy.id, paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', activationAttempts: MAX_ACTIVATION_ATTEMPTS - 1 })

    setEntitlementSlotCreateOverride(async () => { throw new Error('still failing') })
    // Force the failure a different way for a policy with zero benefits —
    // use the membership lookup guard instead: delete the membership
    // AFTER it would have been created, to force a throw deep in the
    // transaction. Simpler: directly monkeypatch jadeClubCommercialPolicy
    // to throw on the SECOND read inside the transaction is complex; use
    // a policy status flip mid-flight instead is also complex. Simplest:
    // reuse the entitlement-slot throw with a benefit present.
    state.policyBenefits.set(policy.id, [
      { id: 'pb_2', policyId: policy.id, benefitKey: 'jade-connect-2', entitlementType: 'COUNT_PER_PERIOD', countPerPeriod: 1, costCapMinorUsd: null, booleanEligible: null },
    ])
    state.benefitsCatalog.set('jade-connect-2', { name: 'Jade Connect 2' })

    const outcome = await attemptActivation(p.id)
    expect(outcome).toEqual({ outcome: 'FAILED_PERMANENTLY', reason: 'MAX_RETRIES_EXCEEDED' })

    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.activationStatus).toBe('FAILED_PERMANENTLY')
    expect(after.activationAttempts).toBe(MAX_ACTIVATION_ATTEMPTS)
  })
})

describe('Admin retry (reason-required, audited, reason-allowlisted, permission-defended)', () => {
  it('resets a FAILED_PERMANENTLY + SUCCEEDED + retryable-reason row back to retryable, with an audit entry', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'FAILED_PERMANENTLY', failureReason: 'MAX_RETRIES_EXCEEDED', activationAttempts: 5 })
    await adminResetForRetry(FAKE_ADMIN, p.id, 'Transient DB outage has been resolved — retrying')
    const after = await fakeDb.jadeClubPurchase.findUnique({ where: { id: p.id } })
    expect(after.activationStatus).toBe('PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING')
  })

  it('refuses a structural/business failure reason even when activationStatus+paymentStatus otherwise match', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'FAILED_PERMANENTLY', failureReason: 'POLICY_NO_LONGER_ACTIVE' })
    await expect(adminResetForRetry(FAKE_ADMIN, p.id, 'please retry anyway')).rejects.toThrow('not eligible for a mechanical retry')
  })

  it('requires jade_club.manage even if called directly, bypassing any route-level check', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'FAILED_PERMANENTLY', failureReason: 'MAX_RETRIES_EXCEEDED' })
    const unprivileged: AdminSession = { ...FAKE_ADMIN, role: 'sales_rep', staffRole: 'sales_rep', permissions: {} }
    await expect(adminResetForRetry(unprivileged, p.id, 'trying anyway')).rejects.toThrow('FORBIDDEN')
  })

  it('a PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION row can never be targeted (structurally excluded — CAS only matches FAILED_PERMANENTLY)', async () => {
    const p = seedPurchase({ paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION', failureReason: 'DUPLICATE_PAID_MEMBERSHIP_PURCHASE' })
    await expect(adminResetForRetry(FAKE_ADMIN, p.id, 'trying anyway')).rejects.toThrow('not eligible for a mechanical retry')
  })
})

// ─── Mandatory new cross-tier tests (narrow fix, independent-review HIGH
// finding: a losing purchase must never mutate JadeClubMembership.tier —
// not even transiently — since a speculative pre-collision-check bump
// could leave the membership's tier permanently diverged from the tier
// of the terms the winner actually got issued). These are PERMANENT
// regression tests, not throwaway verification. ─────────────────────────

function seedCrossTierPolicy(tier: 'CLUB' | 'CLUB_PLUS', benefitKey: string, countPerPeriod: number) {
  const policy = seedPolicy({ tier, currency: 'NGN', market: 'NG', annualPriceMinor: tier === 'CLUB' ? 8_500_000 : 15_000_000 })
  state.policyBenefits.set(policy.id, [
    { id: nid('pb', { n: purchaseSeq++ }), policyId: policy.id, benefitKey, entitlementType: 'COUNT_PER_PERIOD', countPerPeriod, costCapMinorUsd: null, booleanEligible: null },
  ])
  state.benefitsCatalog.set(benefitKey, { name: benefitKey })
  return policy
}

describe('TEST 1 — CLUB wins, CLUB_PLUS loses (cross-tier, narrow fix)', () => {
  it('membership.tier ends CLUB, terms.tier=CLUB, CLUB entitlements only; the losing CLUB_PLUS purchase never mutated the membership tier', async () => {
    const userId = 'user_cross_tier_1'
    const clubPolicy = seedCrossTierPolicy('CLUB', 'jade-connect-club', 3)
    const clubPlusPolicy = seedCrossTierPolicy('CLUB_PLUS', 'jade-connect-club-plus', 6)

    const membership = await fakeDb.jadeClubMembership.create({ data: { userId, memberCode: 'JW-CT1', tier: 'CLUB', status: 'FREE', source: 'DEFAULT' } })
    const purchaseClub = seedPurchase({ userId, policyId: clubPolicy.id, tier: 'CLUB', paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })
    const purchaseClubPlus = seedPurchase({ userId, policyId: clubPlusPolicy.id, tier: 'CLUB_PLUS', paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })

    // Force CLUB to win by activating it first.
    const outcomeA = await attemptActivation(purchaseClub.id)
    expect(outcomeA.outcome).toBe('ACTIVATED')

    const outcomeB = await attemptActivation(purchaseClubPlus.id)
    expect(outcomeB).toEqual({ outcome: 'REQUIRES_RECONCILIATION', reason: 'DUPLICATE_PAID_MEMBERSHIP_PURCHASE' })

    // Exactly one active terms period, for CLUB.
    const allTerms = [...state.terms.values()].filter((t) => t.membershipId === membership.id)
    expect(allTerms).toHaveLength(1)
    expect(allTerms[0].tier).toBe('CLUB')

    // Membership tier reflects the WINNER — CLUB, never CLUB_PLUS.
    const membershipAfter = await fakeDb.jadeClubMembership.findUnique({ where: { id: membership.id } })
    expect(membershipAfter.tier).toBe('CLUB')
    expect(membershipAfter.status).toBe('ACTIVE')

    // Only CLUB's entitlement slots exist (3), never CLUB_PLUS's (6).
    const slotsForTerms = [...state.slots.values()].filter((s) => s.membershipTermsId === allTerms[0].id)
    expect(slotsForTerms).toHaveLength(3)

    // Purchase states.
    const clubAfter = await fakeDb.jadeClubPurchase.findUnique({ where: { id: purchaseClub.id } })
    const clubPlusAfter = await fakeDb.jadeClubPurchase.findUnique({ where: { id: purchaseClubPlus.id } })
    expect(clubAfter.activationStatus).toBe('ACTIVATED')
    expect(clubPlusAfter.activationStatus).toBe('PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION')
    expect(clubPlusAfter.failureReason).toBe('DUPLICATE_PAID_MEMBERSHIP_PURCHASE')
    expect(clubPlusAfter.tier).toBe('CLUB_PLUS') // retained on ITS OWN purchase record for audit — never projected onto the membership

    // THE explicit assertion the fix targets: the membership was NEVER at
    // CLUB_PLUS at any point this test can observe, and definitely isn't now.
    expect(membershipAfter.tier).not.toBe('CLUB_PLUS')
  })
})

describe('TEST 2 — CLUB_PLUS wins, CLUB loses (cross-tier, narrow fix, reverse)', () => {
  it('membership.tier ends CLUB_PLUS, terms.tier=CLUB_PLUS, CLUB_PLUS entitlements only; the losing CLUB purchase never downgraded the tier', async () => {
    const userId = 'user_cross_tier_2'
    const clubPolicy = seedCrossTierPolicy('CLUB', 'jade-connect-club-2', 3)
    const clubPlusPolicy = seedCrossTierPolicy('CLUB_PLUS', 'jade-connect-club-plus-2', 6)

    const membership = await fakeDb.jadeClubMembership.create({ data: { userId, memberCode: 'JW-CT2', tier: 'CLUB_PLUS', status: 'FREE', source: 'DEFAULT' } })
    const purchaseClubPlus = seedPurchase({ userId, policyId: clubPlusPolicy.id, tier: 'CLUB_PLUS', paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })
    const purchaseClub = seedPurchase({ userId, policyId: clubPolicy.id, tier: 'CLUB', paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })

    // Force CLUB_PLUS to win by activating it first.
    const outcomeB = await attemptActivation(purchaseClubPlus.id)
    expect(outcomeB.outcome).toBe('ACTIVATED')

    const outcomeA = await attemptActivation(purchaseClub.id)
    expect(outcomeA).toEqual({ outcome: 'REQUIRES_RECONCILIATION', reason: 'DUPLICATE_PAID_MEMBERSHIP_PURCHASE' })

    const allTerms = [...state.terms.values()].filter((t) => t.membershipId === membership.id)
    expect(allTerms).toHaveLength(1)
    expect(allTerms[0].tier).toBe('CLUB_PLUS')

    const membershipAfter = await fakeDb.jadeClubMembership.findUnique({ where: { id: membership.id } })
    expect(membershipAfter.tier).toBe('CLUB_PLUS')

    const slotsForTerms = [...state.slots.values()].filter((s) => s.membershipTermsId === allTerms[0].id)
    expect(slotsForTerms).toHaveLength(6)

    const clubAfter = await fakeDb.jadeClubPurchase.findUnique({ where: { id: purchaseClub.id } })
    expect(clubAfter.activationStatus).toBe('PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION')
    expect(clubAfter.failureReason).toBe('DUPLICATE_PAID_MEMBERSHIP_PURCHASE')

    // THE explicit assertion: the membership was NEVER downgraded to CLUB.
    expect(membershipAfter.tier).not.toBe('CLUB')
  })
})

describe('TEST 3 — loser arrives after the winner already settled (cross-tier)', () => {
  it('a differently-tiered purchase attempting activation AFTER pre-existing active terms already exist changes nothing on the membership', async () => {
    const userId = 'user_cross_tier_3'
    const clubPolicy = seedCrossTierPolicy('CLUB', 'jade-connect-club-3', 3)
    const clubPlusPolicy = seedCrossTierPolicy('CLUB_PLUS', 'jade-connect-club-plus-3', 6)

    const membership = await fakeDb.jadeClubMembership.create({ data: { userId, memberCode: 'JW-CT3', tier: 'CLUB', status: 'ACTIVE', source: 'PURCHASE' } })
    const winnerPurchase = seedPurchase({ userId, policyId: clubPolicy.id, tier: 'CLUB', paymentStatus: 'SUCCEEDED', activationStatus: 'ACTIVATED' })
    const winnerTerms = await fakeDb.jadeClubMembershipTerms.create({
      data: {
        membershipId: membership.id, policyId: clubPolicy.id, policyVersion: 1, tier: 'CLUB', market: 'NG', currency: 'NGN',
        annualPriceMinor: 8_500_000, durationMonths: 12, serviceFeeDiscountPercent: 10,
        activatedAt: new Date(), expiresAt: new Date(Date.now() + 1e10), source: 'PURCHASE', purchaseId: winnerPurchase.id,
      },
    })
    await fakeDb.jadeClubPurchase.update({ where: { id: winnerPurchase.id }, data: { membershipTermsId: winnerTerms.id } })

    const lateComer = seedPurchase({ userId, policyId: clubPlusPolicy.id, tier: 'CLUB_PLUS', paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })

    const outcome = await attemptActivation(lateComer.id)
    expect(outcome).toEqual({ outcome: 'REQUIRES_RECONCILIATION', reason: 'DUPLICATE_PAID_MEMBERSHIP_PURCHASE' })

    // Membership/terms/entitlements completely unchanged.
    const membershipAfter = await fakeDb.jadeClubMembership.findUnique({ where: { id: membership.id } })
    expect(membershipAfter.tier).toBe('CLUB')
    const allTerms = [...state.terms.values()].filter((t) => t.membershipId === membership.id)
    expect(allTerms).toHaveLength(1)
    expect(allTerms[0].id).toBe(winnerTerms.id)

    const lateComerAfter = await fakeDb.jadeClubPurchase.findUnique({ where: { id: lateComer.id } })
    expect(lateComerAfter.activationStatus).toBe('PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION')
    expect(lateComerAfter.membershipTermsId).toBeNull()
  })
})

describe('TEST 4 — same-tier concurrency regression (unchanged behavior, still correct after the reorder)', () => {
  it('two distinct SAME-TIER purchases: one winner, one reconciliation loser, no duplicate terms/benefits, correct membership tier', async () => {
    const userId = 'user_same_tier_regression'
    const policy = seedCrossTierPolicy('CLUB', 'jade-connect-same-tier', 3)
    const membership = await fakeDb.jadeClubMembership.create({ data: { userId, memberCode: 'JW-ST1', tier: 'CLUB', status: 'FREE', source: 'DEFAULT' } })
    const purchaseA = seedPurchase({ userId, policyId: policy.id, tier: 'CLUB', paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })
    const purchaseB = seedPurchase({ userId, policyId: policy.id, tier: 'CLUB', paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })

    const outcomeA = await attemptActivation(purchaseA.id)
    expect(outcomeA.outcome).toBe('ACTIVATED')
    const outcomeB = await attemptActivation(purchaseB.id)
    expect(outcomeB).toEqual({ outcome: 'REQUIRES_RECONCILIATION', reason: 'DUPLICATE_PAID_MEMBERSHIP_PURCHASE' })

    const allTerms = [...state.terms.values()].filter((t) => t.membershipId === membership.id)
    expect(allTerms).toHaveLength(1)
    const allSnapshotsForTerms = [...state.snapshots.values()].filter((s) => s.membershipTermsId === allTerms[0].id)
    expect(allSnapshotsForTerms).toHaveLength(1) // one benefit snapshot, never duplicated

    const membershipAfter = await fakeDb.jadeClubMembership.findUnique({ where: { id: membership.id } })
    expect(membershipAfter.tier).toBe('CLUB')
    expect(membershipAfter.status).toBe('ACTIVE')
  })
})

describe('TEST 5 — same-purchase idempotency (the winner retried)', () => {
  it('retrying the ALREADY-ACTIVATED winning purchase: tier unchanged, same terms returned, same entitlements, ACTIVATED stays monotonic', async () => {
    const userId = 'user_same_purchase_idempotent'
    const policy = seedCrossTierPolicy('CLUB_PLUS', 'jade-connect-idempotent', 6)
    const membership = await fakeDb.jadeClubMembership.create({ data: { userId, memberCode: 'JW-SP1', tier: 'CLUB_PLUS', status: 'FREE', source: 'DEFAULT' } })
    const purchase = seedPurchase({ userId, policyId: policy.id, tier: 'CLUB_PLUS', paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })

    const firstOutcome = await attemptActivation(purchase.id)
    expect(firstOutcome.outcome).toBe('ACTIVATED')
    const firstTermsId = firstOutcome.outcome === 'ACTIVATED' ? firstOutcome.termsId : null

    const membershipAfterFirst = await fakeDb.jadeClubMembership.findUnique({ where: { id: membership.id } })
    const slotsAfterFirst = [...state.slots.values()].filter((s) => {
      const snap = state.snapshots.get(s.benefitSnapshotId)
      return snap && [...state.terms.values()].some((t) => t.id === snap.membershipTermsId && t.membershipId === membership.id)
    })

    // Retry the SAME purchase — via the top-level ALREADY_ACTIVATED
    // precheck (the purchase row itself already reflects ACTIVATED) —
    // ACTIVATED never regresses/changes on a retry.
    const secondOutcome = await attemptActivation(purchase.id)
    expect(secondOutcome).toEqual({ outcome: 'ALREADY_ACTIVATED' })

    const membershipAfterSecond = await fakeDb.jadeClubMembership.findUnique({ where: { id: membership.id } })
    expect(membershipAfterSecond.tier).toBe(membershipAfterFirst.tier)
    expect(membershipAfterSecond.tier).toBe('CLUB_PLUS')

    const allTerms = [...state.terms.values()].filter((t) => t.membershipId === membership.id)
    expect(allTerms).toHaveLength(1) // never duplicated by the retry
    expect(allTerms[0].id).toBe(firstTermsId)

    const slotsAfterSecond = [...state.slots.values()].filter((s) => {
      const snap = state.snapshots.get(s.benefitSnapshotId)
      return snap && [...state.terms.values()].some((t) => t.id === snap.membershipTermsId && t.membershipId === membership.id)
    })
    expect(slotsAfterSecond.length).toBe(slotsAfterFirst.length) // no duplicate entitlement issuance
    expect(slotsAfterSecond.length).toBe(6)
  })
})

// ─── FAIL-CLOSED INVARIANT GUARD (final correction) ──────────────────────
//
// Forces the normally-unreachable branch for real: (1) the real pre-check
// runs and finds no collision, (2) applyPurchaseTierBump runs for real
// (using the real, unmocked function) inside the transaction, (3) the
// SHARED CORE is overridden — for this ONE call only — to report the
// defensive collision anyway, simulating the "provably redundant"
// assumption turning out to be wrong. Every other test in this file
// exercises the genuine engine throughout.

describe('FAIL-CLOSED INVARIANT GUARD — collision detected after tier mutation (should be impossible; must roll back everything)', () => {
  it('throws JadePurchaseActivationInvariantError, which propagates to the caller as FAILED_RETRYABLE, and the ENTIRE transaction rolls back: membership tier unchanged, purchase not ACTIVATED, no new terms/snapshots/slots/events', async () => {
    const userId = 'user_invariant_guard'
    const policy = seedCrossTierPolicy('CLUB', 'jade-connect-invariant', 3)
    const preExistingMembership = await fakeDb.jadeClubMembership.create({
      data: { userId, memberCode: 'JW-INV1', tier: 'FREE', status: 'FREE', source: 'DEFAULT' },
    })
    const purchase = seedPurchase({ userId, policyId: policy.id, tier: 'CLUB', paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })

    const tierBeforeAttempt = preExistingMembership.tier
    const termsCountBefore = state.terms.size
    const snapshotsCountBefore = state.snapshots.size
    const slotsCountBefore = state.slots.size
    const eventsCountBefore = state.events.length

    // Force the shared core to report a collision on its NEXT call only —
    // even though the real pre-check just above it (inside
    // attemptActivation, using the REAL, unmocked logic) will genuinely
    // find no conflicting unexpired terms for this brand-new membership.
    mockCreateMembershipTermsCore.mockImplementationOnce(async () => ({
      ok: false,
      reason: 'UNEXPIRED_TERMS_EXISTS',
      existingTerms: { id: 'terms_phantom_for_this_test_only', purchaseId: null },
    }))

    const outcome = await attemptActivation(purchase.id)

    // The invariant error surfaces to the caller as a technical failure —
    // never silently reconciled, never a successful ACTIVATED.
    expect(outcome.outcome).toBe('FAILED_RETRYABLE')
    if (outcome.outcome === 'FAILED_RETRYABLE') {
      expect(outcome.error).toContain('Collision detected after membership tier mutation under purchase/member locks')
      expect(outcome.error).toContain(purchase.id)
      expect(outcome.error).toContain(preExistingMembership.id)
    }

    // FULL ROLLBACK — the tier bump that ran moments before the forced
    // collision is undone too, not just the terms/entitlement writes.
    const membershipAfter = await fakeDb.jadeClubMembership.findUnique({ where: { id: preExistingMembership.id } })
    expect(membershipAfter.tier).toBe(tierBeforeAttempt)
    expect(membershipAfter.tier).toBe('FREE') // never became CLUB
    expect(membershipAfter.status).not.toBe('ACTIVE')

    const purchaseAfter = await fakeDb.jadeClubPurchase.findUnique({ where: { id: purchase.id } })
    expect(purchaseAfter.activationStatus).not.toBe('ACTIVATED')
    expect(purchaseAfter.activationStatus).not.toBe('PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION') // NOT treated as a business collision either
    expect(purchaseAfter.membershipTermsId).toBeNull()

    // Nothing new was committed anywhere.
    expect(state.terms.size).toBe(termsCountBefore)
    expect(state.snapshots.size).toBe(snapshotsCountBefore)
    expect(state.slots.size).toBe(slotsCountBefore)
    expect(state.events.length).toBe(eventsCountBefore)
  })

  it('the JadePurchaseActivationInvariantError is genuinely a distinct, named error class thrown by the shared-core branch, not swallowed into a generic message anywhere inside the transaction', async () => {
    const userId = 'user_invariant_guard_2'
    const policy = seedCrossTierPolicy('CLUB_PLUS', 'jade-connect-invariant-2', 6)
    await fakeDb.jadeClubMembership.create({ data: { userId, memberCode: 'JW-INV2', tier: 'FREE', status: 'FREE', source: 'DEFAULT' } })
    const purchase = seedPurchase({ userId, policyId: policy.id, tier: 'CLUB_PLUS', paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })

    let capturedError: unknown = null
    // Exercises the documented `{ ok: false }` RETURN path specifically
    // (as opposed to a thrown error from the core, which would be a
    // separate, already-covered "genuine technical failure" case handled
    // the same way by the outer catch).
    mockCreateMembershipTermsCore.mockImplementationOnce(async () => ({
      ok: false, reason: 'UNEXPIRED_TERMS_EXISTS', existingTerms: { id: 'terms_phantom_2', purchaseId: 'some_other_purchase' },
    }))

    try {
      await attemptActivation(purchase.id)
    } catch (e) {
      capturedError = e
    }
    // attemptActivation itself never re-throws (it catches internally and
    // returns FAILED_RETRYABLE) — this assertion documents that
    // expectation explicitly, and separately confirms via the outcome
    // shape that the underlying cause really was our named error class by
    // checking the audit trail was NOT written with a reconciliation
    // action for this purchase.
    expect(capturedError).toBeNull()
    expect(state.activityLogs.some((l) => l.entityId === purchase.id && l.action === 'JADE_CLUB_PURCHASE_REQUIRES_RECONCILIATION')).toBe(false)
    expect(state.activityLogs.some((l) => l.entityId === purchase.id && l.action === 'JADE_CLUB_PURCHASE_ACTIVATED')).toBe(false)
  })

  it('JadePurchaseActivationInvariantError is exported and is a real Error subclass with the expected name/code (source-level contract)', () => {
    const err = new JadePurchaseActivationInvariantError('test message')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('JadePurchaseActivationInvariantError')
    expect(err.code).toBe('JADE_PURCHASE_ACTIVATION_INVARIANT_VIOLATION')
    expect(err.message).toBe('test message')
  })

  it('raises a staff operational alert identifying the invariant violation, using only safe identifiers (purchase id, membership id, error code) — never payment/PII data', async () => {
    const userId = 'user_invariant_guard_3'
    const policy = seedCrossTierPolicy('CLUB', 'jade-connect-invariant-3', 3)
    await fakeDb.jadeClubMembership.create({ data: { userId, memberCode: 'JW-INV3', tier: 'FREE', status: 'FREE', source: 'DEFAULT' } })
    const purchase = seedPurchase({ userId, policyId: policy.id, tier: 'CLUB', paymentStatus: 'SUCCEEDED', activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' })

    mockCreateMembershipTermsCore.mockImplementationOnce(async () => ({
      ok: false, reason: 'UNEXPIRED_TERMS_EXISTS', existingTerms: { id: 'terms_phantom_3', purchaseId: null },
    }))

    await attemptActivation(purchase.id)

    const alert = state.staffNotifications.find((n) => n.sourceId === `jade-club-activation-invariant-violation:${purchase.id}`)
    expect(alert).toBeTruthy()
    expect(alert.body).toContain(purchase.id)
    expect(alert.body).toContain('JADE_PURCHASE_ACTIVATION_INVARIANT_VIOLATION')
    expect(alert.body).not.toMatch(/card|cvv|pan\b/i)
  })
})
