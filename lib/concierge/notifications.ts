// lib/concierge/notifications.ts
// Client-facing emails for concierge request lifecycle.
// Called fire-and-forget from executeConciergeIntent and admin PATCH.
// No internal costs, supplier details, or admin notes are ever included.

import { getResend } from '@/lib/resend'
import { BUSINESS } from '@/lib/config/business'

// ── Internal notification on request creation (web form path) ─────────────────

export interface RequestNotification {
  reference:    string
  categoryName: string
  clientName?:  string
  clientEmail?: string
  fields:       Record<string, unknown>
}

/**
 * Logs internally and attempts a Supabase insert into concierge_notifications.
 * Non-throwing — errors are swallowed. The table is optional.
 */
export async function notifyNewRequest(n: RequestNotification): Promise<void> {
  console.info(`[Concierge] New request: ${n.reference} (${n.categoryName})`)

  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    const supabase = getSupabaseAdmin()

    await supabase.from('concierge_notifications').insert({
      reference:     n.reference,
      category_name: n.categoryName,
      client_name:   n.clientName   ?? null,
      client_email:  n.clientEmail  ?? null,
      fields:        n.fields,
      created_at:    new Date().toISOString(),
    })
    // Intentionally not checking error — table may not exist yet.
  } catch {
    // Swallow all errors. The concierge_notifications table is optional.
  }
}

const FROM = 'Walz Concierge <contact@walztravels.com>'

const STATUS_LABELS: Record<string, { subject: string; headline: string; body: string; color: string }> = {
  QUOTED: {
    subject:  'Your concierge proposal is ready — {ref}',
    headline: 'Your proposal is ready',
    body:     'Our concierge specialist has prepared a tailored proposal for your request. They will be in contact with the full details shortly.',
    color:    '#3B82F6',
  },
  CONFIRMED: {
    subject:  'Booking confirmed — {ref}',
    headline: 'You\'re all set',
    body:     'Your concierge request has been confirmed. Our team will send you a full confirmation and any next steps you need.',
    color:    '#16A34A',
  },
  IN_PROGRESS: {
    subject:  'Your request is underway — {ref}',
    headline: 'We\'re on it',
    body:     'Your concierge specialist is actively working on your request. We\'ll update you as soon as we have more to share.',
    color:    '#7C3AED',
  },
  COMPLETED: {
    subject:  'Request completed — {ref}',
    headline: 'All done',
    body:     'Your concierge request has been completed. Thank you for choosing Walz Concierge — we look forward to serving you again.',
    color:    '#0B1F3A',
  },
  CANCELLED: {
    subject:  'Request update — {ref}',
    headline: 'Request cancelled',
    body:     'Your concierge request has been cancelled. If you have any questions or would like to discuss alternatives, please contact us via WhatsApp or email.',
    color:    '#DC2626',
  },
}

// ── Confirmation email on request creation ────────────────────────────────────

export async function sendClientConfirmation(opts: {
  clientEmail:  string
  clientName?:  string
  reference:    string
  categoryName: string
  sla:          string
}): Promise<void> {
  const name = opts.clientName ?? 'there'
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f8f9fa;padding:20px">
      <div style="background:#0B1F3A;padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:#C9A84C;margin:0;font-size:22px;font-weight:700;letter-spacing:.5px">Walz Concierge</h1>
        <p style="color:#ffffff60;margin:4px 0 0;font-size:12px">Your request has been received</p>
      </div>
      <div style="background:#ffffff;padding:28px;border-radius:0 0 12px 12px">
        <p style="font-size:15px;color:#0B1F3A;margin:0 0 16px">Hi ${name},</p>
        <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 24px">
          We've received your <strong>${opts.categoryName}</strong> request and your personal concierge specialist will be in touch within <strong>${opts.sla}</strong> with a tailored proposal.
        </p>

        <div style="background:#FEF9EC;border:1px solid #C9A84C;border-radius:10px;padding:16px 20px;margin-bottom:24px">
          <p style="margin:0;font-size:11px;color:#92400E;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Your reference number</p>
          <p style="margin:6px 0 0;font-size:22px;color:#0B1F3A;font-weight:700;letter-spacing:.1em">${opts.reference}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6B7280">Quote this reference if you contact us</p>
        </div>

        <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 20px">
          In the meantime, if you have any questions or additional details to add, reach us on WhatsApp or email — we're always happy to help.
        </p>

        <div style="text-align:center;margin-bottom:20px">
          <a href="https://wa.me/${BUSINESS.contacts.globalWhatsapp.e164}?text=Hi%2C%20my%20concierge%20reference%20is%20${opts.reference}"
            style="display:inline-block;background:#25D366;color:#ffffff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px">
            Message us on WhatsApp
          </a>
        </div>

        <p style="font-size:11px;color:#9CA3AF;text-align:center;margin:0;padding-top:16px;border-top:1px solid #E5E7EB">
          Walz Concierge · contact@walztravels.com<br />
          This is an automated confirmation — a specialist will follow up personally.
        </p>
      </div>
    </div>`

  try {
    const resend = getResend()
    await resend.emails.send({
      from:    FROM,
      to:      opts.clientEmail,
      subject: `Concierge request received — ${opts.reference}`,
      html,
    })
  } catch (e) {
    console.error('[Concierge Notifications] Confirmation email failed:', e)
  }
}

// ── Status update email when admin changes request status ─────────────────────

export async function sendClientStatusUpdate(opts: {
  clientEmail:  string
  clientName?:  string
  reference:    string
  categoryName: string
  newStatus:    string
}): Promise<void> {
  const tpl = STATUS_LABELS[opts.newStatus]
  if (!tpl) return  // don't email on every status — only meaningful client-facing ones

  const name = opts.clientName ?? 'there'
  const subject = tpl.subject.replace('{ref}', opts.reference)

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f8f9fa;padding:20px">
      <div style="background:#0B1F3A;padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:#C9A84C;margin:0;font-size:22px;font-weight:700;letter-spacing:.5px">Walz Concierge</h1>
        <p style="color:#ffffff60;margin:4px 0 0;font-size:12px">${opts.categoryName}</p>
      </div>
      <div style="background:#ffffff;padding:28px;border-radius:0 0 12px 12px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <div style="width:10px;height:10px;border-radius:50%;background:${tpl.color};flex-shrink:0"></div>
          <h2 style="margin:0;font-size:18px;color:#0B1F3A;font-weight:700">${tpl.headline}</h2>
        </div>

        <p style="font-size:14px;color:#374151;margin:0 0 20px">Hi ${name},</p>
        <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 24px">${tpl.body}</p>

        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px 16px;margin-bottom:24px">
          <p style="margin:0;font-size:11px;color:#9CA3AF;font-weight:600;text-transform:uppercase">Reference</p>
          <p style="margin:4px 0 0;font-size:15px;color:#0B1F3A;font-weight:700;letter-spacing:.08em">${opts.reference}</p>
        </div>

        <div style="text-align:center;margin-bottom:16px">
          <a href="https://wa.me/${BUSINESS.contacts.globalWhatsapp.e164}?text=Hi%2C%20my%20concierge%20reference%20is%20${opts.reference}"
            style="display:inline-block;background:#0B1F3A;color:#C9A84C;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px">
            Chat with your specialist
          </a>
        </div>

        <p style="font-size:11px;color:#9CA3AF;text-align:center;margin:0;padding-top:16px;border-top:1px solid #E5E7EB">
          Walz Concierge · contact@walztravels.com
        </p>
      </div>
    </div>`

  try {
    const resend = getResend()
    await resend.emails.send({ from: FROM, to: opts.clientEmail, subject, html })
  } catch (e) {
    console.error('[Concierge Notifications] Status update email failed:', e)
  }
}
