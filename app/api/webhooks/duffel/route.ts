import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()

    const signature = req.headers.get('x-duffel-signature')

    if (!signature) {
      console.error('[duffel-webhook] No signature')
      return NextResponse.json({ error: 'No signature' }, { status: 401 })
    }

    const secret = process.env.DUFFEL_WEBHOOK_SECRET
    if (!secret) {
      console.error('[duffel-webhook] No secret configured')
      return NextResponse.json({ error: 'Misconfigured' }, { status: 500 })
    }

    // Verify HMAC-SHA256 signature
    const hmac = createHmac('sha256', secret)
    hmac.update(body)
    const expectedSig = hmac.digest('base64')

    // Timing-safe comparison prevents timing attacks
    const sigBuffer      = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expectedSig)

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      console.error('[duffel-webhook] Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event: { type: string; data: { object: any } } = JSON.parse(body)
    const { type, data } = event

    console.log('[duffel-webhook] Event:', type)

    switch (type) {

      case 'order.created': {
        const order = data.object
        await supabase
          .from('FlightBooking')
          .update({
            duffelOrderId: order.id,
            status: 'confirmed',
            updatedAt: new Date().toISOString(),
          })
          .eq('duffelOrderId', order.id)
        break
      }

      case 'order.airline_initiated_change': {
        const order = data.object
        await notifyChange(order, 'airline_change')
        break
      }

      case 'order.airline_initiated_change.accepted': {
        const order = data.object
        await supabase
          .from('FlightBooking')
          .update({
            status: 'change_accepted',
            updatedAt: new Date().toISOString(),
          })
          .eq('duffelOrderId', order.id)
        break
      }

      case 'order.airline_initiated_change.rejected': {
        const order = data.object
        await notifyChange(order, 'change_rejected')
        break
      }

      case 'order.cancelled': {
        const order = data.object
        await supabase
          .from('FlightBooking')
          .update({
            status: 'cancelled',
            updatedAt: new Date().toISOString(),
          })
          .eq('duffelOrderId', order.id)
        await notifyChange(order, 'cancelled')
        break
      }

      case 'ping':
        console.log('[duffel-webhook] Ping received')
        break

      default:
        console.log('[duffel-webhook] Unhandled event type:', type)
    }

    // Always 200 — Duffel retries on non-2xx
    return NextResponse.json({ received: true })

  } catch (err) {
    console.error('[duffel-webhook] Error:', err)
    // Return 200 to prevent Duffel retry loop on malformed payloads
    return NextResponse.json({ received: true })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Duffel webhook active',
    endpoint: '/api/webhooks/duffel',
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyChange(order: any, changeType: string) {
  console.log(`[duffel-webhook] ${changeType}:`, {
    orderId: order.id,
    bookingRef: order.booking_reference,
  })

  await supabase
    .from('FlightBooking')
    .update({
      status: changeType,
      updatedAt: new Date().toISOString(),
    })
    .eq('duffelOrderId', order.id)
}
