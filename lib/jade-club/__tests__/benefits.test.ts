/**
 * Jade Travel Club — benefits catalog tests.
 * Covers section 22 (partner-benefit activation bypass, admin RBAC bypass)
 * and section 7/8 (eligibility computed from membership tier only, no fake
 * Priority Pass activation).
 */

const benefitFindMany   = jest.fn()
const benefitFindUnique = jest.fn()
const benefitUpdate     = jest.fn()
const activityLogCreate = jest.fn()

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    jadeClubBenefit: {
      findMany:   (...args: unknown[]) => benefitFindMany(...args),
      findUnique: (...args: unknown[]) => benefitFindUnique(...args),
      update:     (...args: unknown[]) => benefitUpdate(...args),
    },
    activityLog: { create: (...args: unknown[]) => activityLogCreate(...args) },
  },
}))

import { listActiveBenefits, adminUpdateBenefit } from '../benefits'
import type { AdminSession } from '@/lib/admin-auth'

function fakeAdmin(role: string): AdminSession {
  return {
    id: 'staff_1', email: 'staff@walztravels.com', name: 'Staff Member', roleTitle: 'Agent',
    sendingEmail: 'reservations@walztravels.com', signatureTagline: null,
    role, staffRole: role, permissions: {}, branch: 'HQ', department: 'Ops', isActive: true,
  }
}

function priorityPassRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'benefit_1', key: 'priority-pass', name: 'Airport Lounge Access', category: 'PARTNER',
    provider: 'Priority Pass', description: 'Airport lounge benefits.', eligibleTiers: ['CLUB_PLUS'],
    status: 'COMING_SOON', activationMethod: null, activationUrl: null, sortOrder: 70,
    ...overrides,
  }
}

beforeEach(() => {
  benefitFindMany.mockReset()
  benefitFindUnique.mockReset()
  benefitUpdate.mockReset()
  activityLogCreate.mockReset()
  activityLogCreate.mockResolvedValue({})
})

describe('listActiveBenefits — entitlement computed from tier only', () => {
  it('marks a CLUB_PLUS-only benefit ineligible for a FREE viewer', async () => {
    benefitFindMany.mockResolvedValueOnce([priorityPassRow()])
    const benefits = await listActiveBenefits('FREE')
    expect(benefits[0].eligibleForViewer).toBe(false)
    expect(benefits[0].status).toBe('COMING_SOON')
  })

  it('marks it eligible for a CLUB_PLUS viewer (still COMING_SOON — eligibility ≠ activation)', async () => {
    benefitFindMany.mockResolvedValueOnce([priorityPassRow()])
    const benefits = await listActiveBenefits('CLUB_PLUS')
    expect(benefits[0].eligibleForViewer).toBe(true)
    expect(benefits[0].status).toBe('COMING_SOON') // never auto-activated just because eligible
  })

  it('never claims Priority Pass is "Included" while status is COMING_SOON', async () => {
    benefitFindMany.mockResolvedValueOnce([priorityPassRow()])
    const benefits = await listActiveBenefits('CLUB_PLUS')
    expect(benefits[0].status).not.toBe('ACTIVE')
  })
})

describe('adminUpdateBenefit — RBAC-gated, audited (no partner-benefit activation bypass)', () => {
  it('rejects a viewer-only admin (jade_club but not jade_club.manage)', async () => {
    const viewer = fakeAdmin('customer_support') // has 'jade_club' but not '.manage'
    await expect(
      adminUpdateBenefit(viewer, 'priority-pass', { status: 'ACTIVE' }),
    ).rejects.toThrow(/FORBIDDEN/)
    expect(benefitUpdate).not.toHaveBeenCalled()
  })

  it('rejects a role with no jade_club permission at all', async () => {
    const outsider = fakeAdmin('hotel_staff')
    await expect(
      adminUpdateBenefit(outsider, 'priority-pass', { status: 'ACTIVE' }),
    ).rejects.toThrow(/FORBIDDEN/)
    expect(benefitUpdate).not.toHaveBeenCalled()
  })

  it('allows an authorized admin to activate a benefit and writes an audit row', async () => {
    const admin = fakeAdmin('super_admin')
    benefitFindUnique.mockResolvedValueOnce(priorityPassRow())
    benefitUpdate.mockResolvedValueOnce(priorityPassRow({ status: 'ACTIVE' }))

    const result = await adminUpdateBenefit(admin, 'priority-pass', { status: 'ACTIVE' })

    expect(result.status).toBe('ACTIVE')
    expect(activityLogCreate).toHaveBeenCalledTimes(1)
    const logArgs = activityLogCreate.mock.calls[0][0].data
    expect(logArgs.module).toBe('jade_club')
    expect(logArgs.action).toBe('JADE_CLUB_BENEFIT_UPDATED')
    expect(logArgs.before.status).toBe('COMING_SOON')
    expect(logArgs.after.status).toBe('ACTIVE')
  })

  it('throws for an unknown benefit key rather than silently creating one', async () => {
    const admin = fakeAdmin('super_admin')
    benefitFindUnique.mockResolvedValueOnce(null)
    await expect(
      adminUpdateBenefit(admin, 'does-not-exist', { status: 'ACTIVE' }),
    ).rejects.toThrow(/not found/i)
    expect(benefitUpdate).not.toHaveBeenCalled()
  })
})
