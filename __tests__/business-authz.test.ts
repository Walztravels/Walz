/**
 * Walz Business (Release 1) — authz helper tests.
 *
 * This is the single most important test file in Release 1: every API route
 * in this domain depends on assertOrgScopedAccess/assertSensitiveDocumentAccess
 * being airtight. Covers:
 *   - no membership row → deny
 *   - INVITED / SUSPENDED / REMOVED membership → deny
 *   - ACTIVE membership, no minRole → allow
 *   - ACTIVE membership below minRole → deny
 *   - ACTIVE membership at/above minRole → allow
 *   - role-tie behaviour within the documented peer tier (TRAVEL_MANAGER /
 *     APPROVER / FINANCE all satisfy each other's minRole)
 *   - TRAVEL_MANAGER attempting sensitive-document access → deny
 *   - ADMIN and OWNER → allow sensitive-document access
 *   - every denial path returns the identical generic 404 shape (no
 *     enumeration oracle)
 */

const findUnique = jest.fn()

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: { organizationMembership: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}))

import { assertOrgScopedAccess, assertSensitiveDocumentAccess, ORG_ROLE_RANK, type OrgRole } from '../lib/business/authz'

function membershipRow(overrides: Partial<{ role: string; status: string }> = {}) {
  return {
    id: 'mem_1',
    organizationId: 'org_1',
    userId: 'user_1',
    role: 'TRAVELLER',
    status: 'ACTIVE',
    invitedBy: null,
    joinedAt: new Date('2026-01-01'),
    lastActivityAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

beforeEach(() => {
  findUnique.mockReset()
})

describe('assertOrgScopedAccess', () => {
  it('denies when no membership row exists', async () => {
    findUnique.mockResolvedValue(null)
    const result = await assertOrgScopedAccess('user_1', 'org_1')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.status).toBe(404)
    expect(result.error).toBe('Not found')
  })

  it.each(['INVITED', 'SUSPENDED', 'REMOVED'])('denies a %s membership', async (status) => {
    findUnique.mockResolvedValue(membershipRow({ status }))
    const result = await assertOrgScopedAccess('user_1', 'org_1')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.status).toBe(404)
    expect(result.error).toBe('Not found')
  })

  it('allows an ACTIVE membership with no minRole requested', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'TRAVELLER', status: 'ACTIVE' }))
    const result = await assertOrgScopedAccess('user_1', 'org_1')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.membership.role).toBe('TRAVELLER')
  })

  it('denies an ACTIVE membership below the requested minRole', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'TRAVELLER', status: 'ACTIVE' }))
    const result = await assertOrgScopedAccess('user_1', 'org_1', { minRole: 'ADMIN' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.status).toBe(404)
  })

  it('denies COORDINATOR when minRole is TRAVEL_MANAGER', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'COORDINATOR', status: 'ACTIVE' }))
    const result = await assertOrgScopedAccess('user_1', 'org_1', { minRole: 'TRAVEL_MANAGER' })
    expect(result.ok).toBe(false)
  })

  it('allows an ACTIVE membership exactly at the requested minRole', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'ADMIN', status: 'ACTIVE' }))
    const result = await assertOrgScopedAccess('user_1', 'org_1', { minRole: 'ADMIN' })
    expect(result.ok).toBe(true)
  })

  it('allows an ACTIVE membership above the requested minRole', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'OWNER', status: 'ACTIVE' }))
    const result = await assertOrgScopedAccess('user_1', 'org_1', { minRole: 'ADMIN' })
    expect(result.ok).toBe(true)
  })

  it('OWNER satisfies every minRole', async () => {
    for (const minRole of Object.keys(ORG_ROLE_RANK) as OrgRole[]) {
      findUnique.mockResolvedValue(membershipRow({ role: 'OWNER', status: 'ACTIVE' }))
      const result = await assertOrgScopedAccess('user_1', 'org_1', { minRole })
      expect(result.ok).toBe(true)
    }
  })

  it('documents the peer-tier tie: TRAVEL_MANAGER satisfies minRole APPROVER', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'TRAVEL_MANAGER', status: 'ACTIVE' }))
    const result = await assertOrgScopedAccess('user_1', 'org_1', { minRole: 'APPROVER' })
    expect(result.ok).toBe(true)
  })

  it('documents the peer-tier tie: FINANCE satisfies minRole TRAVEL_MANAGER', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'FINANCE', status: 'ACTIVE' }))
    const result = await assertOrgScopedAccess('user_1', 'org_1', { minRole: 'TRAVEL_MANAGER' })
    expect(result.ok).toBe(true)
  })

  it('denies APPROVER when minRole is ADMIN (peer tier does not reach admin tier)', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'APPROVER', status: 'ACTIVE' }))
    const result = await assertOrgScopedAccess('user_1', 'org_1', { minRole: 'ADMIN' })
    expect(result.ok).toBe(false)
  })

  it('denies on missing userId or organizationId without querying the DB', async () => {
    const r1 = await assertOrgScopedAccess('', 'org_1')
    const r2 = await assertOrgScopedAccess('user_1', '')
    expect(r1.ok).toBe(false)
    expect(r2.ok).toBe(false)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('queries by the exact (organizationId, userId) pair — never trusts any other identifier', async () => {
    findUnique.mockResolvedValue(membershipRow())
    await assertOrgScopedAccess('user_1', 'org_1')
    expect(findUnique).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: 'org_1', userId: 'user_1' } },
    })
  })
})

describe('assertSensitiveDocumentAccess', () => {
  it('denies when there is no membership at all', async () => {
    findUnique.mockResolvedValue(null)
    const result = await assertSensitiveDocumentAccess('user_1', 'org_1')
    expect(result.ok).toBe(false)
  })

  it('denies TRAVEL_MANAGER — the locked decision: no sensitive-document access by default', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'TRAVEL_MANAGER', status: 'ACTIVE' }))
    const result = await assertSensitiveDocumentAccess('user_1', 'org_1')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.status).toBe(404)
  })

  it('denies APPROVER and FINANCE too, despite being peer-tier to TRAVEL_MANAGER', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'APPROVER', status: 'ACTIVE' }))
    expect((await assertSensitiveDocumentAccess('user_1', 'org_1')).ok).toBe(false)

    findUnique.mockResolvedValue(membershipRow({ role: 'FINANCE', status: 'ACTIVE' }))
    expect((await assertSensitiveDocumentAccess('user_1', 'org_1')).ok).toBe(false)
  })

  it('denies COORDINATOR and TRAVELLER', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'COORDINATOR', status: 'ACTIVE' }))
    expect((await assertSensitiveDocumentAccess('user_1', 'org_1')).ok).toBe(false)

    findUnique.mockResolvedValue(membershipRow({ role: 'TRAVELLER', status: 'ACTIVE' }))
    expect((await assertSensitiveDocumentAccess('user_1', 'org_1')).ok).toBe(false)
  })

  it('allows ADMIN', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'ADMIN', status: 'ACTIVE' }))
    const result = await assertSensitiveDocumentAccess('user_1', 'org_1')
    expect(result.ok).toBe(true)
  })

  it('allows OWNER', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'OWNER', status: 'ACTIVE' }))
    const result = await assertSensitiveDocumentAccess('user_1', 'org_1')
    expect(result.ok).toBe(true)
  })

  it('denies a SUSPENDED ADMIN — status gate runs before the role check', async () => {
    findUnique.mockResolvedValue(membershipRow({ role: 'ADMIN', status: 'SUSPENDED' }))
    const result = await assertSensitiveDocumentAccess('user_1', 'org_1')
    expect(result.ok).toBe(false)
  })
})
