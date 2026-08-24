import { getResend } from '@/lib/email-internal'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://walztravels.com'
const FROM_ADDRESS = 'Walz Travels <bookings@walztravels.com>'

const SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$' }
function fmt(amount: number, currency: string) {
  const sym = SYM[currency.toUpperCase()] ?? currency + ' '
  return `${sym}${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(d: Date) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(d)
}
function safe(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wrap(content: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
      <tr><td style="background:#0B1F3A;padding:20px 32px;">
        <span style="color:#C9A84C;font-size:20px;font-weight:700;letter-spacing:.5px;">Walz Travels</span>
      </td></tr>
      <tr><td style="padding:32px;">${content}</td></tr>
      <tr><td style="background:#f8f8f8;padding:16px 32px;border-top:1px solid #eee;">
        <p style="margin:0;font-size:12px;color:#bbb;">Walz Travels &middot; walztravels.com</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

function row(label: string, value: string): string {
  return `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f0f0f0;">
    <span style="font-size:13px;color:#888;">${label}</span>
    <span style="font-size:13px;font-weight:600;color:#1a1a1a;">${value}</span>
  </div>`
}

// ── Send quote to client ──────────────────────────────────────────────────────

export interface FlightQuoteEmailOpts {
  to:            string
  clientName:    string
  quoteToken:    string
  origin:        string
  destination:   string
  departureDate: Date
  returnDate?:   Date | null
  airline:       string
  cabinClass:    string
  displayPrice:  number
  currency:      string
  staffName:     string
  expiresAt:     Date
}

export async function sendFlightQuoteEmail(opts: FlightQuoteEmailOpts): Promise<void> {
  const resend = getResend()
  const link = `${BASE_URL}/quote/${opts.quoteToken}`

  const html = wrap(`
    <p style="margin:0 0 6px;font-size:15px;color:#1a1a1a;">Hi ${safe(opts.clientName)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.5;">
      ${safe(opts.staffName)} from Walz Travels has prepared a flight quote for you.
      Please review the details and click <strong>Approve</strong> if you'd like to proceed.
    </p>

    <div style="background:#fafafa;border:1px solid #e8e8e8;border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#0B1F3A;text-transform:uppercase;letter-spacing:.8px;">Flight Details</p>
      ${row('Route', `${safe(opts.origin)} → ${safe(opts.destination)}`)}
      ${row('Departure', fmtDate(opts.departureDate))}
      ${opts.returnDate ? row('Return', fmtDate(opts.returnDate)) : ''}
      ${row('Airline', safe(opts.airline))}
      ${row('Cabin', safe(opts.cabinClass))}
      ${row('Price', fmt(opts.displayPrice, opts.currency))}
    </div>

    <p style="margin:0 0 20px;font-size:13px;color:#999;">
      This quote is valid until ${fmtDate(opts.expiresAt)}.
    </p>

    <a href="${link}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;text-decoration:none;
       padding:13px 26px;border-radius:6px;font-weight:700;font-size:15px;">
      View &amp; Approve Quote →
    </a>

    <p style="margin:24px 0 0;font-size:13px;color:#999;">
      Questions? Contact us at <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">contact@walztravels.com</a>
    </p>
  `)

  await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      opts.to,
    subject: `Your Flight Quote — ${opts.origin} → ${opts.destination} | Walz Travels`,
    html,
  })
}

// ── Notify staff when client approves ────────────────────────────────────────

export interface FlightQuoteApprovalOpts {
  to:           string
  staffName:    string
  clientName:   string
  origin:       string
  destination:  string
  airline:      string
  displayPrice: number
  currency:     string
  quoteId:      string
}

export async function sendFlightQuoteApprovalNotification(opts: FlightQuoteApprovalOpts): Promise<void> {
  const resend = getResend()
  const link = `${BASE_URL}/admin/flight-quotes/${opts.quoteId}`

  const html = wrap(`
    <p style="margin:0 0 6px;font-size:15px;color:#1a1a1a;">Hi ${safe(opts.staffName)},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.5;">
      <strong>${safe(opts.clientName)}</strong> has approved the flight quote for
      <strong>${safe(opts.origin)} → ${safe(opts.destination)}</strong> (${safe(opts.airline)}).
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#166534;font-weight:700;">
        ✓ Approved — ${fmt(opts.displayPrice, opts.currency)}
      </p>
    </div>

    <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">
      You can now proceed to collect passenger details and complete the booking.
      Open the quote in admin to verify the Duffel offer and proceed.
    </p>

    <a href="${link}" style="display:inline-block;background:#0B1F3A;color:#fff;text-decoration:none;
       padding:13px 26px;border-radius:6px;font-weight:700;font-size:15px;">
      View Quote &amp; Book →
    </a>
  `)

  await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      opts.to,
    subject: `Flight quote approved — ${safe(opts.clientName)} (${opts.origin} → ${opts.destination})`,
    html,
  })
}
