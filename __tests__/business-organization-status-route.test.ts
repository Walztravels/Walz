/**
 * Walz Business (Release 1) — SECURITY FIX (delta review, MEDIUM finding).
 * POST /api/admin/business/organizations/[id]/status
 *
 * The ONLY path by which Organization.status may change after creation.
 * Creation always sets ONBOARDING (see business-admin-organizations-route
 * test); reaching ACTIVE (or any other status) requires this separate,
 * b2b.manage-gated, mandatory-reason, audited transition.
 */
const mockPrisma = {
  organization: { findUnique: jest.fn(), update: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

import { getAdminSession } from '@/lib/admin-auth'
import { POST } from '@/app/api/admin/business/organizations/[id]/status/route'
import { recordBusinessAudit } from '@/lib/business/audit'

function postReq(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}
function ctx(id: string) {
  return { params: { id } }
}

const SESSION_WITH_MANAGE = { id: 's1', staffId: 's1', email: 'ops@walztravels.com', role: 'operations_manager', staffRole: 'operations_manager', permissions: {} }
const SESSION_VIEW_ONLY = { id: 's2', staffId: 's2', email: 'senior@walztravels.com', role: 'senior_manager', staffRole: 'senior_manager', permissions: {} }

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_1', status: 'ONBOARDING' })
})

it('rejects unauthenticated with 401', async () => {
  ;(getAdminSession as jest.Mock).mockResolvedValue(null)
  const res = await POST(postReq({ status: 'ACTIVE', reason: 'Contract signed' }), ctx('org_1'))
  expect(res.status).toBe(401)
})

it('denies a view-only b2b role (senior_manager lacks b2b.manage), without touching the row', async () => {
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_VIEW_ONLY)
  const res = await POST(postReq({ status: 'ACTIVE', reason: 'Contract signed' }), ctx('org_1'))
  expect(res.status).toBe(403)
  expect(mockPrisma.organization.update).not.toHaveBeenCalled()
})

it('rejects an invalid status value', async () => {
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
  const res = await POST(postReq({ status: 'BOGUS', reason: 'x' }), ctx('org_1'))
  expect(res.status).toBe(400)
  expect(mockPrisma.organization.update).not.toHaveBeenCalled()
})

it('rejects a missing/blank reason even for an authorized staff member', async () => {
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
  const res = await POST(postReq({ status: 'ACTIVE', reason: '   ' }), ctx('org_1'))
  expect(res.status).toBe(400)
  expect(mockPrisma.organization.update).not.toHaveBeenCalled()
})

it('rejects a no-op transition to the same status', async () => {
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
  mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_1', status: 'ACTIVE' })
  const res = await POST(postReq({ status: 'ACTIVE', reason: 'Contract signed' }), ctx('org_1'))
  expect(res.status).toBe(400)
  expect(mockPrisma.organization.update).not.toHaveBeenCalled()
})

it('returns 404 for a non-existent organization', async () => {
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
  mockPrisma.organization.findUnique.mockResolvedValue(null)
  const res = await POST(postReq({ status: 'ACTIVE', reason: 'Contract signed' }), ctx('org_missing'))
  expect(res.status).toBe(404)
})

it('allows an authorized b2b.manage staff member to transition status and writes a before/after audit row', async () => {
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
  mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_1', status: 'ONBOARDING' })
  mockPrisma.organization.update.mockResolvedValue({ id: 'org_1', status: 'ACTIVE' })

  const res = await POST(postReq({ status: 'ACTIVE', reason: 'Contract signed, first invoice paid' }), ctx('org_1'))

  expect(res.status).toBe(200)
  expect(mockPrisma.organization.update).toHaveBeenCalledWith({
    where: { id: 'org_1' },
    data: { status: 'ACTIVE' },
  })
  expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'organization.status_changed',
    entityType: 'Organization',
    entityId: 'org_1',
    before: { status: 'ONBOARDING' },
    after: { status: 'ACTIVE', reason: 'Contract signed, first invoice paid' },
  }))
})
