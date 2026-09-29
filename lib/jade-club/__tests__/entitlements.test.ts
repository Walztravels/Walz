/**
 * Jade Travel Club Release 2A — entitlement-slot concurrency-safety tests.
 * This is the highest-priority test surface in the brief: exact slot
 * counts, the unique-constraint-backed CAS reservation/consumption engine,
 * genuine concurrent races (Promise.all against a faithful in-memory fake
 * of Postgres row-level CAS semantics — see FakeDb below), TTL expiry
 * reclaim, admin reversal, and replacement-grant behaviour.
 *
 * FakeDb is deliberately NOT a jest.fn()-per-call mock: the adversarial
 * race tests need genuinely shared, mutating state so that two concurrent
 * calls can actually contend for the SAME row. Every mutating method here
 * (`updateMany`, `create`) runs its entire body synchronously (no `await`
 * inside), which is exactly what gives a single Postgres `UPDATE ... WHERE`
 * statement its atomicity — this fake reproduces that property faithfully
 * under Node's run-to-completion scheduling, so `Promise.all([...])` racing
 * multiple reservation attempts here exercises the SAME interleaving
 * hazard a real concurrent request pair would hit against Postgres.
 */

// ─── Fake DB ────────────────────────────────────────────────────────────

interface FakeSlot {
  id: string; membershipTermsId: string; benefitSnapshotId: string; periodKey: string; slotNumber: number
  status: string; reservedAt: Date | null; reservedBy: string | null; reservationExpiresAt: Date | null
  consumedAt: Date | null; linkedProviderReference: string | null; createdAt: Date; updatedAt: Date
}

function makeFakeDb() {
  const state = {
    memberships: new Map<string, any>(),
    policies: new Map<string, any>(),
    benefits: new Map<string, any>(), // catalog, by key
    terms: new Map<string, any>(),
    snapshots: new Map<string, any>(),
    slots: new Map<string, FakeSlot>(),
    events: [] as any[],
    activityLogs: [] as any[],
    seq: 0,
  }
  const nid = (p: string) => `${p}_${++state.seq}`

  function matchSlots(where: Record<string, unknown>): FakeSlot[] {
    return [...state.slots.values()].filter((s) => {
      if (where.id !== undefined && s.id !== where.id) return false
      if (where.membershipTermsId !== undefined && s.membershipTermsId !== where.membershipTermsId) return false
      if (where.benefitSnapshotId !== undefined && s.benefitSnapshotId !== where.benefitSnapshotId) return false
      if (where.periodKey !== undefined && s.periodKey !== where.periodKey) return false
      if (where.status !== undefined && s.status !== where.status) return false
      if (where.reservedBy !== undefined && s.reservedBy !== where.reservedBy) return false
      const gt = (where.reservationExpiresAt as { gt?: Date } | undefined)?.gt
      if (gt !== undefined) {
        if (!s.reservationExpiresAt || s.reservationExpiresAt.getTime() <= gt.getTime()) return false
      }
      const lt = (where.reservationExpiresAt as { lt?: Date } | undefined)?.lt
      if (lt !== undefined) {
        if (!s.reservationExpiresAt || s.reservationExpiresAt.getTime() >= lt.getTime()) return false
      }
      return true
    })
  }

  const mockPrisma: any = {
    jadeClubMembership: {
      findUnique: async ({ where }: any) => state.memberships.get(where.id) ?? null,
    },
    jadeClubCommercialPolicy: {
      findUnique: async ({ where }: any) => state.policies.get(where.id) ?? null,
    },
    jadeClubBenefit: {
      findUnique: async ({ where }: any) => state.benefits.get(where.key) ?? null,
    },
    jadeClubMembershipTerms: {
      findFirst: async ({ where }: any) => {
        let rows = [...state.terms.values()].filter((t) => t.membershipId === where.membershipId)
        const gt = where.expiresAt?.gt as Date | undefined
        if (gt) rows = rows.filter((t) => t.expiresAt.getTime() > gt.getTime())
        rows.sort((a, b) => b.activatedAt.getTime() - a.activatedAt.getTime())
        return rows[0] ?? null
      },
      create: async ({ data }: any) => {
        const row = { id: nid('terms'), ...data }
        state.terms.set(row.id, row)
        return row
      },
    },
    jadeClubMembershipBenefitSnapshot: {
      findUnique: async ({ where }: any) => {
        if (where.id) return state.snapshots.get(where.id) ?? null
        if (where.membershipTermsId_benefitKey) {
          const { membershipTermsId, benefitKey } = where.membershipTermsId_benefitKey
          return [...state.snapshots.values()].find((s) => s.membershipTermsId === membershipTermsId && s.benefitKey === benefitKey) ?? null
        }
        return null
      },
      findUniqueOrThrow: async (args: any) => {
        const r = await mockPrisma.jadeClubMembershipBenefitSnapshot.findUnique(args)
        if (!r) throw new Error('benefit snapshot not found')
        return r
      },
      create: async ({ data }: any) => {
        const row = { id: nid('snap'), ...data }
        state.snapshots.set(row.id, row)
        return row
      },
    },
    jadeClubEntitlementSlot: {
      findUnique: async ({ where }: any) => {
        if (where.id) return state.slots.get(where.id) ?? null
        const key = where.membershipTermsId_benefitSnapshotId_periodKey_slotNumber
        if (key) {
          return [...state.slots.values()].find((s) =>
            s.membershipTermsId === key.membershipTermsId && s.benefitSnapshotId === key.benefitSnapshotId
            && s.periodKey === key.periodKey && s.slotNumber === key.slotNumber) ?? null
        }
        return null
      },
      findFirst: async ({ where, orderBy }: any) => {
        let rows = matchSlots(where)
        if (orderBy?.slotNumber === 'asc') rows = [...rows].sort((a, b) => a.slotNumber - b.slotNumber)
        if (orderBy?.slotNumber === 'desc') rows = [...rows].sort((a, b) => b.slotNumber - a.slotNumber)
        return rows[0] ?? null
      },
      findMany: async ({ where }: any) => matchSlots(where ?? {}),
      create: async ({ data }: any) => {
        const row: FakeSlot = {
          id: nid('slot'), reservedAt: null, reservedBy: null, reservationExpiresAt: null,
          consumedAt: null, linkedProviderReference: null, createdAt: new Date(), updatedAt: new Date(),
          ...data,
        }
        state.slots.set(row.id, row)
        return row
      },
      updateMany: async ({ where, data }: any) => {
        const rows = matchSlots(where)
        for (const row of rows) Object.assign(row, data, { updatedAt: new Date() })
        return { count: rows.length }
      },
    },
    jadeClubEntitlementEvent: {
      create: async ({ data }: any) => {
        const row = { id: nid('evt'), createdAt: new Date(), ...data }
        state.events.push(row)
        return row
      },
      findMany: async ({ where }: any) => state.events.filter((e) => !where?.slotId || e.slotId === where.slotId),
    },
    activityLog: { create: async ({ data }: any) => { state.activityLogs.push(data); return data } },
    $transaction: async (cb: any) => cb(mockPrisma),
  }

  return { mockPrisma, state, nid }
}

const { mockPrisma, state, nid } = makeFakeDb()
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import {
  activateMembershipTerms, reserveEntitlementSlot, consumeEntitlementSlot, releaseExpiredReservations,
  reverseConsumedSlot, createReplacementSlot, issueSlotsForSnapshot,
} from '../entitlements'
import type { AdminSession } from '@/lib/admin-auth'

function fakeAdmin(role: string): AdminSession {
  return {
    id: 'staff_1', email: 'staff@walztravels.com', name: 'Staff', roleTitle: 'Agent',
    sendingEmail: 'reservations@walztravels.com', signatureTagline: null,
    role, staffRole: role, permissions: {}, branch: 'HQ', department: 'Ops', isActive: true,
  }
}
const MANAGER = fakeAdmin('super_admin')
const UNAUTHORIZED = fakeAdmin('sales_rep')

function resetDb() {
  state.memberships.clear(); state.policies.clear(); state.benefits.clear()
  state.terms.clear(); state.snapshots.clear(); state.slots.clear()
  state.events.length = 0; state.activityLogs.length = 0
}

/** Seeds a benefit snapshot + N AVAILABLE slots directly, bypassing activation, for focused reservation/consumption tests. */
function seedCountBenefit(count: number, opts: { termsId?: string; benefitKey?: string } = {}) {
  const termsId = opts.termsId ?? nid('terms')
  if (!state.terms.has(termsId)) {
    state.terms.set(termsId, { id: termsId, membershipId: 'mem_1', expiresAt: new Date('2099-01-01'), activatedAt: new Date() })
  }
  const snapshotId = nid('snap')
  state.snapshots.set(snapshotId, {
    id: snapshotId, membershipTermsId: termsId, benefitKey: opts.benefitKey ?? 'jade-connect',
    benefitName: 'Jade Connect eSIM', entitlementType: 'COUNT_PER_PERIOD', countPerPeriod: count,
    costCapMinorUsd: null, booleanEligible: null,
  })
  const slotIds: string[] = []
  for (let n = 1; n <= count; n++) {
    const id = nid('slot')
    state.slots.set(id, {
      id, membershipTermsId: termsId, benefitSnapshotId: snapshotId, periodKey: 'Y1', slotNumber: n,
      status: 'AVAILABLE', reservedAt: null, reservedBy: null, reservationExpiresAt: null,
      consumedAt: null, linkedProviderReference: null, createdAt: new Date(), updatedAt: new Date(),
    })
    slotIds.push(id)
  }
  return { termsId, snapshotId, slotIds }
}

beforeEach(() => { resetDb(); jest.useRealTimers() })

// ─── Activation: exact slot count + idempotent issuance ──────────────────

describe('activateMembershipTerms — pre-issues exact slot counts in one transaction', () => {
  beforeEach(() => {
    state.memberships.set('mem_1', { id: 'mem_1', tier: 'CLUB', status: 'ACTIVE' })
    state.benefits.set('jade-connect', { name: 'Jade Connect eSIM' })
    state.policies.set('pol_1', {
      id: 'pol_1', tier: 'CLUB', market: 'NG', currency: 'NGN', annualPriceMinor: 5000000,
      durationMonths: 12, serviceFeeDiscountPercent: 20, status: 'ACTIVE', version: 1,
      benefits: [
        { benefitKey: 'jade-connect', entitlementType: 'COUNT_PER_PERIOD', countPerPeriod: 3, costCapMinorUsd: null, booleanEligible: null },
        { benefitKey: 'priority-pass', entitlementType: 'BOOLEAN_ELIGIBILITY', countPerPeriod: null, costCapMinorUsd: null, booleanEligible: true },
      ],
    })
  })

  it('issues exactly countPerPeriod slots for a COUNT_PER_PERIOD benefit, zero for a BOOLEAN_ELIGIBILITY one', async () => {
    const result = await activateMembershipTerms(MANAGER, 'mem_1', 'pol_1', 'activate CLUB terms')
    expect(result.slotsIssued).toBe(3)
    const slots = [...state.slots.values()].filter((s) => s.membershipTermsId === result.termsId)
    expect(slots).toHaveLength(3)
    expect(slots.map((s) => s.slotNumber).sort()).toEqual([1, 2, 3])
    expect(slots.every((s) => s.status === 'AVAILABLE')).toBe(true)
  })

  it('writes exactly one ISSUED event per slot', async () => {
    const result = await activateMembershipTerms(MANAGER, 'mem_1', 'pol_1', 'activate')
    const issuedEvents = state.events.filter((e) => e.eventType === 'ISSUED')
    expect(issuedEvents).toHaveLength(3)
    const slotIds = [...state.slots.values()].filter((s) => s.membershipTermsId === result.termsId).map((s) => s.id)
    expect(issuedEvents.map((e) => e.slotId).sort()).toEqual(slotIds.sort())
  })

  it('copies the benefitName from the catalog AT THAT MOMENT', async () => {
    await activateMembershipTerms(MANAGER, 'mem_1', 'pol_1', 'activate')
    const snapshot = [...state.snapshots.values()].find((s) => s.benefitKey === 'jade-connect')
    expect(snapshot.benefitName).toBe('Jade Connect eSIM')
  })

  it('rejects an unauthorized role', async () => {
    await expect(activateMembershipTerms(UNAUTHORIZED, 'mem_1', 'pol_1', 'x')).rejects.toThrow(/FORBIDDEN/)
  })

  it('rejects activating against a non-ACTIVE policy', async () => {
    state.policies.get('pol_1').status = 'DRAFT'
    await expect(activateMembershipTerms(MANAGER, 'mem_1', 'pol_1', 'x')).rejects.toThrow(/must be ACTIVE/)
  })

  it('rejects a policy/membership tier mismatch', async () => {
    state.memberships.get('mem_1').tier = 'CLUB_PLUS'
    await expect(activateMembershipTerms(MANAGER, 'mem_1', 'pol_1', 'x')).rejects.toThrow(/does not match/)
  })

  it('rejects re-activation while an unexpired terms period already exists', async () => {
    await activateMembershipTerms(MANAGER, 'mem_1', 'pol_1', 'first activation')
    await expect(activateMembershipTerms(MANAGER, 'mem_1', 'pol_1', 'second activation')).rejects.toThrow(/already has an unexpired/)
  })
})

describe('issueSlotsForSnapshot — idempotent re-issuance (structural, via the unique identity)', () => {
  it('calling it twice with the same identifiers does not create extra slots', async () => {
    const termsId = nid('terms'); const snapshotId = nid('snap')
    const params = { membershipTermsId: termsId, benefitSnapshotId: snapshotId, periodKey: 'Y1', countPerPeriod: 2 }
    const first = await issueSlotsForSnapshot(mockPrisma, params)
    const second = await issueSlotsForSnapshot(mockPrisma, params) // simulate a retried activation step
    expect(first).toBe(2)
    expect(second).toBe(0) // nothing new issued the second time
    const slots = [...state.slots.values()].filter((s) => s.benefitSnapshotId === snapshotId)
    expect(slots).toHaveLength(2) // still exactly 2, never 4
  })
})

// ─── Reservation CAS — the adversarial core ──────────────────────────────

describe('reserveEntitlementSlot — atomic CAS reservation', () => {
  it('reserves an AVAILABLE slot and writes a RESERVED event', async () => {
    const { snapshotId } = seedCountBenefit(2)
    const snap = [...state.snapshots.values()].find((s) => s.id === snapshotId)!
    const result = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'corr-1' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const slot = state.slots.get(result.slotId)!
      expect(slot.status).toBe('RESERVED')
      expect(slot.reservedBy).toBe('corr-1')
      expect(state.events.some((e) => e.slotId === result.slotId && e.eventType === 'RESERVED')).toBe(true)
    }
  })

  it('two CONCURRENT requests racing for ONE slot — exactly one wins', async () => {
    const { snapshotId } = seedCountBenefit(1)
    const snap = [...state.snapshots.values()].find((s) => s.id === snapshotId)!
    const [r1, r2] = await Promise.all([
      reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-A' }),
      reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-B' }),
    ])
    const outcomes = [r1, r2]
    const wins = outcomes.filter((r) => r.ok)
    const losses = outcomes.filter((r) => !r.ok)
    expect(wins).toHaveLength(1)
    expect(losses).toHaveLength(1)
    expect((losses[0] as any).reason).toBe('NO_ENTITLEMENT_AVAILABLE')
    // The DB itself only ever has 1 slot, and it ends up RESERVED exactly once.
    const slots = [...state.slots.values()].filter((s) => s.benefitSnapshotId === snapshotId)
    expect(slots.filter((s) => s.status === 'RESERVED')).toHaveLength(1)
  })

  it('two CONCURRENT requests racing for TWO slots — both succeed, on different slots', async () => {
    const { snapshotId } = seedCountBenefit(2)
    const snap = [...state.snapshots.values()].find((s) => s.id === snapshotId)!
    const [r1, r2] = await Promise.all([
      reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-A' }),
      reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-B' }),
    ])
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    if (r1.ok && r2.ok) expect(r1.slotId).not.toBe(r2.slotId)
  })

  it('THREE concurrent requests racing for TWO slots — exactly two win, one gets NO_ENTITLEMENT_AVAILABLE', async () => {
    const { snapshotId } = seedCountBenefit(2)
    const snap = [...state.snapshots.values()].find((s) => s.id === snapshotId)!
    const results = await Promise.all([
      reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-A' }),
      reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-B' }),
      reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-C' }),
    ])
    const wins = results.filter((r) => r.ok)
    const losses = results.filter((r) => !r.ok)
    expect(wins).toHaveLength(2)
    expect(losses).toHaveLength(1)
    expect((losses[0] as any).reason).toBe('NO_ENTITLEMENT_AVAILABLE')
    const winningSlotIds = wins.map((w: any) => w.slotId)
    expect(new Set(winningSlotIds).size).toBe(2) // two DISTINCT slots, never double-booked
  })

  it('repeated reservation request by the SAME caller is idempotent — returns the same slot, consumes no second one', async () => {
    const { snapshotId } = seedCountBenefit(2)
    const snap = [...state.snapshots.values()].find((s) => s.id === snapshotId)!
    const first = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-A' })
    const second = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-A' })
    expect(first.ok && second.ok).toBe(true)
    if (first.ok && second.ok) expect(first.slotId).toBe(second.slotId)
    const reserved = [...state.slots.values()].filter((s) => s.benefitSnapshotId === snapshotId && s.status === 'RESERVED')
    expect(reserved).toHaveLength(1) // still only one slot taken
  })

  it('returns NO_ENTITLEMENT_AVAILABLE once every slot is taken', async () => {
    const { snapshotId } = seedCountBenefit(1)
    const snap = [...state.snapshots.values()].find((s) => s.id === snapshotId)!
    await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-A' })
    const result = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-B' })
    expect(result).toEqual({ ok: false, reason: 'NO_ENTITLEMENT_AVAILABLE' })
  })

  it('rejects reservation against a BOOLEAN_ELIGIBILITY benefit (no slots exist for it)', async () => {
    const termsId = nid('terms')
    state.terms.set(termsId, { id: termsId, membershipId: 'mem_1', expiresAt: new Date('2099-01-01'), activatedAt: new Date() })
    state.snapshots.set('snap_bool', { id: 'snap_bool', membershipTermsId: termsId, benefitKey: 'priority-pass', entitlementType: 'BOOLEAN_ELIGIBILITY', booleanEligible: true, countPerPeriod: null, costCapMinorUsd: null })
    const result = await reserveEntitlementSlot({ membershipTermsId: termsId, benefitKey: 'priority-pass', reservedBy: 'x' })
    expect(result).toEqual({ ok: false, reason: 'NOT_COUNT_PER_PERIOD' })
  })

  it('rejects reservation against an unknown benefitKey', async () => {
    const result = await reserveEntitlementSlot({ membershipTermsId: 'terms_none', benefitKey: 'nope', reservedBy: 'x' })
    expect(result).toEqual({ ok: false, reason: 'BENEFIT_NOT_FOUND' })
  })
})

// ─── TTL expiry + reclaim ─────────────────────────────────────────────────

describe('Reservation TTL expiry and reclaim', () => {
  it('an expired reservation is released back to AVAILABLE and becomes reclaimable', async () => {
    const { snapshotId } = seedCountBenefit(1)
    const snap = [...state.snapshots.values()].find((s) => s.id === snapshotId)!
    const first = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-A' })
    expect(first.ok).toBe(true)
    // Force the reservation into the past.
    const slotId = (first as any).slotId
    state.slots.get(slotId)!.reservationExpiresAt = new Date(Date.now() - 1000)

    const released = await releaseExpiredReservations(new Date())
    expect(released).toBe(1)
    expect(state.slots.get(slotId)!.status).toBe('AVAILABLE')
    expect(state.events.some((e) => e.slotId === slotId && e.eventType === 'RESERVATION_RELEASED')).toBe(true)

    // Now reclaimable by a new caller.
    const second = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-B' })
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.slotId).toBe(slotId)
  })

  it('reserveEntitlementSlot lazily reclaims an expired reservation before searching for AVAILABLE candidates', async () => {
    const { snapshotId } = seedCountBenefit(1)
    const snap = [...state.snapshots.values()].find((s) => s.id === snapshotId)!
    const first = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-A' })
    const slotId = (first as any).slotId
    state.slots.get(slotId)!.reservationExpiresAt = new Date(Date.now() - 1000)

    // No explicit releaseExpiredReservations call — a fresh reservation attempt should reclaim it inline.
    const second = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-B' })
    expect(second.ok).toBe(true)
  })
})

// ─── Consumption ──────────────────────────────────────────────────────────

describe('consumeEntitlementSlot', () => {
  it('consumes a RESERVED slot held by the same caller', async () => {
    const { snapshotId } = seedCountBenefit(1)
    const snap = [...state.snapshots.values()].find((s) => s.id === snapshotId)!
    const reserved = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-A' })
    const slotId = (reserved as any).slotId
    const result = await consumeEntitlementSlot({ slotId, reservedBy: 'caller-A' })
    expect(result).toEqual({ ok: true, slotId })
    expect(state.slots.get(slotId)!.status).toBe('CONSUMED')
    expect(state.events.some((e) => e.slotId === slotId && e.eventType === 'CONSUMED')).toBe(true)
  })

  it('rejects consumption without a prior reservation (slot is AVAILABLE)', async () => {
    const { slotIds } = seedCountBenefit(1)
    const result = await consumeEntitlementSlot({ slotId: slotIds[0], reservedBy: 'caller-A' })
    expect(result).toEqual({ ok: false, reason: 'NOT_RESERVED' })
  })

  it('rejects a repeated consumption attempt on an already-CONSUMED slot', async () => {
    const { snapshotId } = seedCountBenefit(1)
    const snap = [...state.snapshots.values()].find((s) => s.id === snapshotId)!
    const reserved = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-A' })
    const slotId = (reserved as any).slotId
    await consumeEntitlementSlot({ slotId, reservedBy: 'caller-A' })
    const second = await consumeEntitlementSlot({ slotId, reservedBy: 'caller-A' })
    expect(second).toEqual({ ok: false, reason: 'ALREADY_CONSUMED' })
  })

  it('rejects consumption by a caller who does not hold the reservation', async () => {
    const { snapshotId } = seedCountBenefit(1)
    const snap = [...state.snapshots.values()].find((s) => s.id === snapshotId)!
    const reserved = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-A' })
    const slotId = (reserved as any).slotId
    const result = await consumeEntitlementSlot({ slotId, reservedBy: 'caller-IMPOSTOR' })
    expect(result).toEqual({ ok: false, reason: 'RESERVATION_MISMATCH' })
    expect(state.slots.get(slotId)!.status).toBe('RESERVED') // unchanged
  })

  it('rejects consumption against an expired reservation and reclaims it to AVAILABLE rather than silently succeeding', async () => {
    const { snapshotId } = seedCountBenefit(1)
    const snap = [...state.snapshots.values()].find((s) => s.id === snapshotId)!
    const reserved = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-A' })
    const slotId = (reserved as any).slotId
    state.slots.get(slotId)!.reservationExpiresAt = new Date(Date.now() - 1000)

    const result = await consumeEntitlementSlot({ slotId, reservedBy: 'caller-A' })
    expect(result).toEqual({ ok: false, reason: 'RESERVATION_EXPIRED' })
    expect(state.slots.get(slotId)!.status).toBe('AVAILABLE')
  })

  it('rejects consumption of a nonexistent slot', async () => {
    const result = await consumeEntitlementSlot({ slotId: 'does-not-exist', reservedBy: 'x' })
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })
})

// ─── Admin reversal + replacement ─────────────────────────────────────────

describe('reverseConsumedSlot — admin-only, audited, terminal', () => {
  it('rejects an unauthorized role', async () => {
    const { slotIds } = seedCountBenefit(1)
    await expect(reverseConsumedSlot(UNAUTHORIZED, slotIds[0], 'refund')).rejects.toThrow(/FORBIDDEN/)
  })

  it('rejects a missing reason', async () => {
    const { slotIds } = seedCountBenefit(1)
    state.slots.get(slotIds[0])!.status = 'CONSUMED'
    await expect(reverseConsumedSlot(MANAGER, slotIds[0], '')).rejects.toThrow(/reason is required/)
  })

  it('reverses a CONSUMED slot to REVERSED and writes an audited event', async () => {
    const { slotIds } = seedCountBenefit(1)
    state.slots.get(slotIds[0])!.status = 'CONSUMED'
    await reverseConsumedSlot(MANAGER, slotIds[0], 'provider order failed downstream')
    expect(state.slots.get(slotIds[0])!.status).toBe('REVERSED')
    expect(state.events.some((e) => e.slotId === slotIds[0] && e.eventType === 'REVERSED' && e.actorStaffId === 'staff_1')).toBe(true)
    expect(state.activityLogs.some((l) => l.action === 'JADE_CLUB_ENTITLEMENT_SLOT_REVERSED')).toBe(true)
  })

  it('rejects reversing a slot that is not CONSUMED', async () => {
    const { slotIds } = seedCountBenefit(1) // AVAILABLE
    await expect(reverseConsumedSlot(MANAGER, slotIds[0], 'x')).rejects.toThrow(/Only a CONSUMED slot/)
  })

  it('a REVERSED slot cannot be reserved again', async () => {
    const { snapshotId, slotIds } = seedCountBenefit(1)
    const snap = [...state.snapshots.values()].find((s) => s.id === snapshotId)!
    state.slots.get(slotIds[0])!.status = 'CONSUMED'
    await reverseConsumedSlot(MANAGER, slotIds[0], 'refund')
    const result = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-new' })
    expect(result).toEqual({ ok: false, reason: 'NO_ENTITLEMENT_AVAILABLE' })
  })

  it('a REVERSED slot cannot be consumed again', async () => {
    const { slotIds } = seedCountBenefit(1)
    state.slots.get(slotIds[0])!.status = 'CONSUMED'
    await reverseConsumedSlot(MANAGER, slotIds[0], 'refund')
    const result = await consumeEntitlementSlot({ slotId: slotIds[0], reservedBy: 'anyone' })
    expect(result).toEqual({ ok: false, reason: 'TERMINAL' })
  })
})

describe('createReplacementSlot — genuinely NEW slot, never resurrects the REVERSED one', () => {
  it('rejects an unauthorized role', async () => {
    const { snapshotId } = seedCountBenefit(1)
    await expect(createReplacementSlot(UNAUTHORIZED, snapshotId, 'replace')).rejects.toThrow(/FORBIDDEN/)
  })

  it('creates a new slot with the next slotNumber, distinct from the reversed one', async () => {
    const { snapshotId, slotIds } = seedCountBenefit(1)
    state.slots.get(slotIds[0])!.status = 'CONSUMED'
    await reverseConsumedSlot(MANAGER, slotIds[0], 'device lost')

    const replacement = await createReplacementSlot(MANAGER, snapshotId, 'goodwill replacement')
    expect(replacement.slotId).not.toBe(slotIds[0])
    expect(replacement.slotNumber).toBe(2)
    const newSlot = state.slots.get(replacement.slotId)!
    expect(newSlot.status).toBe('AVAILABLE')
    // The original REVERSED row is untouched — never resurrected.
    expect(state.slots.get(slotIds[0])!.status).toBe('REVERSED')
  })

  it('the new replacement slot is reservable', async () => {
    const { snapshotId, slotIds } = seedCountBenefit(1)
    const snap = state.snapshots.get(snapshotId)!
    state.slots.get(slotIds[0])!.status = 'CONSUMED'
    await reverseConsumedSlot(MANAGER, slotIds[0], 'lost device')
    const replacement = await createReplacementSlot(MANAGER, snapshotId, 'replacement grant')

    const result = await reserveEntitlementSlot({ membershipTermsId: snap.membershipTermsId, benefitKey: snap.benefitKey, reservedBy: 'caller-A' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.slotId).toBe(replacement.slotId)
  })

  it('rejects a replacement grant for a non-COUNT_PER_PERIOD snapshot', async () => {
    const termsId = nid('terms')
    state.snapshots.set('snap_bool', { id: 'snap_bool', membershipTermsId: termsId, benefitKey: 'priority-pass', entitlementType: 'BOOLEAN_ELIGIBILITY', booleanEligible: true, countPerPeriod: null, costCapMinorUsd: null })
    await expect(createReplacementSlot(MANAGER, 'snap_bool', 'x')).rejects.toThrow(/only apply to COUNT_PER_PERIOD/)
  })
})
