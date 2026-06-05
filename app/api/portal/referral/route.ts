import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

function generateCode(name: string): string {
  const base = name.replace(/\s+/g, '').toUpperCase().slice(0, 5)
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `WALZ-${base}-${suffix}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let referral = await prisma.referralCode.findUnique({ where: { userId: user.id } })

  if (!referral) {
    referral = await prisma.referralCode.create({
      data: {
        userId: user.id,
        code:   generateCode(user.name ?? user.email ?? 'CLIENT'),
      },
    })
  }

  return NextResponse.json({ referral })
}
