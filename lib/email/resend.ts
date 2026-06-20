const RESEND_API = 'https://api.resend.com'
const FROM       = 'Walz Travels <bookings@walztravels.com>'

interface EmailPayload {
  from:    string
  to:      string
  subject: string
  html:    string
}

async function send(payload: EmailPayload) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.log('[resend] No RESEND_API_KEY — email not sent:', payload.subject, '→', payload.to)
    return
  }
  const res = await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error('[resend] send failed:', res.status, body)
  }
}

export async function sendBookingConfirmationEmail({
  to, name, bookingRef, orderId,
}: { to: string; name: string; bookingRef: string; orderId: string }) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <title>Booking Confirmed — Walz Travels</title>
    </head>
    <body style="margin:0;padding:0;font-family:'DM Sans',system-ui,sans-serif;background:#F7F4EF;">
      <div style="max-width:600px;margin:0 auto;background:#fff;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#0B1F3A,#1C3557);padding:36px 40px 28px;text-align:center;">
          <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="160" style="display:block;margin:0 auto 10px;width:160px;height:auto;" />
          <p style="margin:0;color:#8B9BAE;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Luxury Travel Agency</p>
        </div>

        <!-- Success Banner -->
        <div style="background:linear-gradient(135deg,#C9A84C,#E8C97A);padding:24px 40px;text-align:center;">
          <h1 style="margin:0 0 4px;font-size:24px;color:#0B1F3A;font-weight:700;">Booking Confirmed!</h1>
          <p style="margin:0;color:#0F2340;font-size:14px;">Your adventure is officially booked.</p>
        </div>

        <!-- Booking Ref -->
        <div style="padding:32px 40px;border-bottom:1px solid #E2D9CC;">
          <p style="margin:0 0 8px;color:#8B9BAE;font-size:13px;">Hi ${name},</p>
          <p style="margin:0 0 20px;color:#1C3557;font-size:14px;line-height:1.6;">Thank you for booking with Walz Travels. Your booking is confirmed and we're getting everything ready for your journey.</p>
          <div style="background:#0B1F3A;border-radius:12px;padding:20px;text-align:center;">
            <p style="margin:0 0 4px;color:#8B9BAE;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Your Booking Reference</p>
            <p style="margin:0;color:#C9A84C;font-size:32px;font-weight:700;letter-spacing:8px;font-family:monospace;">${bookingRef}</p>
            <p style="margin:8px 0 0;color:#8B9BAE;font-size:12px;">Order ID: ${orderId}</p>
          </div>
        </div>

        <!-- What Next -->
        <div style="padding:32px 40px;">
          <h3 style="margin:0 0 16px;color:#0B1F3A;font-size:16px;">What happens next?</h3>
          <ul style="margin:0;padding-left:20px;color:#1C3557;line-height:2;">
            <li>Your e-ticket will be sent within 24 hours</li>
            <li>Check your spam folder if you don't receive it</li>
            <li>Ensure your passport is valid for at least 6 months</li>
            <li>Check visa requirements for your destination</li>
          </ul>
        </div>

        <!-- Footer -->
        <div style="padding:24px 40px;background:#F7F4EF;border-top:1px solid #E2D9CC;">
          <p style="margin:0 0 8px;color:#0B1F3A;font-weight:600;font-size:14px;">Need help?</p>
          <p style="margin:0;color:#8B9BAE;font-size:13px;">
            📧 <a href="mailto:info@walztravels.com" style="color:#C9A84C;text-decoration:none;">info@walztravels.com</a>&nbsp;&nbsp;
            📱 <a href="https://wa.me/447398753797" style="color:#C9A84C;text-decoration:none;">+44 7398 753797</a>
          </p>
        </div>
        <div style="padding:20px 40px;text-align:center;border-top:1px solid #E2D9CC;">
          <p style="margin:0;color:#8B9BAE;font-size:12px;">© ${new Date().getFullYear()} Walz Travels Ltd. All rights reserved. IATA Certified.</p>
        </div>
      </div>
    </body>
    </html>
  `

  await send({ from: FROM, to, subject: `Booking Confirmed — ${bookingRef} | Walz Travels`, html })
}

export async function sendMilesEarnedEmail({
  to, name, miles, bookingRef, totalMiles, tier,
}: { to: string; name: string; miles: number; bookingRef: string; totalMiles: number; tier: string }) {
  const tierColour: Record<string, string> = {
    bronze: '#CD7F32', silver: '#9BA4B5', gold: '#C9A84C', platinum: '#8B5CF6',
  }
  const colour = tierColour[tier.toLowerCase()] ?? '#C9A84C'
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase()

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <title>You earned Walz Miles!</title>
    </head>
    <body style="margin:0;padding:0;font-family:'DM Sans',system-ui,sans-serif;background:#F7F4EF;">
      <div style="max-width:600px;margin:0 auto;background:#fff;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#0B1F3A,#1C3557);padding:36px 40px 28px;text-align:center;">
          <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="160" style="display:block;margin:0 auto 10px;width:160px;height:auto;" />
        </div>

        <!-- Miles Banner -->
        <div style="background:linear-gradient(135deg,${colour},${colour}CC);padding:28px 40px;text-align:center;">
          <p style="margin:0 0 6px;color:#fff;font-size:14px;opacity:0.8;letter-spacing:1px;text-transform:uppercase;">Miles Earned</p>
          <p style="margin:0;color:#fff;font-size:48px;font-weight:700;line-height:1;">+${miles.toLocaleString()}</p>
          <p style="margin:8px 0 0;color:#fff;font-size:14px;opacity:0.9;">Walz Miles · ${tierLabel} Member</p>
        </div>

        <!-- Content -->
        <div style="padding:32px 40px;">
          <p style="margin:0 0 16px;color:#1C3557;font-size:14px;line-height:1.6;">
            Great news, ${name}! You've just earned <strong>${miles.toLocaleString()} Walz Miles</strong> on booking ${bookingRef}.
          </p>

          <!-- Balance Card -->
          <div style="background:#0B1F3A;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
            <p style="margin:0 0 4px;color:#8B9BAE;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Total Balance</p>
            <p style="margin:0;color:${colour};font-size:36px;font-weight:700;">${totalMiles.toLocaleString()}</p>
            <p style="margin:4px 0 0;color:#8B9BAE;font-size:13px;">Walz Miles · ${tierLabel} Tier</p>
          </div>

          <p style="margin:0;color:#8B9BAE;font-size:13px;line-height:1.6;">
            Redeem your miles on your next booking — 100 miles = £1 discount.
            <a href="https://walztravels.com/flights/loyalty" style="color:#C9A84C;text-decoration:none;">View your loyalty account →</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="padding:24px 40px;background:#F7F4EF;border-top:1px solid #E2D9CC;">
          <p style="margin:0;color:#8B9BAE;font-size:13px;">
            📧 <a href="mailto:info@walztravels.com" style="color:#C9A84C;text-decoration:none;">info@walztravels.com</a>&nbsp;&nbsp;
            📱 <a href="https://wa.me/447398753797" style="color:#C9A84C;text-decoration:none;">+44 7398 753797</a>
          </p>
        </div>
        <div style="padding:20px 40px;text-align:center;border-top:1px solid #E2D9CC;">
          <p style="margin:0;color:#8B9BAE;font-size:12px;">© ${new Date().getFullYear()} Walz Travels Ltd. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `

  await send({ from: FROM, to, subject: `You earned +${miles.toLocaleString()} Walz Miles! | Walz Travels`, html })
}
