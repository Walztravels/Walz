// ─────────────────────────────────────────────────────────────────────────────
// Normalized payment lifecycle — provider-independent commercial events.
//
// All payment routes must funnel through these helpers rather than calling
// trackDurableEvent directly. This gives a single place to:
//   1. Deduplicate by (provider + providerPaymentId)
//   2. Emit the correct CommercialEventName
//   3. Record safe metadata (never credentials/secrets)
//   4. Update CartSession.convertedAt where cartSessionId is known
//
// NEVER emit booking_confirmed from here.
// Payment success ≠ supplier confirmation.
// ─────────────────────────────────────────────────────────────────────────────

import prisma            from '@/lib/db'
import { trackDurableEvent, trackCommercialEvent, type CommercialEventName } from './track'

// ── Provider type ─────────────────────────────────────────────────────────────

export type PaymentProvider =
  | 'STRIPE'
  | 'FLUTTERWAVE'
  | 'PAYSTACK'
  | 'NOWPAYMENTS'
  | 'BANK_TRANSFER'   // Flutterwave VA / dedicated_nuban
  | 'MANUAL'          // Admin mark-paid action

// ── Idempotency key ───────────────────────────────────────────────────────────
// Format: "PROVIDER:providerPaymentId"
// Stored as CommercialEvent.eventId so the existing unique index prevents dupes.

function paymentEventId(provider: PaymentProvider, providerPaymentId: string): string {
  return `${provider}:${providerPaymentId}`.slice(0, 64)
}

// ── Shared option shape ───────────────────────────────────────────────────────

export interface PaymentEventOpts {
  provider:          PaymentProvider
  providerPaymentId: string   // Stripe PI id, Flutterwave id, Paystack reference, etc.
  bookingId?:        string   // Prisma Booking.id when linkable
  quoteId?:          string
  leadId?:           string
  cartSessionId?:    string   // walz_cart_session_id — if present, marks CartSession.convertedAt
  amount:            number   // in major currency units (GBP/USD/NGN, not pence/kobo)
  currency:          string   // ISO 4217 uppercase
  paidAt?:           Date
  metadata?:         Record<string, unknown>
}

// ── recordPaymentSucceeded ────────────────────────────────────────────────────

/**
 * Call from any authoritative server-side payment confirmation:
 * - Stripe webhook (payment_intent.succeeded)
 * - Flutterwave webhook (charge.completed successful)
 * - Paystack webhook (charge.success)
 * - NowPayments IPN (finished)
 * - Admin MARK_PAID action
 * - Bank transfer VA confirmation
 *
 * Idempotent: duplicate calls with the same provider+providerPaymentId are silently skipped.
 * Never emits booking_confirmed — that is the supplier confirmation path.
 *
 * Must be wrapped in try/catch by callers — never allow tracking to fail
 * a business transaction.
 */
export async function recordPaymentSucceeded(opts: PaymentEventOpts): Promise<void> {
  const eventId = paymentEventId(opts.provider, opts.providerPaymentId)

  // Deduplicate — if this payment was already recorded, skip silently
  const existing = await prisma.commercialEvent.findFirst({
    where:  { eventId },
    select: { id: true },
  }).catch(() => null)
  if (existing) {
    console.log(`[Payment] Duplicate skipped: ${eventId}`)
    return
  }

  // Mark CartSession converted when cartSessionId is known
  if (opts.cartSessionId) {
    await prisma.cartSession.updateMany({
      where: { sessionId: opts.cartSessionId, convertedAt: null },
      data:  { convertedAt: opts.paidAt ?? new Date() },
    }).catch(err => console.warn('[Payment] CartSession convertedAt update failed:', (err as Error).message))
  }

  await trackDurableEvent('payment_succeeded', {
    eventId,
    bookingId:   opts.bookingId,
    leadId:      opts.leadId,
    sessionId:   opts.cartSessionId,
    currency:    opts.currency.toUpperCase(),
    amount:      opts.amount,
    metadata: {
      provider:          opts.provider,
      providerPaymentId: opts.providerPaymentId,
      quoteId:           opts.quoteId,
      paidAt:            (opts.paidAt ?? new Date()).toISOString(),
      ...opts.metadata,
    },
  })
}

// ── recordPaymentFailed ───────────────────────────────────────────────────────

export interface PaymentFailedOpts {
  provider:          PaymentProvider
  providerPaymentId: string
  bookingId?:        string
  amount?:           number
  currency?:         string
  reason?:           string
  metadata?:         Record<string, unknown>
}

/**
 * Call when the payment provider definitively fails the transaction.
 * Server-only — never accept from browser.
 */
export async function recordPaymentFailed(opts: PaymentFailedOpts): Promise<void> {
  trackCommercialEvent('payment_failed' as CommercialEventName, {
    bookingId: opts.bookingId,
    currency:  opts.currency?.toUpperCase(),
    amount:    opts.amount,
    metadata: {
      provider:          opts.provider,
      providerPaymentId: opts.providerPaymentId,
      reason:            opts.reason,
      ...opts.metadata,
    },
  })
}

// ── recordRefundProcessed ─────────────────────────────────────────────────────

export interface RefundOpts {
  provider:         PaymentProvider
  providerRefundId: string
  bookingId?:       string
  amount:           number
  currency:         string
  metadata?:        Record<string, unknown>
}

/**
 * Call when a refund is confirmed by the payment provider.
 * Server-only — never accept from browser.
 */
export async function recordRefundProcessed(opts: RefundOpts): Promise<void> {
  const eventId = paymentEventId(opts.provider, `refund:${opts.providerRefundId}`)

  const existing = await prisma.commercialEvent.findFirst({
    where:  { eventId },
    select: { id: true },
  }).catch(() => null)
  if (existing) return

  await trackDurableEvent('refund_processed' as CommercialEventName, {
    eventId,
    bookingId: opts.bookingId,
    currency:  opts.currency.toUpperCase(),
    amount:    opts.amount,
    metadata: {
      provider:         opts.provider,
      providerRefundId: opts.providerRefundId,
      ...opts.metadata,
    },
  })
}
