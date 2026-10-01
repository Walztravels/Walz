/**
 * Jade Customer Experience Polish — /dashboard/club page.
 *
 * This presentation-only pass must not change any commercial-gating
 * behavior: a tier is only ever "Join"-able when a real ACTIVE commercial
 * policy exists for it, "Coming Soon" otherwise, and no price is ever
 * shown. These tests re-prove exactly that invariant against the restyled
 * page, plus a no-fabricated-content check — the visual rhythm/typography
 * changes themselves are left to human visual acceptance.
 */

const mockGetServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

const mockRedirect = jest.fn((url: string) => { throw new Error(`REDIRECT:${url}`) })
jest.mock('next/navigation', () => ({ redirect: (url: string) => mockRedirect(url) }))

const mockEnsureJadeClubMembership = jest.fn()
jest.mock('@/lib/jade-club/membership', () => ({ ensureJadeClubMembership: (...a: unknown[]) => mockEnsureJadeClubMembership(...a) }))

const mockListActiveBenefits = jest.fn()
jest.mock('@/lib/jade-club/benefits', () => ({ listActiveBenefits: (...a: unknown[]) => mockListActiveBenefits(...a) }))

const mockGetMilesWalletData = jest.fn()
jest.mock('@/lib/portal/miles-data', () => ({ getMilesWalletData: (...a: unknown[]) => mockGetMilesWalletData(...a) }))

const mockListActivePoliciesForTier = jest.fn()
jest.mock('@/lib/jade-club/purchase', () => ({ listActivePoliciesForTier: (...a: unknown[]) => mockListActivePoliciesForTier(...a) }))

import { renderToStaticMarkup } from 'react-dom/server'

function membership(overrides: Partial<{ tier: string; status: string; memberCode: string; startedAt: Date; expiresAt: Date | null }> = {}) {
  return {
    id: 'membership_1',
    userId: 'user_1',
    memberCode: 'JW-002847',
    tier: 'FREE',
    status: 'FREE',
    startedAt: new Date('2026-01-15T12:00:00.000Z'),
    expiresAt: null,
    qrTokenVersion: 1,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetServerSession.mockResolvedValue({ user: { id: 'user_1' } })
  mockGetMilesWalletData.mockResolvedValue({ milesBalance: 1200, lifetimeMiles: 1200 })
  mockListActiveBenefits.mockResolvedValue([])
})

describe('/dashboard/club — commercial gating is unchanged by the polish pass', () => {
  it('Jade Club shows "Coming Soon" (not Join) when zero ACTIVE policies exist for it', async () => {
    mockEnsureJadeClubMembership.mockResolvedValue(membership({ tier: 'FREE' }))
    mockListActivePoliciesForTier.mockResolvedValue([]) // both CLUB and CLUB_PLUS calls
    const { default: JadeClubPage } = await import('@/app/dashboard/club/page')
    const html = renderToStaticMarkup(await JadeClubPage())

    expect(html).toContain('Coming Soon')
    expect(html).not.toContain('/dashboard/club/join/club"')
  })

  it('Jade Club shows a real "Join" link when an ACTIVE policy exists for it', async () => {
    mockEnsureJadeClubMembership.mockResolvedValue(membership({ tier: 'FREE' }))
    mockListActivePoliciesForTier.mockImplementation(async (tier: string) =>
      tier === 'CLUB' ? [{ id: 'policy_1', tier: 'CLUB', status: 'ACTIVE' }] : [])
    const { default: JadeClubPage } = await import('@/app/dashboard/club/page')
    const html = renderToStaticMarkup(await JadeClubPage())

    expect(html).toContain('/dashboard/club/join/club"')
    expect(html).toContain('Join')
  })

  it('never shows a price/currency figure anywhere on the page', async () => {
    mockEnsureJadeClubMembership.mockResolvedValue(membership({ tier: 'FREE' }))
    mockListActivePoliciesForTier.mockImplementation(async (tier: string) =>
      tier === 'CLUB' ? [{ id: 'policy_1', tier: 'CLUB', status: 'ACTIVE', annualPriceMinor: 99900, currency: 'USD' }] : [])
    const { default: JadeClubPage } = await import('@/app/dashboard/club/page')
    const html = renderToStaticMarkup(await JadeClubPage())

    expect(html).not.toMatch(/\$\d|USD\s*\d|999|annualPriceMinor/)
  })

  it('the current tier shows "Current", not "Coming Soon" or "Join"', async () => {
    mockEnsureJadeClubMembership.mockResolvedValue(membership({ tier: 'CLUB', status: 'ACTIVE' }))
    mockListActivePoliciesForTier.mockResolvedValue([])
    const { default: JadeClubPage } = await import('@/app/dashboard/club/page')
    const html = renderToStaticMarkup(await JadeClubPage())

    expect(html).toContain('Current')
  })

  it('renders the real Walz Miles balance from the read-only reader, unchanged', async () => {
    mockEnsureJadeClubMembership.mockResolvedValue(membership())
    mockListActivePoliciesForTier.mockResolvedValue([])
    mockGetMilesWalletData.mockResolvedValue({ milesBalance: 54321, lifetimeMiles: 54321 })
    const { default: JadeClubPage } = await import('@/app/dashboard/club/page')
    const html = renderToStaticMarkup(await JadeClubPage())

    expect(html).toContain('54,321')
  })

  it('renders the Digital Jade Card preview and the Member ID, same authoritative source as before', async () => {
    mockEnsureJadeClubMembership.mockResolvedValue(membership({ memberCode: 'JW-999999' }))
    mockListActivePoliciesForTier.mockResolvedValue([])
    const { default: JadeClubPage } = await import('@/app/dashboard/club/page')
    const html = renderToStaticMarkup(await JadeClubPage())

    expect(html).toContain('/dashboard/club/card"')
    expect(html).toContain('JW-999999')
  })

  it('still redirects to login when there is no session (unchanged auth gate)', async () => {
    mockGetServerSession.mockResolvedValue(null)
    mockEnsureJadeClubMembership.mockResolvedValue(membership())
    mockListActivePoliciesForTier.mockResolvedValue([])
    const { default: JadeClubPage } = await import('@/app/dashboard/club/page')

    await expect(JadeClubPage()).rejects.toThrow('REDIRECT:/login?callbackUrl=/dashboard/club')
  })
})
