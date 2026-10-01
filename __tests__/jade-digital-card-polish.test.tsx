/**
 * Jade Customer Experience Polish — Digital Jade Card page.
 *
 * This file verifies the ONE new behavior introduced by the polish pass
 * (Decision 2: authoritative-only "Valid Until", omitted cleanly when
 * card.expiresAt is null) and confirms every other authoritative field
 * (name, tier, member ID, member since, QR target) still renders from the
 * same DTO/session values as before — the visual refinement itself
 * (typography/spacing/sheen) is not something a DOM-shape test can
 * meaningfully assert and is left to human visual acceptance per the
 * implementation report.
 */

const mockGetServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

const mockRedirect = jest.fn((url: string) => { throw new Error(`REDIRECT:${url}`) })
jest.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
  // RotateQrButton (rendered inside the page tree) calls useRouter() — stub
  // it with a no-op router so SSR of the page doesn't need a real one.
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), forward: jest.fn(), prefetch: jest.fn() }),
}))

const mockGetJadeClubCardView = jest.fn()
jest.mock('@/lib/jade-club/membership', () => ({ getJadeClubCardView: (...a: unknown[]) => mockGetJadeClubCardView(...a) }))

jest.mock('qrcode', () => ({
  __esModule: true,
  default: { toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,FAKE') },
}))

import { renderToStaticMarkup } from 'react-dom/server'

function baseCard(overrides: Partial<{ tier: string; memberCode: string; memberSince: Date; expiresAt: Date | null }> = {}) {
  return {
    memberCode: 'JW-002847',
    tier: 'CLUB',
    status: 'ACTIVE',
    memberSince: new Date('2026-01-15T12:00:00.000Z'),
    expiresAt: null,
    verificationToken: 'tok_abc123',
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetServerSession.mockResolvedValue({ user: { id: 'user_1', name: 'Olawale Somto', email: 'olawale@example.com' } })
})

describe('Digital Jade Card — authoritative data rendering', () => {
  it('renders member name, tier label, member ID, and member since from the DTO/session', async () => {
    mockGetJadeClubCardView.mockResolvedValue(baseCard())
    const { default: DigitalJadeCardPage } = await import('@/app/dashboard/club/card/page')
    const html = renderToStaticMarkup(await DigitalJadeCardPage())

    expect(html).toContain('Olawale Somto')
    expect(html).toContain('Jade Club')
    expect(html).toContain('JW-002847')
    expect(html).toContain('January 2026')
  })

  it('omits "Valid Until" cleanly (no empty slot) when expiresAt is null — e.g. Jade Free / ongoing membership', async () => {
    mockGetJadeClubCardView.mockResolvedValue(baseCard({ expiresAt: null }))
    const { default: DigitalJadeCardPage } = await import('@/app/dashboard/club/card/page')
    const html = renderToStaticMarkup(await DigitalJadeCardPage())

    expect(html).not.toContain('Valid Until')
  })

  it('renders "Valid Until" with the exact authoritative expiresAt value when one exists — never a computed/derived date', async () => {
    mockGetJadeClubCardView.mockResolvedValue(baseCard({ expiresAt: new Date('2027-03-15T12:00:00.000Z') }))
    const { default: DigitalJadeCardPage } = await import('@/app/dashboard/club/card/page')
    const html = renderToStaticMarkup(await DigitalJadeCardPage())

    expect(html).toContain('Valid Until')
    expect(html).toContain('March 2027')
  })

  it('CLUB_PLUS tier renders its own real label, not a fabricated one', async () => {
    mockGetJadeClubCardView.mockResolvedValue(baseCard({ tier: 'CLUB_PLUS' }))
    const { default: DigitalJadeCardPage } = await import('@/app/dashboard/club/card/page')
    const html = renderToStaticMarkup(await DigitalJadeCardPage())

    expect(html).toContain('Jade Club+')
  })

  it('the QR verification URL is built from the authoritative verificationToken, unchanged mechanism', async () => {
    mockGetJadeClubCardView.mockResolvedValue(baseCard())
    const { default: DigitalJadeCardPage } = await import('@/app/dashboard/club/card/page')
    const html = renderToStaticMarkup(await DigitalJadeCardPage())

    expect(html).toContain('/club/verify/tok_abc123')
    expect(html).toContain('alt="Jade Card verification QR code"')
  })

  it('still redirects to login when there is no session (unchanged auth gate)', async () => {
    mockGetServerSession.mockResolvedValue(null)
    mockGetJadeClubCardView.mockResolvedValue(baseCard())
    const { default: DigitalJadeCardPage } = await import('@/app/dashboard/club/card/page')

    await expect(DigitalJadeCardPage()).rejects.toThrow('REDIRECT:/login?callbackUrl=/dashboard/club/card')
  })

  it('introduces no fake NFC/wallet/barcode/Platinum/Priority-Pass/lounge markup', async () => {
    mockGetJadeClubCardView.mockResolvedValue(baseCard({ tier: 'CLUB_PLUS', expiresAt: new Date('2027-01-01') }))
    const { default: DigitalJadeCardPage } = await import('@/app/dashboard/club/card/page')
    const html = (renderToStaticMarkup(await DigitalJadeCardPage())).toLowerCase()

    for (const forbidden of ['nfc', 'apple wallet', 'google wallet', 'barcode', 'platinum', 'priority pass', 'lounge']) {
      expect(html).not.toContain(forbidden)
    }
  })
})
