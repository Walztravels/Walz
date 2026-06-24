import { NextRequest, NextResponse }    from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { getSupabaseAdmin }            from '@/lib/supabase'
import { getResend }                   from '@/lib/resend'

const ADMIN_EMAIL = 'contact@walztravels.com'

export async function POST(req: NextRequest) {
  try {
    const body      = await req.text()
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

    const expected   = createHmac('sha256', secret).update(body).digest('base64')
    const sigBuf     = Buffer.from(signature)
    const expectedBuf = Buffer.from(expected)

    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      console.error('[duffel-webhook] Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event: { type: string; data: { object: any } } = JSON.parse(body)
    const { type, data } = event

    console.log('[duffel-webhook]', type, data?.object?.id ?? '')

    const supabase = getSupabaseAdmin()

    switch (type) {

      case 'order.created': {
        const order = data.object
        await supabase
          .from('FlightBooking')
          .update({ status: 'booking_placed', updatedAt: new Date().toISOString() })
          .eq('duffelOrderId', order.id)
        break
      }

      case 'order.airline_initiated_change': {
        const order = data.object
        await supabase
          .from('FlightBooking')
          .update({ status: 'change_pending', updatedAt: new Date().toISOString() })
          .eq('duffelOrderId', order.id)
        await notifyAdmin(order, 'Airline change proposed', `
          <p>The airline has proposed a change to this booking.</p>
          <p><strong>Booking:</strong> ${order.booking_reference ?? order.id}</p>
          <p>Login to the Duffel dashboard to accept or reject it.</p>
        `)
        break
      }

      case 'order.airline_initiated_change.accepted': {
        const order = data.object
        await supabase
          .from('FlightBooking')
          .update({ status: 'booking_placed', updatedAt: new Date().toISOString() })
          .eq('duffelOrderId', order.id)
        break
      }

      case 'order.airline_initiated_change.rejected': {
        const order = data.object
        await supabase
          .from('FlightBooking')
          .update({ status: 'booking_placed', updatedAt: new Date().toISOString() })
          .eq('duffelOrderId', order.id)
        await notifyAdmin(order, 'Airline change rejected', `
          <p>The airline change for booking ${order.booking_reference ?? order.id} has been rejected.</p>
        `)
        break
      }

      case 'order.cancelled': {
        const order = data.object
        await supabase
          .from('FlightBooking')
          .update({ status: 'cancelled', updatedAt: new Date().toISOString() })
          .eq('duffelOrderId', order.id)
        await notifyAdmin(order, 'Order cancelled by airline', `
          <p>Booking ${order.booking_reference ?? order.id} has been cancelled by the airline.</p>
          <p>Contact the client and arrange a refund if necessary.</p>
        `)
        break
      }

      case 'ping':
        console.log('[duffel-webhook] Ping received')
        break

      default:
        console.log('[duffel-webhook] Unhandled:', type)
    }

    // Always 200 — Duffel retries on non-2xx
    return NextResponse.json({ received: true })

  } catch (err) {
    console.error('[duffel-webhook] Error:', err)
    return NextResponse.json({ received: true })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Duffel webhook active', endpoint: '/api/webhooks/duffel' })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyAdmin(order: any, subject: string, body: string) {
  try {
    const resend = getResend()
    await resend.emails.send({
      from:    'Walz System <system@walztravels.com>',
      to:      ADMIN_EMAIL,
      subject: `⚠ Duffel: ${subject} — ${order.booking_reference ?? order.id}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;">
          <div style="background:#0B1F3A;padding:16px 20px;border-radius:8px 8px 0 0;">
            <h2 style="color:#C9A84C;margin:0;">Duffel Alert</h2>
          </div>
          <div style="padding:20px;border:1px solid #e5e7eb;border-top:none;">
            ${body}
            <p style="margin-top:20px;">
              <a href="https://walztravels.com/admin/flight-bookings"
                 style="background:#C9A84C;color:#0B1F3A;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">
                Open Flight Bookings →
              </a>
            </p>
          </div>
        </div>
      `,
    })
  } catch (e) {
    console.warn('[duffel-webhook] Admin notify failed:', e)
  }
}
