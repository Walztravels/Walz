/**
 * Walz Business (Release 2) — BusinessTraveller account-claim flow.
 *
 * Token generation + expiry, one-time atomic consumption (CAS), replay,
 * double claim, expired token, wrong signed-in user, cross-organization
 * claim, and enumeration-resistance (every failure is the same response).
 * Also: invite issuance is org-scoped (customer + staff routes) and the
 * email goes through the hardened Resend client, never exposing the token
 * to the API caller.
 */
const mockPrisma = {
  businessTraveller: { update: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
  user: { findUnique: jest.fn() },
  organizationMembership: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

const mockSend = jest.fn().mockResolvedValue({ data: { id: 'email_1' } })
jest.mock('@/lib/resend', () => ({ getResend: () => ({ emails: { send: mockSend } }) }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))

import fs from 'fs'
import path from 'path'
import { getAdminSession } from '@/lib/admin-auth'
import { recordBusinessAudit } from '@/lib/business/audit'
import {
  initiateBusinessTravellerClaim, consumeBusinessTravellerClaim, claimState, CLAIM_TOKEN_TTL_MS,
} from '@/lib/business/claim'
import { POST as claimRoute } from '@/app/api/business/claim/route'
import { POST as customerInvite } from '@/app/api/business/organizations/[id]/travellers/[travellerId]/claim/route'
import { POST as adminInvite } from '@/app/api/admin/business/organizations/[id]/travellers/[travellerId]/claim/route'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const TOKEN = 'a'.repeat(64)
// Real wall-clock anchor: the routes call consume() without an injected
// `now`, so PAST/FUTURE must be relative to the actual current time.
const NOW = new Date()
const FUTURE = new Date(NOW.getTime() + 60 * 60 * 1000)
const PAST = new Date(NOW.getTime() - 60 * 1000)

function traveller(over: Record<string, unknown> = {}) {
  return { id: 'bt_1', organizationId: ORG_A, email: 'Jane@Acme.com', userId: null, claimTokenExpiresAt: FUTURE, ...over }
}
function postReq(body: unknown) {
  return { json: async () => body } as any
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.RESEND_API_KEY = 're_test'
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_jane', email: 'jane@acme.com' })
  mockPrisma.businessTraveller.findFirst.mockResolvedValue(null)
  mockPrisma.businessTraveller.updateMany.mockResolvedValue({ count: 1 })
})

describe('initiateBusinessTravellerClaim — generation + expiry', () => {
  it('stores a fresh 64-hex token with a hard expiry of CLAIM_TOKEN_TTL_MS', async () => {
    mockPrisma.businessTraveller.update.mockResolvedValue({})
    const r = await initiateBusinessTravellerClaim('bt_1', NOW)
    expect(r!.token).toMatch(/^[0-9a-f]{64}$/)
    expect(r!.expiresAt.getTime()).toBe(NOW.getTime() + CLAIM_TOKEN_TTL_MS)
    expect(mockPrisma.businessTraveller.update).toHaveBeenCalledWith({
      where: { id: 'bt_1' },
      data: { claimVerificationToken: r!.token, claimVerifiedAt: null, claimTokenExpiresAt: r!.expiresAt },
    })
  })

  it('re-issuing replaces the token (only the latest link can ever work)', async () => {
    mockPrisma.businessTraveller.update.mockResolvedValue({})
    const a = await initiateBusinessTravellerClaim('bt_1', NOW)
    const b = await initiateBusinessTravellerClaim('bt_1', NOW)
    expect(a!.token).not.toBe(b!.token)
    expect(mockPrisma.businessTraveller.update.mock.calls[1][0].data.claimVerificationToken).toBe(b!.token)
  })

  it('never sets userId', async () => {
    mockPrisma.businessTraveller.update.mockResolvedValue({})
    await initiateBusinessTravellerClaim('bt_1', NOW)
    expect(mockPrisma.businessTraveller.update.mock.calls[0][0].data.userId).toBeUndefined()
  })
})

describe('claimState', () => {
  it('derives claimed / pending / expired / none (NULL expiry counts as expired)', () => {
    expect(claimState({ userId: 'u', claimVerificationToken: null, claimTokenExpiresAt: null }, NOW)).toBe('claimed')
    expect(claimState({ userId: null, claimVerificationToken: TOKEN, claimTokenExpiresAt: FUTURE }, NOW)).toBe('pending')
    expect(claimState({ userId: null, claimVerificationToken: TOKEN, claimTokenExpiresAt: PAST }, NOW)).toBe('expired')
    expect(claimState({ userId: null, claimVerificationToken: TOKEN, claimTokenExpiresAt: null }, NOW)).toBe('expired')
    expect(claimState({ userId: null, claimVerificationToken: null, claimTokenExpiresAt: null }, NOW)).toBe('none')
  })
})

describe('consumeBusinessTravellerClaim — one-time atomic consumption', () => {
  it('links the signed-in user via a CAS updateMany keyed on the token still valid + unclaimed', async () => {
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller())
    const r = await consumeBusinessTravellerClaim(TOKEN, 'user_jane', { now: NOW })
    expect(r).toEqual({ ok: true, businessTravellerId: 'bt_1', organizationId: ORG_A })
    expect(mockPrisma.businessTraveller.updateMany).toHaveBeenCalledWith({
      where: { id: 'bt_1', organizationId: ORG_A, claimVerificationToken: TOKEN, userId: null, claimTokenExpiresAt: { gt: NOW } },
      data: { userId: 'user_jane', claimVerifiedAt: NOW, claimVerificationToken: null, claimTokenExpiresAt: null },
    })
  })

  it('REPLAY: the same token a second time fails (token was cleared by the first consumption)', async () => {
    mockPrisma.businessTraveller.findUnique
      .mockResolvedValueOnce(traveller())
      .mockResolvedValueOnce(null) // token no longer on any row
    expect((await consumeBusinessTravellerClaim(TOKEN, 'user_jane', { now: NOW })).ok).toBe(true)
    expect(await consumeBusinessTravellerClaim(TOKEN, 'user_jane', { now: NOW })).toEqual({ ok: false })
    expect(mockPrisma.businessTraveller.updateMany).toHaveBeenCalledTimes(1)
  })

  it('RACE: two concurrent consumptions — only one CAS wins, the loser fails', async () => {
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller())
    mockPrisma.businessTraveller.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    const [a, b] = await Promise.all([
      consumeBusinessTravellerClaim(TOKEN, 'user_jane', { now: NOW }),
      consumeBusinessTravellerClaim(TOKEN, 'user_jane', { now: NOW }),
    ])
    expect([a.ok, b.ok].sort()).toEqual([false, true])
  })

  it('DOUBLE CLAIM: an already-linked traveller cannot be claimed again', async () => {
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller({ userId: 'someone' }))
    expect(await consumeBusinessTravellerClaim(TOKEN, 'user_jane', { now: NOW })).toEqual({ ok: false })
    expect(mockPrisma.businessTraveller.updateMany).not.toHaveBeenCalled()
  })

  it('EXPIRED token fails without writing', async () => {
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller({ claimTokenExpiresAt: PAST }))
    expect(await consumeBusinessTravellerClaim(TOKEN, 'user_jane', { now: NOW })).toEqual({ ok: false })
    expect(mockPrisma.businessTraveller.updateMany).not.toHaveBeenCalled()
  })

  it('a legacy token with NO expiry fails closed', async () => {
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller({ claimTokenExpiresAt: null }))
    expect(await consumeBusinessTravellerClaim(TOKEN, 'user_jane', { now: NOW })).toEqual({ ok: false })
  })

  it('WRONG USER: a signed-in account whose email differs from the traveller email fails', async () => {
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller())
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_mallory', email: 'mallory@evil.com' })
    expect(await consumeBusinessTravellerClaim(TOKEN, 'user_mallory', { now: NOW })).toEqual({ ok: false })
    expect(mockPrisma.businessTraveller.updateMany).not.toHaveBeenCalled()
  })

  it('CROSS-ORG: an org-A token presented in an org-B context fails', async () => {
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller())
    expect(await consumeBusinessTravellerClaim(TOKEN, 'user_jane', { now: NOW, expectedOrganizationId: ORG_B })).toEqual({ ok: false })
    expect(mockPrisma.businessTraveller.updateMany).not.toHaveBeenCalled()
  })

  it('CROSS-ORG: the write is always pinned to the token row\'s own organization', async () => {
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller())
    await consumeBusinessTravellerClaim(TOKEN, 'user_jane', { now: NOW })
    expect(mockPrisma.businessTraveller.updateMany.mock.calls[0][0].where.organizationId).toBe(ORG_A)
  })

  it('one account cannot hold two traveller identities in the same org', async () => {
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller())
    mockPrisma.businessTraveller.findFirst.mockResolvedValue({ id: 'bt_other' })
    expect(await consumeBusinessTravellerClaim(TOKEN, 'user_jane', { now: NOW })).toEqual({ ok: false })
    expect(mockPrisma.businessTraveller.updateMany).not.toHaveBeenCalled()
  })

  it('malformed tokens are rejected without any DB lookup', async () => {
    for (const bad of ['', 'abc', 'Z'.repeat(64), 'a'.repeat(63), null, 42, { $ne: null }]) {
      expect(await consumeBusinessTravellerClaim(bad, 'user_jane', { now: NOW })).toEqual({ ok: false })
    }
    expect(mockPrisma.businessTraveller.findUnique).not.toHaveBeenCalled()
  })

  it('never throws on a DB error (returns the generic failure)', async () => {
    mockPrisma.businessTraveller.findUnique.mockRejectedValue(new Error('db down'))
    expect(await consumeBusinessTravellerClaim(TOKEN, 'user_jane', { now: NOW })).toEqual({ ok: false })
  })
})

describe('POST /api/business/claim', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    const res = await claimRoute(postReq({ token: TOKEN }))
    expect(res.status).toBe(401)
  })

  it('success: links and audits traveller.claimed with the session user', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user_jane', email: 'jane@acme.com' } })
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller())
    const res = await claimRoute(postReq({ token: TOKEN }))
    expect(res.status).toBe(200)
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'traveller.claimed', organizationId: ORG_A, actorUserId: 'user_jane', entityId: 'bt_1',
    }))
  })

  it('ENUMERATION: unknown, expired, claimed, wrong-user, cross-org and malformed all return the IDENTICAL 404 body', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user_jane', email: 'jane@acme.com' } })
    const scenarios: Array<() => void> = [
      () => mockPrisma.businessTraveller.findUnique.mockResolvedValue(null),
      () => mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller({ claimTokenExpiresAt: PAST })),
      () => mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller({ userId: 'x' })),
      () => { mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller()); mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'user_jane', email: 'other@x.com' }) },
      () => { mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller()); mockPrisma.businessTraveller.updateMany.mockResolvedValueOnce({ count: 0 }) },
    ]
    const bodies: string[] = []
    for (const setup of scenarios) {
      setup()
      const res = await claimRoute(postReq({ token: TOKEN }))
      expect(res.status).toBe(404)
      bodies.push(JSON.stringify(await res.json()))
    }
    // cross-org context
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller())
    const crossOrg = await claimRoute(postReq({ token: TOKEN, organizationId: ORG_B }))
    expect(crossOrg.status).toBe(404)
    bodies.push(JSON.stringify(await crossOrg.json()))
    // malformed
    const malformed = await claimRoute(postReq({ token: 'nope' }))
    bodies.push(JSON.stringify(await malformed.json()))

    expect(new Set(bodies).size).toBe(1)
    expect(recordBusinessAudit).not.toHaveBeenCalled()
  })

  it('the landing page performs no DB lookup on GET and consumes only via explicit POST', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'app', 'business', 'claim', '[token]', 'page.tsx'), 'utf8')
    expect(page).not.toMatch(/prisma/)
    expect(page).not.toMatch(/consumeBusinessTravellerClaim/)
    const confirm = fs.readFileSync(path.join(__dirname, '..', 'app', 'business', 'claim', '[token]', 'ClaimConfirm.tsx'), 'utf8')
    expect(confirm).toMatch(/method: 'POST'/)
  })
})

describe('issuing a claim invite (customer TRAVEL_MANAGER route)', () => {
  function member(role: string, org = ORG_A) {
    return { id: 'mem_1', organizationId: org, userId: 'user_tm', role, status: 'ACTIVE' }
  }
  beforeEach(() => {
    getServerSession.mockResolvedValue({ user: { id: 'user_tm', email: 'tm@acme.com' } })
    mockPrisma.businessTraveller.update.mockResolvedValue({})
  })

  it('denies a non-member (404)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    const res = await customerInvite(postReq({}), { params: { id: ORG_A, travellerId: 'bt_1' } })
    expect(res.status).toBe(404)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('denies COORDINATOR (below TRAVEL_MANAGER)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('COORDINATOR'))
    const res = await customerInvite(postReq({}), { params: { id: ORG_A, travellerId: 'bt_1' } })
    expect(res.status).toBe(404)
  })

  it('Org A member targeting Org B URL is denied', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.organizationId_userId.organizationId === ORG_A ? member('TRAVEL_MANAGER') : null))
    const res = await customerInvite(postReq({}), { params: { id: ORG_B, travellerId: 'bt_b' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.businessTraveller.update).not.toHaveBeenCalled()
  })

  it('Org A TRAVEL_MANAGER cannot issue a claim for an Org B traveller id via the Org A URL', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.businessTraveller.findUnique.mockResolvedValue({ id: 'bt_b', organizationId: ORG_B, firstName: 'B', email: 'b@b.com', userId: null, organization: { legalName: 'B', tradingName: null } })
    const res = await customerInvite(postReq({}), { params: { id: ORG_A, travellerId: 'bt_b' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.businessTraveller.update).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('refuses an already-claimed traveller', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.businessTraveller.findUnique.mockResolvedValue({ id: 'bt_1', organizationId: ORG_A, firstName: 'J', email: 'j@a.com', userId: 'u', organization: { legalName: 'A', tradingName: null } })
    const res = await customerInvite(postReq({}), { params: { id: ORG_A, travellerId: 'bt_1' } })
    expect(res.status).toBe(409)
  })

  it('issues, emails the traveller via the hardened Resend client, audits, and never returns the token', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.businessTraveller.findUnique.mockResolvedValue({ id: 'bt_1', organizationId: ORG_A, firstName: 'Jane', email: 'jane@acme.com', userId: null, organization: { legalName: 'Acme Ltd', tradingName: 'Acme' } })
    const res = await customerInvite(postReq({}), { params: { id: ORG_A, travellerId: 'bt_1' } })
    expect(res.status).toBe(200)
    const token = mockPrisma.businessTraveller.update.mock.calls[0][0].data.claimVerificationToken
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain(token)
    expect(mockSend).toHaveBeenCalledTimes(1)
    const email = mockSend.mock.calls[0][0]
    expect(email.to).toBe('jane@acme.com')
    expect(email.html).toContain(`/business/claim/${token}`)
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'traveller.claim_invite_sent', organizationId: ORG_A }))
    expect(JSON.stringify((recordBusinessAudit as jest.Mock).mock.calls[0][0])).not.toContain(token)
  })

  it('the claim-invite module sends email only through lib/resend (the hardened wrapper)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'business', 'claim-invite.ts'), 'utf8')
    expect(src).toMatch(/from '@\/lib\/resend'/)
    expect(src).not.toMatch(/from ['"]resend['"]/)
    const lib = fs.readFileSync(path.join(__dirname, '..', 'lib', 'resend.ts'), 'utf8')
    expect(lib).toMatch(/resend-hardened/)
  })
})

describe('issuing a claim invite (staff route)', () => {
  it('denies view-only staff', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 's2', staffId: 's2', email: 'x', role: 'senior_manager', permissions: {} })
    const res = await adminInvite(postReq({}), { params: { id: ORG_A, travellerId: 'bt_1' } })
    expect(res.status).toBe(403)
  })

  it('Org A URL + Org B traveller id -> 404, nothing issued', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 's1', staffId: 's1', email: 'ops', role: 'operations_manager', permissions: {} })
    mockPrisma.businessTraveller.findUnique.mockResolvedValue({ id: 'bt_b', organizationId: ORG_B, firstName: 'B', email: 'b@b.com', userId: null, organization: { legalName: 'B', tradingName: null } })
    const res = await adminInvite(postReq({}), { params: { id: ORG_A, travellerId: 'bt_b' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.businessTraveller.update).not.toHaveBeenCalled()
  })
})
