/**
 * PUT /api/admin/check-ins/settings and GET/PUT /api/admin/check-ins/deduction-policy
 * Covers test 17 — unauthorized staff cannot change policy.
 */
const mockPrisma = {
  checkInSettings: { upsert: jest.fn() },
  checkInDeductionPolicy: { findMany: jest.fn(), update: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, prisma: mockPrisma, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'

function jsonReq(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Request
}

const SUPER_ADMIN = { id: 'a1', staffId: 'admin1', role: 'super_admin', staffRole: 'super_admin' }
const OPS_MANAGER = { id: 'o1', staffId: 'ops1', role: 'operations_manager', staffRole: 'operations_manager' }
const SALES_REP   = { id: 'u2', staffId: 'staff2', role: 'sales_rep', staffRole: 'sales_rep' }

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.checkInSettings.upsert.mockImplementation(async ({ create, update }: any) => ({ id: 'singleton', ...create, ...update }))
})

describe('PUT /api/admin/check-ins/settings', () => {
  it('test 17 — a sales rep cannot change settings at all', async () => {
    const { PUT } = await import('@/app/api/admin/check-ins/settings/route')
    ;(getAdminSession as jest.Mock).mockResolvedValue(SALES_REP)
    const res = await PUT(jsonReq({ graceMinutes: 10 }))
    expect(res.status).toBe(403)
  })

  it('an operations manager CAN change schedule fields', async () => {
    const { PUT } = await import('@/app/api/admin/check-ins/settings/route')
    ;(getAdminSession as jest.Mock).mockResolvedValue(OPS_MANAGER)
    const res = await PUT(jsonReq({ graceMinutes: 10 }))
    expect(res.status).toBe(200)
  })

  it('test 17 — an operations manager CANNOT set the deduction effective date (Super Admin only financial switch)', async () => {
    const { PUT } = await import('@/app/api/admin/check-ins/settings/route')
    ;(getAdminSession as jest.Mock).mockResolvedValue(OPS_MANAGER)
    const res = await PUT(jsonReq({ effectiveDeductionDate: '2026-10-01' }))
    expect(res.status).toBe(403)
    expect(mockPrisma.checkInSettings.upsert).not.toHaveBeenCalled()
  })

  it('a super admin CAN set the deduction effective date', async () => {
    const { PUT } = await import('@/app/api/admin/check-ins/settings/route')
    ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
    const res = await PUT(jsonReq({ effectiveDeductionDate: '2026-10-01' }))
    expect(res.status).toBe(200)
    expect(mockPrisma.checkInSettings.upsert).toHaveBeenCalled()
  })
})

describe('/api/admin/check-ins/deduction-policy', () => {
  it('test 17 — GET 403s a non-super-admin', async () => {
    const { GET } = await import('@/app/api/admin/check-ins/deduction-policy/route')
    ;(getAdminSession as jest.Mock).mockResolvedValue(OPS_MANAGER)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('test 17 — PUT 403s a non-super-admin', async () => {
    const { PUT } = await import('@/app/api/admin/check-ins/deduction-policy/route')
    ;(getAdminSession as jest.Mock).mockResolvedValue(OPS_MANAGER)
    const res = await PUT(jsonReq({ country: 'GH', amount: 20 }))
    expect(res.status).toBe(403)
    expect(mockPrisma.checkInDeductionPolicy.update).not.toHaveBeenCalled()
  })

  it('a super admin can configure the Ghana amount', async () => {
    const { PUT } = await import('@/app/api/admin/check-ins/deduction-policy/route')
    ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
    mockPrisma.checkInDeductionPolicy.update.mockResolvedValue({ country: 'GH', currency: 'GHS', amount: 20, enabled: true })
    const res  = await PUT(jsonReq({ country: 'GH', amount: 20 }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.policy.amount).toBe(20)
  })

  it('rejects a negative amount', async () => {
    const { PUT } = await import('@/app/api/admin/check-ins/deduction-policy/route')
    ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
    const res = await PUT(jsonReq({ country: 'GH', amount: -5 }))
    expect(res.status).toBe(400)
  })

  it('rejects an unknown country', async () => {
    const { PUT } = await import('@/app/api/admin/check-ins/deduction-policy/route')
    ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
    const res = await PUT(jsonReq({ country: 'US', amount: 5 }))
    expect(res.status).toBe(400)
  })
})
