import { getResend } from '@/lib/email-internal'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://walztravels.com'
const ADMIN_URL = process.env.NEXT_PUBLIC_APP_URL ?? BASE_URL
const FROM_ADDRESS = 'Walz Travels <bookings@walztravels.com>'

function safe(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function fmtDate(d: Date) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(d)
}

function wrap(content: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
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

// ── Send quote proposal to client ─────────────────────────────────────────────

export interface QuoteProposalEmailOpts {
  to:         string
  clientName: string
  reference:  string
  title:      string
  link:       string
  validUntil: Date
  staffName:  string
  message?:   string   // optional custom intro message
}

export async function sendQuoteProposalEmail(opts: QuoteProposalEmailOpts): Promise<void> {
  const resend = getResend()

  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0B1F3A;">Your Travel Proposal</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#555;">
      Hi ${safe(opts.clientName)}, we've prepared a personalised travel proposal for you.
    </p>

    <div style="background:#f8f9fb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Proposal Reference</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:#0B1F3A;">${safe(opts.reference)}</p>
    </div>

    <div style="background:#f8f9fb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Package</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#1a1a1a;">${safe(opts.title)}</p>
    </div>

    ${opts.message ? `<p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px;">${safe(opts.message)}</p>` : ''}

    <p style="margin:0 0 6px;font-size:13px;color:#888;">
      This proposal is valid until <strong>${fmtDate(opts.validUntil)}</strong>.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${opts.link}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;text-decoration:none;">
        View Your Proposal
      </a>
    </div>

    <p style="font-size:13px;color:#888;text-align:center;margin:0;">
      If you have any questions, reply to this email or contact us at
      <a href="mailto:bookings@walztravels.com" style="color:#C9A84C;">bookings@walztravels.com</a>
    </p>

    <p style="font-size:12px;color:#bbb;text-align:center;margin-top:16px;">
      Prepared by ${safe(opts.staffName)} &middot; Walz Travels
    </p>
  `)

  await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      opts.to,
    subject: `Your Walz Travels Proposal — ${opts.reference}`,
    html,
  })
}

// ── Notify staff of client action ─────────────────────────────────────────────

export interface QuoteActionNotificationOpts {
  to:         string
  staffName:  string
  action:     'accepted' | 'declined' | 'changes'
  clientName: string
  reference:  string
  title:      string
  quoteId:    string
  note?:      string
}

const ACTION_LABELS = {
  accepted: 'Accepted ✅',
  declined: 'Declined ❌',
  changes:  'Changes Requested 📝',
}

const ACTION_COLORS = {
  accepted: '#16a34a',
  declined: '#dc2626',
  changes:  '#d97706',
}

export async function sendQuoteActionNotification(opts: QuoteActionNotificationOpts): Promise<void> {
  const resend = getResend()
  const adminLink = `${ADMIN_URL}/admin/quotes/${opts.quoteId}`
  const label     = ACTION_LABELS[opts.action]
  const color     = ACTION_COLORS[opts.action]

  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0B1F3A;">Quote Update</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#555;">Hi ${safe(opts.staffName)},</p>

    <div style="background:#f8f9fb;border-radius:8px;padding:20px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Client</p>
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1a1a1a;">${safe(opts.clientName)}</p>
      <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Proposal</p>
      <p style="margin:0 0 12px;font-size:14px;color:#555;">${safe(opts.title)}</p>
      <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Reference</p>
      <p style="margin:0;font-size:14px;font-weight:600;color:#0B1F3A;">${safe(opts.reference)}</p>
    </div>

    <div style="border-left:4px solid ${color};padding:12px 16px;background:#fafafa;border-radius:4px;margin-bottom:20px;">
      <p style="margin:0;font-size:16px;font-weight:700;color:${color};">${label}</p>
      ${opts.note ? `<p style="margin:8px 0 0;font-size:13px;color:#555;">${safe(opts.note)}</p>` : ''}
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${adminLink}" style="display:inline-block;background:#0B1F3A;color:#C9A84C;font-weight:700;font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none;">
        View in Admin →
      </a>
    </div>
  `)

  const subjectMap = {
    accepted: `✅ Quote Accepted — ${opts.reference}`,
    declined: `❌ Quote Declined — ${opts.reference}`,
    changes:  `📝 Changes Requested — ${opts.reference}`,
  }

  await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      opts.to,
    subject: subjectMap[opts.action],
    html,
  })
}

// ── Status change notification (send / resend) — re-export alias for compat ──

export { sendQuoteProposalEmail as sendQuoteStatusChangeEmail }
