// ─── Email Hub utilities ───────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  inbox:   'Inbox',
  sent:    'Sent',
  drafts:  'Drafts',
  hotel:   'Hotels',
  client:  'Clients',
  tours:   'Tours',
  visa:    'Visa',
  admin:   'Admin',
}

export const STATUS_COLORS: Record<string, string> = {
  open:     'bg-blue-500/20 text-blue-300',
  closed:   'bg-gray-500/20 text-gray-400',
  pending:  'bg-yellow-500/20 text-yellow-300',
  resolved: 'bg-green-500/20 text-green-300',
}

// ─── Signature block ────────────────────────────────────────────────────────

export function buildSignatureHtml(staffName: string, staffRole: string): string {
  return `
<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-top:2px solid #C9A84C;padding-top:16px;font-family:Arial,sans-serif;">
  <tr>
    <td>
      <p style="margin:0;font-size:15px;font-weight:700;color:#0B1F3A;">${staffName}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#666;">${staffRole} &bull; Walz Travels</p>
      <p style="margin:6px 0 0;font-size:12px;color:#888;">
        <a href="https://walztravels.com" style="color:#C9A84C;text-decoration:none;">walztravels.com</a>
        &nbsp;|&nbsp;bookings@walztravels.com
      </p>
      <p style="margin:6px 0 0;font-size:11px;color:#aaa;font-style:italic;">
        This email and any attachments are confidential and intended solely for the named recipient.
      </p>
    </td>
  </tr>
</table>
  `.trim()
}

// ─── Full branded email HTML wrapper ────────────────────────────────────────

export function buildEmailHtml(
  bodyText: string,
  staffName: string,
  staffRole: string,
  trackingId?: string,
): string {
  const trackingPixel = trackingId
    ? `<img src="https://walztravels.com/api/email/track/${trackingId}" width="1" height="1" alt="" style="display:block;" />`
    : ''

  const bodyHtml = bodyText
    .split('\n')
    .map(line => line.trim() === '' ? '<br/>' : `<p style="margin:0 0 12px;color:#1a1a1a;font-size:15px;line-height:1.6;">${line}</p>`)
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0B1F3A;padding:28px 40px;">
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#C9A84C;letter-spacing:2px;text-transform:uppercase;">WALZ TRAVELS</h1>
              <p style="margin:4px 0 0;font-size:12px;color:#8ca0b8;letter-spacing:1px;text-transform:uppercase;">Premium Travel Services</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 24px;">
              ${bodyHtml}
              ${buildSignatureHtml(staffName, staffRole)}
            </td>
          </tr>

          <!-- Gold footer bar -->
          <tr>
            <td style="background:#C9A84C;padding:12px 40px;">
              <p style="margin:0;font-size:11px;color:#0B1F3A;text-align:center;">
                &copy; ${new Date().getFullYear()} Walz Travels Ltd. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  ${trackingPixel}
</body>
</html>`
}
