import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const ADMIN_COOKIE = 'admin_token'

/**
 * Verify a HS256 JWT using the Web Crypto API (Edge-compatible, no extra deps).
 */
async function verifyAdminCookie(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  if (!token) return false

  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const [headerB64, payloadB64, sigB64] = parts

    const secret = process.env.JWT_ADMIN_SECRET ?? 'walz-admin-secret-change-me-in-production'
    const keyData = new TextEncoder().encode(secret)
    const key = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )

    // Base64URL → ArrayBuffer
    function b64urlToBuffer(s: string): ArrayBuffer {
      const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return bytes.buffer as ArrayBuffer
    }

    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    const sig = b64urlToBuffer(sigB64)

    const valid = await crypto.subtle.verify('HMAC', key, sig, data)
    if (!valid) return false

    // Check expiry
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBuffer(payloadB64)))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false

    return true
  } catch {
    return false
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Admin routes ─────────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') {
      if (await verifyAdminCookie(req)) {
        return NextResponse.redirect(new URL('/admin/dashboard', req.url))
      }
      return NextResponse.next()
    }

    if (!(await verifyAdminCookie(req))) {
      const loginUrl = new URL('/admin/login', req.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }

    return NextResponse.next()
  }

  // ── User-facing protected routes (next-auth) ──────────────────────────────────
  const protectedRoutes = ['/dashboard', '/portal']
  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    const token = await getToken({ req })
    if (!token) {
      // Redirect to main /login with callbackUrl so they land on portal after sign-in
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${encodeURIComponent(pathname)}`, req.url)
      )
    }
  }

  // Redirect already-authenticated users away from /login
  if (pathname === '/login') {
    const token = await getToken({ req })
    if (token) {
      const callbackUrl = req.nextUrl.searchParams.get('callbackUrl') || '/portal/dashboard'
      return NextResponse.redirect(new URL(callbackUrl, req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/dashboard/:path*',
    '/portal',
    '/portal/((?!login$).*)',   // protect /portal/* but NOT /portal/login
    '/login',
  ],
}
