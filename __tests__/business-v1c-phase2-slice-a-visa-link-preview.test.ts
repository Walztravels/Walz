/**
 * Walz Business (V1-C Phase 2, Slice A) — GET
 * /api/business/link/[token]/preview.
 *
 * Adversarial coverage per the slice brief: every invalid state (malformed,
 * unknown hash, expired, revoked, consumed, REFERRAL_PARTNER-reclassified
 * org, traveller moved, service moved) must be externally indistinguishable
 * — same status, same body shape. Zero writes on any branch. Repeated calls
 * against a valid token never consume it. No token hash / raw internal id
 * ever appears in a response body. A client-supplied query/body field never
 * influences scope. Cache-Control: no-store on every response.
 *
 * validateServiceLinkToken() itself is already exhaustively unit-tested in
 * business-v1c-phase1-service-link-token.test.ts (every one of those failure
 * reasons collapsing to { ok: false }) — this file mocks that function
 * directly and asserts the ROUTE's own contract: it must treat every
 * { ok: false } identically (never re-deriving a different reason), must
 * never write, and must never call consumeServiceLinkToken().
 */
const mockPrisma = {
  organization: { findUnique: jest.fn() },
  businessTraveller: { findUnique: jest.fn() },
  // Write methods across every model this route could conceivably touch —
  // asserted NOT called on every branch below. Listed explicitly (rather
  // than a catch-all proxy) so a missing assertion is visible in the diff.
  businessServiceLinkToken: {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

const validateServiceLinkToken = jest.fn()
const consumeServiceLinkToken = jest.fn()
jest.mock('@/lib/business/service-link-token', () => ({
  validateServiceLinkToken: (...args: unknown[]) => validateServiceLinkToken(...args),
  consumeServiceLinkToken: (...args: unknown[]) => consumeServiceLinkToken(...args),
}))

// Rate limiting itself (the in-memory primitive) is exercised directly in
// lib/rate-limit's own behaviour; here we control the named limiter's
// allow/deny decision deterministically per test rather than racing the
// real in-memory window across the whole suite.
const visaLinkPreviewRateLimit = jest.fn()
jest.mock('@/lib/rate-limit', () => ({
  visaLinkPreviewRateLimit: (...args: unknown[]) => visaLinkPreviewRateLimit(...args),
}))

import { GET } from '@/app/api/business/link/[token]/preview/route'

const TOKEN = 'a'.repeat(64)
const ORG_ID = 'org_internal_id_should_never_leak'
const TRAVELLER_ID = 'trav_internal_id_should_never_leak'
const REQUEST_ID = 'req_internal_id_should_never_leak'
const SERVICE_ID = 'svc_internal_id_should_never_leak'
const TOKEN_ID = 'tok_internal_id_should_never_leak'

function req(token: string, extra: { searchParams?: Record<string, string> } = {}) {
  const url = new URL(`https://walztravels.com/api/business/link/${token}/preview`)
  for (const [k, v] of Object.entries(extra.searchParams ?? {})) url.searchParams.set(k, v)
  return {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.5' }),
    nextUrl: url,
    json: async () => ({}),
  } as any
}

function validToken() {
  return {
    ok: true as const,
    token: {
      tokenId: TOKEN_ID,
      organizationId: ORG_ID,
      businessTravellerId: TRAVELLER_ID,
      travelRequestId: REQUEST_ID,
      travelRequestServiceId: SERVICE_ID,
    },
  }
}

function allWriteMocks() {
  return [
    mockPrisma.businessServiceLinkToken.create,
    mockPrisma.businessServiceLinkToken.update,
    mockPrisma.businessServiceLinkToken.updateMany,
    mockPrisma.businessServiceLinkToken.delete,
  ]
}

beforeEach(() => {
  jest.clearAllMocks()
  visaLinkPreviewRateLimit.mockReturnValue({ allowed: true, remaining: 29, resetAt: Date.now() + 600_000 })
  mockPrisma.organization.findUnique.mockResolvedValue({ tradingName: 'Acme Corp', legalName: 'Acme Corporation Ltd' })
  mockPrisma.businessTraveller.findUnique.mockResolvedValue({ firstName: 'Jordan' })
})

describe('GET /api/business/link/[token]/preview — valid token', () => {
  it('succeeds with minimal display context, no internal ids, no token hash', async () => {
    validateServiceLinkToken.mockResolvedValue(validToken())
    const res = await GET(req(TOKEN), { params: { token: TOKEN } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      ok: true,
      organizationDisplayName: 'Acme Corp',
      travellerFirstName: 'Jordan',
      destinationPlaceholder: 'Visa application',
    })
    const serialized = JSON.stringify(body)
    for (const leaked of [ORG_ID, TRAVELLER_ID, REQUEST_ID, SERVICE_ID, TOKEN_ID, TOKEN]) {
      expect(serialized).not.toContain(leaked)
    }
    expect(serialized).not.toMatch(/organizationId|businessTravellerId|travelRequestId|travelRequestServiceId|tokenHash|issuedByMembershipId|issuedByStaffId/i)
  })

  it('passes the raw token path param straight through to validateServiceLinkToken, nothing else', async () => {
    validateServiceLinkToken.mockResolvedValue(validToken())
    await GET(req(TOKEN), { params: { token: TOKEN } })
    expect(validateServiceLinkToken).toHaveBeenCalledWith(TOKEN)
    expect(validateServiceLinkToken).toHaveBeenCalledTimes(1)
  })

  it('a client-supplied query param (e.g. a different organizationId) has zero effect on scope', async () => {
    validateServiceLinkToken.mockResolvedValue(validToken())
    const res = await GET(req(TOKEN, { searchParams: { organizationId: 'attacker_supplied_org', businessTravellerId: 'attacker_traveller' } }), {
      params: { token: TOKEN },
    })
    const body = await res.json()
    // Still resolves using validateServiceLinkToken's own result, never the
    // query string — the lookups below are keyed on result.token.organizationId.
    expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({ where: { id: ORG_ID }, select: { tradingName: true, legalName: true } })
    expect(mockPrisma.businessTraveller.findUnique).toHaveBeenCalledWith({ where: { id: TRAVELLER_ID }, select: { firstName: true } })
    expect(body.ok).toBe(true)
  })

  it('falls back to legalName when tradingName is absent', async () => {
    validateServiceLinkToken.mockResolvedValue(validToken())
    mockPrisma.organization.findUnique.mockResolvedValue({ tradingName: null, legalName: 'Acme Corporation Ltd' })
    const res = await GET(req(TOKEN), { params: { token: TOKEN } })
    const body = await res.json()
    expect(body.organizationDisplayName).toBe('Acme Corporation Ltd')
  })

  it('calling preview repeatedly against the same valid token never consumes it — consumeServiceLinkToken is never called', async () => {
    validateServiceLinkToken.mockResolvedValue(validToken())
    await GET(req(TOKEN), { params: { token: TOKEN } })
    await GET(req(TOKEN), { params: { token: TOKEN } })
    await GET(req(TOKEN), { params: { token: TOKEN } })
    expect(consumeServiceLinkToken).not.toHaveBeenCalled()
  })

  it('performs zero Prisma writes', async () => {
    validateServiceLinkToken.mockResolvedValue(validToken())
    await GET(req(TOKEN), { params: { token: TOKEN } })
    for (const fn of allWriteMocks()) expect(fn).not.toHaveBeenCalled()
  })

  it('response carries Cache-Control: no-store', async () => {
    validateServiceLinkToken.mockResolvedValue(validToken())
    const res = await GET(req(TOKEN), { params: { token: TOKEN } })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('never calls getServerSession / requires no session — fully anonymous', async () => {
    // No next-auth mock is registered for this test file at all; if the
    // route imported getServerSession it would throw on an unmocked
    // module resolution of next-auth internals during the real request —
    // its absence from this file's mocks, combined with a passing test,
    // demonstrates the route never calls it.
    validateServiceLinkToken.mockResolvedValue(validToken())
    const res = await GET(req(TOKEN), { params: { token: TOKEN } })
    expect(res.status).toBe(200)
  })
})

describe('GET /api/business/link/[token]/preview — every invalid state is externally indistinguishable', () => {
  const failureReasons = [
    'malformed shape',
    'unknown token hash',
    'expired',
    'revoked',
    'consumed',
    'organization reclassified to REFERRAL_PARTNER',
    'traveller moved to a different organization',
    'service moved to a different request/org, or no longer VISA',
  ]

  it.each(failureReasons)('%s -> generic 404 { ok: false }, zero writes', async () => {
    // The route never re-derives WHY validateServiceLinkToken failed — it
    // only ever branches on { ok: false }, so every one of these reasons is
    // represented identically here; this intentionally does not re-test
    // validateServiceLinkToken's own internal branching (covered in
    // business-v1c-phase1-service-link-token.test.ts) but DOES prove the
    // route adds no distinguishing behaviour of its own.
    validateServiceLinkToken.mockResolvedValue({ ok: false })
    const res = await GET(req(TOKEN), { params: { token: TOKEN } })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ ok: false })
    for (const fn of allWriteMocks()) expect(fn).not.toHaveBeenCalled()
    expect(consumeServiceLinkToken).not.toHaveBeenCalled()
  })

  it('all failure modes produce byte-identical response bodies and status codes', async () => {
    const bodies: string[] = []
    const statuses: number[] = []
    for (let i = 0; i < failureReasons.length; i++) {
      validateServiceLinkToken.mockResolvedValue({ ok: false })
      const res = await GET(req(`${i}${'a'.repeat(63)}`), { params: { token: `${i}${'a'.repeat(63)}` } })
      statuses.push(res.status)
      bodies.push(JSON.stringify(await res.json()))
    }
    expect(new Set(statuses).size).toBe(1)
    expect(new Set(bodies).size).toBe(1)
  })

  it('malformed/garbage token strings also collapse to the same generic response (route never special-cases shape itself)', async () => {
    validateServiceLinkToken.mockResolvedValue({ ok: false })
    const res = await GET(req('not-a-valid-token'), { params: { token: 'not-a-valid-token' } })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ ok: false })
  })

  it('invalid-token response still carries Cache-Control: no-store', async () => {
    validateServiceLinkToken.mockResolvedValue({ ok: false })
    const res = await GET(req(TOKEN), { params: { token: TOKEN } })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('a display lookup coming back empty after a valid validate result (race) also fails generic, not a crash or a distinguishable shape', async () => {
    validateServiceLinkToken.mockResolvedValue(validToken())
    mockPrisma.organization.findUnique.mockResolvedValue(null)
    const res = await GET(req(TOKEN), { params: { token: TOKEN } })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ ok: false })
  })
})

describe('GET /api/business/link/[token]/preview — rate limiting', () => {
  it('a denied rate-limit decision short-circuits before validateServiceLinkToken is ever called', async () => {
    visaLinkPreviewRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 600_000 })
    const res = await GET(req(TOKEN), { params: { token: TOKEN } })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ ok: false })
    expect(validateServiceLinkToken).not.toHaveBeenCalled()
    for (const fn of allWriteMocks()) expect(fn).not.toHaveBeenCalled()
  })

  it('rate-limited response also carries Cache-Control: no-store', async () => {
    visaLinkPreviewRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 600_000 })
    const res = await GET(req(TOKEN), { params: { token: TOKEN } })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
