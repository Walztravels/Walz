import { randomBytes } from 'crypto'
import prisma from '@/lib/db'
import { getFxQuote } from '@/lib/payments/fx'
import { priceTour } from '@/lib/tours/pricing'
import { duffelGet } from '@/lib/duffel/client'

/**
 * Server-side payment authority.
 *
 * The browser is NEVER authoritative for money. Before an inline/popup
 * provider flow starts, the client asks for a payment intent here; the
 * server derives the amount from authoritative records (Duffel offer,
 * package booking row, Tour row + add-on catalogue), persists it as a
 * PaymentLink snapshot, and hands back only { txRef, amount, currency }.
 * Fulfilment then reconciles the provider's verified transaction against
 * that snapshot — a mismatch can never fulfil an order; it becomes
 * PAYMENT_RECONCILIATION_REQUIRED for a human.
 *
 * Payment captured is still NOT supplier confirmation — nothing here
 * touches booking/supplier lifecycle states.
 */

export const PAYMENT_RECONCILIATION_REQUIRED = 'PAYMENT_RECONCILIATION_REQUIRED'

/** Absolute tolerance for provider-vs-snapshot comparison, in major units.
 *  Covers provider rounding of decimals; a real tamper is far larger. */
const AMOUNT_TOLERANCE = 1

export interface PaymentIntentResult {
  txRef:    string
  amount:   number
  currency: string
  description: string
}

function newIntentRef(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`
}

async function persistIntent(input: {
  txRef: string
  amount: number
  currency: string
  description: string
  clientEmail?: string | null
  clientName?: string | null
  fare?: { currency: string; amount: number; fxRate?: number; fxSource?: string } | null
}): Promise<void> {
  await prisma.paymentLink.create({
    data: {
      txRef:       input.txRef,
      amount:      input.amount,
      currency:    input.currency,
      clientEmail: input.clientEmail ?? null,
      clientName:  input.clientName ?? null,
      description: input.description,
      type:        'payment_intent',
      provider:    'walz-authority',
      status:      'pending',
      chargeCurrency: input.currency,
      chargeAmount:   input.amount,
      ...(input.fare ? {
        fareCurrency: input.fare.currency,
        fareAmount:   input.fare.amount,
        ...(input.fare.fxRate   ? { fxRate: input.fare.fxRate } : {}),
        ...(input.fare.fxSource ? { fxSource: input.fare.fxSource } : {}),
        fxQuotedAt: new Date(),
      } : {}),
    },
  })
}

export class PaymentAuthorityError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) {
    super(message)
    this.name = 'PaymentAuthorityError'
  }
}

// ── Flight intent ────────────────────────────────────────────────────────────

interface DuffelOfferLite {
  data?: { id: string; total_amount: string; total_currency: string; expires_at?: string }
}

export interface FlightIntentInput {
  offerId:        string
  chargeCurrency: string           // 'GBP' (fare currency) or 'NGN'
  fxLockId?:      string | null
  // Client-declared extras — additive only; they can raise the total, never
  // lower it below the Duffel fare.
  seatsTotal?:    number
  extrasTotal?:   number
  // Requested miles discount — honoured only up to the server-side
  // WalzRewardsMembership balance for the authenticated email (100 mi = £1).
  discountGBP?:   number
  clientEmail?:   string | null
  clientName?:    string | null
}

export async function createFlightPaymentIntent(input: FlightIntentInput): Promise<PaymentIntentResult> {
  if (!input.offerId?.startsWith('off_')) throw new PaymentAuthorityError('Invalid offer id')

  // 1. Authoritative fare from Duffel — never from the browser.
  let offer: DuffelOfferLite
  try {
    offer = await duffelGet<DuffelOfferLite>(`/air/offers/${input.offerId}`)
  } catch {
    throw new PaymentAuthorityError('Flight offer could not be verified. Please refresh your search.', 409, 'OFFER_UNAVAILABLE')
  }
  const fareTotal    = Number(offer.data?.total_amount)
  const fareCurrency = (offer.data?.total_currency ?? 'GBP').toUpperCase()
  if (!Number.isFinite(fareTotal) || fareTotal <= 0) {
    throw new PaymentAuthorityError('Flight offer could not be verified. Please refresh your search.', 409, 'OFFER_UNAVAILABLE')
  }

  // 2. Additive components — clamped to non-negative; capped defensively.
  const seats  = Math.min(Math.max(Number(input.seatsTotal)  || 0, 0), fareTotal)
  const extras = Math.min(Math.max(Number(input.extrasTotal) || 0, 0), fareTotal)

  // 3. Miles discount — only what the server-side balance supports.
  let discount = 0
  const requested = Math.max(Number(input.discountGBP) || 0, 0)
  if (requested > 0 && input.clientEmail) {
    const user = await prisma.user.findUnique({
      where:  { email: input.clientEmail.toLowerCase() },
      select: { walzRewards: { select: { milesBalance: true } } },
    }).catch(() => null)
    const balance     = user?.walzRewards?.milesBalance ?? 0
    const maxDiscount = Math.floor(balance / 100)
    discount = Math.min(requested, maxDiscount)
  }
  if (discount < requested) {
    console.warn(`[pay-authority] flight discount clamped ${requested}→${discount} (offer ${input.offerId})`)
  }

  const fareChargeTotal = Math.max(fareTotal + seats + extras - discount, 0.5)

  const charge = (input.chargeCurrency ?? fareCurrency).toUpperCase()
  const txRef  = newIntentRef('WALZ-FLIGHT')

  // 4. Charge amount in the fare currency — direct.
  if (charge === fareCurrency) {
    await persistIntent({
      txRef, amount: fareChargeTotal, currency: fareCurrency,
      description: `Flight ${input.offerId}`,
      clientEmail: input.clientEmail, clientName: input.clientName,
    })
    return { txRef, amount: fareChargeTotal, currency: fareCurrency, description: `Flight ${input.offerId}` }
  }

  // 5. NGN charge — central FX engine lock when enabled, otherwise the
  //    existing legacy service — computed HERE, server-side, either way.
  if (charge === 'NGN') {
    const { isNgnFxEngineEnabled, loadFxLock, createNgnQuote } = await import('@/lib/fx')
    if (isNgnFxEngineEnabled()) {
      // Reuse a valid lock whose base matches this fare; otherwise mint one.
      if (input.fxLockId) {
        const lock = await loadFxLock(input.fxLockId)
        if (lock && !lock.expired && lock.baseCurrency === fareCurrency
            && Math.abs(lock.baseAmount.toNumber() - fareChargeTotal) <= AMOUNT_TOLERANCE) {
          const amount = lock.convertedAmount.toNumber()
          await persistIntent({
            txRef, amount, currency: 'NGN',
            description: `Flight ${input.offerId} (NGN via FX lock ${lock.id})`,
            clientEmail: input.clientEmail, clientName: input.clientName,
            fare: { currency: fareCurrency, amount: fareChargeTotal, fxRate: lock.rawRate.toNumber(), fxSource: `walz-fx:${lock.rateSource}` },
          })
          return { txRef, amount, currency: 'NGN', description: `Flight ${input.offerId}` }
        }
      }
      const q = await createNgnQuote({ baseCurrency: fareCurrency, baseAmount: fareChargeTotal, context: 'CHECKOUT', reference: `flight:${input.offerId}` })
      const amount = q.convertedAmount.toNumber()
      await persistIntent({
        txRef, amount, currency: 'NGN',
        description: `Flight ${input.offerId} (NGN via FX lock ${q.lockId})`,
        clientEmail: input.clientEmail, clientName: input.clientName,
        fare: { currency: fareCurrency, amount: fareChargeTotal, fxRate: q.rawRate.toNumber(), fxSource: `walz-fx:${q.rateSource}` },
      })
      return { txRef, amount, currency: 'NGN', description: `Flight ${input.offerId}` }
    }

    const legacy = await getFxQuote(fareCurrency, 'NGN', fareChargeTotal)
    if (!legacy) throw new PaymentAuthorityError('NGN pricing is temporarily unavailable. Please try again shortly.', 503, 'NGN_RATE_UNAVAILABLE')
    await persistIntent({
      txRef, amount: legacy.amountTo, currency: 'NGN',
      description: `Flight ${input.offerId} (NGN legacy)`,
      clientEmail: input.clientEmail, clientName: input.clientName,
      fare: { currency: fareCurrency, amount: fareChargeTotal, fxRate: legacy.rate, fxSource: legacy.source },
    })
    return { txRef, amount: legacy.amountTo, currency: 'NGN', description: `Flight ${input.offerId}` }
  }

  throw new PaymentAuthorityError(`Unsupported charge currency ${charge}`)
}

// ── Package intent ───────────────────────────────────────────────────────────

interface PackageBookingRow {
  booking_ref:    string
  package_title:  string
  client_name:    string | null
  client_email:   string | null
  deposit_amount: number | string | null
  total_price:    number | string | null
  currency:       string | null
  payment_status: string | null
}

export interface PackageIntentInput {
  bookingRef:  string
  payCurrency: string   // package currency, or NGN/GHS for local payment
}

export async function createPackagePaymentIntent(input: PackageIntentInput): Promise<PaymentIntentResult> {
  const rows = await prisma.$queryRawUnsafe<PackageBookingRow[]>(
    `SELECT booking_ref, package_title, client_name, client_email,
            deposit_amount, total_price, currency, payment_status
     FROM package_bookings WHERE booking_ref = $1 LIMIT 1`,
    input.bookingRef,
  )
  const booking = rows?.[0]
  if (!booking) throw new PaymentAuthorityError('Booking not found', 404)
  if (booking.payment_status === 'deposit_paid') throw new PaymentAuthorityError('Deposit already paid', 400)

  const pkgCurrency = (booking.currency ?? 'USD').toUpperCase()
  const due = Number(booking.deposit_amount ?? booking.total_price ?? 0)
  if (!Number.isFinite(due) || due <= 0) throw new PaymentAuthorityError('No amount due for this booking', 400)

  const pay   = (input.payCurrency ?? pkgCurrency).toUpperCase()
  const txRef = newIntentRef('WALZ-PKG')
  const description = `Package deposit — ${booking.package_title} (${booking.booking_ref})`

  if (pay === pkgCurrency) {
    await persistIntent({ txRef, amount: due, currency: pkgCurrency, description, clientEmail: booking.client_email, clientName: booking.client_name })
    return { txRef, amount: due, currency: pkgCurrency, description }
  }

  // Local-currency deposit: NGN via the central engine when enabled;
  // otherwise the legacy Flutterwave-rate service — always server-side.
  // (This replaces the old hardcoded browser-side ×1620/×16.5 estimates.)
  if (pay === 'NGN') {
    const { isNgnFxEngineEnabled, createNgnQuote } = await import('@/lib/fx')
    if (isNgnFxEngineEnabled()) {
      const q = await createNgnQuote({ baseCurrency: pkgCurrency, baseAmount: due, context: 'CHECKOUT', reference: `package:${booking.booking_ref}` })
      const amount = q.convertedAmount.toNumber()
      await persistIntent({
        txRef, amount, currency: 'NGN', description,
        clientEmail: booking.client_email, clientName: booking.client_name,
        fare: { currency: pkgCurrency, amount: due, fxRate: q.rawRate.toNumber(), fxSource: `walz-fx:${q.rateSource}` },
      })
      return { txRef, amount, currency: 'NGN', description }
    }
  }
  const legacy = await getFxQuote(pkgCurrency, pay, due)
  if (!legacy) throw new PaymentAuthorityError(`${pay} pricing is temporarily unavailable. Please try again shortly.`, 503)
  await persistIntent({
    txRef, amount: legacy.amountTo, currency: pay, description,
    clientEmail: booking.client_email, clientName: booking.client_name,
    fare: { currency: pkgCurrency, amount: due, fxRate: legacy.rate, fxSource: legacy.source },
  })
  return { txRef, amount: legacy.amountTo, currency: pay, description }
}

// ── Tour intent ──────────────────────────────────────────────────────────────

export interface TourIntentInput {
  tourId:      string
  groupSize:   number
  addonIds:    string[]
  clientEmail?: string | null
  clientName?:  string | null
}

export async function createTourPaymentIntent(input: TourIntentInput): Promise<PaymentIntentResult> {
  const pricing = await priceTour(input.tourId, input.groupSize, input.addonIds)
  const txRef   = newIntentRef('WLZ-TOUR')
  const description = `Tour — ${pricing.tour.name} × ${input.groupSize}`
  await persistIntent({
    txRef, amount: pricing.total, currency: pricing.currency, description,
    clientEmail: input.clientEmail, clientName: input.clientName,
  })
  return { txRef, amount: pricing.total, currency: pricing.currency, description }
}

// ── Flutterwave verification + reconciliation ────────────────────────────────

export interface FlwVerifiedTx {
  ok:        boolean
  status?:   string
  amount?:   number
  currency?: string
  txRef?:    string
  flwId?:    string
}

/** Server-side Flutterwave transaction verify — the only trusted source of
 *  what was actually charged. */
export async function verifyFlutterwaveTransaction(transactionId: string | number): Promise<FlwVerifiedTx> {
  const secret = process.env.FLW_SECRET_KEY
  if (!secret) return { ok: false }
  try {
    const res = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(transactionId))}/verify`,
      { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15_000) },
    )
    if (!res.ok) return { ok: false }
    const json = await res.json() as {
      status?: string
      data?: { status?: string; amount?: number; currency?: string; tx_ref?: string; id?: number }
    }
    if (json.status !== 'success' || !json.data) return { ok: false }
    return {
      ok:       json.data.status === 'successful',
      status:   json.data.status,
      amount:   Number(json.data.amount),
      currency: json.data.currency?.toUpperCase(),
      txRef:    json.data.tx_ref,
      flwId:    String(json.data.id ?? transactionId),
    }
  } catch {
    return { ok: false }
  }
}

export interface ReconcileResult {
  ok:        boolean
  code?:     string           // PAYMENT_RECONCILIATION_REQUIRED | NOT_VERIFIED | INTENT_NOT_FOUND
  detail?:   string           // internal — never sent to the customer verbatim
  verified?: FlwVerifiedTx
  intent?:   { txRef: string; amount: number; currency: string; description: string | null }
}

/**
 * Reconcile a Flutterwave transaction against the server intent snapshot it
 * claims to pay. The snapshot is located from the VERIFIED transaction's
 * tx_ref (not from anything browser-supplied). Underpayment, overpayment
 * beyond tolerance, or a currency mismatch cannot fulfil — they surface as
 * PAYMENT_RECONCILIATION_REQUIRED and flag the snapshot for review.
 */
export async function reconcileFlutterwavePayment(transactionId: string | number): Promise<ReconcileResult> {
  const verified = await verifyFlutterwaveTransaction(transactionId)
  if (!verified.ok || !verified.amount || !verified.currency) {
    return { ok: false, code: 'NOT_VERIFIED', detail: `flw verify failed for ${transactionId}`, verified }
  }

  const intent = verified.txRef
    ? await prisma.paymentLink.findUnique({
        where:  { txRef: verified.txRef },
        select: { txRef: true, amount: true, currency: true, description: true, status: true },
      })
    : null

  if (!intent || intent.amount == null) {
    return { ok: false, code: 'INTENT_NOT_FOUND', detail: `no payment intent for tx_ref ${verified.txRef ?? '?'}`, verified }
  }

  const expected = Number(intent.amount)
  const matches  =
    verified.currency === intent.currency.toUpperCase() &&
    Math.abs(verified.amount - expected) <= AMOUNT_TOLERANCE

  if (!matches) {
    await prisma.paymentLink.update({
      where: { txRef: intent.txRef },
      data:  { status: 'reconciliation_required', payerName: `paid ${verified.currency} ${verified.amount}` },
    }).catch(() => {})
    console.error(`[pay-authority] ${PAYMENT_RECONCILIATION_REQUIRED} txRef=${intent.txRef} expected=${intent.currency} ${expected} got=${verified.currency} ${verified.amount}`)
    return {
      ok: false, code: PAYMENT_RECONCILIATION_REQUIRED,
      detail: `expected ${intent.currency} ${expected}, provider verified ${verified.currency} ${verified.amount}`,
      verified,
      intent: { txRef: intent.txRef, amount: expected, currency: intent.currency, description: intent.description },
    }
  }

  await prisma.paymentLink.update({
    where: { txRef: intent.txRef },
    data:  { status: 'paid', paidAt: new Date() },
  }).catch(() => {})

  return {
    ok: true, verified,
    intent: { txRef: intent.txRef, amount: expected, currency: intent.currency, description: intent.description },
  }
}
