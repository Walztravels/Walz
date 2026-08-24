import { Resend } from 'resend'
import { formatCurrencyMinor } from '@/lib/currency'

function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
  return new Resend(process.env.RESEND_API_KEY)
}

const FROM     = 'Walz Travels <bookings@walztravels.com>'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'

export async function sendCardAuthorizationRequest(params: {
  clientEmail:  string
  clientName:   string
  amountMinor:  number   // Stripe minor units
  currency:     string
  description:  string
  token:        string
}) {
  const { clientEmail, clientName, amountMinor, currency, description, token } = params
  const authUrl   = `${BASE_URL}/authorize/${token}`
  const amountStr = formatCurrencyMinor(amountMinor, currency)

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#0A1628;padding:32px 40px;text-align:center;">
            <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="140" style="display:inline-block;width:140px;height:auto;" />
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:#0A1628;font-weight:700;">Card Authorisation Required</h1>
            <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
              Dear ${clientName},
            </p>
            <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
              Walz Travels is requesting a card authorisation (pre-authorisation hold) for the following:
            </p>
            <!-- Details box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="4" cellspacing="0">
                    <tr>
                      <td style="color:#888;font-size:13px;width:140px;">Description</td>
                      <td style="color:#0A1628;font-size:14px;font-weight:600;">${description}</td>
                    </tr>
                    <tr>
                      <td style="color:#888;font-size:13px;padding-top:8px;">Amount</td>
                      <td style="color:#0A1628;font-size:18px;font-weight:700;padding-top:8px;">${amountStr}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <!-- What is a pre-auth -->
            <div style="background:#fffbf0;border-left:4px solid #C9A84C;border-radius:4px;padding:16px 20px;margin-bottom:28px;">
              <p style="margin:0;color:#7a5c00;font-size:13px;line-height:1.6;">
                <strong>What is a card authorisation?</strong><br />
                A pre-authorisation temporarily holds funds on your card without charging you. Walz Travels will either capture the funds (complete the payment) or release the hold within 7 days. No money leaves your account until captured.
              </p>
            </div>
            <!-- CTA -->
            <div style="text-align:center;margin:32px 0;">
              <a href="${authUrl}"
                 style="display:inline-block;background:#C9A84C;color:#0A1628;font-weight:700;font-size:16px;padding:16px 40px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
                Authorise Card &rarr;
              </a>
            </div>
            <p style="margin:0 0 8px;color:#888;font-size:12px;text-align:center;">
              Button not working? Copy and paste this link into your browser:
            </p>
            <p style="margin:0;color:#555;font-size:12px;word-break:break-all;text-align:center;">${authUrl}</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f4f6fb;padding:24px 40px;border-top:1px solid #e2e8f0;">
            <p style="margin:0 0 4px;color:#888;font-size:12px;text-align:center;">Walz Travels — The Travel Experts</p>
            <p style="margin:0;color:#aaa;font-size:11px;text-align:center;">
              Questions? Email <a href="mailto:contact@walztravels.com" style="color:#C9A84C;text-decoration:none;">contact@walztravels.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  await getResend().emails.send({
    from:    FROM,
    to:      clientEmail,
    subject: `Card Authorisation Required — ${amountStr} | Walz Travels`,
    html,
  })
}
