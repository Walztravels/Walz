import { NextRequest, NextResponse } from 'next/server'
import { getFLWKey }                from '@/lib/flutterwave-banks'
import { prisma }                   from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { transactionId, txRef } = await req.json()

    if (!transactionId) {
      return NextResponse.json({ verified: false, error: 'No transaction ID' })
    }

    const FLW_KEY = getFLWKey()

    const res = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      { headers: { Authorization: `Bearer ${FLW_KEY}` } }
    )

    const data = await res.json()

    const isVerified =
      data.status === 'success' &&
      data.data?.status === 'successful'

    if (isVerified && txRef) {
      try {
        await prisma.paymentLink.updateMany({
          where: { txRef },
          data:  { status: 'paid', paidAt: new Date() },
        })
      } catch (dbErr: any) {
        console.warn('[payments/verify] DB update failed:', dbErr.message)
      }
    }

    return NextResponse.json({
      verified: isVerified,
      amount:   data.data?.amount,
      currency: data.data?.currency,
      customer: data.data?.customer?.name,
    })
  } catch (err: any) {
    console.error('[payments/verify]', err.message)
    return NextResponse.json({ verified: false, error: err.message })
  }
}
