/**
 * Client Action Centre shared constants (UX-4.1B) — client-safe module
 * (no prisma/provider imports; the UI and the server service both use it).
 */

export const PAYMENT_PURPOSES = [
  'flight', 'hotel', 'visa_service', 'tour_activity',
  'transfer', 'package', 'insurance', 'esim', 'other',
] as const
export type PaymentPurpose = typeof PAYMENT_PURPOSES[number]

export const PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  flight: 'Flight', hotel: 'Hotel', visa_service: 'Visa Service',
  tour_activity: 'Tour / Activity', transfer: 'Transfer',
  package: 'Package', insurance: 'Insurance', esim: 'eSIM', other: 'Other',
}

/** Providers exposed by the Action Centre — proven operational only. */
export const ACTION_CENTRE_PROVIDERS = ['stripe', 'flutterwave', 'paystack_va'] as const
export type ActionCentreProvider = typeof ACTION_CENTRE_PROVIDERS[number]

export const PROVIDER_LABELS: Record<ActionCentreProvider, string> = {
  stripe: 'Stripe (card / Apple Pay / Google Pay)',
  flutterwave: 'Flutterwave (card / bank transfer / USSD)',
  paystack_va: 'Paystack bank transfer (NGN account)',
}

/**
 * Account-level currency allowlists mirrored from lib/payments/processors
 * (the server re-validates through isCurrencySupported — this map only
 * drives the form options).
 */
export const PROVIDER_CURRENCIES: Record<ActionCentreProvider, string[]> = {
  stripe: ['GBP', 'USD', 'CAD', 'EUR', 'AED'],
  flutterwave: ['NGN', 'GHS', 'KES', 'ZAR', 'UGX', 'TZS', 'XAF', 'XOF', 'RWF', 'USD', 'GBP', 'EUR'],
  paystack_va: ['NGN'],
}

/**
 * Amount must be a positive finite number with at most 2 decimals, capped.
 * Epsilon comparison — an exact float check rejects legitimate values
 * (19.99 * 100 === 1998.9999999999998 in IEEE 754). Client-safe: used by
 * both server services (payment-request.ts re-exports this) and UI forms.
 */
const MAX_AMOUNT_MAJOR = 50_000_000
export function isValidAmountMajor(n: unknown): n is number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return false
  if (n > MAX_AMOUNT_MAJOR) return false
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6
}

/**
 * UX-4.3 — visa case types. VisaApplication.visaType is a plain string
 * (no Prisma enum, matching this app's whole-schema convention) defaulting
 * to 'tourist' — this is a presentation taxonomy for the Action Centre's
 * "Create case" form, not a new source of truth on the model.
 */
export const VISA_TYPES = ['tourist', 'business', 'student', 'work', 'transit', 'other'] as const
export type VisaType = typeof VISA_TYPES[number]
export const VISA_TYPE_LABELS: Record<VisaType, string> = {
  tourist: 'Tourist / Visitor', business: 'Business', student: 'Student',
  work: 'Work', transit: 'Transit', other: 'Other',
}

/**
 * Destination country options for the Create-case form, derived from the
 * EXISTING supported-destinations map (lib/visa-config.ts ISO2_TO_SLUG —
 * already client-safe, already imported by the public /visa pages) rather
 * than a second, hand-maintained country list. Slug title-cased for
 * display (e.g. 'south-africa' -> 'South Africa').
 */
import { ISO2_TO_SLUG } from '@/lib/visa-config'
export const DESTINATION_OPTIONS: Array<{ iso2: string; label: string }> =
  Object.entries(ISO2_TO_SLUG)
    .map(([iso2, slug]) => {
      const name = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      // The Schengen-area countries all share the 'schengen' slug — the
      // iso2 suffix disambiguates what would otherwise be identical rows.
      return { iso2, label: slug === 'schengen' ? `${name} (${iso2})` : name }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
