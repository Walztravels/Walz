/**
 * Walz Business (Release 1) — lib/business/claim.ts and lib/business/audit.ts
 *
 * claim.ts: confirms initiateBusinessTravellerClaim() only ever generates +
 * stores a token — no email is sent (nothing to mock for an email-send
 * because the module imports none), and userId is never touched.
 * audit.ts: confirms recordBusinessAudit() is fail-soft (a DB error never
 * throws out of the function).
 */
const mockPrisma = {
  businessTraveller: { update: jest.fn() },
  businessAuditLog: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import { initiateBusinessTravellerClaim } from '@/lib/business/claim'
import { recordBusinessAudit } from '@/lib/business/audit'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('initiateBusinessTravellerClaim', () => {
  it('generates a token and stores it, clearing any prior verification', async () => {
    mockPrisma.businessTraveller.update.mockResolvedValue({})
    const result = await initiateBusinessTravellerClaim('bt_1')
    expect(result).not.toBeNull()
    expect(result!.businessTravellerId).toBe('bt_1')
    expect(result!.token).toMatch(/^[0-9a-f]{64}$/)
    expect(mockPrisma.businessTraveller.update).toHaveBeenCalledWith({
      where: { id: 'bt_1' },
      data: { claimVerificationToken: result!.token, claimVerifiedAt: null },
    })
  })

  it('never sets userId — linking stays explicit-verification-only', async () => {
    mockPrisma.businessTraveller.update.mockResolvedValue({})
    await initiateBusinessTravellerClaim('bt_1')
    const data = mockPrisma.businessTraveller.update.mock.calls[0][0].data
    expect(data.userId).toBeUndefined()
  })

  it('returns null (never throws) when the DB write fails', async () => {
    mockPrisma.businessTraveller.update.mockRejectedValue(new Error('db down'))
    const result = await initiateBusinessTravellerClaim('bt_1')
    expect(result).toBeNull()
  })

  it('produces a different token on each call', async () => {
    mockPrisma.businessTraveller.update.mockResolvedValue({})
    const a = await initiateBusinessTravellerClaim('bt_1')
    const b = await initiateBusinessTravellerClaim('bt_1')
    expect(a!.token).not.toBe(b!.token)
  })
})

describe('recordBusinessAudit', () => {
  it('writes a row with the given fields', async () => {
    mockPrisma.businessAuditLog.create.mockResolvedValue({ id: 'audit_1' })
    const result = await recordBusinessAudit({
      organizationId: 'org_1', actorUserId: 'user_1', action: 'organization.create',
      entityType: 'Organization', entityId: 'org_1', after: { legalName: 'Acme' },
    })
    expect(result).toEqual({ id: 'audit_1' })
    expect(mockPrisma.businessAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org_1', actorUserId: 'user_1', actorStaffId: null,
        action: 'organization.create', entityType: 'Organization', entityId: 'org_1',
        after: { legalName: 'Acme' },
      }),
    })
  })

  it('is fail-soft: a DB error is swallowed, never thrown', async () => {
    mockPrisma.businessAuditLog.create.mockRejectedValue(new Error('db down'))
    const result = await recordBusinessAudit({ action: 'x', entityType: 'Y' })
    expect(result).toBeNull()
  })
})
