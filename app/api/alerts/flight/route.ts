import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'

const FROM   = process.env.RESEND_FROM ?? 'Walz Travels <alerts@walztravels.com>'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      email:        string
      name?:        string
      origin:       string
      destination:  string
      targetPrice?: number | null
      currency?:    string
      cabinClass?:  string
    }

    const { email, name, origin, destination, targetPrice, currency = 'GBP', cabinClass = 'economy' } = body

    if (!email || !origin || !destination) {
      return NextResponse.json({ error: 'email, origin, and destination are required' }, { status: 400 })
    }

    // Upsert: if same alert already exists for this email+route, re-activate it
    const existing = await prisma.flightAlert.findFirst({
      where: { email, origin: origin.toUpperCase(), destination: destination.toUpperCase(), active: true },
    })

    if (existing) {
      return NextResponse.json({ success: true, alertId: existing.id, reactivated: false })
    }

    const alert = await prisma.flightAlert.create({
      data: {
        email,
        name:        name || null,
        origin:      origin.toUpperCase(),
        destination: destination.toUpperCase(),
        targetPrice: targetPrice ?? null,
        currency,
        cabinClass,
        active:      true,
        alertSent:   false,
      },
    })

    // Confirmation email
    try {
      await getResend().emails.send({
        from:    FROM,
        to:      email,
        subject: `✈️ Price alert set — ${origin.toUpperCase()} → ${destination.toUpperCase()}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9f9f9;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.06)">
    <div style="background:#0B1F3A;padding:28px 32px">
      <p style="color:#C9A84C;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 6px">Walz Travels</p>
      <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0">Price Alert Confirmed 🔔</h1>
    </div>
    <div style="padding:28px 32px">
      <p style="color:#374151;font-size:15px;margin:0 0 20px">
        Hi${name ? ` ${name}` : ''},<br><br>
        Your price alert is set. We&apos;ll email you the moment we spot a significant price drop on this route.
      </p>
      <div style="background:#F8F8F8;border-radius:12px;padding:20px;margin:0 0 20px">
        <p style="color:#6B7280;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:0 0 12px">Your Alert</p>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="color:#6B7280;font-size:13px;padding:4px 0">From</td>
            <td style="color:#0B1F3A;font-size:13px;font-weight:600;text-align:right">${origin.toUpperCase()}</td>
          </tr>
          <tr>
            <td style="color:#6B7280;font-size:13px;padding:4px 0">To</td>
            <td style="color:#0B1F3A;font-size:13px;font-weight:600;text-align:right">${destination.toUpperCase()}</td>
          </tr>
          <tr>
            <td style="color:#6B7280;font-size:13px;padding:4px 0">Cabin</td>
            <td style="color:#0B1F3A;font-size:13px;font-weight:600;text-align:right;text-transform:capitalize">${cabinClass}</td>
          </tr>
          ${targetPrice ? `<tr>
            <td style="color:#6B7280;font-size:13px;padding:4px 0">Your target</td>
            <td style="color:#C9A84C;font-size:13px;font-weight:700;text-align:right">£${targetPrice}</td>
          </tr>` : ''}
        </table>
      </div>
      <p style="color:#9CA3AF;font-size:12px;margin:0">
        We check prices every 6 hours. You&apos;ll only be notified when there&apos;s a 10%+ drop — no spam.
        To cancel this alert, reply to this email and we&apos;ll remove it immediately.
      </p>
    </div>
    <div style="background:#F3F4F6;padding:16px 32px;text-align:center">
      <a href="https://walztravels.com/flights" style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:13px;text-decoration:none;padding:10px 24px;border-radius:8px">Search Flights Now →</a>
    </div>
  </div>
</body>
</html>`,
      })
    } catch (emailErr) {
      console.error('[flight-alert] confirmation email failed:', emailErr)
    }

    return NextResponse.json({ success: true, alertId: alert.id })
  } catch (err) {
    console.error('[alerts/flight] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
