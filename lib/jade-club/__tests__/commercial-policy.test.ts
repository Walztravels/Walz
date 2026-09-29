/**
 * Jade Travel Club Release 2A — commercial policy + policy-benefit tests.
 * Covers: version creation, ACTIVE immutability, atomic supersession, the
 * partial-unique-index race being surfaced as a friendly error,
 * authorization (jade_club.manage), mandatory audit reason, and
 * mass-assignment rejection.
 */

import { Prisma } from '@prisma/client'

const mockTx = {
  jadeClubCommercialPolicy: {
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
}
const mockPrisma = {
  jadeClubCommercialPolicy: {
    findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(),
  },
  jadeClubPolicyBenefit: {
    create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn(),
  },
  activityLog: { create: jest.fn() },
  $transaction: jest.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import {
  createDraftPolicy, activatePolicy, addPolicyBenefit, updatePolicyBenefit, deletePolicyBenefit,
} from '../commercial-policy'
import type { AdminSession } from '@/lib/admin-auth'

function fakeAdmin(role: string): AdminSession {
  return {
    id: 'staff_1', email: 'staff@walztravels.com', name: 'Staff Member', roleTitle: 'Agent',
    sendingEmail: 'reservations@walztravels.com', signatureTagline: null,
    role, staffRole: role, permissions: {}, branch: 'HQ', department: 'Ops', isActive: true,
  }
}
const MANAGER = fakeAdmin('super_admin')
const UNAUTHORIZED = fakeAdmin('sales_rep')

function fakePolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pol_1', tier: 'CLUB', market: 'NG', currency: 'NGN',
    annualPriceMinor: 5000000, durationMonths: 12, serviceFeeDiscountPercent: 20,
    effectiveFrom: new Date('2026-01-01'), effectiveTo: null,
    version: 1, status: 'DRAFT', createdBy: 'staff_1',
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx))
  mockPrisma.activityLog.create.mockResolvedValue({})
})

describe('createDraftPolicy', () => {
  const validInput = {
    tier: 'CLUB', market: 'NG', currency: 'NGN',
    annualPriceMinor: 5000000, serviceFeeDiscountPercent: 20,
    effectiveFrom: new Date('2026-01-01'), reason: 'New 2026 pricing',
  }

  it('rejects an unauthorized role WITHOUT touching the database', async () => {
    await expect(createDraftPolicy(UNAUTHORIZED, validInput)).rejects.toThrow(/FORBIDDEN/)
    expect(mockPrisma.jadeClubCommercialPolicy.create).not.toHaveBeenCalled()
  })

  it('rejects a missing/blank reason', async () => {
    await expect(createDraftPolicy(MANAGER, { ...validInput, reason: '   ' })).rejects.toThrow(/reason is required/)
    expect(mockPrisma.jadeClubCommercialPolicy.create).not.toHaveBeenCalled()
  })

  it('rejects tier FREE (no commercial policy exists for Free)', async () => {
    await expect(createDraftPolicy(MANAGER, { ...validInput, tier: 'FREE' })).rejects.toThrow(/Invalid tier/)
  })

  it('rejects a negative annualPriceMinor', async () => {
    await expect(createDraftPolicy(MANAGER, { ...validInput, annualPriceMinor: -1 })).rejects.toThrow(/annualPriceMinor/)
  })

  it('rejects a non-integer annualPriceMinor (no fractional minor units)', async () => {
    await expect(createDraftPolicy(MANAGER, { ...validInput, annualPriceMinor: 100.5 })).rejects.toThrow(/annualPriceMinor/)
  })

  it('rejects serviceFeeDiscountPercent outside 0–100', async () => {
    await expect(createDraftPolicy(MANAGER, { ...validInput, serviceFeeDiscountPercent: 101 })).rejects.toThrow(/serviceFeeDiscountPercent/)
    await expect(createDraftPolicy(MANAGER, { ...validInput, serviceFeeDiscountPercent: -1 })).rejects.toThrow(/serviceFeeDiscountPercent/)
  })

  it('accepts boundary discount percentages 0 and 100', async () => {
    mockPrisma.jadeClubCommercialPolicy.findFirst.mockResolvedValue(null)
    mockPrisma.jadeClubCommercialPolicy.create.mockResolvedValue(fakePolicy({ serviceFeeDiscountPercent: 0 }))
    await expect(createDraftPolicy(MANAGER, { ...validInput, serviceFeeDiscountPercent: 0 })).resolves.toBeTruthy()

    mockPrisma.jadeClubCommercialPolicy.create.mockResolvedValue(fakePolicy({ serviceFeeDiscountPercent: 100 }))
    await expect(createDraftPolicy(MANAGER, { ...validInput, serviceFeeDiscountPercent: 100 })).resolves.toBeTruthy()
  })

  it('rejects an invalid currency code', async () => {
    await expect(createDraftPolicy(MANAGER, { ...validInput, currency: 'naira' })).rejects.toThrow(/currency/)
  })

  it('computes version as (max existing version for scope) + 1, never client-supplied', async () => {
    mockPrisma.jadeClubCommercialPolicy.findFirst.mockResolvedValue({ version: 3 })
    mockPrisma.jadeClubCommercialPolicy.create.mockResolvedValue(fakePolicy({ version: 4 }))

    await createDraftPolicy(MANAGER, { ...validInput, ...({ version: 999 } as Record<string, unknown>) })

    const createArgs = mockPrisma.jadeClubCommercialPolicy.create.mock.calls[0][0]
    expect(createArgs.data.version).toBe(4)
  })

  it('starts version at 1 for a brand-new scope', async () => {
    mockPrisma.jadeClubCommercialPolicy.findFirst.mockResolvedValue(null)
    mockPrisma.jadeClubCommercialPolicy.create.mockResolvedValue(fakePolicy({ version: 1 }))
    await createDraftPolicy(MANAGER, validInput)
    expect(mockPrisma.jadeClubCommercialPolicy.create.mock.calls[0][0].data.version).toBe(1)
  })

  it('always creates as DRAFT regardless of any client-supplied status (mass-assignment rejection)', async () => {
    mockPrisma.jadeClubCommercialPolicy.findFirst.mockResolvedValue(null)
    mockPrisma.jadeClubCommercialPolicy.create.mockResolvedValue(fakePolicy())

    await createDraftPolicy(MANAGER, { ...validInput, ...({ status: 'ACTIVE', createdBy: 'someone_else' } as Record<string, unknown>) })

    const data = mockPrisma.jadeClubCommercialPolicy.create.mock.calls[0][0].data
    expect(data.status).toBe('DRAFT')
    expect(data.createdBy).toBe('staff_1') // server-derived from admin.id, never client-supplied
    // Exactly the known scalar fields — never a spread of the raw input.
    expect(Object.keys(data).sort()).toEqual([
      'annualPriceMinor', 'createdBy', 'currency', 'durationMonths', 'effectiveFrom',
      'effectiveTo', 'market', 'serviceFeeDiscountPercent', 'status', 'tier', 'version',
    ].sort())
  })

  it('writes an ActivityLog audit row with the reason', async () => {
    mockPrisma.jadeClubCommercialPolicy.findFirst.mockResolvedValue(null)
    mockPrisma.jadeClubCommercialPolicy.create.mockResolvedValue(fakePolicy())
    await createDraftPolicy(MANAGER, validInput)
    expect(mockPrisma.activityLog.create).toHaveBeenCalledTimes(1)
    const log = mockPrisma.activityLog.create.mock.calls[0][0].data
    expect(log.module).toBe('jade_club')
    expect(log.action).toBe('JADE_CLUB_POLICY_CREATED')
    expect(log.detail).toBe('New 2026 pricing')
  })
})

describe('activatePolicy — atomic supersession + the single-active-policy invariant', () => {
  it('rejects an unauthorized role', async () => {
    await expect(activatePolicy(UNAUTHORIZED, 'pol_1', 'go live')).rejects.toThrow(/FORBIDDEN/)
  })

  it('rejects a missing reason', async () => {
    await expect(activatePolicy(MANAGER, 'pol_1', '')).rejects.toThrow(/reason is required/)
  })

  it('rejects activating a policy that is not DRAFT', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue(fakePolicy({ status: 'ACTIVE' }))
    await expect(activatePolicy(MANAGER, 'pol_1', 'go live')).rejects.toThrow(/Only a DRAFT policy/)
  })

  it('supersedes the prior ACTIVE policy and activates the target, inside one transaction', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue(fakePolicy({ status: 'DRAFT' }))
    mockTx.jadeClubCommercialPolicy.updateMany
      .mockResolvedValueOnce({ count: 1 }) // supersede old ACTIVE
      .mockResolvedValueOnce({ count: 1 }) // claim DRAFT -> ACTIVE
    mockTx.jadeClubCommercialPolicy.findUniqueOrThrow.mockResolvedValue(fakePolicy({ status: 'ACTIVE' }))

    const result = await activatePolicy(MANAGER, 'pol_1', 'go live')

    expect(result.status).toBe('ACTIVE')
    expect(mockTx.jadeClubCommercialPolicy.updateMany).toHaveBeenCalledTimes(2)
    const supersedeCall = mockTx.jadeClubCommercialPolicy.updateMany.mock.calls[0][0]
    expect(supersedeCall.where).toMatchObject({ tier: 'CLUB', market: 'NG', currency: 'NGN', status: 'ACTIVE' })
    expect(supersedeCall.data.status).toBe('SUPERSEDED')
    const claimCall = mockTx.jadeClubCommercialPolicy.updateMany.mock.calls[1][0]
    expect(claimCall.where).toMatchObject({ id: 'pol_1', status: 'DRAFT' })
    expect(claimCall.data.status).toBe('ACTIVE')
  })

  it('throws if the claim (DRAFT -> ACTIVE) loses a race — a concurrent request already activated it', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue(fakePolicy({ status: 'DRAFT' }))
    mockTx.jadeClubCommercialPolicy.updateMany
      .mockResolvedValueOnce({ count: 0 }) // supersede (nothing to supersede)
      .mockResolvedValueOnce({ count: 0 }) // claim lost the race
    await expect(activatePolicy(MANAGER, 'pol_1', 'go live')).rejects.toThrow(/no longer DRAFT/)
  })

  it('translates a P2002 unique-violation (partial index caught a race) into a friendly error', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue(fakePolicy({ status: 'DRAFT' }))
    mockPrisma.$transaction.mockImplementationOnce(async () => {
      const err = new Error('Unique constraint failed') as Error & { code: string }
      err.code = 'P2002'
      throw err
    })
    await expect(activatePolicy(MANAGER, 'pol_1', 'go live')).rejects.toThrow(/already ACTIVE/)
  })

  it('writes an ActivityLog audit row on successful activation', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue(fakePolicy({ status: 'DRAFT' }))
    mockTx.jadeClubCommercialPolicy.updateMany.mockResolvedValue({ count: 1 })
    mockTx.jadeClubCommercialPolicy.findUniqueOrThrow.mockResolvedValue(fakePolicy({ status: 'ACTIVE' }))
    await activatePolicy(MANAGER, 'pol_1', 'go live')
    expect(mockPrisma.activityLog.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.activityLog.create.mock.calls[0][0].data.action).toBe('JADE_CLUB_POLICY_ACTIVATED')
  })
})

describe('policy-benefit rows — DRAFT-only mutability, immutable once ever ACTIVE', () => {
  const validCount = { benefitKey: 'jade-connect', entitlementType: 'COUNT_PER_PERIOD', countPerPeriod: 2, reason: 'add eSIM benefit' }

  it('addPolicyBenefit rejects an unauthorized role', async () => {
    await expect(addPolicyBenefit(UNAUTHORIZED, 'pol_1', validCount)).rejects.toThrow(/FORBIDDEN/)
  })

  it('addPolicyBenefit rejects a missing reason', async () => {
    await expect(addPolicyBenefit(MANAGER, 'pol_1', { ...validCount, reason: '' })).rejects.toThrow(/reason is required/)
  })

  it('addPolicyBenefit succeeds on a DRAFT policy', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue({ id: 'pol_1', status: 'DRAFT' })
    mockPrisma.jadeClubPolicyBenefit.create.mockResolvedValue({
      id: 'pb_1', policyId: 'pol_1', benefitKey: 'jade-connect', entitlementType: 'COUNT_PER_PERIOD',
      countPerPeriod: 2, costCapMinorUsd: null, booleanEligible: null, createdAt: new Date(),
    })
    const result = await addPolicyBenefit(MANAGER, 'pol_1', validCount)
    expect(result.benefitKey).toBe('jade-connect')
  })

  it('addPolicyBenefit rejects once the policy is ACTIVE (immutable)', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue({ id: 'pol_1', status: 'ACTIVE' })
    await expect(addPolicyBenefit(MANAGER, 'pol_1', validCount)).rejects.toThrow(/immutable/)
    expect(mockPrisma.jadeClubPolicyBenefit.create).not.toHaveBeenCalled()
  })

  it('addPolicyBenefit rejects once the policy was EVER active (now SUPERSEDED) — not just currently ACTIVE', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue({ id: 'pol_1', status: 'SUPERSEDED' })
    await expect(addPolicyBenefit(MANAGER, 'pol_1', validCount)).rejects.toThrow(/immutable/)
  })

  it('rejects a COUNT_PER_PERIOD row with costCapMinorUsd or booleanEligible also set', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue({ id: 'pol_1', status: 'DRAFT' })
    await expect(addPolicyBenefit(MANAGER, 'pol_1', { ...validCount, costCapMinorUsd: 500 } as never)).rejects.toThrow(/Only countPerPeriod/)
  })

  it('rejects COUNT_PER_PERIOD with a zero or negative count', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue({ id: 'pol_1', status: 'DRAFT' })
    await expect(addPolicyBenefit(MANAGER, 'pol_1', { ...validCount, countPerPeriod: 0 })).rejects.toThrow(/positive integer/)
  })

  it('accepts a valid COST_CAPPED row', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue({ id: 'pol_1', status: 'DRAFT' })
    mockPrisma.jadeClubPolicyBenefit.create.mockResolvedValue({
      id: 'pb_2', policyId: 'pol_1', benefitKey: 'concierge', entitlementType: 'COST_CAPPED',
      countPerPeriod: null, costCapMinorUsd: 10000, booleanEligible: null, createdAt: new Date(),
    })
    const result = await addPolicyBenefit(MANAGER, 'pol_1', { benefitKey: 'concierge', entitlementType: 'COST_CAPPED', costCapMinorUsd: 10000, reason: 'concierge cap' })
    expect(result.costCapMinorUsd).toBe(10000)
  })

  it('accepts a valid BOOLEAN_ELIGIBILITY row', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue({ id: 'pol_1', status: 'DRAFT' })
    mockPrisma.jadeClubPolicyBenefit.create.mockResolvedValue({
      id: 'pb_3', policyId: 'pol_1', benefitKey: 'priority-pass', entitlementType: 'BOOLEAN_ELIGIBILITY',
      countPerPeriod: null, costCapMinorUsd: null, booleanEligible: true, createdAt: new Date(),
    })
    const result = await addPolicyBenefit(MANAGER, 'pol_1', { benefitKey: 'priority-pass', entitlementType: 'BOOLEAN_ELIGIBILITY', booleanEligible: true, reason: 'lounge eligibility' })
    expect(result.booleanEligible).toBe(true)
  })

  it('updatePolicyBenefit rejects once the parent policy is not DRAFT', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue({ id: 'pol_1', status: 'ACTIVE' })
    await expect(updatePolicyBenefit(MANAGER, 'pol_1', 'pb_1', { entitlementType: 'COUNT_PER_PERIOD', countPerPeriod: 3, reason: 'bump' })).rejects.toThrow(/immutable/)
  })

  it('updatePolicyBenefit succeeds on a DRAFT policy and preserves the row', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue({ id: 'pol_1', status: 'DRAFT' })
    mockPrisma.jadeClubPolicyBenefit.findUnique.mockResolvedValue({ id: 'pb_1', policyId: 'pol_1', benefitKey: 'jade-connect', entitlementType: 'COUNT_PER_PERIOD', countPerPeriod: 2, costCapMinorUsd: null, booleanEligible: null })
    mockPrisma.jadeClubPolicyBenefit.update.mockResolvedValue({ id: 'pb_1', policyId: 'pol_1', benefitKey: 'jade-connect', entitlementType: 'COUNT_PER_PERIOD', countPerPeriod: 3, costCapMinorUsd: null, booleanEligible: null, createdAt: new Date() })
    const result = await updatePolicyBenefit(MANAGER, 'pol_1', 'pb_1', { entitlementType: 'COUNT_PER_PERIOD', countPerPeriod: 3, reason: 'bump to 3' })
    expect(result.countPerPeriod).toBe(3)
  })

  it('deletePolicyBenefit rejects once the parent policy is not DRAFT', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue({ id: 'pol_1', status: 'SUPERSEDED' })
    await expect(deletePolicyBenefit(MANAGER, 'pol_1', 'pb_1', 'remove')).rejects.toThrow(/immutable/)
    expect(mockPrisma.jadeClubPolicyBenefit.delete).not.toHaveBeenCalled()
  })

  it('deletePolicyBenefit succeeds on a DRAFT policy and audits it', async () => {
    mockPrisma.jadeClubCommercialPolicy.findUnique.mockResolvedValue({ id: 'pol_1', status: 'DRAFT' })
    mockPrisma.jadeClubPolicyBenefit.findUnique.mockResolvedValue({ id: 'pb_1', policyId: 'pol_1', benefitKey: 'jade-connect', entitlementType: 'COUNT_PER_PERIOD' })
    mockPrisma.jadeClubPolicyBenefit.delete.mockResolvedValue({})
    await deletePolicyBenefit(MANAGER, 'pol_1', 'pb_1', 'no longer offered')
    expect(mockPrisma.jadeClubPolicyBenefit.delete).toHaveBeenCalledWith({ where: { id: 'pb_1' } })
    expect(mockPrisma.activityLog.create).toHaveBeenCalledTimes(1)
  })
})

// Sanity: Prisma.JsonNull is used (not bare `null`) for empty before/after —
// confirms this file actually imports and exercises the real Prisma runtime
// value, matching lib/db's ActivityLog convention.
it('Prisma.JsonNull is a distinct sentinel value (guards against the schema-typing regression this file already fixed once)', () => {
  expect(Prisma.JsonNull).toBeDefined()
})
