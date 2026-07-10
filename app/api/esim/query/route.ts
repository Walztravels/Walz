import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { getSimDetails } from '@/lib/airalo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { iccid, orderRef } = await req.json().catch(() => ({}))
  if (!iccid && !orderRef) {
    return NextResponse.json({ error: 'iccid or orderRef required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const localOrder = await prisma.esimOrder.findFirst({
    where: { userId: user.id, OR: [{ iccid: iccid ?? '' }, { orderRef: orderRef ?? '' }] },
  })
  if (!localOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Try to get live status from Airalo; fall back to DB data on any error.
  const live = localOrder.iccid ? await getSimDetails(localOrder.iccid) : null

  const remoteStatus = live?.status ?? null

  // Sync DB status if Airalo reports a different value
  if (remoteStatus && remoteStatus !== localOrder.status) {
    await prisma.esimOrder.update({
      where: { id: localOrder.id },
      data: {
        status:      remoteStatus,
        activatedAt: remoteStatus === 'active' && !localOrder.activatedAt ? new Date() : localOrder.activatedAt,
      },
    }).catch(() => {})
  }

  return NextResponse.json({
    status:        remoteStatus ?? localOrder.status,
    iccid:         live?.iccid ?? localOrder.iccid,
    dataRemaining: live?.remaining ?? null,
    dataTotal:     live?.total    ?? null,
    expiresAt:     live?.expired_at ?? localOrder.expiresAt,
  })
}
