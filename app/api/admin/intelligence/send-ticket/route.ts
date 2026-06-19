import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

const FROM = 'Walz Travels <noreply@walztravels.com>'

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

// ─── Flight details shape (mirrors frontend) ──────────────────────────────────
interface FlightDetails {
  airline:      string
  airlineCode?: string
  flightNumber: string
  fromCode:     string
  fromCity:     string
  toCode:       string
  toCity:       string
  departureAt:  string
  arrivalAt:    string
  duration:     string
  stops:        number
  cabin:        string
  baggage:      string
  price?:       string
  seat:         string
  pnr:          string
}

// ─── HTML email builders ──────────────────────────────────────────────────────

function flightEmailHtml(flight: FlightDetails, clientName: string): string {
  const depDate = new Date(flight.departureAt).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })
  const depTime = new Date(flight.departureAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  const arrDate = new Date(flight.arrivalAt).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })
  const arrTime = new Date(flight.arrivalAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Flight Itinerary — Walz Travels</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:#0B1F3A;padding:28px 32px;text-align:center;">
    <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="120" style="display:block;margin:0 auto 12px;height:auto;" />
    <div style="color:#C9A84C;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Flight Itinerary</div>
    <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:6px;">Your booking is confirmed</div>
  </td></tr>

  <!-- Greeting -->
  <tr><td style="padding:28px 32px 8px;">
    <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">
      Dear ${clientName || 'Valued Traveller'},
    </p>
    <p style="margin:12px 0 0;color:#6B7280;font-size:14px;line-height:1.6;">
      Please find your flight itinerary below and attached as a PDF. Show this at check-in and keep it for your records.
    </p>
  </td></tr>

  <!-- Route banner -->
  <tr><td style="padding:20px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;">
      <tr>
        <td width="40%" style="text-align:left;">
          <div style="font-size:36px;font-weight:900;color:#0B1F3A;letter-spacing:-1px;">${flight.fromCode}</div>
          <div style="font-size:13px;color:#6B7280;margin-top:2px;">${flight.fromCity}</div>
          <div style="font-size:14px;font-weight:700;color:#374151;margin-top:6px;">${depDate}</div>
          <div style="font-size:20px;font-weight:700;color:#0B1F3A;">${depTime}</div>
        </td>
        <td width="20%" style="text-align:center;">
          <div style="color:#C9A84C;font-size:22px;">✈</div>
          <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">${flight.duration}</div>
          <div style="font-size:10px;color:#9CA3AF;">${flight.stops === 0 ? 'Direct' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}</div>
        </td>
        <td width="40%" style="text-align:right;">
          <div style="font-size:36px;font-weight:900;color:#0B1F3A;letter-spacing:-1px;">${flight.toCode}</div>
          <div style="font-size:13px;color:#6B7280;margin-top:2px;">${flight.toCity}</div>
          <div style="font-size:14px;font-weight:700;color:#374151;margin-top:6px;">${arrDate}</div>
          <div style="font-size:20px;font-weight:700;color:#0B1F3A;">${arrTime}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Booking details table -->
  <tr><td style="padding:0 32px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${[
        ['Airline',       flight.airline],
        ['Flight Number', flight.flightNumber],
        ['Cabin Class',   flight.cabin],
        ['Seat',          flight.seat],
        ['PNR Reference', flight.pnr],
        ['Baggage',       flight.baggage],
        ...(flight.price ? [['Price', flight.price]] : []),
      ].map(([label, value], i) => `
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px 0;font-size:13px;color:#9CA3AF;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${label}</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${value}</td>
      </tr>`).join('')}
    </table>
  </td></tr>

  <!-- Important notice -->
  <tr><td style="padding:0 32px 24px;">
    <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:14px 16px;">
      <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5;">
        <strong>Important:</strong> Please arrive at the airport at least 3 hours before departure for international flights.
        Ensure your passport is valid for at least 6 months beyond your travel dates.
        The PDF itinerary is attached to this email for your records.
      </p>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f8fafc;padding:24px 32px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.6;text-align:center;">
      Need help? Contact us:
    </p>
    <div style="text-align:center;margin-top:10px;">
      <a href="https://wa.me/447000000000" style="display:inline-block;background:#25D366;color:#ffffff;font-size:13px;font-weight:700;padding:8px 20px;border-radius:6px;text-decoration:none;margin:0 6px;">
        WhatsApp Us
      </a>
      <a href="mailto:contact@walztravels.com" style="display:inline-block;background:#0B1F3A;color:#ffffff;font-size:13px;font-weight:700;padding:8px 20px;border-radius:6px;text-decoration:none;margin:0 6px;">
        Email Us
      </a>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#9CA3AF;text-align:center;">
      © ${new Date().getFullYear()} Walz Travels · <a href="https://walztravels.com" style="color:#C9A84C;text-decoration:none;">walztravels.com</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

function hotelEmailHtml(ticketData: Record<string, unknown>, clientName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hotel Voucher — Walz Travels</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:#0B1F3A;padding:28px 32px;text-align:center;">
    <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="120" style="display:block;margin:0 auto 12px;height:auto;" />
    <div style="color:#C9A84C;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Hotel Voucher</div>
    <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:6px;">Your accommodation is confirmed</div>
  </td></tr>

  <!-- Greeting -->
  <tr><td style="padding:28px 32px 8px;">
    <p style="margin:0;color:#374151;font-size:15px;">Dear ${clientName || 'Valued Traveller'},</p>
    <p style="margin:12px 0 0;color:#6B7280;font-size:14px;line-height:1.6;">
      Please find your hotel voucher below and attached as a PDF. Present this at check-in.
    </p>
  </td></tr>

  <!-- Hotel details -->
  <tr><td style="padding:20px 32px;">
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;">
      <div style="font-size:20px;font-weight:800;color:#0B1F3A;">${ticketData.hotel_name ?? 'Hotel'}</div>
      <div style="font-size:13px;color:#6B7280;margin-top:4px;">${ticketData.hotel_address ?? ''}</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-collapse:collapse;">
        ${[
          ['Check-in',    `${ticketData.checkin_date ?? ''} at ${ticketData.checkin_time ?? '14:00'}`],
          ['Check-out',   `${ticketData.checkout_date ?? ''} at ${ticketData.checkout_time ?? '12:00'}`],
          ['Nights',      String(ticketData.num_nights ?? '—')],
          ['Room Type',   String(ticketData.room_type ?? 'Standard Room')],
          ['Guests',      String(ticketData.num_guests ?? '1')],
          ['Confirmation', String(ticketData.confirmation_number ?? '—')],
        ].map(([label, value]) => `
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:9px 0;font-size:12px;color:#9CA3AF;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${label}</td>
          <td style="padding:9px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${value}</td>
        </tr>`).join('')}
      </table>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f8fafc;padding:24px 32px;border-top:1px solid #e5e7eb;">
    <div style="text-align:center;">
      <a href="https://wa.me/447000000000" style="display:inline-block;background:#25D366;color:#ffffff;font-size:13px;font-weight:700;padding:8px 20px;border-radius:6px;text-decoration:none;margin:0 6px;">WhatsApp Us</a>
      <a href="mailto:contact@walztravels.com" style="display:inline-block;background:#0B1F3A;color:#ffffff;font-size:13px;font-weight:700;padding:8px 20px;border-radius:6px;text-decoration:none;margin:0 6px;">Email Us</a>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#9CA3AF;text-align:center;">
      © ${new Date().getFullYear()} Walz Travels · <a href="https://walztravels.com" style="color:#C9A84C;text-decoration:none;">walztravels.com</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json() as {
      email:         string
      clientName?:   string
      mode:          'live' | 'manual' | 'hotel'
      pdf_base64:    string
      flightDetails?: FlightDetails
      ticketData?:   Record<string, unknown>
    }

    if (!body.email || !body.pdf_base64) {
      return NextResponse.json({ error: 'email and pdf_base64 are required' }, { status: 400 })
    }

    const resend = getResend()
    if (!resend) {
      return NextResponse.json({ error: 'Email service not configured (RESEND_API_KEY missing)' }, { status: 503 })
    }

    const pdfBuffer  = Buffer.from(body.pdf_base64, 'base64')
    const isHotel    = body.mode === 'hotel'
    const clientName = body.clientName ?? 'Valued Traveller'

    const subject    = isHotel
      ? 'Your Hotel Voucher — Walz Travels'
      : 'Your Flight Itinerary — Walz Travels'
    const filename   = isHotel ? 'walz-hotel-voucher.pdf' : 'walz-flight-itinerary.pdf'
    const html       = isHotel
      ? hotelEmailHtml(body.ticketData ?? {}, clientName)
      : flightEmailHtml(body.flightDetails!, clientName)

    const result = await resend.emails.send({
      from:        FROM,
      to:          [body.email],
      subject,
      html,
      attachments: [
        {
          filename,
          content: pdfBuffer,
        },
      ],
    })

    if (result.error) {
      console.error('[send-ticket]', result.error)
      return NextResponse.json({ error: result.error.message ?? 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, messageId: result.data?.id })
  } catch (e) {
    console.error('[send-ticket]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
