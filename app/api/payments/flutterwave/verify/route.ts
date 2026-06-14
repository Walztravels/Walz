import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function POST(req: Request) {
  try {
    const { transaction_id, booking_ref, expected_amount, expected_currency } =
      await req.json()

    if (!transaction_id || !booking_ref) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    )
    const data = await response.json()

    if (
      data.status === 'success' &&
      data.data.status === 'successful' &&
      data.data.amount >= Number(expected_amount) &&
      data.data.currency === expected_currency
    ) {
      await prisma.$executeRawUnsafe(
        `UPDATE package_bookings
         SET payment_status = 'deposit_paid',
             payment_gateway = 'flutterwave',
             payment_intent_id = $1,
             deposit_paid_at = NOW(),
             deposit_amount_paid = $2,
             payment_currency = $3,
             updated_at = NOW()
         WHERE booking_ref = $4`,
        String(transaction_id),
        data.data.amount,
        data.data.currency,
        booking_ref
      )
      return NextResponse.json({ verified: true })
    }

    return NextResponse.json(
      { verified: false, error: 'Payment verification failed' },
      { status: 400 }
    )
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Verification error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
