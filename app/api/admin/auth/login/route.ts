import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { signAdminToken, COOKIE_NAME } from '@/lib/admin-auth'
import { z } from 'zod'
import prisma from '@/lib/db'

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

  // ── 1. Check Staff table (database accounts) ─────────────────────────────
  const staffMember = await prisma.staff.findUnique({ where: { email: normalizedEmail } })
  if (staffMember) {
    if (!staffMember.isActive) {
      return NextResponse.json(
        { error: 'Account is deactivated. Contact your administrator.' },
        { status: 403 }
      )
    }

    const valid = await bcrypt.compare(password, staffMember.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Update last login timestamp
    await prisma.staff.update({
      where: { id: staffMember.id },
      data: { lastLoginAt: new Date() },
    })

    // Activity log
    await prisma.activityLog.create({
      data: {
        staffId:   staffMember.id,
        staffName: staffMember.name,
        action:    'login',
        detail:    `${staffMember.name} signed in (${staffMember.accessLevel})`,
      },
    })

    const token = await signAdminToken(normalizedEmail)
    const response = NextResponse.json({
      success:     true,
      email:       normalizedEmail,
      staffName:   staffMember.name,
      accessLevel: staffMember.accessLevel,
    })
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   60 * 60 * 12,
    })
    return response
  }

  // ── 2. Fall back to env-var super-admin ───────────────────────────────────
  if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const adminPassword     = process.env.ADMIN_PASSWORD ?? ''
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ?? ''

  let passwordValid = false
  if (adminPasswordHash) {
    passwordValid = await bcrypt.compare(password, adminPasswordHash)
  } else if (adminPassword) {
    passwordValid = password === adminPassword
  }

  if (!passwordValid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = await signAdminToken(normalizedEmail)
  const response = NextResponse.json({ success: true, email: normalizedEmail })
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   60 * 60 * 12,
  })
  return response
}
