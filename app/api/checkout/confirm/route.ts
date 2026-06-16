import { NextRequest, NextResponse } from 'next/server'
import { stripe }  from '@/lib/stripe'
import { Resend }  from 'resend'
import prisma      from '@/lib/db'

const resend = new Resend(process.env.RESEND_API_KEY)

function generateRef() {
  return 'WLZ-' + Math.random().toString(36).slice(2, 8).toUpperCase()
}

export async function POST(req: NextRequest) {
  const { sessionId, gateway, txRef } = await req.json()

  const bookingReference = generateRef()
  let customerEmail = ''
  let customerName  = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items: any[]  = []

  try {
    if (gateway !== 'flutterwave' && sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      customerEmail = session.customer_details?.email ?? ''
      customerName  = session.customer_details?.name  ?? ''
      items         = JSON.parse(session.metadata?.items ?? '[]')
    }

    // Save to DB (silent fail — enum mismatches won't crash the response)
    await prisma.booking.create({
      data: {
        bookingReference,
        type:          'ACTIVITY' as never,
        status:        'CONFIRMED' as never,
        paymentStatus: 'SUCCEEDED' as never,
        totalAmount:   0,
        currency:      'USD',
        contactEmail:  customerEmail || 'unknown@walztravels.com',
      },
    }).catch(e => console.error('[Cart Booking DB]', e))

    // Send confirmation email
    if (customerEmail) {
      await resend.emails.send({
        from:    'Walz Travels <bookings@walztravels.com>',
        to:      customerEmail,
        subject: `Booking Confirmed — ${bookingReference}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <img src="https://www.walztravels.com/walz-logo.png" width="120" alt="Walz Travels"
              style="margin-bottom:24px" />
            <h1 style="color:#0B1F3A;font-size:24px;margin-bottom:8px">Booking Confirmed! ✅</h1>
            <p style="color:#666;margin-bottom:24px">
              Thank you${customerName ? ` ${customerName}` : ''}. Your booking reference is:
            </p>
            <div style="background:#F5F0E8;border-radius:12px;padding:16px;text-align:center;margin-bottom:24px">
              <span style="font-family:monospace;font-size:28px;font-weight:bold;color:#C9A84C">
                ${bookingReference}
              </span>
            </div>
            ${items.length > 0 ? `
              <h3 style="color:#0B1F3A;margin-bottom:12px">Your Bookings:</h3>
              ${items.map((i: { title: string; type: string }) => `
                <div style="border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:8px">
                  <strong>${i.title}</strong>
                  <span style="color:#666;font-size:14px"> (${i.type})</span>
                </div>
              `).join('')}
            ` : ''}
            <p style="color:#666;margin-top:24px;font-size:14px">
              Your vouchers will be sent separately. For questions, WhatsApp us on
              <strong>+44 7398 753797</strong> or email
              <a href="mailto:contact@walztravels.com">contact@walztravels.com</a>
            </p>
            <p style="color:#999;font-size:12px;margin-top:32px">Walz Travels — walztravels.com</p>
          </div>
        `,
      }).catch(e => console.error('[Cart Email send]', e))
    }

    console.log('[Cart confirm]', { bookingReference, customerEmail, gateway, txRef })
    return NextResponse.json({ bookingReference, customerEmail })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Cart confirm]', msg)
    return NextResponse.json({ bookingReference, error: msg })
  }
}
