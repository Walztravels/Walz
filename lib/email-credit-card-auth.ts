import { Resend } from 'resend'
import { formatCurrencyMinor } from '@/lib/currency'

function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
  return new Resend(process.env.RESEND_API_KEY)
}

const FROM     = 'Walz Travels <bookings@walztravels.com>'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:#0A1628;padding:28px 40px;text-align:center;">
            <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="130" style="display:inline-block;" />
          </td>
        </tr>
        <tr><td style="padding:36px 40px;">${content}</td></tr>
        <tr>
          <td style="background:#f4f6fb;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0 0 4px;color:#888;font-size:12px;">Walz Travels — The Travel Experts</p>
            <p style="margin:0;color:#aaa;font-size:11px;">Questions? <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">contact@walztravels.com</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function goldBtn(url: string, label: string): string {
  return `<div style="text-align:center;margin:28px 0;">
    <a href="${url}" style="display:inline-block;background:#C9A84C;color:#0A1628;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;text-decoration:none;">
      ${label} &rarr;
    </a>
    <p style="margin:12px 0 0;color:#888;font-size:11px;">Button not working? <a href="${url}" style="color:#555;">${url}</a></p>
  </div>`
}

function detailBox(rows: Array<[string, string]>): string {
  const inner = rows.map(([label, value]) => `
    <tr>
      <td style="color:#888;font-size:13px;padding:6px 0 6px;width:160px;vertical-align:top;">${label}</td>
      <td style="color:#0A1628;font-size:14px;font-weight:600;padding:6px 0 6px;">${value}</td>
    </tr>`).join('')
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;border:1px solid #e2e8f0;border-radius:8px;margin:20px 0;">
    <tr><td style="padding:18px 22px;"><table width="100%" cellpadding="0" cellspacing="0">${inner}</table></td></tr>
  </table>`
}

// ─── 1. Authorization Request ─────────────────────────────────────────────────

export async function sendCCARequest(params: {
  cardholderEmail:  string
  cardholderName:   string
  travellerName:    string
  serviceType:      string
  maxAmountMinor:   number
  currency:         string
  description:      string
  validUntil:       Date
  reference:        string
  rawToken:         string
}) {
  const url     = `${BASE_URL}/credit-card-authorization/${params.rawToken}`
  const amount  = formatCurrencyMinor(params.maxAmountMinor, params.currency)
  const expires = params.validUntil.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;color:#0A1628;font-weight:700;">Credit Card Authorisation</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;">Dear ${params.cardholderName},</p>
    <p style="margin:0 0 16px;color:#555;font-size:15px;">
      Walz Travels is requesting your credit card authorisation for the following travel service.
      By completing this form, you authorise Walz Travels to charge your card as described below.
    </p>
    ${detailBox([
      ['Reference', params.reference],
      ['Service', params.serviceType],
      ['Traveller', params.travellerName],
      ['Purpose', params.description],
      ['Maximum Amount', amount],
      ['Expires', expires],
    ])}
    <div style="background:#fffbf0;border-left:4px solid #C9A84C;border-radius:4px;padding:14px 18px;margin:0 0 20px;">
      <p style="margin:0;color:#7a5c00;font-size:13px;line-height:1.6;">
        <strong>What is a credit card authorisation?</strong><br />
        You are authorising Walz Travels to charge your saved card for the service above.
        No payment is taken now. Your card details are stored securely by Stripe — Walz Travels
        never sees or stores your full card number.
      </p>
    </div>
    ${goldBtn(url, 'Complete Authorisation')}
  `

  await getResend().emails.send({
    from:    FROM,
    to:      params.cardholderEmail,
    subject: `Credit Card Authorisation — ${params.reference} | Walz Travels`,
    html:    emailWrapper(body),
  })
}

// ─── 2. Authorisation Signed Confirmation ─────────────────────────────────────

export async function sendCCASignedConfirmation(params: {
  cardholderEmail: string
  cardholderName:  string
  reference:       string
  serviceType:     string
  maxAmountMinor:  number
  currency:        string
  cardBrand:       string
  cardLast4:       string
  signedAt:        Date
}) {
  const amount   = formatCurrencyMinor(params.maxAmountMinor, params.currency)
  const signedAt = params.signedAt.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;color:#0A1628;font-weight:700;">Authorisation Confirmed</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;">Dear ${params.cardholderName},</p>
    <p style="margin:0 0 16px;color:#555;font-size:15px;">
      Thank you. Your credit card authorisation has been received and your card is now on file.
    </p>
    ${detailBox([
      ['Reference', params.reference],
      ['Service', params.serviceType],
      ['Maximum Amount', amount],
      ['Card', `${params.cardBrand} ending ${params.cardLast4}`],
      ['Signed At', signedAt],
    ])}
    <p style="margin:16px 0 0;color:#888;font-size:13px;line-height:1.6;">
      Your card will only be charged when a service is confirmed with you. You will receive a receipt
      for every charge. To revoke this authorisation, please contact <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">contact@walztravels.com</a>.
    </p>
  `

  await getResend().emails.send({
    from:    FROM,
    to:      params.cardholderEmail,
    subject: `Authorisation Confirmed — ${params.reference} | Walz Travels`,
    html:    emailWrapper(body),
  })
}

// ─── 3. Charge Successful ─────────────────────────────────────────────────────

export async function sendCCAChargeSuccess(params: {
  cardholderEmail: string
  cardholderName:  string
  reference:       string
  serviceType:     string
  amountMinor:     number
  currency:        string
  cardBrand:       string
  cardLast4:       string
  description:     string
  chargedAt:       Date
}) {
  const amount    = formatCurrencyMinor(params.amountMinor, params.currency)
  const chargedAt = params.chargedAt.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;color:#0A1628;font-weight:700;">Payment Receipt</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;">Dear ${params.cardholderName},</p>
    <p style="margin:0 0 16px;color:#555;font-size:15px;">
      A payment has been processed to your card on file as per your signed authorisation.
    </p>
    ${detailBox([
      ['Reference', params.reference],
      ['Service', params.serviceType],
      ['Description', params.description],
      ['Amount Charged', `<strong style="font-size:18px;">${amount}</strong>`],
      ['Card', `${params.cardBrand} ending ${params.cardLast4}`],
      ['Date', chargedAt],
    ])}
    <p style="margin:16px 0 0;color:#888;font-size:13px;line-height:1.6;">
      If you have any questions about this charge, please contact us at
      <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">contact@walztravels.com</a>.
    </p>
  `

  await getResend().emails.send({
    from:    FROM,
    to:      params.cardholderEmail,
    subject: `Payment Receipt — ${amount} | Walz Travels`,
    html:    emailWrapper(body),
  })
}

// ─── 4. Authentication Required (3DS) ────────────────────────────────────────

export async function sendCCAAuthRequired(params: {
  cardholderEmail: string
  cardholderName:  string
  reference:       string
  amountMinor:     number
  currency:        string
  description:     string
  rawAuthToken:    string
}) {
  const url    = `${BASE_URL}/payment-authentication/${params.rawAuthToken}`
  const amount = formatCurrencyMinor(params.amountMinor, params.currency)

  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;color:#0A1628;font-weight:700;">Payment Authentication Required</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;">Dear ${params.cardholderName},</p>
    <p style="margin:0 0 16px;color:#555;font-size:15px;">
      Your bank requires additional authentication to complete the following payment.
      Please click the button below to authenticate — this takes less than a minute.
    </p>
    ${detailBox([
      ['Reference', params.reference],
      ['Purpose', params.description],
      ['Amount', amount],
    ])}
    <div style="background:#fff3cd;border-left:4px solid #f0a500;border-radius:4px;padding:14px 18px;margin:0 0 20px;">
      <p style="margin:0;color:#7a5000;font-size:13px;">
        This link is unique to you and expires in 24 hours. Do not share it with anyone.
      </p>
    </div>
    ${goldBtn(url, 'Authenticate Payment')}
  `

  await getResend().emails.send({
    from:    FROM,
    to:      params.cardholderEmail,
    subject: `Action Required: Authenticate Payment — ${amount} | Walz Travels`,
    html:    emailWrapper(body),
  })
}

// ─── 5. Charge Failed ────────────────────────────────────────────────────────

export async function sendCCAChargeFailed(params: {
  cardholderEmail:    string
  cardholderName:     string
  reference:          string
  amountMinor:        number
  currency:           string
  safeFailureMessage: string
}) {
  const amount = formatCurrencyMinor(params.amountMinor, params.currency)

  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;color:#0A1628;font-weight:700;">Payment Could Not Be Processed</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;">Dear ${params.cardholderName},</p>
    <p style="margin:0 0 16px;color:#555;font-size:15px;">
      We were unable to process a payment of <strong>${amount}</strong> against your authorised card
      for booking reference <strong>${params.reference}</strong>.
    </p>
    <div style="background:#fff0f0;border-left:4px solid #e53e3e;border-radius:4px;padding:14px 18px;margin:0 0 20px;">
      <p style="margin:0;color:#c53030;font-size:13px;">${params.safeFailureMessage}</p>
    </div>
    <p style="margin:0;color:#555;font-size:14px;">
      Our team will be in touch to arrange an alternative payment. If you have questions, please
      contact <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">contact@walztravels.com</a>.
    </p>
  `

  await getResend().emails.send({
    from:    FROM,
    to:      params.cardholderEmail,
    subject: `Payment Notice — ${params.reference} | Walz Travels`,
    html:    emailWrapper(body),
  })
}

// ─── 6. Revocation Notification ──────────────────────────────────────────────

export async function sendCCARevoked(params: {
  cardholderEmail: string
  cardholderName:  string
  reference:       string
  reason?:         string
}) {
  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;color:#0A1628;font-weight:700;">Authorisation Revoked</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;">Dear ${params.cardholderName},</p>
    <p style="margin:0 0 16px;color:#555;font-size:15px;">
      Your credit card authorisation (reference: <strong>${params.reference}</strong>) has been revoked.
      No further charges will be made to your card under this authorisation.
    </p>
    ${params.reason ? `<div style="background:#f8f9fb;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin:0 0 20px;">
      <p style="margin:0;color:#555;font-size:13px;"><strong>Reason:</strong> ${params.reason}</p>
    </div>` : ''}
    <p style="margin:0;color:#555;font-size:14px;">
      If you have questions, please contact <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">contact@walztravels.com</a>.
    </p>
  `

  await getResend().emails.send({
    from:    FROM,
    to:      params.cardholderEmail,
    subject: `Authorisation Revoked — ${params.reference} | Walz Travels`,
    html:    emailWrapper(body),
  })
}
