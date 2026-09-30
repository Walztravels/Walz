/**
 * Walz Business (Release 1) — GET /api/business/organizations/[id]
 * Exercises the real assertOrgScopedAccess() (not mocked) against a mocked
 * prisma.organizationMembership, so this also verifies the route wires the
 * authz helper correctly end-to-end.
 */
const mockPrisma = {
  organizationMembership: { findUnique: jest.fn() },
  organization: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { GET } from '@/app/api/business/organizations/[id]/route'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const USER = 'user_1'

function req() {
  return {} as unknown as Parameters<typeof GET>[0]
}

function membershipRow(overrides: Partial<{ organizationId: string; role: string; status: string }> = {}) {
  return {
    id: 'mem_1', organizationId: ORG_A, userId: USER, role: 'TRAVELLER', status: 'ACTIVE',
    invitedBy: null, joinedAt: new Date(), lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: USER, email: 'u@x.com' } })
})

describe('GET organization profile', () => {
  it('rejects unauthenticated callers with 401', async () => {
    getServerSession.mockResolvedValue(null)
    const res = await GET(req(), { params: { id: ORG_A } })
    expect(res.status).toBe(401)
  })

  it('denies with 404 when the caller has no membership', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    const res = await GET(req(), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled()
  })

  it('denies a cross-organization request (ACTIVE member of Org A requesting Org B)', async () => {
    // The caller's only membership row is for Org A — a lookup keyed on Org B
    // finds nothing, exactly like the no-membership case.
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) => {
      const { organizationId } = where.organizationId_userId
      return Promise.resolve(organizationId === ORG_A ? membershipRow() : null)
    })
    const res = await GET(req(), { params: { id: ORG_B } })
    expect(res.status).toBe(404)
  })

  it('returns the organization profile for an ACTIVE member', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow())
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: ORG_A, legalName: 'Acme Ltd', tradingName: null, country: 'GB',
      businessEmail: 'ops@acme.example', businessPhone: null, status: 'ACTIVE',
      defaultCurrency: 'GBP', market: null, createdAt: new Date(),
    })
    const res = await GET(req(), { params: { id: ORG_A } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.organization.legalName).toBe('Acme Ltd')
    expect(body.membership.role).toBe('TRAVELLER')
  })

  it('denies a SUSPENDED member', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ status: 'SUSPENDED' }))
    const res = await GET(req(), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
  })
})
