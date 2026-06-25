import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const ADMIN_COOKIE = 'admin_token'

/**
 * Verify a HS256 JWT using the Web Crypto API (Edge-compatible, no extra deps).
 * Returns the decoded payload on success, or null on failure.
 */
async function verifyAdminCookie(req: NextRequest): Promise<{
  email: string
  staffRole: string
} | null> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  if (!token) return null

  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, sigB64] = parts

    const rawSecret = process.env.JWT_ADMIN_SECRET
    if (!rawSecret && process.env.NODE_ENV === 'production') {
      // Fail closed — reject all admin requests if secret is missing
      return null
    }
    const secret  = rawSecret ?? 'dev-only-secret-do-not-use-in-production'
    const keyData = new TextEncoder().encode(secret)
    const key = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )

    function b64urlToBuffer(s: string): ArrayBuffer {
      const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return bytes.buffer as ArrayBuffer
    }

    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    const sig  = b64urlToBuffer(sigB64)

    const valid = await crypto.subtle.verify('HMAC', key, sig, data)
    if (!valid) return null

    const payload = JSON.parse(new TextDecoder().decode(b64urlToBuffer(payloadB64)))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null

    return {
      email:     payload.email     ?? '',
      staffRole: payload.staffRole ?? 'sales_rep',
    }
  } catch {
    return null
  }
}

/**
 * Role hierarchy — index = seniority (higher = more access).
 * Used for coarse "minimum role" checks in middleware.
 */
const ROLE_HIERARCHY = ['sales_rep', 'coordinator', 'senior_manager', 'general_manager', 'super_admin']

function isAtLeast(userRole: string, minRole: string): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(minRole)
}

/**
 * Routes that require a minimum role to even access.
 * Fine-grained permission checks (button visibility, data filtering) happen inside each page.
 */
const ROUTE_MIN_ROLES: Array<{ prefix: string; minRole: string }> = [
  { prefix: '/admin/settings',   minRole: 'super_admin'     },
  { prefix: '/admin/staff',      minRole: 'general_manager' },
  { prefix: '/admin/reports',    minRole: 'sales_rep'       },
  { prefix: '/admin/payments',   minRole: 'coordinator'     },
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Admin routes ─────────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    // Always allow the login page
    if (pathname === '/admin/login') {
      const session = await verifyAdminCookie(req)
      if (session) {
        return NextResponse.redirect(new URL('/admin/dashboard', req.url))
      }
      return NextResponse.next()
    }

    // Allow the unauthorized page without auth
    if (pathname === '/admin/unauthorized') {
      return NextResponse.next()
    }

    const session = await verifyAdminCookie(req)
    if (!session) {
      const loginUrl = new URL('/admin/login', req.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Role-based route guard (coarse — checks minimum role)
    const routeRule = ROUTE_MIN_ROLES.find((r) => pathname.startsWith(r.prefix))
    if (routeRule && !isAtLeast(session.staffRole, routeRule.minRole)) {
      return NextResponse.redirect(new URL('/admin/unauthorized', req.url))
    }

    return NextResponse.next()
  }

  // ── API admin routes ─────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/admin')) {
    // Auth endpoints must be reachable without a cookie
    if (pathname === '/api/admin/auth/login' || pathname === '/api/admin/auth/logout') {
      return NextResponse.next()
    }
    // Allow CRON_SECRET bearer token (used by CLI migration triggers)
    const cronSecret = process.env.CRON_SECRET
    const authHeader = req.headers.get('authorization')
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return NextResponse.next()
    }
    const session = await verifyAdminCookie(req)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    return NextResponse.next()
  }

  // ── User-facing protected routes (next-auth) ──────────────────────────────────
  // cookieName must match authOptions.cookies.sessionToken.name exactly —
  // getToken() defaults to __Secure-* on HTTPS which mismatches our explicit name
  const jwtOpts = {
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: 'next-auth.session-token',
  } as const

  const protectedRoutes = ['/dashboard', '/portal']
  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    const token = await getToken(jwtOpts)
    if (!token) {
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${encodeURIComponent(pathname)}`, req.url)
      )
    }
  }

  // Redirect already-authenticated users away from /login
  if (pathname === '/login') {
    const token = await getToken(jwtOpts)
    if (token) {
      const callbackUrl = req.nextUrl.searchParams.get('callbackUrl') || '/dashboard'
      return NextResponse.redirect(new URL(callbackUrl, req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/dashboard',
    '/dashboard/:path*',
    '/portal',
    '/portal/((?!login$).*)',
    '/login',
  ],
}
