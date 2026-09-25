import { SMS_SENDER_PHRASE } from '@/lib/config/legal-entities'

/**
 * Approved HELP text for the CUSTOMER_CARE SMS program (non-promotional).
 * Lives outside the route file because Next.js route modules may only export
 * HTTP handlers and route-config fields. Twilio Advanced Opt-Out is the
 * authoritative HELP responder; this is also the text to paste into its
 * console configuration.
 */
export const SMS_HELP_REPLY =
  `${SMS_SENDER_PHRASE}: customer-care texts about your travel enquiries, bookings, payments and visa services. ` +
  'Msg frequency varies. Msg&data rates may apply. Reply STOP to opt out. Support: contact@walztravels.com'
