/**
 * Walz Business Track B1 — B1.1 (forgot-password API) + B1.3
 * (resend-verification API): route-level integration proving the emailed
 * link actually carries the validated callbackUrl end-to-end, and that
 * adversarial payloads never survive into the built URL.
 */
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/rate-limit', () => ({ forgotPasswordRateLimit: () => ({ allowed: true }) }))

// app/api/auth/forgot-password/route.ts uses lib/resend's getResend().
let capturedForgotPasswordHtml: string | null = null
jest.mock('@/lib/resend', () => ({
  getResend: () => ({
    emails: {
      send: jest.fn(async (payload: { html: string }) => { capturedForgotPasswordHtml = payload.html; return { data: { id: 'email_1' } } }),
    },
  }),
}))

// app/api/auth/verify-email/route.ts instantiates `Resend` from
// lib/resend-hardened directly (its own local getResend(), distinct from
// lib/resend's) — mocked separately here to match that exact import.
let capturedVerifyEmailHtml: string | null = null
jest.mock('@/lib/resend-hardened', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn(async (payload: { html: string }) => { capturedVerifyEmailHtml = payload.html; return { data: { id: 'email_2' } } }),
    },
  })),
}))

import { POST as forgotPassword } from '@/app/api/auth/forgot-password/route'
import { POST as resendVerify } from '@/app/api/auth/verify-email/route'

function req(body: Record<string, unknown>) {
  return {
    headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
    json: async () => body,
  } as any
}

const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL
const ORIGINAL_RESEND_KEY = process.env.RESEND_API_KEY

beforeEach(() => {
  jest.clearAllMocks()
  capturedForgotPasswordHtml = null
  capturedVerifyEmailHtml = null
  process.env.NEXTAUTH_URL = 'https://www.walztravels.com'
  process.env.RESEND_API_KEY = 'test_key'
})
afterEach(() => {
  process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL
  process.env.RESEND_API_KEY = ORIGINAL_RESEND_KEY
})

const ADVERSARIAL_PAYLOADS: Array<[string, string]> = [
  ['protocol-relative', '//evil.com'],
  ['backslash-variant', '/\\evil.com'],
  ['fully-qualified external URL', 'https://evil.com'],
  ['encoded path traversal', '/business/%2e%2e/%2e%2e/etc/passwd'],
  ['literal path traversal', '/business/../../../login'],
  ['embedded control character', '/\t/evil.com'],
]

describe('POST /api/auth/forgot-password: callbackUrl threading', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'biz@acme.com', name: 'Biz', password: 'hashed' })
    mockPrisma.user.update.mockResolvedValue({})
  })

  it('a legitimate /business/login callbackUrl is embedded in the emailed reset link', async () => {
    const res = await forgotPassword(req({ email: 'biz@acme.com', callbackUrl: '/business/login' }))
    expect(res.status).toBe(200)
    expect(capturedForgotPasswordHtml).toContain(
      'https://www.walztravels.com/reset-password?token=' +
        mockPrisma.user.update.mock.calls[0][0].data.passwordResetToken +
        '&callbackUrl=%2Fbusiness%2Flogin',
    )
  })

  it('REGRESSION: no callbackUrl (consumer flow) builds the plain, unchanged reset link', async () => {
    const res = await forgotPassword(req({ email: 'biz@acme.com' }))
    expect(res.status).toBe(200)
    const token = mockPrisma.user.update.mock.calls[0][0].data.passwordResetToken
    expect(capturedForgotPasswordHtml).toContain(`https://www.walztravels.com/reset-password?token=${token}`)
    expect(capturedForgotPasswordHtml).not.toContain('callbackUrl')
  })

  describe('ADVERSARIAL — malicious callbackUrl never reaches the emailed link', () => {
    it.each(ADVERSARIAL_PAYLOADS)('%s: %s is stripped, falls back to the plain link', async (_label, payload) => {
      const res = await forgotPassword(req({ email: 'biz@acme.com', callbackUrl: payload }))
      expect(res.status).toBe(200)
      expect(capturedForgotPasswordHtml).not.toContain('callbackUrl')
      expect(capturedForgotPasswordHtml).not.toMatch(/evil\.com/)
      expect(capturedForgotPasswordHtml).not.toMatch(/etc\/passwd/)
    })
  })
})

describe('POST /api/auth/verify-email (resend): callbackUrl threading (B1.3)', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'biz@acme.com', emailVerified: null })
    mockPrisma.user.update.mockResolvedValue({})
  })

  it('a legitimate /business/org_123 callbackUrl (threaded from the ORIGINAL link) is preserved in the RESENT verification link', async () => {
    const res = await resendVerify(req({ email: 'biz@acme.com', callbackUrl: '/business/org_123' }))
    expect(res.status).toBe(200)
    const token = mockPrisma.user.update.mock.calls[0][0].data.verificationToken
    expect(capturedVerifyEmailHtml).toContain(
      `https://www.walztravels.com/api/auth/verify-email?token=${token}&callbackUrl=%2Fbusiness%2Forg_123`,
    )
  })

  it('REGRESSION: no callbackUrl (consumer resend, the previously-existing behavior) builds the plain link, unchanged', async () => {
    const res = await resendVerify(req({ email: 'biz@acme.com' }))
    expect(res.status).toBe(200)
    const token = mockPrisma.user.update.mock.calls[0][0].data.verificationToken
    expect(capturedVerifyEmailHtml).toContain(`https://www.walztravels.com/api/auth/verify-email?token=${token}`)
    expect(capturedVerifyEmailHtml).not.toContain('callbackUrl')
  })

  it('a non-/business callbackUrl is ignored, falls back to the plain link', async () => {
    const res = await resendVerify(req({ email: 'biz@acme.com', callbackUrl: '/portal/dashboard' }))
    expect(res.status).toBe(200)
    expect(capturedVerifyEmailHtml).not.toContain('callbackUrl')
  })

  describe('ADVERSARIAL — malicious callbackUrl never reaches the resent verification link', () => {
    it.each(ADVERSARIAL_PAYLOADS)('%s: %s is stripped, falls back to the plain link', async (_label, payload) => {
      const res = await resendVerify(req({ email: 'biz@acme.com', callbackUrl: payload }))
      expect(res.status).toBe(200)
      expect(capturedVerifyEmailHtml).not.toContain('callbackUrl')
      expect(capturedVerifyEmailHtml).not.toMatch(/evil\.com/)
      expect(capturedVerifyEmailHtml).not.toMatch(/etc\/passwd/)
    })
  })

  it('never verified / already-verified users: generic success, no email sent (enumeration-safe, unchanged)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const res = await resendVerify(req({ email: 'nobody@acme.com', callbackUrl: '/business/org_123' }))
    expect(res.status).toBe(200)
    expect(capturedVerifyEmailHtml).toBeNull()
  })
})
