/**
 * Staff Updates — "a Staff Update was just published" transactional email.
 *
 * Visual/structural convention copied deliberately from
 * lib/email-team-notification.ts / lib/email-staff-notification.ts (navy
 * #0B1F3A header, gold #C9A84C CTA, white card on #f0f2f5) so this reads as
 * the same family of Walz staff mail, not a one-off design.
 *
 * Sending goes through getResend() like every other send site in this
 * codebase. Rendering (renderAnnouncementEmail) is a pure function,
 * separated from sending (sendAnnouncementEmail), so subject/HTML shape can
 * be unit tested without touching Resend at all.
 *
 * Deliberately does NOT include the announcement's full `detail`/`whatToDo`
 * content — only `summary` — per the "don't leak confidential detail into
 * an email inbox" requirement; the CTA deep-links into the authenticated
 * admin app for the full content, never a public URL.
 */

import { getResend } from '@/lib/resend'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://walztravels.com'

export type AnnouncementPriority = 'NORMAL' | 'HIGH' | 'URGENT'

/** Human label for the priority badge and subject-line tagging. URGENT is
 *  this codebase's closest existing enum value to the mission's "Critical"
 *  tier — there is no separate CRITICAL value in AnnouncementPriority, so
 *  URGENT is treated as Critical throughout this feature rather than adding
 *  a new enum value for a naming difference alone. */
const PRIORITY_LABEL: Record<AnnouncementPriority, string> = {
  NORMAL: 'Normal',
  HIGH:   'High',
  URGENT: 'Critical',
}

const CATEGORY_LABEL: Record<string, string> = {
  NEW_FEATURE:    'New Feature',
  SYSTEM_UPDATE:  'System Update',
  POLICY:         'Policy',
  SUPPLIER:       'Supplier',
  IMPORTANT:      'Important',
  TRAINING:       'Training',
}

export function announcementLink(announcementId: string, baseUrl: string = BASE_URL): string {
  return `${baseUrl}/admin/staff-updates/${encodeURIComponent(announcementId)}`
}

export function announcementEmailSubject(title: string, priority: AnnouncementPriority): string {
  if (priority === 'URGENT') return `[CRITICAL] Walz Staff Update — ${title}`
  if (priority === 'HIGH')   return `[HIGH PRIORITY] Walz Staff Update — ${title}`
  return `[Walz Staff Update] ${title}`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatEffectiveDate(d: Date | string | null | undefined): string | null {
  if (!d) return null
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export interface AnnouncementEmailInput {
  announcementId: string
  title:          string
  summary:        string
  category:       string
  priority:       AnnouncementPriority
  effectiveDate?: Date | string | null
  staffName:      string
  baseUrl?:       string
}

export function renderAnnouncementEmail(input: AnnouncementEmailInput): { subject: string; html: string } {
  const baseUrl = input.baseUrl ?? BASE_URL
  const subject = announcementEmailSubject(input.title, input.priority)
  const link = announcementLink(input.announcementId, baseUrl)
  const priorityLabel = PRIORITY_LABEL[input.priority] ?? input.priority
  const categoryLabel = CATEGORY_LABEL[input.category] ?? input.category
  const effective = formatEffectiveDate(input.effectiveDate)
  const isUrgent = input.priority === 'URGENT'
  const isHigh = input.priority === 'HIGH'
  const badgeColor = isUrgent ? '#B3261E' : isHigh ? '#C9A84C' : '#0B1F3A'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @media only screen and (max-width:600px) {
      .walz-card { width:100% !important; border-radius:0 !important; }
      .walz-pad  { padding:22px 18px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" class="walz-card" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td class="walz-pad" style="background:#0B1F3A;padding:20px 32px;">
            <span style="color:#C9A84C;font-size:20px;font-weight:700;letter-spacing:0.5px;">Walz Travels</span>
            <p style="margin:6px 0 0;color:#8B9BAE;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;">Staff Update</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td class="walz-pad" style="padding:32px;">
            <p style="margin:0 0 18px;font-size:15px;color:#1a1a1a;">Hi ${esc(input.staffName)},</p>

            <p style="margin:0 0 14px;">
              <span style="display:inline-block;background:${badgeColor};color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:4px 10px;border-radius:4px;">${esc(priorityLabel)}</span>
              <span style="margin-left:8px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">${esc(categoryLabel)}</span>
            </p>

            <p style="margin:0 0 12px;font-size:19px;color:#0B1F3A;font-weight:700;line-height:1.4;">${esc(input.title)}</p>
            <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.6;">${esc(input.summary)}</p>

            ${effective ? `<p style="margin:0 0 22px;font-size:13px;color:#666;">Effective: <strong>${esc(effective)}</strong></p>` : ''}

            <a href="${esc(link)}"
               style="display:inline-block;margin-top:4px;background:#C9A84C;color:#0B1F3A;text-decoration:none;
                      padding:13px 26px;border-radius:6px;font-weight:700;font-size:15px;">
              Read Full Update →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f8f8;padding:16px 32px;border-top:1px solid #eee;">
            <p style="margin:0 0 6px;font-size:12px;color:#999;">
              This is an internal Walz Travels staff communication. Please do not forward confidential internal information.
            </p>
            <p style="margin:0;font-size:12px;color:#bbb;">Walz Travels &middot; walztravels.com</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html }
}

export interface SendAnnouncementEmailResult {
  ok:                boolean
  providerMessageId?: string | null
  error?:             string
}

/**
 * Sends the email. NEVER throws — the caller (the notify orchestrator) must
 * be able to record a FAILED delivery row and carry on to the next
 * recipient rather than aborting the whole publish. Logs metadata only
 * (staffId, announcementId, priority) — never the recipient address, never
 * the summary/title content, never the API key.
 */
export async function sendAnnouncementEmail(
  input: AnnouncementEmailInput & { staffId: string; staffEmail: string },
): Promise<SendAnnouncementEmailResult> {
  if (!input.staffEmail) return { ok: false, error: 'missing_email' }
  try {
    const { subject, html } = renderAnnouncementEmail(input)
    const resend = getResend()
    const res = await resend.emails.send({
      from:    'Walz Travels <hello@walztravels.com>',
      to:      input.staffEmail,
      subject,
      html,
    })
    if (res?.error) {
      console.warn(`[staff-updates/email] send rejected staffId=${input.staffId} announcementId=${input.announcementId}`)
      return { ok: false, error: res.error.message ?? 'send_rejected' }
    }
    console.info(`[staff-updates/email] sent staffId=${input.staffId} announcementId=${input.announcementId} priority=${input.priority}`)
    return { ok: true, providerMessageId: res?.data?.id ?? null }
  } catch (e) {
    const message = (e as Error)?.message ?? 'unknown_error'
    console.warn(`[staff-updates/email] send failed staffId=${input.staffId} announcementId=${input.announcementId}:`, message)
    return { ok: false, error: message }
  }
}
