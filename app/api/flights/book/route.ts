import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin }          from '@/lib/supabase'
import { getResend }                 from '@/lib/resend'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FROM       = 'Walz Travels <bookings@walztravels.com>'
const ADMIN_FROM = 'Walz System <system@walztravels.com>'
const ADMIN_TO   = 'contact@walztravels.com'

function generateRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const rand  = Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
  return `WLZ-${rand}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      offerId, offerExpiresAt,
      clientName, clientEmail, clientPhone,
      passengers,
      paymentRef, paymentMethod, paidAmount, quotedAmount, currency,
      searchedOrigin, searchedDest, departDate, returnDate,
      cabinClass, tripType,
    } = body

    if (!clientEmail || !offerId) {
      return NextResponse.json({ error: 'Missing required fields: clientEmail, offerId' }, { status: 400 })
    }

    const reference = generateRef()
    const supabase  = getSupabaseAdmin()

    const { data: booking, error } = await supabase
      .from('FlightBooking')
      .insert({
        reference,
        status:         'pending_review',
        clientName:     clientName     ?? null,
        clientEmail,
        clientPhone:    clientPhone    ?? null,
        offerId,
        offerExpiresAt: offerExpiresAt ?? null,
        passengers:     passengers     ?? [],
        quotedAmount:   quotedAmount   ?? paidAmount ?? null,
        paidAmount:     paidAmount     ?? null,
        currency:       currency       ?? 'GBP',
        paymentMethod:  paymentMethod  ?? null,
        paymentRef:     paymentRef     ?? null,
        paidAt:         new Date().toISOString(),
        searchedOrigin: searchedOrigin ?? null,
        searchedDest:   searchedDest   ?? null,
        departDate:     departDate     ?? null,
        returnDate:     returnDate     ?? null,
        cabinClass:     cabinClass     ?? 'economy',
        tripType:       tripType       ?? 'one_way',
      })
      .select('id, reference, status')
      .single()

    if (error) {
      console.error('[flights/book] Supabase insert error:', error)
      return NextResponse.json({ error: 'Failed to save booking. Please try again.' }, { status: 500 })
    }

    // Await both emails before responding — Vercel terminates the Node process
    // after the response is sent, so fire-and-forget risks the client email
    // being cut off. allSettled() ensures both finish without failing the booking.
    const [adminRes, clientRes] = await Promise.allSettled([
      sendAdminEmail(booking, {
        clientName, clientEmail, clientPhone,
        searchedOrigin, searchedDest, departDate,
        cabinClass, paidAmount, currency, paymentRef, paymentMethod, offerExpiresAt,
      }),
      sendClientHoldingEmail(booking, {
        clientName, clientEmail, searchedOrigin, searchedDest, departDate,
      }),
    ])
    if (adminRes.status  === 'rejected') console.error('[flights/book] Admin email failed:', adminRes.reason)
    if (clientRes.status === 'rejected') console.error('[flights/book] Client email failed:', clientRes.reason)

    return NextResponse.json({
      success:   true,
      reference: booking.reference,
      bookingId: booking.id,
      status:    'pending_review',
      message:   'Booking received. Your ticket will be confirmed within 2 hours.',
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[flights/book]', msg)
    return NextResponse.json({ error: 'Booking failed. Please try again.' }, { status: 500 })
  }
}

async function sendAdminEmail(
  booking: { id: string; reference: string },
  data: Record<string, string | null | undefined>,
) {
  const resend = getResend()
  const {
    clientName, clientEmail, clientPhone,
    searchedOrigin, searchedDest, departDate,
    cabinClass, paidAmount, currency, paymentRef, paymentMethod, offerExpiresAt,
  } = data

  const expiryText = offerExpiresAt
    ? new Date(offerExpiresAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })
    : 'No expiry info'

  await resend.emails.send({
    from:    ADMIN_FROM,
    to:      ADMIN_TO,
    subject: `🔔 New Flight Booking — ${booking.reference} — ${currency ?? 'GBP'} ${paidAmount ?? '?'}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;">
        <div style="background:#0B1F3A;padding:20px;border-radius:8px 8px 0 0;">
          <h2 style="color:#C9A84C;margin:0;">New Flight Booking</h2>
          <p style="color:white;margin:4px 0 0;font-size:14px;">${booking.reference}</p>
        </div>
        <div style="background:#FFF9E6;border:1px solid #F59E0B;padding:12px 20px;font-size:14px;color:#92400E;">
          ⏱ Offer expires: ${expiryText} — place on Duffel before this expires!
        </div>
        <div style="padding:20px;border:1px solid #e5e7eb;border-top:none;">
          <table style="width:100%;font-size:14px;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#6b7280;width:150px;">Client</td><td style="font-weight:bold;">${clientName ?? 'Not provided'}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Email</td><td>${clientEmail}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Phone</td><td>${clientPhone ?? 'Not provided'}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Route</td><td style="font-weight:bold;">${searchedOrigin ?? '?'} → ${searchedDest ?? '?'}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Depart</td><td>${departDate ?? '?'}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Cabin</td><td style="text-transform:capitalize;">${cabinClass ?? 'Economy'}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Paid</td><td style="font-size:18px;font-weight:bold;color:#0B1F3A;">${currency ?? 'GBP'} ${paidAmount ?? '?'}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Method</td><td>${paymentMethod ?? 'Unknown'}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Payment ref</td><td style="font-family:monospace;font-size:12px;">${paymentRef ?? 'None'}</td></tr>
          </table>
          <div style="margin-top:20px;">
            <a href="https://walztravels.com/admin/flight-bookings/${booking.id}"
               style="background:#C9A84C;color:#0B1F3A;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
              Review &amp; Place Booking →
            </a>
          </div>
        </div>
      </div>
    `,
  })
}

async function sendClientHoldingEmail(
  booking: { reference: string },
  data: Record<string, string | null | undefined>,
) {
  const resend    = getResend()
  const { clientName, clientEmail, searchedOrigin, searchedDest, departDate } = data
  const firstName = (clientName ?? 'Traveller').split(' ')[0]

  await resend.emails.send({
    from:    FROM,
    to:      clientEmail!,
    subject: `✈ Booking Request Received — ${booking.reference}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#0B1F3A;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
          <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="130" style="display:block;margin:0 auto;height:auto;" />
        </div>
        <div style="padding:28px;background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
          <h2 style="color:#0B1F3A;font-size:20px;margin:0 0 16px;">Hi ${firstName},</h2>
          <p style="color:#4b5563;line-height:1.6;">We've received your flight booking request for
            <strong>${searchedOrigin ?? 'Origin'} → ${searchedDest ?? 'Destination'}</strong>
            on <strong>${departDate ?? 'your selected date'}</strong>.</p>

          <div style="background:white;border:2px solid #C9A84C;border-radius:8px;padding:16px;margin:20px 0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Your Booking Reference</p>
            <p style="margin:6px 0;font-size:30px;font-weight:bold;color:#0B1F3A;letter-spacing:4px;font-family:monospace;">${booking.reference}</p>
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
}
