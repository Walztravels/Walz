// Recovery email templates + sender (Release 3C)
//
// Templates: ABANDONED_CART | UNPAID_PROPOSAL | FAILED_PAYMENT | INCOMPLETE_TRIP
//
// Rule: do NOT claim prices are still valid in abandoned cart email.
// Rule: for FAILED_PAYMENT with unknown state, do NOT say "payment failed".
// Rule: never include supplier cost, markup, or internal data.

import { getResend } from '@/lib/email-internal'

const BASE_URL       = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://walztravels.com'
const FROM_ADDRESS   = 'Walz Travels <bookings@walztravels.com>'
const CONTACT_EMAIL  = 'info@walztravels.com'
const CONTACT_WHATSAPP = 'https://wa.me/447700000000' // overridden by env at runtime

function safe(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wrap(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:100%;">
      <tr><td style="background:#0B1F3A;padding:20px 32px;">
        <span style="color:#C9A84C;font-size:22px;font-weight:700;letter-spacing:.5px;">Walz Travels</span>
      </td></tr>
      <tr><td style="padding:32px;">${content}</td></tr>
      <tr><td style="background:#f8f8f8;padding:16px 32px;border-top:1px solid #eee;">
        <p style="margin:0;font-size:12px;color:#999;">
          Walz Travels &middot; <a href="${BASE_URL}" style="color:#C9A84C;text-decoration:none;">walztravels.com</a>
          &middot; <a href="mailto:${CONTACT_EMAIL}" style="color:#C9A84C;text-decoration:none;">${CONTACT_EMAIL}</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

function ctaButton(label: string, href: string): string {
  return `<div style="text-align:center;margin:28px 0;">
    <a href="${href}"
       style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;text-decoration:none;">
      ${label}
    </a>
  </div>`
}

function contactLine(): string {
  return `<p style="font-size:13px;color:#888;text-align:center;margin:0;">
    Questions? Email us at
    <a href="mailto:${CONTACT_EMAIL}" style="color:#C9A84C;">${CONTACT_EMAIL}</a>
  </p>`
}

// ── Abandoned Cart ────────────────────────────────────────────────────────────

export interface AbandonedCartEmailOpts {
  to:          string
  clientName:  string
  destination: string
  trackingUrl: string   // /api/recovery/track/[id]?url=...  (server-authoritative click)
  resumeUrl:   string   // the actual cart/trip URL (inside trackingUrl)
}

export function buildAbandonedCartHtml(opts: AbandonedCartEmailOpts): string {
  const name = safe(opts.clientName || 'there')
  const dest = safe(opts.destination || 'your trip')
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0B1F3A;">Your trip plan is still waiting</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">
      Hi ${name}, you left ${dest} in your Walz Travels cart.
      Travel prices can change — we'll check the latest availability when you're ready to continue.
    </p>
    <p style="font-size:13px;color:#888;line-height:1.6;">
      When you're ready to pick up where you left off:
    </p>
    ${ctaButton('Resume My Trip', opts.trackingUrl)}
    <p style="font-size:12px;color:#bbb;text-align:center;margin-top:4px;">
      If you need help or have questions about availability, we're happy to assist.
    </p>
    ${contactLine()}
  `)
}

// ── Unpaid Proposal ───────────────────────────────────────────────────────────

export interface UnpaidProposalEmailOpts {
  to:           string
  clientName:   string
  reference:    string
  destination:  string
  trackingUrl:  string
}

export function buildUnpaidProposalHtml(opts: UnpaidProposalEmailOpts): string {
  const name = safe(opts.clientName || 'there')
  const ref  = safe(opts.reference)
  const dest = safe(opts.destination || 'your trip')
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0B1F3A;">Your proposal is still available</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">
      Hi ${name}, your Walz Travels proposal for <strong>${dest}</strong> is still open.
    </p>
    <div style="background:#f8f9fb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Proposal Reference</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:#0B1F3A;">${ref}</p>
    </div>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 4px;">
      If you'd like to change the hotel, flights, activities, or payment options — our team can help.
    </p>
    ${ctaButton('View My Proposal', opts.trackingUrl)}
    ${contactLine()}
  `)
}

// ── Failed Payment ────────────────────────────────────────────────────────────

export interface FailedPaymentEmailOpts {
  to:          string
  clientName:  string
  isUnknown:   boolean   // true when provider outcome is uncertain — use cautious language
  trackingUrl: string
  retryUrl?:   string
}

export function buildFailedPaymentHtml(opts: FailedPaymentEmailOpts): string {
  const name = safe(opts.clientName || 'there')
  const body = opts.isUnknown
    ? `<p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">
        Hi ${name}, we're checking the status of your recent payment.
        <strong>Please do not attempt to pay again</strong> until you hear from us — we'll confirm shortly.
       </p>
       <p style="font-size:14px;color:#555;margin:0 0 24px;">
         If you have an urgent question, please contact us directly.
       </p>`
    : `<p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">
        Hi ${name}, we weren't able to complete your payment.
        Your booking has not been confirmed, and you have not been charged
        — unless your payment provider shows otherwise.
       </p>
       <p style="font-size:14px;color:#555;margin:0 0 8px;">You can:</p>
       <ul style="font-size:14px;color:#555;margin:0 0 20px;padding-left:20px;line-height:1.8;">
         <li>Try again with a different card or payment method</li>
         <li>Contact us to complete your booking over the phone or via WhatsApp</li>
       </ul>`

  const cta = opts.isUnknown
    ? ctaButton('Contact Us', opts.trackingUrl)
    : `<div style="text-align:center;margin:20px 0 8px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
         ${opts.retryUrl ? `<a href="${opts.trackingUrl}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">Try Again</a>` : ''}
         <a href="mailto:${CONTACT_EMAIL}" style="display:inline-block;background:#fff;border:1px solid #C9A84C;color:#C9A84C;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">Contact Walz</a>
       </div>`

  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0B1F3A;">
      ${opts.isUnknown ? 'Payment status update' : 'Payment not completed'}
    </h2>
    ${body}
    ${cta}
    ${contactLine()}
  `)
}

// ── Incomplete Trip ───────────────────────────────────────────────────────────

export interface IncompleteTripEmailOpts {
  to:          string
  clientName:  string
  destination: string
  trackingUrl: string
}

export function buildIncompleteTripHtml(opts: IncompleteTripEmailOpts): string {
  const name = safe(opts.clientName || 'there')
  const dest = safe(opts.destination || 'your trip')
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0B1F3A;">Your ${dest} plan is still here</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">
      Hi ${name}, you've started planning ${dest} on Walz Travels but haven't completed your booking.
    </p>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 8px;">
      Your trip plan is still saved. Our team can also help you finalise the details if you'd like a hand.
    </p>
    ${ctaButton('Continue Planning', opts.trackingUrl)}
    ${contactLine()}
  `)
}

// ── Sender ────────────────────────────────────────────────────────────────────

export interface SendRecoveryEmailOpts {
  to:       string
  subject:  string
  html:     string
}

export async function sendRecoveryEmail(opts: SendRecoveryEmailOpts): Promise<void> {
  const resend = getResend()
  await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
  })
}

// ── Subject lines ─────────────────────────────────────────────────────────────

export function recoverySubject(type: string, destination?: string): string {
  const dest = destination ? ` — ${destination}` : ''
  switch (type) {
    case 'ABANDONED_CART':  return `Your Walz Travels trip is still saved${dest}`
    case 'UNPAID_PROPOSAL': return `Your Walz Travels proposal${dest}`
    case 'FAILED_PAYMENT':  return `Your Walz Travels payment`
    case 'INCOMPLETE_TRIP': return `Your Walz Travels trip plan${dest}`
    default:                return `Walz Travels — follow up`
  }
}
