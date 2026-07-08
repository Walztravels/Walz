import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'

const FROM   = process.env.RESEND_FROM ?? 'Walz Travels <alerts@walztravels.com>'

const DUFFEL_TOKEN  = process.env.DUFFEL_ACCESS_TOKEN
const DUFFEL_BASE   = 'https://api.duffel.com'
const PRICE_DROP_THRESHOLD = 0.10 // 10%

async function fetchLowestDuffelPrice(
  origin:      string,
  destination: string,
  cabinClass:  string,
): Promise<number | null> {
  if (!DUFFEL_TOKEN) return null
  try {
    // Create offer request for next 30 days, one adult
    const sliceDate = new Date()
    sliceDate.setDate(sliceDate.getDate() + 30)
    const departureDateStr = sliceDate.toISOString().split('T')[0]

    const res = await fetch(`${DUFFEL_BASE}/air/offer_requests`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${DUFFEL_TOKEN}`,
        'Content-Type':  'application/json',
        'Duffel-Version': 'v2',
        'Accept':        'application/json',
      },
      body: JSON.stringify({
        data: {
          slices: [{ origin, destination, departure_date: departureDateStr }],
          passengers: [{ type: 'adult' }],
          cabin_class: cabinClass,
          return_offers: true,
        },
      }),
    })

    if (!res.ok) return null
    const json = await res.json() as { data?: { offers?: Array<{ total_amount: string }> } }
    const offers = json.data?.offers ?? []
    if (offers.length === 0) return null

    const prices = offers.map(o => parseFloat(o.total_amount)).filter(p => !isNaN(p))
    return prices.length > 0 ? Math.min(...prices) : null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent public triggering
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const alerts = await prisma.flightAlert.findMany({
    where: { active: true, alertSent: false },
  })

  let checked = 0
  let notified = 0

  for (const alert of alerts) {
    const livePrice = await fetchLowestDuffelPrice(alert.origin, alert.destination, alert.cabinClass)
    if (livePrice === null) continue
    checked++

    // Update current price + lastChecked
    await prisma.flightAlert.update({
      where: { id: alert.id },
      data:  { currentPrice: livePrice, lastChecked: new Date() },
    })

    const prevPrice    = alert.currentPrice ? parseFloat(String(alert.currentPrice)) : null
    const targetPrice  = alert.targetPrice  ? parseFloat(String(alert.targetPrice))  : null

    // Trigger if: price dropped 10%+ from previous observed price, OR price is at/below user's target
    const droppedFromPrev = prevPrice && livePrice <= prevPrice * (1 - PRICE_DROP_THRESHOLD)
    const hitTarget       = targetPrice && livePrice <= targetPrice

    if (!droppedFromPrev && !hitTarget) continue

    // Send price drop email
    try {
      await getResend().emails.send({
        from:    FROM,
        to:      alert.email,
        subject: `🚨 Price drop! ${alert.origin} → ${alert.destination} — £${livePrice.toFixed(0)} now`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9f9f9;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.06)">
    <div style="background:#0B1F3A;padding:28px 32px">
      <p style="color:#C9A84C;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 6px">Walz Travels · Price Alert</p>
      <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0">Price just dropped! ✈️</h1>
    </div>
    <div style="padding:28px 32px">
      <p style="color:#374151;font-size:15px;margin:0 0 20px">
        Hi${alert.name ? ` ${alert.name}` : ''},<br><br>
        We spotted a price drop on your watched route — book now before it goes back up.
      </p>
      <div style="background:#FEFCE8;border:1px solid #FEF08A;border-radius:12px;padding:20px;margin:0 0 20px;text-align:center">
        <p style="color:#92400E;font-size:32px;font-weight:800;margin:0 0 4px">£${livePrice.toFixed(0)}</p>
        <p style="color:#0B1F3A;font-size:15px;font-weight:700;margin:0">${alert.origin} → ${alert.destination}</p>
        ${prevPrice ? `<p style="color:#9CA3AF;font-size:12px;margin:8px 0 0">Previously ~£${prevPrice.toFixed(0)} · ${Math.round((1 - livePrice/prevPrice) * 100)}% drop</p>` : ''}
        ${targetPrice ? `<p style="color:#22C55E;font-size:12px;font-weight:700;margin:4px 0 0">✅ Below your target of £${targetPrice.toFixed(0)}</p>` : ''}
      </div>
      <a href="https://walztravels.com/flights" style="display:block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:15px;text-decoration:none;padding:14px 24px;border-radius:10px;text-align:center">
        Book This Flight Now →
      </a>
      <p style="color:#9CA3AF;font-size:11px;margin:16px 0 0;text-align:center">
        Or call us: +1 984-388-0110 · WhatsApp: +12317902336<br>
        To stop alerts for this route, reply "STOP" to this email.
      </p>
    </div>
  </div>
</body>
</html>`,
      })
      // Mark alert as sent so we don't spam
      await prisma.flightAlert.update({
        where: { id: alert.id },
        data:  { alertSent: true },
      })
      notified++
    } catch (emailErr) {
      console.error(`[cron/flight-prices] email failed for alert ${alert.id}:`, emailErr)
    }
  }

  return NextResponse.json({ success: true, checked, notified, total: alerts.length })
}
