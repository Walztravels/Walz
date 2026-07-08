import { Resend } from 'resend'

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set')
  return new Resend(process.env.RESEND_API_KEY)
}

const FROM  = 'Walz Travels <bookings@walztravels.com>'
const ADMIN = 'contact@walztravels.com'

const SERVICE_LABELS: Record<string, string> = {
  visa:   'Visa Application',
  flight: 'Flight Credit',
  tour:   'Tour Experience',
}

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
}

function header() {
  return `
  <div style="background:#ffffff;padding:24px 40px 16px;text-align:center;border-bottom:3px solid #C9A84C;">
    <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="200" height="200" style="display:block;margin:0 auto 12px;width:200px;height:auto;" />
    <p style="margin:6px 0 0;color:#0B1F3A;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Gift Voucher</p>
  </div>`
}

function footer() {
  return `
  <div style="background:#0B1F3A;padding:24px 40px;text-align:center;border-top:2px solid #C9A84C;">
    <p style="margin:0 0 8px;color:#8B9BAE;font-size:13px;">Need help redeeming your voucher?</p>
    <p style="margin:0;font-size:13px;">
      <a href="https://wa.me/12317902336" style="color:#C9A84C;text-decoration:none;font-weight:600;">💬 WhatsApp: +12317902336</a>
      &nbsp;&nbsp;|&nbsp;&nbsp;
      <a href="mailto:contact@walztravels.com" style="color:#C9A84C;text-decoration:none;font-weight:600;">✉️ contact@walztravels.com</a>
    </p>
    <p style="margin:16px 0 0;color:#4a5568;font-size:11px;">© ${new Date().getFullYear()} Walz Travels Ltd. All rights reserved.</p>
  </div>`
}

export async function sendVoucherEmail(data: {
  recipientName:   string
  recipientEmail:  string
  senderName:      string
  code:            string
  serviceType:     string
  amount:          number
  currency:        string
  tourName?:       string
  personalMessage?: string
  expiresAt:       Date
}) {
  const resend = getResend()
  const expiry = data.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const serviceLabel = data.tourName ?? SERVICE_LABELS[data.serviceType] ?? 'Travel'
  const value = fmt(data.amount, data.currency)

  const redeemInstructions: Record<string, string> = {
    visa:   'Present this code when booking your visa assistance service with Walz Travels. Our team will apply the credit to your invoice.',
    flight: 'Enter this code at checkout when booking any flight through Walz Travels. The credit will be applied to your total.',
    tour:   `Present this code when booking your ${serviceLabel} tour with Walz Travels. Our team will apply the full value to your booking.`,
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td>${header()}</td></tr>

        <!-- Greeting -->
        <tr><td style="padding:32px 40px 0;">
          <p style="margin:0;color:#0B1F3A;font-size:18px;font-weight:600;">Hello, ${data.recipientName}! 🎉</p>
          <p style="margin:12px 0 0;color:#4a5568;font-size:15px;line-height:1.6;">
            <strong>${data.senderName}</strong> has sent you a gift voucher for <strong>${serviceLabel}</strong> with Walz Travels.
          </p>
        </td></tr>

        ${data.personalMessage ? `
        <!-- Personal Message -->
        <tr><td style="padding:20px 40px 0;">
          <div style="background:#FFF8EC;border-left:4px solid #C9A84C;border-radius:8px;padding:16px 20px;">
            <p style="margin:0 0 4px;color:#C9A84C;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Personal Message</p>
            <p style="margin:0;color:#0B1F3A;font-size:14px;line-height:1.6;font-style:italic;">"${data.personalMessage}"</p>
          </div>
        </td></tr>` : ''}

        <!-- Voucher Card -->
        <tr><td style="padding:28px 40px;">
          <div style="background:linear-gradient(135deg,#0B1F3A,#1a3a5c);border-radius:16px;padding:32px;text-align:center;position:relative;">
            <p style="margin:0 0 6px;color:#C9A84C;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Gift Voucher</p>
            <p style="margin:0 0 16px;color:#fff;font-size:22px;font-weight:700;">${serviceLabel}</p>

            <div style="background:rgba(201,168,76,0.15);border:2px dashed #C9A84C;border-radius:12px;padding:20px;margin:0 0 20px;">
              <p style="margin:0 0 4px;color:#8B9BAE;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">Your Voucher Code</p>
              <p style="margin:0;color:#C9A84C;font-size:28px;font-weight:800;font-family:monospace;letter-spacing:3px;">${data.code}</p>
            </div>

            <div style="display:inline-block;background:rgba(201,168,76,0.2);border-radius:999px;padding:8px 20px;">
              <span style="color:#C9A84C;font-size:22px;font-weight:800;">${value}</span>
            </div>

            <p style="margin:16px 0 0;color:#8B9BAE;font-size:12px;">Valid until ${expiry}</p>
          </div>
        </td></tr>

        <!-- How to Redeem -->
        <tr><td style="padding:0 40px 28px;">
          <h2 style="margin:0 0 12px;color:#0B1F3A;font-size:16px;font-weight:700;">How to Redeem</h2>
          <p style="margin:0 0 16px;color:#4a5568;font-size:14px;line-height:1.7;">
            ${redeemInstructions[data.serviceType] ?? 'Contact our team with your voucher code to apply it to your booking.'}
          </p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <a href="https://wa.me/12317902336?text=Hi%2C%20I%20have%20a%20gift%20voucher%20code%3A%20${data.code}"
               style="display:inline-block;background:#25D366;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">
              💬 WhatsApp Us
            </a>
            <a href="https://walztravels.com"
               style="display:inline-block;background:#0B1F3A;color:#C9A84C;padding:12px 20px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">
              ✈️ Book at walztravels.com
            </a>
          </div>
        </td></tr>

        <!-- Terms -->
        <tr><td style="padding:0 40px 28px;">
          <div style="background:#F7F8FA;border-radius:10px;padding:16px 20px;">
            <p style="margin:0 0 8px;color:#0B1F3A;font-size:13px;font-weight:600;">Terms &amp; Conditions</p>
            <ul style="margin:0;padding:0 0 0 16px;color:#6b7280;font-size:12px;line-height:2;">
              <li>Valid for 12 months from date of issue — expires ${expiry}</li>
              <li>Not redeemable for cash</li>
              <li>Cannot be combined with other promotional offers</li>
              ${data.serviceType !== 'all' ? `<li>Applicable to ${serviceLabel} services only</li>` : ''}
              <li>Subject to availability at time of booking</li>
            </ul>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td>${footer()}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  await resend.emails.send({
    from:    FROM,
    to:      data.recipientEmail,
    subject: `🎁 You've received a ${value} Walz Travels gift voucher from ${data.senderName}!`,
    html,
  })
}

export async function sendTravelCreditEmail(data: {
  recipientName:   string
  recipientEmail:  string
  code:            string
  amount:          number
  currency:        string
  bookingReference: string
  expiresAt:       Date
}) {
  const resend = getResend()
  const expiry = data.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const value = fmt(data.amount, data.currency)

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td>
          <div style="background:#ffffff;padding:24px 40px 16px;text-align:center;border-bottom:3px solid #C9A84C;">
            <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="200" height="200" style="display:block;margin:0 auto 12px;width:200px;height:auto;" />
            <p style="margin:6px 0 0;color:#0B1F3A;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Travel Credit Voucher</p>
          </div>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:32px 40px 0;">
          <p style="margin:0;color:#0B1F3A;font-size:18px;font-weight:600;">Hello, ${data.recipientName}! 👋</p>
          <p style="margin:12px 0 0;color:#4a5568;font-size:15px;line-height:1.6;">
            We've issued you a <strong>Travel Credit Voucher</strong> following the cancellation of booking
            <strong style="font-family:monospace;">${data.bookingReference}</strong>.
            You can use this credit towards any future booking with Walz Travels.
          </p>
        </td></tr>

        <!-- Voucher Card -->
        <tr><td style="padding:28px 40px;">
          <div style="background:linear-gradient(135deg,#0B1F3A,#1a3a5c);border-radius:16px;padding:32px;text-align:center;">
            <p style="margin:0 0 6px;color:#C9A84C;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Travel Credit</p>
            <p style="margin:0 0 16px;color:#fff;font-size:22px;font-weight:700;">Valid on Any Booking</p>

            <div style="background:rgba(201,168,76,0.15);border:2px dashed #C9A84C;border-radius:12px;padding:20px;margin:0 0 20px;">
              <p style="margin:0 0 4px;color:#8B9BAE;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">Your Voucher Code</p>
              <p style="margin:0;color:#C9A84C;font-size:28px;font-weight:800;font-family:monospace;letter-spacing:3px;">${data.code}</p>
            </div>

            <div style="display:inline-block;background:rgba(201,168,76,0.2);border-radius:999px;padding:8px 20px;">
              <span style="color:#C9A84C;font-size:22px;font-weight:800;">${value}</span>
            </div>

            <p style="margin:16px 0 0;color:#8B9BAE;font-size:12px;">Valid until ${expiry}</p>
          </div>
        </td></tr>

        <!-- How to Redeem -->
        <tr><td style="padding:0 40px 28px;">
          <h2 style="margin:0 0 12px;color:#0B1F3A;font-size:16px;font-weight:700;">How to Use Your Credit</h2>
          <p style="margin:0 0 16px;color:#4a5568;font-size:14px;line-height:1.7;">
            Simply quote your voucher code when making your next booking with us — by WhatsApp, email, or phone.
            Our team will deduct the full credit value from your new booking total. Partial use is allowed; any remaining balance stays on your voucher.
          </p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <a href="https://wa.me/12317902336?text=Hi%2C%20I%20have%20a%20travel%20credit%20voucher%3A%20${data.code}"
               style="display:inline-block;background:#25D366;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">
              💬 WhatsApp Us
            </a>
            <a href="https://walztravels.com"
               style="display:inline-block;background:#0B1F3A;color:#C9A84C;padding:12px 20px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">
              ✈️ Browse Trips
            </a>
          </div>
        </td></tr>

        <!-- Terms -->
        <tr><td style="padding:0 40px 28px;">
          <div style="background:#F7F8FA;border-radius:10px;padding:16px 20px;">
            <p style="margin:0 0 8px;color:#0B1F3A;font-size:13px;font-weight:600;">Terms &amp; Conditions</p>
            <ul style="margin:0;padding:0 0 0 16px;color:#6b7280;font-size:12px;line-height:2;">
              <li>Valid for 12 months — expires ${expiry}</li>
              <li>Not redeemable for cash</li>
              <li>Applicable to any Walz Travels booking (flights, hotels, tours, visa)</li>
              <li>Partial use allowed — remaining balance stays active on your voucher</li>
              <li>Subject to availability at time of booking</li>
            </ul>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td>${footer()}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  await resend.emails.send({
    from:    FROM,
    to:      data.recipientEmail,
    subject: `✈️ Your ${value} Walz Travels credit voucher — ${data.code}`,
    html,
  })
}

export async function sendVoucherAdminNotification(data: {
  code:           string
  senderName:     string
  senderEmail:    string
  recipientName:  string
  recipientEmail: string
  serviceType:    string
  amount:         number
  currency:       string
  gateway:        string
  paymentRef:     string
}) {
  const resend = getResend()
  const value = fmt(data.amount, data.currency)

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f7f8fa;padding:32px;">
  <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:#0B1F3A;padding:20px 28px;">
      <h2 style="margin:0;color:#C9A84C;font-size:18px;">🎁 New Gift Voucher Sold</h2>
    </div>
    <div style="padding:24px 28px;">
      <table width="100%" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="color:#6b7280;padding:6px 0;width:140px;">Code</td><td style="color:#0B1F3A;font-weight:700;font-family:monospace;font-size:15px;">${data.code}</td></tr>
        <tr><td style="color:#6b7280;padding:6px 0;">Value</td><td style="color:#0B1F3A;font-weight:600;">${value}</td></tr>
        <tr><td style="color:#6b7280;padding:6px 0;">Service</td><td style="color:#0B1F3A;">${SERVICE_LABELS[data.serviceType] ?? data.serviceType}</td></tr>
        <tr><td style="color:#6b7280;padding:6px 0;">From</td><td style="color:#0B1F3A;">${data.senderName} &lt;${data.senderEmail}&gt;</td></tr>
        <tr><td style="color:#6b7280;padding:6px 0;">To</td><td style="color:#0B1F3A;">${data.recipientName} &lt;${data.recipientEmail}&gt;</td></tr>
        <tr><td style="color:#6b7280;padding:6px 0;">Payment</td><td style="color:#0B1F3A;">${data.gateway} — ref: ${data.paymentRef}</td></tr>
      </table>
    </div>
  </div>
</body>
</html>`

  await resend.emails.send({
    from:    FROM,
    to:      ADMIN,
    subject: `🎁 Gift Voucher Sold — ${data.code} (${value})`,
    html,
  })
}
