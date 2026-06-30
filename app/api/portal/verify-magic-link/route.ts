import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const { token, email } = await req.json()
  if (!token || !email) return NextResponse.json({ valid: false })

  const record = await prisma.verificationToken.findFirst({
    where: { token, identifier: email.toLowerCase() },
  }).catch(() => null)

  if (!record) return NextResponse.json({ valid: false })
  if (record.expires < new Date()) return NextResponse.json({ valid: false, expired: true })

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, password: true },
  }).catch(() => null)

  return NextResponse.json({
    valid: true,
    hasPassword: !!(user as { password?: string | null } | null)?.password,
  })
}
