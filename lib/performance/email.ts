/**
 * Staff Performance Management — email delivery (mission brief §8).
 *
 * The recipient address is ALWAYS resolved server-side from the Staff
 * record passed in — this function never accepts an address from a
 * request body. Subject and body are fixed per the brief; no sensitive
 * performance detail (sales figures, warning type, etc.) is placed in
 * the email body — only a notice that a document has been issued, with a
 * link into the authenticated Walz Admin portal (never a public URL).
 */

import { Resend } from '@/lib/resend-hardened'

function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set')
  }
  return new Resend(process.env.RESEND_API_KEY)
}

const FROM_ADDRESS = 'Walz Travels <bookings@walztravels.com>'

function emailHeader(): string {
  return `<div style="background: linear-gradient(135deg, #0A1628, #1C3557); padding: 32px 40px 24px; text-align: center;">
    <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" style="height: 40px;" />
  </div>`
}

function emailFooter(): string {
  return `<div style="padding: 24px 40px; text-align: center; color: #6b7280; font-size: 11px;">
    Walz Travels — Confidential Management Communication
  </div>`
}

export interface PerformanceNoticeEmailInput {
  toEmail: string
  employeeName: string
  reviewDateDisplay: string
  /** Absolute URL to the authenticated My Performance Notices detail page — never a public/anonymous link. */
  reviewUrl: string
}

export const PERFORMANCE_EMAIL_SUBJECT = 'CONFIDENTIAL: Performance Review — Walz Travels'

export function buildPerformanceNoticeEmailHtml(input: PerformanceNoticeEmailInput): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0; font-family: Arial, Helvetica, sans-serif; background:#f3f4f6;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff;">
    ${emailHeader()}
    <div style="padding: 32px 40px; color: #1f2937; font-size: 14px; line-height: 1.6;">
      <p>Dear ${input.employeeName},</p>
      <p>A performance review document has been issued to you by Walz Travels. Please review the document using the secure link below.</p>
      <p style="text-align:center; margin: 28px 0;">
        <a href="${input.reviewUrl}" style="background:#0A1628; color:#ffffff; padding:12px 28px; text-decoration:none; border-radius:4px; font-weight:bold;">Review Performance Notice</a>
      </p>
      <p>Review date: ${input.reviewDateDisplay}</p>
      <p>If you believe any information contained in the notice is inaccurate or there are circumstances management should consider, please contact your manager.</p>
      <p>Regards,<br/>Walz Travels Management</p>
    </div>
    ${emailFooter()}
  </div>
</body>
</html>`
}

export interface SendPerformanceNoticeResult {
  ok: boolean
  messageId?: string
  error?: string
}

export async function sendPerformanceNoticeEmail(
  input: PerformanceNoticeEmailInput,
): Promise<SendPerformanceNoticeResult> {
  try {
    const html = buildPerformanceNoticeEmailHtml(input)
    const result = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: input.toEmail,
      subject: PERFORMANCE_EMAIL_SUBJECT,
      html,
    })
    if (result.error) {
      return { ok: false, error: result.error.message }
    }
    return { ok: true, messageId: result.data?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown email error' }
  }
}
