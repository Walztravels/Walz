import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { signAdminToken, COOKIE_NAME } from '@/lib/admin-auth'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const ALLOWED_EMAILS = (process.env.ADMIN_EMAILS ?? 'contact@walztravels.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 })
  }

  const { email, password } = parsed.data
  const normalizedEmail = email.toLowerCase()

  // Check whitelist
  if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Verify password
  const adminPassword = process.env.ADMIN_PASSWORD ?? ''
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ?? ''

  let passwordValid = false
  if (adminPasswordHash) {
    // Compare against bcrypt hash (preferred)
    passwordValid = await bcrypt.compare(password, adminPasswordHash)
  } else if (adminPassword) {
    // Fallback: direct compare (set ADMIN_PASSWORD in env)
    passwordValid = password === adminPassword
  }

  if (!passwordValid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Issue JWT
  const token = await signAdminToken(normalizedEmail)

  const response = NextResponse.json({ success: true, email: normalizedEmail })
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12, // 12 hours
  })

  return response
}
