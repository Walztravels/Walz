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

  const { orderRef, iccid } = await req.json().catch(() => ({}))
  if (!orderRef && !iccid) {
    return NextResponse.json({ error: 'orderRef or iccid required' }, { status: 400 })
  }

  // Verify ownership
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const localOrder = await prisma.esimOrder.findFirst({
    where: {
      userId: user.id,
      OR: [
        { orderRef: orderRef ?? '' },
        { iccid: iccid ?? '' },
      ],
    },
  })
  if (!localOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  try {
    const res = await fetch(`${ESIM_BASE}/open/esim/query`, {
      method:  'POST',
      headers: esimHeaders(),
      body:    JSON.stringify({
        orderNo: localOrder.esimAccessOrderNo ?? localOrder.orderRef,
        iccid:   localOrder.iccid ?? '',
      }),
    })
    const json = await res.json()
    const data = json?.obj ?? {}

    // Update local status if changed
    const remoteStatus = data.esimStatus ?? data.status ?? null
    if (remoteStatus && remoteStatus !== localOrder.status) {
      await prisma.esimOrder.update({
        where: { id: localOrder.id },
        data: {
          status:      remoteStatus,
          activatedAt: remoteStatus === 'IN_USE' ? new Date() : localOrder.activatedAt,
        },
      })
    }

    return NextResponse.json({
      status:       remoteStatus ?? localOrder.status,
      iccid:        data.iccid ?? localOrder.iccid,
      dataRemaining: data.remaining,
      dataTotal:    data.total,
      expiresAt:    data.expiredTime ?? localOrder.expiresAt,
      raw:          data,
    })
  } catch (err) {
    console.error('[esim/query]', err)
    return NextResponse.json({ status: localOrder.status, error: 'Query failed' }, { status: 200 })
  }
}
