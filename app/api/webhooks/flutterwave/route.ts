import { NextRequest, NextResponse }          from 'next/server'
import prisma                                 from '@/lib/db'
import { recordPaymentSucceeded }             from '@/lib/commercial/payment'
import { setTripPaid }                        from '@/lib/trips/lifecycle'
import { handleSuccessfulTripPayment }        from '@/lib/payments/handle-success'

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

      recordPaymentSucceeded({
        provider:          'FLUTTERWAVE',
        providerPaymentId: String(data.id),
        amount:    typeof data.amount === 'number' ? data.amount : 0,
        currency:  (data.currency as string | undefined)?.toUpperCase() ?? 'NGN',
        metadata:  { txRef: data.tx_ref, bookingRef: booking_ref },
      }).catch(err => console.warn('[Payment] Flutterwave payment_succeeded tracking failed:', (err as Error).message))

      // Advance Trip lifecycle to PAID (non-fatal)
      const tripId    = meta?.walz_trip_id    as string | undefined
      const sessionId = meta?.walz_session_id as string | undefined
      if (tripId || sessionId) {
        void setTripPaid({ tripId: tripId ?? null, sessionId: sessionId ?? null })

        // Run shared trip-payment orchestration: CartSession.convertedAt,
        // Jade attribution, jade_checkout_converted event, bookCartActivities.
        const customer = data.customer as Record<string, unknown> | undefined
        handleSuccessfulTripPayment({
          provider:          'FLUTTERWAVE',
          providerPaymentId: String(data.id),
          tripId:            tripId    ?? null,
          sessionId:         sessionId ?? null,
          leadId:            (meta?.walz_lead_id as string | undefined) ?? null,
          jadeAssisted:      meta?.jade_assisted === 'true',
          amount:            typeof data.amount === 'number' ? data.amount : 0,
          currency:          (data.currency as string | undefined)?.toUpperCase() ?? 'NGN',
          holder: {
            name:  String(customer?.name  ?? 'Valued Customer'),
            email: String(customer?.email ?? ''),
            phone: customer?.phone_number ? String(customer.phone_number) : undefined,
          },
        }).catch(err => console.error('[FLW] handleSuccessfulTripPayment failed:', err))
      }
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[Flutterwave Webhook] Error:', error)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}
