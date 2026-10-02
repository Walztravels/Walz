/**
 * Walz Business (V1-C Phase 1) — BusinessServiceLinkToken lifecycle:
 * generation/hashing, issuance, reissue-replaces-prior, revoke, the
 * read-only validation sequence (never consumes), and the CAS consumption
 * primitive (written + unit-tested, not wired to any route yet).
 */
const mockPrisma = {
  businessServiceLinkToken: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  businessTraveller: { findUnique: jest.fn() },
  organization: { findUnique: jest.fn() },
  travelRequestService: { findUnique: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

import { recordBusinessAudit } from '@/lib/business/audit'
import {
  isWellFormedServiceLinkToken,
  hashServiceLinkToken,
  issueOrReissueServiceLinkToken,
  revokeServiceLinkToken,
  validateServiceLinkToken,
  consumeServiceLinkToken,
  SERVICE_LINK_TOKEN_TTL_MS,
} from '@/lib/business/service-link-token'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const REQ_A = 'req_a'
const SERVICE_A = 'svc_a'
const TRAVELLER_A = 'trav_a'
const MEMBER_A = 'mem_a'
const NOW = new Date('2026-01-01T00:00:00.000Z')
const FUTURE = new Date(NOW.getTime() + 60 * 60 * 1000)
const PAST = new Date(NOW.getTime() - 60 * 1000)

function visaService(over: Record<string, unknown> = {}) {
  return {
    id: SERVICE_A,
    travelRequestId: REQ_A,
    serviceType: 'VISA',
    linkedVisaApplicationId: null,
    linkedQuoteId: null,
    linkedItineraryId: null,
    linkedTripId: null,
    travelRequest: { id: REQ_A, organizationId: ORG_A },
    ...over,
  }
}
function traveller(over: Record<string, unknown> = {}) {
  return { id: TRAVELLER_A, organizationId: ORG_A, ...over }
}
function tokenRow(over: Record<string, unknown> = {}) {
  return {
    id: 'tok_1',
    organizationId: ORG_A,
    businessTravellerId: TRAVELLER_A,
    travelRequestId: REQ_A,
    travelRequestServiceId: SERVICE_A,
    tokenHash: 'irrelevant-for-most-tests',
    issuedByMembershipId: MEMBER_A,
    issuedByStaffId: null,
    expiresAt: FUTURE,
    revokedAt: null,
    revokedByMembershipId: null,
    consumedAt: null,
    consumedIpAddress: null,
    consumedUserAgent: null,
    replacesTokenId: null,
    createdAt: NOW,
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma))
  mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService())
  mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller())
  mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'CORPORATE' })
  mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue(null)
  mockPrisma.businessServiceLinkToken.create.mockResolvedValue({ id: 'tok_new' })
  mockPrisma.businessServiceLinkToken.update.mockResolvedValue({ id: 'tok_old' })
  mockPrisma.businessServiceLinkToken.updateMany.mockResolvedValue({ count: 1 })
})

describe('token shape / hashing', () => {
  it('well-formed token pattern is 64 lowercase hex chars', () => {
    expect(isWellFormedServiceLinkToken('a'.repeat(64))).toBe(true)
    expect(isWellFormedServiceLinkToken('A'.repeat(64))).toBe(false) // uppercase not allowed
    expect(isWellFormedServiceLinkToken('short')).toBe(false)
    expect(isWellFormedServiceLinkToken(123)).toBe(false)
    expect(isWellFormedServiceLinkToken(null)).toBe(false)
  })

  it('hashServiceLinkToken is deterministic sha256 hex', () => {
    const h1 = hashServiceLinkToken('a'.repeat(64))
    const h2 = hashServiceLinkToken('a'.repeat(64))
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(h1).not.toBe('a'.repeat(64)) // the hash is never the raw token
  })

  it('two issued tokens never collide and carry >= 256 bits of entropy (64 hex chars)', async () => {
    const r1 = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue(null)
    const r2 = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    if (r1.ok && r2.ok) {
      expect(r1.token).toMatch(/^[0-9a-f]{64}$/)
      expect(r1.token).not.toBe(r2.token)
    }
  })
})

describe('issueOrReissueServiceLinkToken', () => {
  it('issues a fresh token when none exists, persists only the hash (never the raw token)', async () => {
    const result = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reissued).toBe(false)
    expect(mockPrisma.businessServiceLinkToken.update).not.toHaveBeenCalled()
    const createCall = mockPrisma.businessServiceLinkToken.create.mock.calls[0][0]
    expect(createCall.data.tokenHash).toBe(hashServiceLinkToken(result.token))
    // The raw token is NEVER a field in the persisted row.
    expect(Object.values(createCall.data)).not.toContain(result.token)
    expect(createCall.data.replacesTokenId).toBeNull()
  })

  it('never logs or returns the hash as if it were the token — the response url and hash are different strings', async () => {
    const result = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.token).not.toBe(hashServiceLinkToken(result.token))
  })

  it('reissue REVOKES the prior live token and sets replacesTokenId on the new row (same operation)', async () => {
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue({ id: 'tok_old' })
    const result = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reissued).toBe(true)
    expect(result.previousTokenId).toBe('tok_old')
    expect(mockPrisma.businessServiceLinkToken.update).toHaveBeenCalledWith({
      where: { id: 'tok_old' },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    })
    const createCall = mockPrisma.businessServiceLinkToken.create.mock.calls[0][0]
    expect(createCall.data.replacesTokenId).toBe('tok_old')
    // revoke-then-create happens inside ONE transaction.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('an old token dies the instant a new one is issued — validation of the OLD token fails after reissue', async () => {
    const oldRow = tokenRow({ id: 'tok_old' })
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue({ id: 'tok_old' })
    await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    // Simulate the DB now reflecting the revoke that just happened.
    mockPrisma.businessServiceLinkToken.findUnique.mockResolvedValue(tokenRow({ id: 'tok_old', revokedAt: NOW }))
    const validation = await validateServiceLinkToken('a'.repeat(64), NOW)
    expect(validation.ok).toBe(false)
  })

  it('rejects issuance for a non-VISA service', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService({ serviceType: 'HOTEL' }))
    const result = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
    expect(mockPrisma.businessServiceLinkToken.create).not.toHaveBeenCalled()
  })

  it('rejects a service belonging to another organization (cross-org / IDOR)', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(
      visaService({ travelRequest: { id: REQ_A, organizationId: ORG_B } }),
    )
    const result = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
    expect(mockPrisma.businessServiceLinkToken.create).not.toHaveBeenCalled()
  })

  it('rejects a traveller belonging to another organization', async () => {
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller({ organizationId: ORG_B }))
    const result = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
    expect(mockPrisma.businessServiceLinkToken.create).not.toHaveBeenCalled()
  })

  it('rejects a nonexistent traveller', async () => {
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(null)
    const result = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    expect(result.ok).toBe(false)
  })

  it('requires an issuing actor (membership or staff)', async () => {
    const result = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A,
    })
    expect(result.ok).toBe(false)
    expect(mockPrisma.businessServiceLinkToken.create).not.toHaveBeenCalled()
  })

  it('audits visa_link_token.issued WITHOUT the token itself', async () => {
    const result = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    expect(result.ok).toBe(true)
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'visa_link_token.issued',
      after: expect.objectContaining({ businessTravellerId: TRAVELLER_A, travelRequestServiceId: SERVICE_A }),
    }))
    const call = (recordBusinessAudit as jest.Mock).mock.calls[0][0]
    expect(JSON.stringify(call)).not.toMatch(/^[0-9a-f]{64}$/) // crude: the exact raw token never appears as a bare value
    if (result.ok) {
      expect(JSON.stringify(call)).not.toContain(result.token)
    }
  })

  it('audits visa_link_token.reissued with before.previousTokenId', async () => {
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue({ id: 'tok_old' })
    await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'visa_link_token.reissued',
      before: { previousTokenId: 'tok_old' },
    }))
  })
})

describe('revokeServiceLinkToken', () => {
  it('revokes the live token via CAS and audits visa_link_token.revoked', async () => {
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue({ id: 'tok_1' })
    const result = await revokeServiceLinkToken({ organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A, revokedByMembershipId: MEMBER_A })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.revoked).toBe(true)
    expect(mockPrisma.businessServiceLinkToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'tok_1', consumedAt: null, revokedAt: null },
      data: expect.objectContaining({ revokedByMembershipId: MEMBER_A }),
    })
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'visa_link_token.revoked' }))
  })

  it('is idempotent — revoking with no live token succeeds with revoked:false', async () => {
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue(null)
    const result = await revokeServiceLinkToken({ organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.revoked).toBe(false)
    expect(mockPrisma.businessServiceLinkToken.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a cross-org service', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService({ travelRequest: { id: REQ_A, organizationId: ORG_B } }))
    const result = await revokeServiceLinkToken({ organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A })
    expect(result.ok).toBe(false)
  })
})

describe('validateServiceLinkToken — READ-ONLY, never consumes', () => {
  const RAW = 'b'.repeat(64)
  const HASH = hashServiceLinkToken(RAW)

  it('well-formed hash lookup — never a raw-token WHERE clause', async () => {
    mockPrisma.businessServiceLinkToken.findUnique.mockResolvedValue(tokenRow({ tokenHash: HASH }))
    await validateServiceLinkToken(RAW, NOW)
    expect(mockPrisma.businessServiceLinkToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: HASH } })
  })

  it('malformed token shape fails without ever querying the DB', async () => {
    const result = await validateServiceLinkToken('not-a-valid-token', NOW)
    expect(result.ok).toBe(false)
    expect(mockPrisma.businessServiceLinkToken.findUnique).not.toHaveBeenCalled()
  })

  it('unknown hash -> fail', async () => {
    mockPrisma.businessServiceLinkToken.findUnique.mockResolvedValue(null)
    const result = await validateServiceLinkToken(RAW, NOW)
    expect(result.ok).toBe(false)
  })

  it('revoked -> fail', async () => {
    mockPrisma.businessServiceLinkToken.findUnique.mockResolvedValue(tokenRow({ tokenHash: HASH, revokedAt: NOW }))
    const result = await validateServiceLinkToken(RAW, NOW)
    expect(result.ok).toBe(false)
  })

  it('consumed -> fail', async () => {
    mockPrisma.businessServiceLinkToken.findUnique.mockResolvedValue(tokenRow({ tokenHash: HASH, consumedAt: NOW }))
    const result = await validateServiceLinkToken(RAW, NOW)
    expect(result.ok).toBe(false)
  })

  it('expired -> fail', async () => {
    mockPrisma.businessServiceLinkToken.findUnique.mockResolvedValue(tokenRow({ tokenHash: HASH, expiresAt: PAST }))
    const result = await validateServiceLinkToken(RAW, NOW)
    expect(result.ok).toBe(false)
  })

  it('organization reclassified REFERRAL_PARTNER -> fail, even though the row itself is untouched', async () => {
    mockPrisma.businessServiceLinkToken.findUnique.mockResolvedValue(tokenRow({ tokenHash: HASH }))
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'REFERRAL_PARTNER' })
    const result = await validateServiceLinkToken(RAW, NOW)
    expect(result.ok).toBe(false)
  })

  it('traveller removed from the organization -> fail', async () => {
    mockPrisma.businessServiceLinkToken.findUnique.mockResolvedValue(tokenRow({ tokenHash: HASH }))
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(null)
    const result = await validateServiceLinkToken(RAW, NOW)
    expect(result.ok).toBe(false)
  })

  it('service no longer a VISA service in that request/org -> fail', async () => {
    mockPrisma.businessServiceLinkToken.findUnique.mockResolvedValue(tokenRow({ tokenHash: HASH }))
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService({ serviceType: 'HOTEL' }))
    const result = await validateServiceLinkToken(RAW, NOW)
    expect(result.ok).toBe(false)
  })

  it('a genuinely valid token succeeds and returns scope identifiers', async () => {
    mockPrisma.businessServiceLinkToken.findUnique.mockResolvedValue(tokenRow({ tokenHash: HASH }))
    const result = await validateServiceLinkToken(RAW, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.token).toEqual({
        tokenId: 'tok_1', organizationId: ORG_A, businessTravellerId: TRAVELLER_A,
        travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      })
    }
  })

  it('NEVER flips consumedAt — calling validate 50 times never writes anything', async () => {
    mockPrisma.businessServiceLinkToken.findUnique.mockResolvedValue(tokenRow({ tokenHash: HASH }))
    for (let i = 0; i < 50; i++) {
      await validateServiceLinkToken(RAW, NOW)
    }
    expect(mockPrisma.businessServiceLinkToken.update).not.toHaveBeenCalled()
    expect(mockPrisma.businessServiceLinkToken.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.businessServiceLinkToken.create).not.toHaveBeenCalled()
  })
})

describe('consumeServiceLinkToken — the CAS primitive (unit-tested; no route calls it yet)', () => {
  it('succeeds exactly once via an atomic updateMany keyed on id+consumedAt:null+revokedAt:null+expiresAt>now', async () => {
    mockPrisma.businessServiceLinkToken.updateMany.mockResolvedValue({ count: 1 })
    const result = await consumeServiceLinkToken('tok_1', { now: NOW })
    expect(result.ok).toBe(true)
    expect(mockPrisma.businessServiceLinkToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'tok_1', consumedAt: null, revokedAt: null, expiresAt: { gt: NOW } },
      data: expect.objectContaining({ consumedAt: NOW }),
    })
  })

  it('a replay (count: 0, already consumed) fails', async () => {
    mockPrisma.businessServiceLinkToken.updateMany.mockResolvedValue({ count: 0 })
    const result = await consumeServiceLinkToken('tok_1', { now: NOW })
    expect(result.ok).toBe(false)
  })

  it('a lost race (two concurrent callers, only one CAS wins) — the second call fails', async () => {
    mockPrisma.businessServiceLinkToken.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    const first = await consumeServiceLinkToken('tok_1', { now: NOW })
    const second = await consumeServiceLinkToken('tok_1', { now: NOW })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
  })

  it('an empty tokenId never reaches the DB', async () => {
    const result = await consumeServiceLinkToken('', { now: NOW })
    expect(result.ok).toBe(false)
    expect(mockPrisma.businessServiceLinkToken.updateMany).not.toHaveBeenCalled()
  })
})
