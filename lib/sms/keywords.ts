import type { SmsKeywordClass } from '@/lib/sms/types'

/**
 * Twilio's default English opt-out / opt-in / help keywords. Matching is
 * EXACT on the whole trimmed, case-folded message: "please stop calling" or
 * "stop it now" is OTHER, never STOP.
 */
export const SMS_STOP_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'] as const
export const SMS_START_KEYWORDS = ['START', 'YES', 'UNSTOP'] as const
export const SMS_HELP_KEYWORDS = ['HELP', 'INFO'] as const

/**
 * Classify an inbound message. Twilio's `OptOutType` param (Advanced Opt-Out
 * on a Messaging Service) is authoritative when present and valid; otherwise
 * fall back to exact keyword matching.
 */
export function classifySmsKeyword(body: string, optOutType?: string | null): SmsKeywordClass {
  const t = (optOutType ?? '').trim().toUpperCase()
  if (t === 'STOP' || t === 'START' || t === 'HELP') return t

  // Surrounding punctuation/emoji is ignored ("STOP.", "stop!"); the remainder must
  // still equal a keyword EXACTLY, so "please stop calling" stays an ordinary message.
  const k = (typeof body === 'string' ? body : '').trim().toUpperCase().replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '')
  if (!k) return 'OTHER'
  if ((SMS_STOP_KEYWORDS as readonly string[]).includes(k)) return 'STOP'
  if ((SMS_START_KEYWORDS as readonly string[]).includes(k)) return 'START'
  if ((SMS_HELP_KEYWORDS as readonly string[]).includes(k)) return 'HELP'
  return 'OTHER'
}
