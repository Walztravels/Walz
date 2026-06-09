import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { esimHeaders, ESIM_BASE } from '@/lib/esim-pricing'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 401 })

  const { orderRef } = await req.json().catch(() => ({}))
  if (!orderRef) return NextResponse.json({ error: 'orderRef required' }, { status: 400 })

  const order = await prisma.esimOrder.findUnique({ where: { orderRef } })
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  try {
    const res  = await fetch(`${ESIM_BASE}/open/esim/cancel`, {
      method:  'POST',
      headers: esimHeaders(),
      body:    JSON.stringify({ orderNo: order.esimAccessOrderNo ?? orderRef }),
    })
    const json = await res.json()

    if (json?.success || json?.errorCode === '0') {
      await prisma.esimOrder.update({
        where: { orderRef },
        data:  { status: 'cancelled' },
      })
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: json?.errorMsg ?? 'Cancel failed' }, { status: 400 })
  } catch (err) {
    console.error('[esim/cancel]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
