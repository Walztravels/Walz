// lib/jade-club/__tests__/postgres-concurrency.test.ts
//
// REAL POSTGRESQL INTEGRATION TEST — not a unit test.
//
// Closes the "POSTGRES CONCURRENCY ACCEPTANCE NOT PROVEN" gap from the
// Walz Business R1 × Jade 2A cross-workstream integration review. Every
// earlier concurrency regression test for
// lib/jade-club/entitlements.ts::activateMembershipTerms ran against a
// hand-written in-memory FakeDb (see entitlements.test.ts) — accurate for
// exercising the application-level logic, but incapable of proving that the
// real `SELECT ... FOR UPDATE` statement genuinely serializes two competing
// Postgres transactions. This file proves exactly that, against a real
// PostgreSQL server, calling the REAL exported function — nothing here
// mocks Prisma, mocks a transaction, or reimplements the lock.
//
// Runs ONLY via jest.postgres-concurrency.config.js, driven by
// .github/workflows/jade-postgres-concurrency-gate.yml's `postgres:16`
// service container. It is excluded from the default `npx jest` run (see
// jest.config.ts) because it requires a real DATABASE_URL and will fail
// immediately without one — that is intentional, not a bug.
//
// TEST INFRASTRUCTURE ONLY. Imports and calls the real, unmodified
// activateMembershipTerms/createDraftPolicy/addPolicyBenefit/activatePolicy
// — no product code in this repo was changed to make this test possible.

import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { activateMembershipTerms } from '../entitlements'
import { createDraftPolicy, addPolicyBenefit, activatePolicy } from '../commercial-policy'
import type { AdminSession } from '@/lib/admin-auth'

if (!process.env.DATABASE_URL) {
  throw new Error(
    'postgres-concurrency.test.ts requires a real DATABASE_URL (a real PostgreSQL ' +
    'instance) — see .github/workflows/jade-postgres-concurrency-gate.yml. Refusing ' +
    'to run against a mock or an undefined connection.',
  )
}

// A dedicated PrismaClient for this test file, separate from lib/db.ts's
// app singleton, so we can assert its provider/connection independently of
// how the app happens to be configured. lib/db.ts's own singleton (used
// internally by activateMembershipTerms et al.) connects to this exact same
// DATABASE_URL — this is the SAME real database, just two client handles to it.
const db = new PrismaClient()

// A believable, permission-bearing admin session. activateMembershipTerms
// only reads .id/.name/.role/.permissions off this object (see
// requireManage/hasPermission in entitlements.ts) — it is never persisted
// as a foreign key itself except via ActivityLog.staffId, which is why a
// real Staff fixture row is created below with a matching id.
function adminSessionFor(staffId: string): AdminSession {
  return {
    id: staffId,
    email: `${staffId}@test.internal`,
    name: 'PG Concurrency Test Admin',
    roleTitle: 'Test Runner',
    sendingEmail: 'bookings@walztravels.com',
    signatureTagline: null,
    role: 'super_admin',
    staffRole: 'super_admin',
    permissions: {},
    branch: 'nigeria',
    department: 'general',
  } as AdminSession
}

const RUN_ID = randomUUID().slice(0, 8)
let staffId: string
let policyId: string
let benefitSnapshotSlotCount: number
const createdUserIds: string[] = []

// GATE A CLOSURE: matches the real production controlled acceptance benefit
// ("acceptance-test-benefit", COUNT_PER_PERIOD, 2 per period) exactly, so
// this real-Postgres test closes the "activation at exactly count=2" Gate A
// item with the strongest available evidence (a real database, not a fake).
const SLOTS_PER_MEMBERSHIP = 2

beforeAll(async () => {
  // ── Prove this is a real PostgreSQL connection, not a mock ────────────
  const versionRow = await db.$queryRaw<{ version: string }[]>`SELECT version()`
  const version = versionRow[0]?.version ?? ''
  // eslint-disable-next-line no-console
  console.log(`[postgres-concurrency] Connected to: ${version}`)
  expect(version.toLowerCase()).toContain('postgresql')

  // ── Fixture: one Staff row (real FK target for ActivityLog.staffId) ───
  const staff = await db.staff.create({
    data: {
      name: 'PG Concurrency Test Admin',
      email: `pg-concurrency-admin-${RUN_ID}@test.internal`,
      passwordHash: 'not-a-real-hash',
      roleTitle: 'Test Runner',
      role: 'super_admin',
    },
  })
  staffId = staff.id

  // ── Fixture: one ACTIVE commercial policy with one COUNT_PER_PERIOD
  //    benefit (countPerPeriod = 2, matching the real acceptance-test-benefit) — created and activated through the
  //    REAL commercial-policy.ts functions, not a raw insert, so the
  //    fixture itself is only ever in a state the real application can
  //    actually produce. ──────────────────────────────────────────────
  const admin = adminSessionFor(staffId)
  const draft = await createDraftPolicy(admin, {
    tier: 'CLUB',
    market: `PGTEST-${RUN_ID}`, // unique scope per run — never collides with a real or prior-run policy
    currency: 'USD',
    annualPriceMinor: 10_000,
    durationMonths: 12,
    serviceFeeDiscountPercent: 10,
    effectiveFrom: new Date(),
    reason: 'Postgres concurrency acceptance test fixture',
  })
  await addPolicyBenefit(admin, draft.id, {
    benefitKey: `pg-test-benefit-${RUN_ID}`,
    entitlementType: 'COUNT_PER_PERIOD',
    countPerPeriod: SLOTS_PER_MEMBERSHIP,
    reason: 'Postgres concurrency acceptance test fixture',
  })
  const activated = await activatePolicy(admin, draft.id, 'Postgres concurrency acceptance test fixture')
  policyId = activated.id
  benefitSnapshotSlotCount = SLOTS_PER_MEMBERSHIP
})

afterAll(async () => {
  // Cleanup order matters: User -> (cascade) JadeClubMembership -> (cascade)
  // JadeClubMembershipTerms -> (cascade) snapshots/slots/events, THEN the
  // policy (JadeClubMembershipTerms.policy is onDelete: Restrict, so the
  // policy can only be deleted once no Terms row references it any more —
  // true immediately after the memberships/users above are gone).
  for (const userId of createdUserIds) {
    await db.user.delete({ where: { id: userId } }).catch(() => {})
  }
  if (policyId) {
    await db.jadeClubPolicyBenefit.deleteMany({ where: { policyId } }).catch(() => {})
    await db.jadeClubCommercialPolicy.delete({ where: { id: policyId } }).catch(() => {})
  }
  if (staffId) {
    await db.activityLog.deleteMany({ where: { staffId } }).catch(() => {})
    await db.staff.delete({ where: { id: staffId } }).catch(() => {})
  }
  await db.$disconnect()
})

/** Creates one fresh User + JadeClubMembership (tier CLUB, matching the fixture policy), returns the membership id. */
async function createFreshMembership(label: string): Promise<string> {
  const user = await db.user.create({
    data: { email: `pg-concurrency-${label}-${RUN_ID}@test.internal`, name: `PG Concurrency ${label}` },
  })
  createdUserIds.push(user.id)
  const membership = await db.jadeClubMembership.create({
    data: {
      userId: user.id,
      memberCode: `PGT-${RUN_ID}-${label}`,
      tier: 'CLUB',
      status: 'ACTIVE',
    },
  })
  return membership.id
}

/** One concurrent activation attempt. Resolves with a discriminated result — never throws — so Promise.all can collect every outcome without allSettled's extra unwrapping. */
async function attemptActivation(admin: AdminSession, membershipId: string, attemptLabel: string) {
  try {
    const result = await activateMembershipTerms(admin, membershipId, policyId, `Concurrency test attempt ${attemptLabel}`)
    return { ok: true as const, result }
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : String(err) }
  }
}

const EXPECTED_LOSER_MESSAGE = 'already has an unexpired commercial terms period'

describe('Jade Club activateMembershipTerms — REAL PostgreSQL concurrency acceptance', () => {
  test('SCENARIO A — two genuinely concurrent activation calls for the SAME membership: exactly one wins', async () => {
    const membershipId = await createFreshMembership('scenario-a')
    const admin = adminSessionFor(staffId)

    // Both calls are started without awaiting between them — Node schedules
    // their microtasks/IO independently, and by the time each reaches
    // activateMembershipTerms's `SELECT ... FOR UPDATE` (the first statement
    // in its transaction), they are two genuinely separate Postgres
    // connections racing for the same row lock. This is the real code path —
    // no test-only synchronization or lock is introduced here.
    const [a, b] = await Promise.all([
      attemptActivation(admin, membershipId, 'A1'),
      attemptActivation(admin, membershipId, 'A2'),
    ])

    const outcomes = [a, b]
    const winners = outcomes.filter((o) => o.ok)
    const losers = outcomes.filter((o) => !o.ok)

    // Integrity, not universal success: exactly one call may create a
    // contract. A losing call rejecting is the designed safe outcome.
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    for (const loser of losers) {
      if (!loser.ok) expect(loser.message).toContain(EXPECTED_LOSER_MESSAGE)
    }

    // ── Direct DB verification — query the real tables, not the function's return value ──
    const termsRows = await db.jadeClubMembershipTerms.findMany({ where: { membershipId } })
    expect(termsRows).toHaveLength(1) // no duplicate contract

    const snapshotRows = await db.jadeClubMembershipBenefitSnapshot.findMany({ where: { membershipTermsId: termsRows[0].id } })
    expect(snapshotRows).toHaveLength(1) // no duplicate benefit snapshot

    const slotRows = await db.jadeClubEntitlementSlot.findMany({ where: { benefitSnapshotId: snapshotRows[0].id }, orderBy: { slotNumber: 'asc' } })
    expect(slotRows).toHaveLength(benefitSnapshotSlotCount) // exactly the configured count, no excess
    expect(slotRows.map((s) => s.slotNumber)).toEqual([1, 2]) // no duplicate slot identity, no gaps
    expect(new Set(slotRows.map((s) => s.status))).toEqual(new Set(['AVAILABLE']))

    const eventRows = await db.jadeClubEntitlementEvent.findMany({ where: { slotId: { in: slotRows.map((s) => s.id) } } })
    expect(eventRows).toHaveLength(benefitSnapshotSlotCount) // one ISSUED event per slot, no more
    expect(eventRows.every((e) => e.eventType === 'ISSUED')).toBe(true)
  })

  test('SCENARIO B — three genuinely concurrent activation calls for the SAME membership: exactly one wins, from clean fixture state', async () => {
    const membershipId = await createFreshMembership('scenario-b')
    const admin = adminSessionFor(staffId)

    const [a, b, c] = await Promise.all([
      attemptActivation(admin, membershipId, 'B1'),
      attemptActivation(admin, membershipId, 'B2'),
      attemptActivation(admin, membershipId, 'B3'),
    ])

    const outcomes = [a, b, c]
    const winners = outcomes.filter((o) => o.ok)
    const losers = outcomes.filter((o) => !o.ok)

    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(2)
    for (const loser of losers) {
      if (!loser.ok) expect(loser.message).toContain(EXPECTED_LOSER_MESSAGE)
    }

    const termsRows = await db.jadeClubMembershipTerms.findMany({ where: { membershipId } })
    expect(termsRows).toHaveLength(1)

    const snapshotRows = await db.jadeClubMembershipBenefitSnapshot.findMany({ where: { membershipTermsId: termsRows[0].id } })
    expect(snapshotRows).toHaveLength(1)

    const slotRows = await db.jadeClubEntitlementSlot.findMany({ where: { benefitSnapshotId: snapshotRows[0].id }, orderBy: { slotNumber: 'asc' } })
    expect(slotRows).toHaveLength(benefitSnapshotSlotCount) // still exactly 3, never 6 or 9
    expect(slotRows.map((s) => s.slotNumber)).toEqual([1, 2])

    // Slot-identity uniqueness constraint (uq_jade_entitlement_slots_identity /
    // the @@unique on JadeClubEntitlementSlot) is what makes a duplicate
    // slotNumber structurally impossible even if the lock were ever bypassed —
    // confirm there really is exactly one row per slotNumber, not just that
    // the count matches.
    const bySlotNumber = new Map<number, number>()
    for (const s of slotRows) bySlotNumber.set(s.slotNumber, (bySlotNumber.get(s.slotNumber) ?? 0) + 1)
    for (const [, count] of bySlotNumber) expect(count).toBe(1)

    const eventRows = await db.jadeClubEntitlementEvent.findMany({ where: { slotId: { in: slotRows.map((s) => s.id) } } })
    expect(eventRows).toHaveLength(benefitSnapshotSlotCount)
  })
})
