/**
 * Walz Business (Release 2.2) Slice B — Item A: auto-trigger the bootstrap
 * invitation at organization creation.
 *
 * POST /api/admin/business/organizations now calls the EXISTING
 * issueOrganizationInvitation()/sendOrganizationInvitationEmail() pair
 * immediately after organization.create() succeeds, with role:'OWNER'
 * hardcoded for THIS call site only. Both calls are wrapped so a failure
 * (issue OR send) can never fail or roll back the already-created
 * organization — creation must still return 201.
 */
const mockPrisma = {
  organization: { findMany: jest.fn(), create: jest.fn() },
  staff: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

const mockIssue = jest.fn()
const mockSendEmail = jest.fn()
jest.mock('@/lib/business/invitations', () => ({
  issueOrganizationInvitation: (...args: unknown[]) => mockIssue(...args),
}))
jest.mock('@/lib/business/invitation-email', () => ({
  sendOrganizationInvitationEmail: (...args: unknown[]) => mockSendEmail(...args),
}))

import { getAdminSession } from '@/lib/admin-auth'
import { POST } from '@/app/api/admin/business/organizations/route'
import { recordBusinessAudit } from '@/lib/business/audit'

const SESSION_WITH_MANAGE = {
  id: 's1', staffId: 's1', email: 'ops@walztravels.com',
  role: 'operations_manager', staffRole: 'operations_manager', permissions: {},
}

function postReq(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

const VALID_BODY = { legalName: 'Acme', country: 'GB', businessEmail: 'Biz@Acme.com', defaultCurrency: 'GBP' }
const CREATED_ORG = {
  id: 'org_1', legalName: 'Acme', tradingName: null, businessEmail: 'biz@acme.com',
  status: 'ONBOARDING', defaultCurrency: 'GBP', accountManagerId: null, organizationType: 'CORPORATE',
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
  mockPrisma.organization.create.mockResolvedValue(CREATED_ORG)
  mockIssue.mockResolvedValue({ ok: true, token: 'raw_token', expiresAt: new Date('2026-12-01'), invitationId: 'inv_1' })
  mockSendEmail.mockResolvedValue(true)
})

describe('POST organizations — Item A: bootstrap invitation auto-trigger', () => {
  it('issues the invitation immediately after creation, for the org businessEmail, role hardcoded to OWNER, using the admin staffId', async () => {
    const res = await POST(postReq(VALID_BODY))
    expect(res.status).toBe(201)
    expect(mockIssue).toHaveBeenCalledTimes(1)
    expect(mockIssue).toHaveBeenCalledWith({
      organizationId: 'org_1',
      email: 'biz@acme.com',
      role: 'OWNER',
      invitedByStaffId: 's1',
    })
  })

  it('falls back to session.email for invitedByStaffId when staffId is absent — same pattern as the standalone bootstrap invitations route', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ ...SESSION_WITH_MANAGE, staffId: undefined })
    await POST(postReq(VALID_BODY))
    expect(mockIssue).toHaveBeenCalledWith(expect.objectContaining({ invitedByStaffId: 'ops@walztravels.com' }))
  })

  it('sends the invitation email with the issued raw token, expiry, and organization name on success', async () => {
    await POST(postReq(VALID_BODY))
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: 'biz@acme.com',
      organizationName: 'Acme', // tradingName is null -> falls back to legalName
      role: 'OWNER',
      token: 'raw_token',
      expiresAt: new Date('2026-12-01'),
    })
  })

  it('prefers tradingName over legalName for the email organizationName when present', async () => {
    mockPrisma.organization.create.mockResolvedValue({ ...CREATED_ORG, tradingName: 'Acme Travel' })
    await POST(postReq(VALID_BODY))
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ organizationName: 'Acme Travel' }))
  })

  it('NON-FATAL: issueOrganizationInvitation throwing never fails organization creation (still 201), and email is never sent', async () => {
    mockIssue.mockRejectedValue(new Error('boom'))
    const res = await POST(postReq(VALID_BODY))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.organization).toEqual(CREATED_ORG)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('NON-FATAL: issueOrganizationInvitation resolving ok:false never fails organization creation, and email is never sent', async () => {
    mockIssue.mockResolvedValue({ ok: false, status: 400, error: 'A valid email is required' })
    const res = await POST(postReq(VALID_BODY))
    expect(res.status).toBe(201)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('NON-FATAL: sendOrganizationInvitationEmail throwing never fails organization creation (still 201)', async () => {
    mockSendEmail.mockRejectedValue(new Error('smtp down'))
    const res = await POST(postReq(VALID_BODY))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.organization.id).toBe('org_1')
  })

  it('the organization.create audit log is still recorded exactly once regardless of invitation outcome', async () => {
    mockIssue.mockRejectedValue(new Error('boom'))
    await POST(postReq(VALID_BODY))
    expect(recordBusinessAudit).toHaveBeenCalledTimes(1)
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'organization.create' }))
  })

  it('does not call issueOrganizationInvitation at all when creation itself is rejected (invalid body, no org created)', async () => {
    const res = await POST(postReq({ ...VALID_BODY, legalName: '' }))
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.create).not.toHaveBeenCalled()
    expect(mockIssue).not.toHaveBeenCalled()
  })
})
