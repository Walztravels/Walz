import { buildEmailSignature, type StaffSignatureData } from '@/lib/email/signature'

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

// ─── Full branded email HTML wrapper ────────────────────────────────────────

export function buildEmailHtml(
  bodyText: string,
  staff: StaffSignatureData,
  trackingId?: string,
): string {
  const trackingPixel = trackingId
    ? `<img src="https://walztravels.com/api/email/track/${trackingId}" width="1" height="1" alt="" style="display:block;" />`
    : ''

  // Escape each line for safe HTML insertion (basic — body is staff-authored, not user-submitted)
  const bodyHtml = bodyText
    .split('\n')
    .map(line =>
      line.trim() === ''
        ? '<br />'
        : `<p style="margin:0 0 14px 0;color:#1a1a1a;font-size:15px;line-height:1.65;">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
    )
    .join('\n')

  const signatureHtml = buildEmailSignature(staff)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f0f0;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;">

          <!-- Navy header with logo -->
          <tr>
            <td style="background:#0B1F3A;padding:24px 40px;text-align:center;">
              <img
                src="https://www.walztravels.com/walz-logo.png"
                width="150"
                height="auto"
                alt="Walz Travels"
                style="display:block;margin:0 auto;border:0;max-width:150px;"
              />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px 40px;">
              ${bodyHtml}
              ${signatureHtml}
            </td>
          </tr>

          <!-- Gold footer bar -->
          <tr>
            <td style="background:#C9A84C;padding:14px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#0B1F3A;font-family:Arial,Helvetica,sans-serif;">
                &copy; ${new Date().getFullYear()} Walz Travels Ltd. All rights reserved.
                &nbsp;&middot;&nbsp;
                <a href="https://walztravels.com" style="color:#0B1F3A;text-decoration:none;">walztravels.com</a>
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
