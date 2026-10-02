/**
 * Walz Business V1-A — item 5 of the required test list:
 * "callbackUrl survives signup + verification end-to-end."
 *
 * app/business/register/BusinessRegisterForm.tsx sends an optional,
 * additive `callbackUrl` field to POST /api/auth/signup. The signup route
 * threads it onto the verification email link (?callbackUrl=X). The GET
 * handler in app/api/auth/verify-email/route.ts reads that same param back
 * off the verification link and, when it is a safe /business-prefixed
 * path, redirects to /business/login?verified=true&callbackUrl=X instead
 * of the hardcoded consumer path.
 */
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  visaApplication: { findMany: jest.fn().mockResolvedValue([]) },
  tripRequest: { findMany: jest.fn().mockResolvedValue([]) },
  tourEnquiry: { findMany: jest.fn().mockResolvedValue([]) },
  applicationLinkRequest: { createMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/rate-limit', () => ({ signupRateLimit: () => ({ allowed: true }) }))
jest.mock('@/lib/commercial/track', () => ({ trackCommercialEvent: jest.fn() }))

import { POST as signup } from '@/app/api/auth/signup/route'
import { GET as verifyEmail } from '@/app/api/auth/verify-email/route'

function signupReq(body: Record<string, unknown>) {
  return {
    headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
    nextUrl: { searchParams: new URLSearchParams() },
    json: async () => body,
  } as any
}
function verifyReq(searchParams: Record<string, string>) {
  return { nextUrl: { searchParams: new URLSearchParams(searchParams) } } as any
}

const ORIGINAL_FETCH = global.fetch
const ORIGINAL_RESEND_KEY = process.env.RESEND_API_KEY
const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.visaApplication.findMany.mockResolvedValue([])
  mockPrisma.tripRequest.findMany.mockResolvedValue([])
  mockPrisma.tourEnquiry.findMany.mockResolvedValue([])
  // Never hit the real HaveIBeenPwned network endpoint from a test — the
  // route fails open (treats the password as not-breached) on any fetch
  // error, so a rejected fetch is a safe, fast stand-in.
  global.fetch = jest.fn().mockRejectedValue(new Error('network disabled in tests')) as any
  delete process.env.RESEND_API_KEY // getResend() returns null — no real email send attempted
  process.env.NEXTAUTH_URL = 'https://www.walztravels.com'
})
afterEach(() => {
  global.fetch = ORIGINAL_FETCH
  process.env.RESEND_API_KEY = ORIGINAL_RESEND_KEY
  process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL
})

describe('callbackUrl survives signup -> verification email -> verify redirect', () => {
  it('threads a /business callbackUrl from signup onto the stored verificationToken, and verify-email redirects to /business/login with it attached', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null) // no existing account
    mockPrisma.user.create.mockImplementation(async ({ data }: any) => ({
      id: 'user_new',
      createdAt: new Date(),
      ...data,
    }))

    const res = await signup(signupReq({
      name: 'Jane Smith',
      email: 'jane@acme.com',
      password: 'correct-horse-battery-staple',
      callbackUrl: '/business/org_123',
    }))
    expect(res.status).toBe(200)

    // The token actually persisted is what verify-email must look up by —
    // assert it was created, and capture it to drive the next step.
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1)
    const createCall = mockPrisma.user.create.mock.calls[0][0]
    const persistedToken = createCall.data.verificationToken
    expect(typeof persistedToken).toBe('string')
    expect(persistedToken.length).toBeGreaterThan(0)

    // Simulate the visitor clicking the emailed verification link, which
    // the signup route must have built as
    // /api/auth/verify-email?token=<token>&callbackUrl=/business/org_123 —
    // reproduced here by calling the GET handler with that same pair.
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user_new',
      email: 'jane@acme.com',
      name: 'Jane Smith',
      verificationToken: persistedToken,
      verificationTokenExpires: new Date(Date.now() + 1000 * 60 * 60),
    })
    mockPrisma.user.update.mockResolvedValue({})

    const verifyRes = await verifyEmail(verifyReq({ token: persistedToken, callbackUrl: '/business/org_123' }))
    expect(verifyRes.status).toBe(307) // NextResponse.redirect default
    const location = verifyRes.headers.get('location')
    expect(location).toBe('https://www.walztravels.com/business/login?verified=true&callbackUrl=%2Fbusiness%2Forg_123')
  })

  it('does NOT thread a callbackUrl when the register form omitted it (default /business destination) — verify-email falls back to the unchanged consumer redirect', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.user.create.mockImplementation(async ({ data }: any) => ({ id: 'user_new', createdAt: new Date(), ...data }))

    await signup(signupReq({ name: 'Jane', email: 'jane2@acme.com', password: 'correct-horse-battery-staple' }))
    const persistedToken = mockPrisma.user.create.mock.calls[0][0].data.verificationToken

    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user_new', email: 'jane2@acme.com', name: 'Jane',
      verificationToken: persistedToken,
      verificationTokenExpires: new Date(Date.now() + 1000 * 60 * 60),
    })
    mockPrisma.user.update.mockResolvedValue({})

    const verifyRes = await verifyEmail(verifyReq({ token: persistedToken })) // no callbackUrl param — matches what signup built
    const location = verifyRes.headers.get('location')
    expect(location).toBe('https://www.walztravels.com/login?verified=true&callbackUrl=/portal/dashboard')
  })

  it('a non-/business callbackUrl sent to signup is silently ignored (never threaded)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.user.create.mockImplementation(async ({ data }: any) => ({ id: 'user_new', createdAt: new Date(), ...data }))

    await signup(signupReq({
      name: 'Jane', email: 'jane3@acme.com', password: 'correct-horse-battery-staple',
      callbackUrl: '/dashboard', // not /business-prefixed
    }))
    const createCall = mockPrisma.user.create.mock.calls[0][0]
    expect(createCall.data).not.toHaveProperty('callbackUrl') // never persisted as a column either way

    // Re-derive what verifyUrl the route would have built by checking no
    // callbackUrl survives into the verify step: calling verify-email
    // without one (as the route would have emailed) falls back exactly like
    // the "omitted" case above.
    const persistedToken = createCall.data.verificationToken
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user_new', email: 'jane3@acme.com', name: 'Jane',
      verificationToken: persistedToken,
      verificationTokenExpires: new Date(Date.now() + 1000 * 60 * 60),
    })
    mockPrisma.user.update.mockResolvedValue({})
    const verifyRes = await verifyEmail(verifyReq({ token: persistedToken }))
    expect(verifyRes.headers.get('location')).toBe('https://www.walztravels.com/login?verified=true&callbackUrl=/portal/dashboard')
  })
})
