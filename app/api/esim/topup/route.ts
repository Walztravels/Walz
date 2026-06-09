import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { esimHeaders, ESIM_BASE, applyMarkup, generateOrderRef } from '@/lib/esim-pricing'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { iccid, packageCode, wholesaleUsd } = await req.json().catch(() => ({}))
  if (!iccid || !packageCode) {
    return NextResponse.json({ error: 'iccid and packageCode required' }, { status: 400 })
  }

  // Verify ownership
  const order = await prisma.esimOrder.findFirst({ where: { iccid, userId: user.id } })
  if (!order) return NextResponse.json({ error: 'eSIM not found' }, { status: 404 })

  const ref = generateOrderRef()

  try {
    const res  = await fetch(`${ESIM_BASE}/open/esim/topup`, {
      method:  'POST',
      headers: esimHeaders(),
      body:    JSON.stringify({
        transactionId:   ref,
        iccid,
        packageCode,
        orderNo:         ref,
        count:           1,
        price:           wholesaleUsd ?? 0,
        amount:          wholesaleUsd ?? 0,
        paymentMethod:   3,
      }),
    })
    const json = await res.json()

    if (json?.success || json?.errorCode === '0') {
      await prisma.esimTopup.create({
        data: {
          orderId:     order.id,
          userId:      user.id,
          packageCode,
          amount:      applyMarkup(wholesaleUsd ?? 0),
          status:      'active',
        },
      })
      return NextResponse.json({ success: true, ref })
    }

    return NextResponse.json({ error: json?.errorMsg ?? 'Top-up failed' }, { status: 400 })
  } catch (err) {
    console.error('[esim/topup]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
