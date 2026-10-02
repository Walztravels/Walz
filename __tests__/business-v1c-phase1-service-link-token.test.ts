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
    expect(mockPrisma.businessServiceLinkToken.update).not.toHaveBeenCalled()
    expect(mockPrisma.businessServiceLinkToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'tok_old', consumedAt: null, revokedAt: null },
      data: expect.objectContaining({ revokedAt: expect.any(Date), revokedByMembershipId: MEMBER_A }),
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
      before: { previousTokenId: 'tok_old', revokedPriorToken: true },
    }))
  })

  it('ordinary reissue: CAS succeeds, revokedByMembershipId is the reissuing actor', async () => {
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue({ id: 'tok_old' })
    mockPrisma.businessServiceLinkToken.updateMany.mockResolvedValue({ count: 1 })
    const result = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    expect(result.ok).toBe(true)
    expect(mockPrisma.businessServiceLinkToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'tok_old', consumedAt: null, revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedByMembershipId: MEMBER_A },
    })
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'visa_link_token.reissued',
      before: { previousTokenId: 'tok_old', revokedPriorToken: true },
    }))
  })

  it('explicit revoke racing with reissue: CAS affects 0 rows, reissue does NOT overwrite the already-set revokedByMembershipId', async () => {
    // Simulate: a different actor's explicit revoke already committed
    // revokedAt/revokedByMembershipId on the prior token BEFORE this
    // reissue's CAS runs (the findFirst above still returned it as "live"
    // because it read a moment earlier — under READ COMMITTED that's exactly
    // the window this CAS guards).
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue({ id: 'tok_old' })
    mockPrisma.businessServiceLinkToken.updateMany.mockResolvedValue({ count: 0 })

    const result = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })

    expect(result.ok).toBe(true)
    // The CAS was attempted with OUR actor, but it affected 0 rows — the row
    // itself (simulated here) keeps the OTHER actor's attribution, because
    // the real DB's WHERE clause (consumedAt: null, revokedAt: null) never
    // matched once the concurrent revoke had already landed.
    expect(mockPrisma.businessServiceLinkToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'tok_old', consumedAt: null, revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedByMembershipId: MEMBER_A },
    })
    // Our code issued exactly one updateMany call for this row — it never
    // retries or issues a second write that could clobber the other actor's
    // attribution.
    expect(mockPrisma.businessServiceLinkToken.updateMany).toHaveBeenCalledTimes(1)
    // The audit event for this call must not claim it revoked the prior
    // token — revokedPriorToken: false documents that the CAS lost the race.
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'visa_link_token.reissued',
      before: { previousTokenId: 'tok_old', revokedPriorToken: false },
    }))
  })

  it('a consumed prior token is never retroactively marked revoked by reissue — CAS affects 0 rows, consumedAt/revokedAt stay as they were', async () => {
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue({ id: 'tok_old' })
    // The prior token's consumedAt is already set (a recipient submitted via
    // consumeServiceLinkToken() a moment earlier) — the CAS WHERE clause
    // (consumedAt: null) can never match it, so updateMany reports 0 rows
    // affected, exactly like the real DB would.
    mockPrisma.businessServiceLinkToken.updateMany.mockResolvedValue({ count: 0 })

    const result = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })

    expect(result.ok).toBe(true)
    // The attempted CAS still carries consumedAt: null in its WHERE — a real
    // DB simply won't match a row whose consumedAt is already set, which is
    // exactly why this is modeled as count: 0 rather than ever writing to it.
    expect(mockPrisma.businessServiceLinkToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'tok_old', consumedAt: null, revokedAt: null },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    })
    // Reissue still proceeds — a consumed token can't block a fresh one.
    expect(mockPrisma.businessServiceLinkToken.create).toHaveBeenCalledTimes(1)
    const createCall = mockPrisma.businessServiceLinkToken.create.mock.calls[0][0]
    expect(createCall.data.replacesTokenId).toBe('tok_old')
    // The audit event must not claim this call revoked the (already
    // consumed) prior token.
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'visa_link_token.reissued',
      before: { previousTokenId: 'tok_old', revokedPriorToken: false },
    }))
  })

  it('an already-revoked prior token cannot have its attribution rewritten (explicit assertion on the final persisted row)', async () => {
    // Model the "final persisted row" directly: a fake in-memory row that
    // only applies the CAS write if the WHERE clause's preconditions hold —
    // i.e. a faithful stand-in for what the real partial-match UPDATE does.
    const priorRow = { id: 'tok_old', consumedAt: null as Date | null, revokedAt: NOW, revokedByMembershipId: 'mem_other' }
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue({ id: priorRow.id })
    mockPrisma.businessServiceLinkToken.updateMany.mockImplementation(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const matches = args.where.id === priorRow.id && args.where.consumedAt === priorRow.consumedAt && args.where.revokedAt === null && priorRow.revokedAt === null
      if (!matches) return { count: 0 }
      priorRow.revokedAt = args.data.revokedAt as Date
      priorRow.revokedByMembershipId = args.data.revokedByMembershipId as string
      return { count: 1 }
    })

    await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })

    // The row's attribution is still the OTHER actor's — our reissue's CAS
    // never matched (revokedAt was already non-null) so it never wrote.
    expect(priorRow.revokedByMembershipId).toBe('mem_other')
    expect(priorRow.revokedAt).toBe(NOW)
  })

  it('concurrent reissues: the loser\'s CAS-then-create ordering cannot produce two live rows — the second call\'s create fails and the whole call reports ok:false', async () => {
    // First (winning) reissue: finds tok_old live, CAS succeeds, creates
    // tok_new_A as the service's new sole live token.
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValueOnce({ id: 'tok_old' })
    mockPrisma.businessServiceLinkToken.updateMany.mockResolvedValueOnce({ count: 1 })
    mockPrisma.businessServiceLinkToken.create.mockResolvedValueOnce({ id: 'tok_new_A' })
    const first = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })
    expect(first.ok).toBe(true)

    // Second (losing) reissue: its findFirst happened to also see tok_old as
    // live (read before the winner committed). Its own CAS on tok_old then
    // affects 0 rows (the winner's CAS already landed), so it proceeds to
    // create() anyway per our zero-row decision — but by the time its INSERT
    // runs, the winner's tok_new_A is the live row for this service, so the
    // DB's partial unique index (uq_bslt_live_per_service) rejects the
    // INSERT. We simulate that rejection as a thrown error from create().
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValueOnce({ id: 'tok_old' })
    mockPrisma.businessServiceLinkToken.updateMany.mockResolvedValueOnce({ count: 0 })
    mockPrisma.businessServiceLinkToken.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed on the fields: (`travel_request_service_id`)'), { code: 'P2002' }),
    )
    const second = await issueOrReissueServiceLinkToken({
      organizationId: ORG_A, travelRequestId: REQ_A, travelRequestServiceId: SERVICE_A,
      businessTravellerId: TRAVELLER_A, issuedByMembershipId: MEMBER_A,
    })

    // The loser's whole transaction is reported as a clean failure — never a
    // reported success referencing a token that doesn't actually exist as
    // the live one.
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.status).toBe(500)
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
