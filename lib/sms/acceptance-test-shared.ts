// Client-safe (no server imports): shared by the admin page and the server logic.

export const SMS_ACCEPTANCE_TEST_MESSAGE =
  'Walz Travels: This is a customer-care SMS test requested by a Walz Travels administrator. ' +
  'No action is required. Reply HELP for help or STOP to opt out.'

/** '+12317902336' → '+1••••2336' (leading digit and last 4 only). */
export function maskRecipient(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  if (digits.length < 6) return '••••'
  return `+${digits[0]}••••${digits.slice(-4)}`
}

/** 'SM0123…abcd' → 'SM••••abcd'. */
export function maskSid(sid: string | null | undefined): string | null {
  if (!sid) return null
  return `${sid.slice(0, 2)}••••${sid.slice(-4)}`
}

