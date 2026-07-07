import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

const SITE = process.env.NEXTAUTH_URL ?? 'https://walztravels.com'

// POST /api/admin/client-accounts/reset-link
// Returns a password reset URL the admin can share directly with the client
// (WhatsApp, SMS, etc.) — no email required
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = await req.json() as { email?: string }
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const normalised = email.toLowerCase().trim()
  const user = await prisma.user.findUnique({ where: { email: normalised } })
  if (!user) return NextResponse.json({ error: 'No account found with that email' }, { status: 404 })

  const token   = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24) // 24 hours

  let link: string

  if (user.password) {
    await prisma.user.update({
      where: { id: user.id },
      data:  { passwordResetToken: token, passwordResetExpires: expires },
    })
    link = `${SITE}/reset-password?token=${token}`
  } else {
    await prisma.verificationToken.deleteMany({ where: { identifier: normalised } }).catch(() => {})
    await prisma.verificationToken.create({
      data: { identifier: normalised, token, expires },
    })
    link = `${SITE}/portal/verify?token=${token}&email=${encodeURIComponent(normalised)}`
  }

  return NextResponse.json({ link, expiresAt: expires.toISOString() })
}
