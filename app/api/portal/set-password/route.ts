import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const { token, email, password } = await req.json()

  if (!token || !email || !password || password.length < 8) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const record = await prisma.verificationToken.findFirst({
    where: { token, identifier: email.toLowerCase() },
  }).catch(() => null)

  if (!record) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  if (record.expires < new Date()) return NextResponse.json({ error: 'Token expired' }, { status: 400 })

  const hashed = await bcrypt.hash(password, 12)

  await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: { password: hashed } as Record<string, unknown>,
  })

  // Delete the used token
  await prisma.verificationToken.deleteMany({
    where: { token, identifier: email.toLowerCase() },
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
