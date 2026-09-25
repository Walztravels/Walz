import { normalizePhoneE164 } from '@/lib/identity/normalize'

/**
 * THE authoritative phone normaliser for SMS consent AND SMS sending.
 *
 * Deterministic, never guesses a country:
 *   '+12317902336', '+1 (231) 790-2336', '0012317902336' → '+12317902336'
 *   '08031234567' (national format) → NATIONAL_FORMAT_REQUIRES_COUNTRY
 *   … unless the CALLER supplies an explicit calling code, in which case the
 *   leading trunk '0' is replaced by it.
 *
 * Reuses lib/identity/normalize.ts (the repo's E.164 primitive, also used by
 * consent capture and the WhatsApp Broadcast audience) so SMS cannot drift
 * from it; lib/twilio-whatsapp.ts's separate normaliser is NOT used here.
 */
export type NormalizeSmsResult =
  | { ok: true; e164: string }
  | { ok: false; reason: 'EMPTY' | 'NATIONAL_FORMAT_REQUIRES_COUNTRY' | 'INVALID' }

export function normalizeSmsNumber(
  raw: string | null | undefined,
  opts?: { defaultCallingCode?: string },
): NormalizeSmsResult {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'EMPTY' }
  const s = raw.trim()
  // Only phone punctuation is allowed; letters ('x5' extensions) or symbols would
  // otherwise be silently stripped and yield a different, wrong number.
  if (!/^\+?[\d\s().\-]+$/.test(s)) return { ok: false, reason: 'INVALID' }
  // SMS is not WhatsApp: a channel-prefixed value is never a valid SMS number.
  if (/^[a-z]+:/i.test(s)) return { ok: false, reason: 'INVALID' }

  const direct = normalizePhoneE164(s)
  if (direct) return { ok: true, e164: direct }

  const digits = s.replace(/\D/g, '')
  const hadPlus = s.startsWith('+')
  const looksNational = !hadPlus && digits.startsWith('0') && !digits.startsWith('00') && digits.length >= 8
  if (looksNational) {
    const cc = (opts?.defaultCallingCode ?? '').replace(/\D/g, '')
    if (!cc) return { ok: false, reason: 'NATIONAL_FORMAT_REQUIRES_COUNTRY' }
    const withCc = normalizePhoneE164(`+${cc}${digits.replace(/^0+/, '')}`)
    return withCc ? { ok: true, e164: withCc } : { ok: false, reason: 'INVALID' }
  }
  return { ok: false, reason: 'INVALID' }
}
