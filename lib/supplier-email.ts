import { getResend } from '@/lib/resend'

const FROM = 'Walz Travels <bookings@walztravels.com>'

export interface SendSupplierMessageInput {
  to:      string
  subject: string
  body:    string
  replyTo?: string
}

const INBOUND_REPLY_TO = process.env.RESEND_INBOUND_REPLY_TO ?? 'replies@inbound.walztravels.com'

export async function sendSupplierMessage(input: SendSupplierMessageInput): Promise<string | null> {
  const resend = getResend()
  const result = await resend.emails.send({
    from:    FROM,
    to:      input.to,
    replyTo: input.replyTo ?? INBOUND_REPLY_TO,
    subject: input.subject,
    text:    input.body,
    html:    `<pre style="font-family:inherit;white-space:pre-wrap">${htmlEscape(input.body)}</pre>`,
  })
  if (result.error) throw new Error(result.error.message)
  return result.data?.id ?? null
}

function htmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
