import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const orders = await prisma.esimOrder.findMany({
    where:   { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id:              true,
      orderRef:        true,
      destination:     true,
      destinationIso2: true,
      packageName:     true,
      durationDays:    true,
      dataAmount:      true,
      dataUnit:        true,
      retailPriceUsd:  true,
      currency:        true,
      iccid:           true,
      qrCodeUrl:       true,
      activationCode:  true,
      smdpAddress:     true,
      status:          true,
      purchasedAt:     true,
      activatedAt:     true,
      expiresAt:       true,
    },
  })

  return NextResponse.json({ orders })
}
