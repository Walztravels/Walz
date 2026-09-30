/**
 * Walz Business (Release 2.1) — regression: the 5 R2 invariants this
 * release must leave completely unchanged.
 *
 *  1. Only ACTIVE-status OrganizationMembership rows count as ownership
 *     evidence.
 *  2. Claim-verified traveller ownership requires BOTH claimVerifiedAt NOT
 *     NULL AND userId NOT NULL.
 *  3. An unclaimed traveller's email is never ownership evidence, however
 *     that row's own `status` reads.
 *  4. The staff cross-org-link override requires b2b.manage + confirmOverride
 *     + a mandatory reason + an audit write (source-level regression check —
 *     this route was not touched in R2.1).
 *  5. The organization travellers roster GET still requires minRole
 *     COORDINATOR (the R2.1-added org-type gate LAYERS ON TOP of this, it
 *     does not replace or loosen it).
 */
import fs from 'fs'
import path from 'path'
import {
  OWNERSHIP_CLAIMED_TRAVELLER,
  OWNERSHIP_MEMBERSHIP_STATUS,
  OWNERSHIP_TRAVELLER_STATUS,
  ownerBelongsToOrganization,
} from '@/lib/business/services'

const ORG_A = 'org_a'

describe('Invariant 1 + 2 + 3: OWNERSHIP_CLAIMED_TRAVELLER predicate is preserved verbatim', () => {
  it('is exactly { status: "active", claimVerifiedAt: { not: null }, userId: { not: null } }', () => {
    expect(OWNERSHIP_CLAIMED_TRAVELLER).toEqual({
      status: 'active',
      claimVerifiedAt: { not: null },
      userId: { not: null },
    })
  })

  it('OWNERSHIP_MEMBERSHIP_STATUS is the exact-match "ACTIVE" allow-list, not a deny-list', () => {
    expect(OWNERSHIP_MEMBERSHIP_STATUS).toBe('ACTIVE')
    expect(OWNERSHIP_TRAVELLER_STATUS).toBe('active')
  })

  it('a userId held by an INVITED/SUSPENDED/REMOVED membership is NOT ownership evidence (invariant 1)', async () => {
    const db = {
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue(null), // no ACTIVE row matches
        findMany: jest.fn().mockResolvedValue([]),
      },
      businessTraveller: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    } as any
    const belongs = await ownerBelongsToOrganization(db, { userId: 'user_x', email: null }, ORG_A)
    expect(belongs).toBe(false)
    expect(db.organizationMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) }),
    )
  })

  it('a CLAIM-VERIFIED traveller (claimVerifiedAt + userId both set) IS ownership evidence (invariant 2)', async () => {
    const db = {
      organizationMembership: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      businessTraveller: { findFirst: jest.fn().mockResolvedValue({ id: 'bt_1' }), findMany: jest.fn().mockResolvedValue([]) },
    } as any
    const belongs = await ownerBelongsToOrganization(db, { userId: 'user_x', email: null }, ORG_A)
    expect(belongs).toBe(true)
    // userId is narrowed to the specific owner id being checked (not the
    // bare `{ not: null }` from the shared predicate) — status and
    // claimVerifiedAt come through from OWNERSHIP_CLAIMED_TRAVELLER unchanged.
    expect(db.businessTraveller.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active', claimVerifiedAt: { not: null }, userId: 'user_x', organizationId: ORG_A }),
      }),
    )
  })

  it('an UNCLAIMED traveller row\'s email is NEVER ownership evidence, however its status reads (invariant 3)', async () => {
    // findMany for businessTraveller is scoped to OWNERSHIP_CLAIMED_TRAVELLER
    // (claimVerifiedAt/userId NOT NULL) — an unclaimed row can never appear
    // in that result set even if it happens to have status:'active'.
    const db = {
      organizationMembership: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      businessTraveller: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]), // an unclaimed row is excluded by the query itself
      },
    } as any
    const belongs = await ownerBelongsToOrganization(db, { userId: null, email: 'unclaimed@example.com' }, ORG_A)
    expect(belongs).toBe(false)
    expect(db.businessTraveller.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(OWNERSHIP_CLAIMED_TRAVELLER) }),
    )
  })
})

describe('Invariant 4: staff cross-org-link override still requires b2b.manage + confirmOverride + reason + audit (source regression check)', () => {
  it('the link route source is untouched by R2.1 and still enforces all four', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'api', 'admin', 'business', 'organizations', '[id]', 'requests', '[requestId]', 'services', '[serviceId]', 'link', 'route.ts'),
      'utf8',
    )
    expect(src).toMatch(/b2b\.manage/)
    expect(src).toMatch(/confirmOverride/)
    expect(src).toMatch(/reason/)
    expect(src).toMatch(/recordBusinessAudit/)
  })
})

describe('Invariant 5: /travellers roster GET still requires minRole COORDINATOR', () => {
  it('the travellers route source still requests minRole: \'COORDINATOR\' on GET (the R2.1 org-type gate layers on top, never loosens this)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'api', 'business', 'organizations', '[id]', 'travellers', 'route.ts'),
      'utf8',
    )
    expect(src).toMatch(/assertAgencyOrCorporateAccess\(session\.user\.id, params\.id, \{ minRole: 'COORDINATOR' \}\)/)
  })
})
