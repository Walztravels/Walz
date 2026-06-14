import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function POST(req: NextRequest) {
  const hash = req.headers.get('verif-hash')

  if (!hash || hash !== process.env.FLUTTERWAVE_WEBHOOK_HASH) {
    return NextResponse.json({ error: 'Invalid hash' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    if (
      body.event === 'charge.completed' &&
      (body.data as Record<string, unknown>)?.status === 'successful'
    ) {
      const data = body.data as Record<string, unknown>
      const meta = data.meta as Record<string, unknown> | undefined
      const booking_ref =
        (meta?.booking_ref as string | undefined) || (data.tx_ref as string | undefined)

      if (booking_ref) {
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
          String(data.id),
          data.amount,
          data.currency,
          booking_ref
        )
      }
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[Flutterwave Webhook] Error:', error)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}
