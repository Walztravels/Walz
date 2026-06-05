import { Resend } from 'resend'

/** Internal helper — returns a Resend client, throws if key not set */
export function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
  return new Resend(process.env.RESEND_API_KEY)
}
