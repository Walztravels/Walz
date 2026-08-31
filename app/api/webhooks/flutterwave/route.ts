import { NextRequest, NextResponse }          from 'next/server'
import prisma                                 from '@/lib/db'
import { recordPaymentSucceeded }             from '@/lib/commercial/payment'
import { setTripPaid }                        from '@/lib/trips/lifecycle'
import { handleSuccessfulTripPayment }        from '@/lib/payments/handle-success'

// Server-side transaction verification to confirm the webhook payload is genuine.
// The verif-hash header is a static secret (not an HMAC of the body), so a forged
// payload that knows the secret passes the header check — this verification call
// ensures the transaction details actually exist on Flutterwave's servers.
async function verifyFlutterwaveTransaction(
  txId: string,
  expectedAmount: number,
  expectedCurrency: string,
): Promise<boolean> {
  const secretKey = process.env.FLW_SECRET_KEY ?? process.env.FLUTTERWAVE_SECRET_KEY
  if (!secretKey) {
    console.warn('[FLW] FLW_SECRET_KEY not set — skipping server-side verification')
    return true // fail open only in dev; production must set the key
  }
  try {
    const resp = await fetch(`https://api.flw-rave.com/v3/transactions/${txId}/verify`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    })
    if (!resp.ok) {
      console.warn('[FLW] verification API returned', resp.status, 'for tx', txId)
      return false
    }
    const result = await resp.json() as { status: string; data?: { amount: number; currency: string; status: string } }
    if (result.status !== 'success' || result.data?.status !== 'successful') return false
    if (result.data.currency !== expectedCurrency) {
      console.warn('[FLW] currency mismatch: expected', expectedCurrency, 'got', result.data.currency)
      return false
    }
    // Allow small rounding tolerance (1 unit) but reject meaningful amount mismatch
    if (Math.abs(result.data.amount - expectedAmount) > 1) {
      console.warn('[FLW] amount mismatch: expected', expectedAmount, 'got', result.data.amount)
      return false
    }
    return true
  } catch (err) {
    console.warn('[FLW] verification failed:', (err as Error).message)
    return false
  }
}

export async function POST(req: NextRequest) {
  const hash = req.headers.get('verif-hash')

  // P13: support both FLUTTERWAVE_WEBHOOK_HASH (code) and FLW_WEBHOOK_SECRET (.env.example)
  const expectedHash = process.env.FLUTTERWAVE_WEBHOOK_HASH ?? process.env.FLW_WEBHOOK_SECRET
  if (!hash || !expectedHash || hash !== expectedHash) {
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

      // M-5: Idempotency guard — prevent duplicate lifecycle processing.
      // Use data.id (Flutterwave's unique transaction ID) as the idempotency key.
      const providerPaymentId = String(data.id)

      // Server-side verification: confirm the transaction is genuine on Flutterwave's servers.
      // The static verif-hash header cannot authenticate body content — this call does.
      const verified = await verifyFlutterwaveTransaction(
        providerPaymentId,
        typeof data.amount === 'number' ? data.amount : 0,
        (data.currency as string | undefined)?.toUpperCase() ?? 'NGN',
      )
      if (!verified) {
        console.warn('[FLW] server-side verification failed for tx', providerPaymentId)
        return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
      }
      const existingPayment = await prisma.paymentLink.findUnique({
        where: { txRef: providerPaymentId },
        select: { status: true },
      })
      if (existingPayment?.status === 'paid') {
        console.log('[Flutterwave] Duplicate event ignored for', providerPaymentId)
        return NextResponse.json({ status: 'ok' })
      }
      // Record this payment before processing lifecycle — idempotency sentinel
      await prisma.paymentLink.upsert({
        where: { txRef: providerPaymentId },
        create: {
          txRef:       providerPaymentId,
          type:        'flutterwave',
          provider:    'flutterwave',
          status:      'paid',
          amount:      typeof data.amount === 'number' ? data.amount : 0,
          currency:    (data.currency as string | undefined)?.toUpperCase() ?? 'NGN',
          paidAt:      new Date(),
          description: `Flutterwave charge ${providerPaymentId}`,
        },
        update: { status: 'paid', paidAt: new Date() },
      })

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
