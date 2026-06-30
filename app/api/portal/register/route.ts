import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const { email, name, password } = await req.json()

  if (!email || !name || !password || password.length < 8) {
    return NextResponse.json({ error: 'Name, email, and a password of at least 8 characters are required.' }, { status: 400 })
  }

  const normalEmail = email.toLowerCase().trim()

  const existing = await prisma.user.findFirst({
    where: { email: { equals: normalEmail, mode: 'insensitive' } },
    select: { id: true },
  })

  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists. Please log in.' },
      { status: 409 },
    )
  }

  const hashed = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      email: normalEmail,
      name: name.trim(),
      password: hashed,
    } as Record<string, unknown>,
  })

  // Auto-link any unlinked visa applications or trip requests by this email
  const [visaCount, tripCount] = await Promise.all([
    prisma.visaApplication.updateMany({
      where: { email: { equals: normalEmail, mode: 'insensitive' }, userId: null, isDraft: false },
      data: { userId: user.id },
    }).catch(() => ({ count: 0 })),
    prisma.tripRequest.updateMany({
      where: { email: { equals: normalEmail, mode: 'insensitive' }, userId: null },
      data: { userId: user.id },
    }).catch(() => ({ count: 0 })),
  ])

  const linked = (visaCount?.count ?? 0) + (tripCount?.count ?? 0)

  return NextResponse.json({
    success: true,
    linkedApplications: linked,
    message: linked > 0
      ? `Account created. ${linked} existing application${linked !== 1 ? 's' : ''} linked to your account.`
      : 'Account created successfully.',
  }, { status: 201 })
}
