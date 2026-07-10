import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 401 })

  const { orderRef } = await req.json().catch(() => ({}))
  if (!orderRef) return NextResponse.json({ error: 'orderRef required' }, { status: 400 })

  const order = await prisma.esimOrder.findUnique({ where: { orderRef } })
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // eSIMs are pre-provisioned digital goods — there is no Airalo API call to
  // remotely cancel them. We mark the record cancelled in our DB only.
  await prisma.esimOrder.update({
    where: { orderRef },
    data:  { status: 'cancelled' },
  })

  return NextResponse.json({ success: true })
}
