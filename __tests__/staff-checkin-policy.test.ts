/**
 * lib/check-ins/policy.ts — the financial decision layer for missed
 * check-in deductions. Covers mission-brief test scenarios:
 *   6  Missed occurrence -> exactly one deduction
 *   7  Cron executes twice -> still one deduction
 *   8  Nigeria staff -> NGN configured deduction
 *   9  Ghana staff -> GHS configured deduction (and: unconfigured -> none)
 *   13 No deduction before the policy's effective date (no auto-backfill)
 *   14 Inactive / non-tracked / pre-hireDate staff -> no deduction
 */
import {
  resolveCountry,
  effectivePayrollPeriod,
  isDeductionPolicyLive,
  isStaffEligibleForOccurrence,
  resolveDeductionAmount,
  ensureMissedCheckInDeduction,
} from '@/lib/check-ins/policy'

describe('resolveCountry', () => {
  it('maps Africa/Accra to GH, everything else to NG', () => {
    expect(resolveCountry('Africa/Accra')).toBe('GH')
    expect(resolveCountry('Africa/Lagos')).toBe('NG')
    expect(resolveCountry(null)).toBe('NG')
    expect(resolveCountry(undefined)).toBe('NG')
  })
})

describe('effectivePayrollPeriod', () => {
  it('formats YYYY-MM in UTC', () => {
    expect(effectivePayrollPeriod(new Date(Date.UTC(2026, 8, 28)))).toBe('2026-09')
    expect(effectivePayrollPeriod(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01')
  })
})

describe('isDeductionPolicyLive (brief §19 — no auto-backfill)', () => {
  it('is false when no effective date has ever been set', () => {
    expect(isDeductionPolicyLive({ effectiveDeductionDate: null }, new Date())).toBe(false)
    expect(isDeductionPolicyLive(null, new Date())).toBe(false)
    expect(isDeductionPolicyLive(undefined, new Date())).toBe(false)
  })

  it('is false for an occurrence before the effective date', () => {
    const settings = { effectiveDeductionDate: new Date('2026-10-01T00:00:00Z') }
    expect(isDeductionPolicyLive(settings, new Date('2026-09-30T23:59:59Z'))).toBe(false)
  })

  it('is true for an occurrence on or after the effective date', () => {
    const settings = { effectiveDeductionDate: new Date('2026-10-01T00:00:00Z') }
    expect(isDeductionPolicyLive(settings, new Date('2026-10-01T00:00:00Z'))).toBe(true)
    expect(isDeductionPolicyLive(settings, new Date('2026-10-05T11:00:00Z'))).toBe(true)
  })
})

describe('isStaffEligibleForOccurrence (brief §14/§15)', () => {
  const occurrence = new Date('2026-10-05T11:00:00Z')

  it('excludes inactive staff', () => {
    expect(isStaffEligibleForOccurrence({ isActive: false, checkInTracked: true, hireDate: null }, occurrence)).toBe(false)
  })

  it('excludes staff outside check-in policy (not tracked)', () => {
    expect(isStaffEligibleForOccurrence({ isActive: true, checkInTracked: false, hireDate: null }, occurrence)).toBe(false)
  })

  it('excludes an occurrence dated before the staff member was hired', () => {
    const hireDate = new Date('2026-11-01T00:00:00Z')
    expect(isStaffEligibleForOccurrence({ isActive: true, checkInTracked: true, hireDate }, occurrence)).toBe(false)
  })

  it('includes an active, tracked staff member with no hireDate restriction', () => {
    expect(isStaffEligibleForOccurrence({ isActive: true, checkInTracked: true, hireDate: null }, occurrence)).toBe(true)
  })
})

describe('resolveDeductionAmount — never guesses an unconfigured amount', () => {
  it('resolves Nigeria at its configured NGN amount', () => {
    expect(resolveDeductionAmount({ country: 'NG', currency: 'NGN', amount: 50, enabled: true })).toEqual({ amount: 50, currency: 'NGN' })
  })

  it('returns null for Ghana when unconfigured (amount = null)', () => {
    expect(resolveDeductionAmount({ country: 'GH', currency: 'GHS', amount: null, enabled: true })).toBeNull()
  })

  it('resolves Ghana once a real amount is configured', () => {
    expect(resolveDeductionAmount({ country: 'GH', currency: 'GHS', amount: 20, enabled: true })).toEqual({ amount: 20, currency: 'GHS' })
  })

  it('returns null when the policy is disabled, missing, zero, or negative', () => {
    expect(resolveDeductionAmount(undefined)).toBeNull()
    expect(resolveDeductionAmount({ country: 'NG', currency: 'NGN', amount: 50, enabled: false })).toBeNull()
    expect(resolveDeductionAmount({ country: 'NG', currency: 'NGN', amount: 0, enabled: true })).toBeNull()
    expect(resolveDeductionAmount({ country: 'NG', currency: 'NGN', amount: -5, enabled: true })).toBeNull()
  })
})

describe('ensureMissedCheckInDeduction — idempotent ledger writes', () => {
  function makeMockPrisma() {
    const deductions = new Map<string, any>()
    let idCounter = 0
    return {
      checkInDeduction: {
        findUnique: jest.fn(async ({ where }: any) => deductions.get(where.checkInRecordId) ?? null),
        create: jest.fn(async ({ data }: any) => {
          if (deductions.has(data.checkInRecordId)) throw new Error('unique constraint violation')
          const row = { id: `ded_${++idCounter}`, ...data }
          deductions.set(data.checkInRecordId, row)
          return row
        }),
      },
      checkInDeductionPolicy: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.country === 'NG' ? { country: 'NG', currency: 'NGN', amount: 50, enabled: true }
          : where.country === 'GH' ? { country: 'GH', currency: 'GHS', amount: null, enabled: true }
          : null,
        ),
      },
      __deductions: deductions,
    } as any
  }

  const baseParams = {
    staffId: 's1', checkInRecordId: 'rec1', windowStart: new Date('2026-10-05T11:00:00Z'),
    settings: { effectiveDeductionDate: new Date('2026-10-01T00:00:00Z') },
    staff: { isActive: true, checkInTracked: true, hireDate: null },
  }

  it('test 6 — a missed occurrence creates exactly one deduction (Nigeria)', async () => {
    const prisma = makeMockPrisma()
    const result = await ensureMissedCheckInDeduction(prisma, { ...baseParams, timezone: 'Africa/Lagos' })
    expect(result.created).toBe(true)
    expect(result.deduction).toEqual(expect.objectContaining({ amount: 50, currency: 'NGN' }))
    expect(prisma.checkInDeduction.create).toHaveBeenCalledTimes(1)
  })

  it('test 8 — Nigeria staff get the configured NGN amount', async () => {
    const prisma = makeMockPrisma()
    const result = await ensureMissedCheckInDeduction(prisma, { ...baseParams, timezone: 'Africa/Lagos' })
    expect(result.deduction?.currency).toBe('NGN')
    expect(result.deduction?.amount).toBe(50)
  })

  it('test 9 — Ghana staff resolve to the GHS policy, and stay inert while unconfigured', async () => {
    const prisma = makeMockPrisma()
    const result = await ensureMissedCheckInDeduction(prisma, { ...baseParams, timezone: 'Africa/Accra' })
    expect(result.created).toBe(false)
    expect(result.deduction).toBeNull()
    expect(prisma.checkInDeduction.create).not.toHaveBeenCalled()
  })

  it('test 7 — calling twice for the same occurrence (cron retry) still yields one deduction', async () => {
    const prisma = makeMockPrisma()
    const first  = await ensureMissedCheckInDeduction(prisma, { ...baseParams, timezone: 'Africa/Lagos' })
    const second = await ensureMissedCheckInDeduction(prisma, { ...baseParams, timezone: 'Africa/Lagos' })
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.deduction?.id).toBe(first.deduction?.id)
    expect(prisma.checkInDeduction.create).toHaveBeenCalledTimes(1)
    expect(prisma.__deductions.size).toBe(1)
  })

  it('test 13/19 — no deduction before the effective date (no retroactive backfill)', async () => {
    const prisma = makeMockPrisma()
    const result = await ensureMissedCheckInDeduction(prisma, {
      ...baseParams, timezone: 'Africa/Lagos',
      windowStart: new Date('2026-09-01T11:00:00Z'), // before the 2026-10-01 effective date
    })
    expect(result.created).toBe(false)
    expect(result.deduction).toBeNull()
    expect(prisma.checkInDeduction.create).not.toHaveBeenCalled()
  })

  it('test 14 — inactive staff never get a deduction', async () => {
    const prisma = makeMockPrisma()
    const result = await ensureMissedCheckInDeduction(prisma, {
      ...baseParams, timezone: 'Africa/Lagos',
      staff: { isActive: false, checkInTracked: true, hireDate: null },
    })
    expect(result.created).toBe(false)
    expect(prisma.checkInDeduction.create).not.toHaveBeenCalled()
  })

  it('test 14 — staff outside check-in policy (not tracked) never get a deduction', async () => {
    const prisma = makeMockPrisma()
    const result = await ensureMissedCheckInDeduction(prisma, {
      ...baseParams, timezone: 'Africa/Lagos',
      staff: { isActive: true, checkInTracked: false, hireDate: null },
    })
    expect(result.created).toBe(false)
    expect(prisma.checkInDeduction.create).not.toHaveBeenCalled()
  })

  it('handles a unique-constraint race (two overlapping cron calls) as an idempotent replay, not an error', async () => {
    const prisma = makeMockPrisma()
    // Simulate a row that appears between our findUnique and our create by
    // making the first findUnique return null, but create fail (as if
    // another process just inserted it), then re-read succeeding.
    prisma.checkInDeduction.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'ded_race', amount: 50, currency: 'NGN' })
    prisma.checkInDeduction.create.mockRejectedValueOnce(new Error('duplicate key'))

    const result = await ensureMissedCheckInDeduction(prisma, { ...baseParams, timezone: 'Africa/Lagos' })
    expect(result.created).toBe(false)
    expect(result.deduction?.id).toBe('ded_race')
  })
})
