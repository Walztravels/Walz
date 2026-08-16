import { getResend } from '@/lib/resend'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://walztravels.com'

interface VisaWhatsAppNotificationOpts {
  agentName:    string
  agentEmail:   string
  clientName:   string
  clientPhone:  string
  applicationId: string
  messagePreview: string
}

export async function sendVisaWhatsAppNotification(opts: VisaWhatsAppNotificationOpts): Promise<void> {
  const resend  = getResend()
  const link    = `${BASE_URL}/admin/visa-applications/${opts.applicationId}#whatsapp-thread`
  const safe    = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  await resend.emails.send({
    from:    'Walz Travels <hello@walztravels.com>',
    to:      opts.agentEmail,
    subject: `WhatsApp reply from ${opts.clientName} — Visa application`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr>
          <td style="background:#0B1F3A;padding:20px 32px;">
            <span style="color:#C9A84C;font-size:20px;font-weight:700;letter-spacing:0.5px;">Walz Travels</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 6px;font-size:15px;color:#1a1a1a;">Hi ${safe(opts.agentName)},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.5;">
              <strong>${safe(opts.clientName)}</strong> (${safe(opts.clientPhone)}) has replied on WhatsApp regarding their visa application.
            </p>
            <div style="background:#fafafa;border-left:3px solid #C9A84C;padding:14px 16px;margin:0 0 28px;border-radius:0 6px 6px 0;">
              <p style="margin:0 0 5px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.6px;">Message</p>
              <p style="margin:0;font-size:14px;color:#333;line-height:1.5;">${safe(opts.messagePreview.substring(0, 300))}</p>
            </div>
            <a href="${link}"
               style="display:inline-block;background:#C9A84C;color:#0B1F3A;text-decoration:none;
                      padding:13px 26px;border-radius:6px;font-weight:700;font-size:15px;">
              View WhatsApp thread →
            </a>
            <p style="margin:24px 0 0;font-size:13px;color:#999;">This link opens the visa application WhatsApp thread directly.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f8f8;padding:16px 32px;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#bbb;">Walz Travels &middot; walztravels.com</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  }).catch(() => {}) // non-fatal
}

interface AssignmentEmailOpts {
  agentName:      string
  agentEmail:     string
  conversationId: string | number
  messagePreview?: string
  assignedBy:     string
}

export async function sendConversationAssignedEmail(opts: AssignmentEmailOpts): Promise<void> {
  const resend  = getResend()
  const link    = `${BASE_URL}/admin/inbox?lead=${opts.conversationId}`
  const preview = opts.messagePreview?.substring(0, 200) ?? ''

  await resend.emails.send({
    from:    'Walz Travels <hello@walztravels.com>',
    to:      opts.agentEmail,
    subject: 'New conversation assigned to you — Walz Inbox',
    html:    buildHtml({ ...opts, link, preview }),
  })
}

function buildHtml(
  opts: AssignmentEmailOpts & { link: string; preview: string },
): string {
  const safePreview = opts.preview
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:#0B1F3A;padding:20px 32px;">
            <span style="color:#C9A84C;font-size:20px;font-weight:700;letter-spacing:0.5px;">Walz Travels</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 6px;font-size:15px;color:#1a1a1a;">Hi ${opts.agentName},</p>
            <p style="margin:0 0 28px;font-size:15px;color:#444;line-height:1.5;">
              A conversation has been assigned to you by <strong>${opts.assignedBy}</strong>.
            </p>

            ${safePreview ? `
            <div style="background:#fafafa;border-left:3px solid #C9A84C;padding:14px 16px;margin:0 0 28px;border-radius:0 6px 6px 0;">
              <p style="margin:0 0 5px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.6px;">Message preview</p>
              <p style="margin:0;font-size:14px;color:#333;line-height:1.5;">${safePreview}</p>
            </div>` : ''}

            <a href="${opts.link}"
               style="display:inline-block;background:#C9A84C;color:#0B1F3A;text-decoration:none;
                      padding:13px 26px;border-radius:6px;font-weight:700;font-size:15px;">
              View conversation →
            </a>

            <p style="margin:24px 0 0;font-size:13px;color:#999;line-height:1.5;">
              This link opens the conversation directly in the Walz admin inbox.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f8f8;padding:16px 32px;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#bbb;">
              Walz Travels &middot; walztravels.com
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
