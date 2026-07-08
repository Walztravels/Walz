import { NextRequest, NextResponse } from 'next/server'
import { getResend } from '@/lib/resend'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { bookingRef, clientName, clientEmail, origin, dest, departDate } = await req.json()

    if (!clientEmail || !bookingRef) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const resend    = getResend()
    const firstName = (clientName ?? 'Traveller').split(' ')[0]

    await resend.emails.send({
      from:    'Walz Travels <bookings@walztravels.com>',
      to:      clientEmail,
      subject: `✈ Booking Request Received — ${bookingRef}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
          <div style="background:#0B1F3A;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
            <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="130" style="display:block;margin:0 auto;height:auto;" />
          </div>
          <div style="padding:28px;background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            <h2 style="color:#0B1F3A;font-size:20px;margin:0 0 16px;">Hi ${firstName},</h2>
            <p style="color:#4b5563;line-height:1.6;">We've received your flight booking request for
              <strong>${origin ?? 'Origin'} → ${dest ?? 'Destination'}</strong>
              on <strong>${departDate ?? 'your selected date'}</strong>.</p>

            <div style="background:white;border:2px solid #C9A84C;border-radius:8px;padding:16px;margin:20px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Your Booking Reference</p>
              <p style="margin:6px 0;font-size:30px;font-weight:bold;color:#0B1F3A;letter-spacing:4px;font-family:monospace;">${bookingRef}</p>
            </div>

            <p style="color:#4b5563;line-height:1.6;">
              Our team is verifying your payment and will confirm your ticket within <strong>2 business hours</strong>.
              You'll receive your e-ticket by email as soon as it's issued.
            </p>

            <a href="https://wa.me/12317902336" style="display:inline-block;background:#25D366;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:8px;">
              WhatsApp +1 231 790 2336
            </a>

            <p style="color:#9ca3af;font-size:13px;margin-top:28px;">The Walz Travels Team<br>bookings@walztravels.com</p>
          </div>
        </div>
      `,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[flights/resend-confirmation]', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
