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
