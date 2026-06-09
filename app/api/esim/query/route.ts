import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { esimHeaders, ESIM_BASE } from '@/lib/esim-pricing'

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

  // Verify ownership
  const localOrder = await prisma.esimOrder.findFirst({
    where: { userId: user.id, OR: [{ iccid: iccid ?? '' }, { orderRef: orderRef ?? '' }] },
  })
  if (!localOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  try {
    const res  = await fetch(`${ESIM_BASE}/open/esim/query`, {
      method:  'POST',
      headers: esimHeaders(),
      body:    JSON.stringify({ iccid: localOrder.iccid ?? '' }),
    })
    const json = await res.json()
    const obj  = json?.obj ?? {}

    // Sync status to DB
    const remoteStatus = obj.esimStatus ?? obj.status ?? null
    if (remoteStatus && remoteStatus !== localOrder.status) {
      await prisma.esimOrder.update({
        where: { id: localOrder.id },
        data: {
          status:      remoteStatus,
          activatedAt: remoteStatus === 'IN_USE' && !localOrder.activatedAt ? new Date() : localOrder.activatedAt,
        },
      })
    }

    return NextResponse.json({
      status:        remoteStatus ?? localOrder.status,
      iccid:         obj.iccid ?? localOrder.iccid,
      dataRemaining: obj.remaining ?? obj.residualFlow,
      dataTotal:     obj.total ?? obj.totalFlow,
      expiresAt:     obj.expiredTime ?? localOrder.expiresAt,
    })
  } catch (err) {
    console.error('[esim/query]', err)
    return NextResponse.json({ status: localOrder.status }, { status: 200 })
  }
}
