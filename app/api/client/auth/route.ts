import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

const JWT_SECRET = new TextEncoder().encode(
  process.env.CLIENT_JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'walz-client-fallback-secret'
)
const COOKIE_NAME = 'walz_client_token'
const TOKEN_TTL   = 60 * 60 * 24 * 7 // 7 days in seconds

// POST /api/client/auth — login
export async function POST(req: NextRequest) {
  const { email, password } = await req.json() as { email?: string; password?: string }
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: client } = await supabase
    .from('ClientAccount')
    .select('id, email, name, passwordHash, isVerified')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (!client || !client.passwordHash) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, client.passwordHash as string)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const token = await new SignJWT({ sub: client.id as string, email: client.email as string, name: client.name as string })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)

  const res = NextResponse.json({ success: true, name: client.name })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   TOKEN_TTL,
    path:     '/',
  })
  return res
}

// DELETE /api/client/auth — logout
export async function DELETE() {
  const res = NextResponse.json({ success: true })
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  return res
}

// GET /api/client/auth — verify current session
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ authenticated: false }, { status: 401 })

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return NextResponse.json({ authenticated: true, email: payload.email, name: payload.name })
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}

// Helper: verify token from cookie in server components
async function verifyClientToken(req: NextRequest): Promise<{ sub: string; email: string; name: string } | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return { sub: payload.sub as string, email: payload.email as string, name: payload.name as string }
  } catch {
    return null
  }
}
