// ─────────────────────────────────────────────────────────────────────────────
// Server-only: post-payment activity booking dispatcher.
//
// Called from the Stripe webhook (checkout.session.completed) as the authoritative
// trusted trigger. The browser success page is read-only — it polls status.
//
// ── Status lifecycle ──────────────────────────────────────────────────────────
//   PAYMENT_RECEIVED
//     ↓  (atomic claim — only one process proceeds)
//   SUPPLIER_CONFIRMING
//     ↓
//   CONFIRMED                   — supplier booked, voucher + email sent
//   SUPPLIER_BOOKING_FAILED     — definitive rejection (SOLD_OUT / REJECTED)
//   RECONCILIATION_REQUIRED     — timeout / lost response / unknown outcome
//   PAYMENT_RECEIVED            — feature flag off; admin confirms manually
//   PRICE_CHANGE_REQUIRES_ACTION — supplier price increased beyond tolerance
//
// ── Idempotency ───────────────────────────────────────────────────────────────
//   Primary key:  (stripeSessionId, cartItemId)  [unique index in DB]
//   Secondary:    walzReference == Viator partnerOrderId for reconciliation
//   Email flags:  paymentReceiptSentAt / confirmationEmailSentAt / failureAlertSentAt
//
// ── Race condition protection ─────────────────────────────────────────────────
//   Atomic SQL UPDATE WHERE status='PAYMENT_RECEIVED' — only 1 process proceeds.
//
// ── SECURITY ─────────────────────────────────────────────────────────────────
//   Viator API key is env-only. supplierNetAmount is DB-only, never client-side.
// ─────────────────────────────────────────────────────────────────────────────

import prisma                          from '@/lib/db'
import { ViatorActivityProvider }      from './providers/viator'
import { HotelbedsActivityProvider }   from './providers/hotelbeds'
import { applyActivityMarkup }         from './pricing'
import { getResend }                   from '@/lib/resend'
import { viatorGet }                   from './providers/viator/client'
import {
  recordBookingConfirmed,
  recordSupplierBookingFailed,
  recordReconciliationRequired,
  recordCrossSellPurchased,
  recordPostBookingUpsellPurchased,
} from '@/lib/commercial/track'
import { setTripConfirming, applyDerivedTripStatus } from '@/lib/trips/lifecycle'
import type { ActivityBookingResult, ActivitySupplier } from './types'
import type { ViatorScheduleResponse } from './providers/viator/types'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

// ── Feature flags ─────────────────────────────────────────────────────────────

function isViatorEnabled(): boolean {
  return process.env.VIATOR_SELF_SERVICE_BOOKING_ENABLED === 'true'
}

// Max Walz-absorbed price increase before requiring admin action (default 5%)
const PRICE_TOLERANCE_PERCENT = Number(
  process.env.VIATOR_POST_PAYMENT_PRICE_TOLERANCE_PERCENT ?? '5'
)

// Stale SUPPLIER_CONFIRMING detection: older than this → move to RECONCILIATION_REQUIRED
const STALE_CONFIRMING_MS = 10 * 60 * 1000  // 10 minutes

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CartItemCompact {
  cid:   string    // stable cart-line ID (position index within Stripe session)
  tid?:  string    // TripItem.id — back-written to TripItem.bookingRef after booking (2D.1)
  cs?:   string    // commercialSource — 'cross_sell' | 'post_booking_upsell' for attribution (2D.3)
  t:     string    // 'activity' | 'transfer' | ...
  title: string
  s:     string    // 'VIATOR' | 'HOTELBEDS' | 'MANUAL'
  pc:    string    // productCode / activityCode
  poc:   string    // productOptionCode / modalityCode
  d:     string    // YYYY-MM-DD travel date
  a:     number    // adults
  c:     number    // children
  i:     number    // infants
  st:    string    // startTime HH:MM
  p:     number    // Walz selling price (post-markup)
  cur:   string    // currency
  loc:   string
  dur:   string
}

export interface BookingHolder {
  name:   string
  email:  string
  phone?: string
}

export interface ProcessedBooking {
  walzReference:     string
  supplierReference: string | null
  status:            string
  supplier:          string
  activityTitle:     string
  failureReason?:    string
  error?:            string
}

// ── Parse compact item keys from Stripe session metadata ──────────────────────

export function parseCartItems(metadata: Record<string, string>): CartItemCompact[] {
  const count = parseInt(metadata.item_count ?? '0', 10)
  const items: CartItemCompact[] = []
  for (let i = 0; i < count; i++) {
    const raw = metadata[`item_${i}`]
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as Partial<CartItemCompact>
      // Back-fill cid for sessions created before the cartItemId change
      items.push({ ...parsed, cid: parsed.cid ?? String(i) } as CartItemCompact)
    } catch { /* skip malformed */ }
  }
  return items
}

// ── Walz reference ────────────────────────────────────────────────────────────

function generateWalzRef(): string {
  const ts  = Date.now().toString(36).toUpperCase()
  const rnd = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `WALZ-ACT-${ts}-${rnd}`
}

// ── Structured logging ────────────────────────────────────────────────────────

function log(event: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({ event, ...fields, ts: new Date().toISOString() }))
}

// ── Attempt record helpers ─────────────────────────────────────────────────────

async function createAttempt(
  activityBookingId: string,
  supplier: string,
  walzRef: string,
  attemptNumber: number,
): Promise<string> {
  const attempt = await prisma.activityBookingAttempt.create({
    data: {
      activityBookingId,
      supplier,
      action:                 'BOOK',
      status:                 'IN_PROGRESS',
      partnerBookingReference: walzRef,
      startedAt:              new Date(),
      attemptNumber,
    },
  })
  return attempt.id
}

async function resolveAttempt(
  attemptId: string,
  result: ActivityBookingResult,
) {
  await prisma.activityBookingAttempt.update({
    where: { id: attemptId },
    data: {
      status:                  result.success ? 'SUCCEEDED' : 'FAILED',
      supplierBookingReference: result.supplierReference ?? null,
      completedAt:             new Date(),
      lastErrorMessage:        result.error ?? null,
    },
  })
}

async function markAttemptUnknown(attemptId: string, error: string) {
  await prisma.activityBookingAttempt.update({
    where: { id: attemptId },
    data: {
      status:          'UNKNOWN',
      completedAt:     new Date(),
      lastErrorMessage: error,
    },
  })
}

// ── Price revalidation ────────────────────────────────────────────────────────
// Fetches the current Viator schedule and checks:
//   1. Is the date still available?
//   2. Has the supplier net price changed beyond tolerance?

interface PriceRevalidationResult {
  available:       boolean
  currentNetPrice: number | null
  soldOut:         boolean
  priceIncreasePct: number | null
}

async function revalidateViatorPrice(
  productCode: string,
  travelDate: string,
  storedSellingPrice: number,
  currency: string,
): Promise<PriceRevalidationResult> {
  try {
    const { status, data } = await viatorGet<ViatorScheduleResponse>(
      `/availability/schedules/${encodeURIComponent(productCode)}`
    )
    if (status !== 200 || !data.bookableItems?.length) {
      return { available: false, currentNetPrice: null, soldOut: true, priceIncreasePct: null }
    }

    const today    = new Date().toISOString().slice(0, 10)
    const dayName  = new Date(`${travelDate}T12:00:00Z`)
      .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toUpperCase()

    let currentNetPrice: number | null = null
    let dateIsAvailable = false
    let dateIsSoldOut   = false

    for (const item of data.bookableItems) {
      for (const season of item.seasons ?? []) {
        if (season.startDate > travelDate || season.endDate < travelDate) continue
        for (const rec of season.pricingRecords ?? []) {
          if (rec.daysOfWeek && !rec.daysOfWeek.includes(dayName)) continue
          const adultDetail = (rec.pricingDetails ?? []).find(d => d.ageBand === 'ADULT')
            ?? (rec.pricingDetails ?? [])[0]
          if (!adultDetail) continue

          const sp = adultDetail.price.special
          const useSpecial = !!(sp && sp.offerStartDate != null && sp.offerEndDate != null &&
            sp.offerStartDate <= today && sp.offerEndDate >= today)
          currentNetPrice = useSpecial
            ? (sp!.partnerNetPrice)
            : adultDetail.price.original.partnerNetPrice

          // Check sold-out via timedEntries
          if (rec.timedEntries?.length) {
            const allSoldOut = rec.timedEntries.every(e =>
              e.unavailableDates?.some(u => u.date === travelDate)
            )
            if (allSoldOut) { dateIsSoldOut = true; break }
          }
          dateIsAvailable = true
          break
        }
        if (currentNetPrice !== null) break
      }
      if (currentNetPrice !== null) break
    }

    if (!dateIsAvailable || dateIsSoldOut) {
      return { available: false, currentNetPrice, soldOut: true, priceIncreasePct: null }
    }

    // Compare prices: reverse-engineer stored net from selling price
    const viatorMarkup = 18
    const storedNetEstimate = storedSellingPrice / (1 + viatorMarkup / 100)

    let priceIncreasePct: number | null = null
    if (currentNetPrice !== null && storedNetEstimate > 0) {
      const diff = currentNetPrice - storedNetEstimate
      if (diff > 0) priceIncreasePct = (diff / storedNetEstimate) * 100
    }

    return { available: true, currentNetPrice, soldOut: false, priceIncreasePct }
  } catch (err) {
    // Revalidation failure is non-fatal — proceed with booking
    console.warn('[ActivityBooking] Price revalidation failed:', err instanceof Error ? err.message : err)
    return { available: true, currentNetPrice: null, soldOut: false, priceIncreasePct: null }
  }
}

// ── Supplier API dispatch ─────────────────────────────────────────────────────

async function callSupplierAPI(
  item:      CartItemCompact,
  holder:    BookingHolder,
  walzRef:   string,
  attemptId: string,
): Promise<ActivityBookingResult> {
  const params = {
    supplier:          (item.s || 'MANUAL') as ActivitySupplier,
    supplierProductId: item.pc,
    modalityCode:      item.poc || undefined,
    date:              item.d,
    startTime:         item.st || undefined,
    adults:            item.a || 1,
    children:          item.c || 0,
    infants:           item.i || 0,
    holderName:        holder.name,
    holderEmail:       holder.email,
    holderPhone:       holder.phone,
    currency:          item.cur,
    sellingPrice:      item.p,
    walzReference:     walzRef,
  }

  if (item.s === 'VIATOR') {
    if (!isViatorEnabled()) {
      log('viator_supplier_claim_skipped_flag_off', { walzRef, attemptId })
      return {
        success:       false,
        walzReference: walzRef,
        status:        'PENDING',
        error:         'VIATOR_SELF_SERVICE_BOOKING_ENABLED=false. Admin confirms manually.',
      }
    }
    if (!process.env.VIATOR_API_KEY) {
      return { success: false, walzReference: walzRef, status: 'FAILED', error: 'VIATOR_API_KEY not set' }
    }
    log('viator_booking_started', { walzRef, attemptId, productCode: item.pc })
    return new ViatorActivityProvider().book(params)
  }

  if (item.s === 'HOTELBEDS') {
    return new HotelbedsActivityProvider().book(params)
  }

  return { success: true, walzReference: walzRef, supplierReference: undefined, status: 'CONFIRMED' }
}

// ── Email helpers (all idempotent via DB timestamp flags) ─────────────────────

async function sendPaymentReceiptEmailIfNotSent(
  bookingId: string,
  holder:    BookingHolder,
  walzRef:   string,
  title:     string,
) {
  const existing = await prisma.activityBooking.findUnique({
    where:  { id: bookingId },
    select: { paymentReceiptSentAt: true },
  })
  if (existing?.paymentReceiptSentAt) return

  await getResend().emails.send({
    from:    'Walz Travels <bookings@walztravels.com>',
    to:      holder.email,
    subject: `Payment Received — Your booking is being confirmed | ${walzRef}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#0B1F3A;padding:32px;text-align:center">
          <img src="${SITE}/walz-logo.png" width="140" alt="Walz Travels"/>
        </div>
        <div style="padding:32px;background:#fff">
          <h1 style="color:#0B1F3A;font-size:22px;margin:0 0 12px">Payment Received</h1>
          <p style="color:#374151;margin:0 0 20px">Hi ${holder.name || 'there'}, we've received your payment for:</p>
          <div style="background:#f5f0e8;border-radius:12px;padding:20px;margin-bottom:20px">
            <p style="font-weight:bold;color:#0B1F3A;margin:0 0 12px">${title}</p>
            <p style="color:#6b7280;font-size:11px;letter-spacing:2px;margin:0 0 4px">WALZ REFERENCE</p>
            <p style="color:#C9A84C;font-family:monospace;font-size:22px;font-weight:bold;margin:0">${walzRef}</p>
          </div>
          <p style="color:#374151;margin:0 0 12px">Your activity reservation is being confirmed with the supplier.</p>
          <p style="color:#374151;margin:0 0 24px">You will receive your final confirmation and voucher once confirmed — usually within a few minutes.</p>
          <div style="background:#f0fdf4;border-radius:12px;padding:16px">
            <p style="color:#166534;font-size:14px;margin:0">Questions? WhatsApp: <a href="https://wa.me/12317902336" style="color:#16a34a;font-weight:bold">+1 231 790 2336</a></p>
          </div>
        </div>
      </div>
    `,
  }).catch(e => console.error('[ActivityBooking] Receipt email failed:', e))

  await prisma.activityBooking.update({
    where: { id: bookingId },
    data:  { paymentReceiptSentAt: new Date() },
  }).catch(() => {})
}

async function sendConfirmedEmailIfNotSent(
  bookingId:   string,
  holder:      BookingHolder,
  walzRef:     string,
  supplierRef: string | null | undefined,
  item:        CartItemCompact,
) {
  const existing = await prisma.activityBooking.findUnique({
    where:  { id: bookingId },
    select: { confirmationEmailSentAt: true },
  })
  if (existing?.confirmationEmailSentAt) return

  const travellerLine = [
    item.a > 0 ? `${item.a} adult${item.a !== 1 ? 's' : ''}` : '',
    item.c > 0 ? `${item.c} child${item.c !== 1 ? 'ren' : ''}` : '',
    item.i > 0 ? `${item.i} infant${item.i !== 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(', ')

  await getResend().emails.send({
    from:    'Walz Travels <bookings@walztravels.com>',
    to:      holder.email,
    subject: `Activity Confirmed — ${walzRef} | Walz Travels`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#0B1F3A;padding:32px;text-align:center">
          <img src="${SITE}/walz-logo.png" width="140" alt="Walz Travels"/>
        </div>
        <div style="padding:32px;background:#fff">
          <div style="text-align:center;margin-bottom:28px">
            <div style="width:64px;height:64px;background:#dcfce7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center">
              <span style="font-size:32px">✅</span>
            </div>
            <h1 style="color:#0B1F3A;font-size:24px;margin:12px 0 4px">Activity Confirmed!</h1>
            <p style="color:#6b7280;margin:0">Hi ${holder.name || 'there'}, your reservation is all set.</p>
          </div>
          <div style="background:#f5f0e8;border-radius:12px;padding:20px;margin-bottom:20px">
            <p style="font-weight:bold;color:#0B1F3A;font-size:16px;margin:0 0 16px">${item.title}</p>
            ${item.d ? `<p style="color:#374151;font-size:14px;margin:0 0 6px">📅 <strong>Date:</strong> ${item.d}</p>` : ''}
            ${item.st ? `<p style="color:#374151;font-size:14px;margin:0 0 6px">🕐 <strong>Time:</strong> ${item.st}</p>` : ''}
            ${travellerLine ? `<p style="color:#374151;font-size:14px;margin:0 0 6px">👥 <strong>Travellers:</strong> ${travellerLine}</p>` : ''}
          </div>
          <div style="display:flex;gap:12px;margin-bottom:20px">
            <div style="flex:1;background:#f9fafb;border-radius:8px;padding:14px">
              <p style="color:#6b7280;font-size:10px;letter-spacing:2px;margin:0 0 4px">WALZ REFERENCE</p>
              <p style="color:#C9A84C;font-family:monospace;font-weight:bold;font-size:16px;margin:0">${walzRef}</p>
            </div>
            ${supplierRef ? `<div style="flex:1;background:#f9fafb;border-radius:8px;padding:14px">
              <p style="color:#6b7280;font-size:10px;letter-spacing:2px;margin:0 0 4px">SUPPLIER REF</p>
              <p style="color:#0B1F3A;font-family:monospace;font-weight:bold;font-size:16px;margin:0">${supplierRef}</p>
            </div>` : ''}
          </div>
          <p style="color:#374151;font-size:14px;margin:0 0 24px">Present your Walz reference at the meeting point.</p>
          <div style="background:#f0fdf4;border-radius:12px;padding:16px">
            <p style="color:#166534;font-size:14px;margin:0">Questions? WhatsApp: <a href="https://wa.me/12317902336" style="color:#16a34a;font-weight:bold">+1 231 790 2336</a></p>
          </div>
        </div>
      </div>
    `,
  }).catch(e => console.error('[ActivityBooking] Confirmed email failed:', e))

  await prisma.activityBooking.update({
    where: { id: bookingId },
    data:  { confirmationEmailSentAt: new Date(), supplierConfirmedAt: new Date() },
  }).catch(() => {})
}

async function sendFailureAlertIfNotSent(
  bookingId: string,
  walzRef:   string,
  supplier:  string,
  title:     string,
  reason:    string,
  error:     string,
) {
  const existing = await prisma.activityBooking.findUnique({
    where:  { id: bookingId },
    select: { failureAlertSentAt: true },
  })
  if (existing?.failureAlertSentAt) return

  const label = reason === 'SOLD_OUT' ? '🚫 SOLD OUT AFTER PAYMENT'
    : reason === 'PRICE_CHANGE' ? '💰 PRICE CHANGE AFTER PAYMENT'
    : reason === 'TIMEOUT' ? '⏱️ SUPPLIER TIMEOUT — RECONCILIATION REQUIRED'
    : '⚠️ SUPPLIER BOOKING FAILED'

  await getResend().emails.send({
    from:    'Walz Travels System <bookings@walztravels.com>',
    to:      'contact@walztravels.com',
    subject: `${label} — ${walzRef}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#7f1d1d;padding:24px;text-align:center">
          <h1 style="color:#fff;font-size:18px;margin:0">${label}</h1>
        </div>
        <div style="padding:24px;background:#fff">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 12px;font-weight:bold;color:#374151;background:#f9fafb;width:160px">Walz Reference</td>
                <td style="padding:8px 12px;font-family:monospace;color:#C9A84C;font-size:18px">${walzRef}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;color:#374151;background:#f9fafb">Activity</td>
                <td style="padding:8px 12px">${title}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;color:#374151;background:#f9fafb">Supplier</td>
                <td style="padding:8px 12px">${supplier}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;color:#374151;background:#f9fafb">Reason</td>
                <td style="padding:8px 12px">${reason}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;color:#374151;background:#f9fafb">Error</td>
                <td style="padding:8px 12px;color:#dc2626;font-size:13px">${error}</td></tr>
          </table>
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin-top:16px">
            <p style="color:#7f1d1d;font-weight:bold;margin:0">PAYMENT RECEIVED — ACTION REQUIRED</p>
            <p style="color:#991b1b;margin:8px 0 0;font-size:14px">Customer has been charged. Manual resolution or refund required.</p>
            <p style="color:#991b1b;margin:4px 0 0;font-size:14px">Review <strong>${walzRef}</strong> in the admin panel immediately.</p>
          </div>
        </div>
      </div>
    `,
  }).catch(e => console.error('[ActivityBooking] Admin alert email failed:', e))

  await prisma.activityBooking.update({
    where: { id: bookingId },
    data:  { failureAlertSentAt: new Date() },
  }).catch(() => {})
}

// ── Aggregate cart status ─────────────────────────────────────────────────────

export type CartStatus =
  | 'PROCESSING'
  | 'CONFIRMED'
  | 'PARTIALLY_CONFIRMED'
  | 'ACTION_REQUIRED'
  | 'FAILED'

const CONFIRMED_STATUS    = new Set(['CONFIRMED'])
const PENDING_STATUSES    = new Set(['PAYMENT_RECEIVED', 'SUPPLIER_CONFIRMING', 'PROCESSING'])
const FAILED_STATUSES     = new Set(['SUPPLIER_BOOKING_FAILED', 'PRICE_CHANGE_REQUIRES_ACTION'])
const RECON_STATUSES      = new Set(['RECONCILIATION_REQUIRED'])

export function aggregateCartStatus(statuses: string[]): CartStatus {
  if (!statuses.length) return 'PROCESSING'
  const confirmed = statuses.filter(s => CONFIRMED_STATUS.has(s)).length
  const pending   = statuses.filter(s => PENDING_STATUSES.has(s)).length
  const failed    = statuses.filter(s => FAILED_STATUSES.has(s) || RECON_STATUSES.has(s)).length
  if (confirmed === statuses.length) return 'CONFIRMED'
  if (confirmed > 0 && (failed > 0 || pending > 0)) return 'PARTIALLY_CONFIRMED'
  if (failed > 0 || RECON_STATUSES.has(statuses[0])) return 'ACTION_REQUIRED'
  return 'PROCESSING'
}

// ── Main booking processor ────────────────────────────────────────────────────
//
// Process all activity items from a confirmed Stripe session.
// Safe to call multiple times — fully idempotent.

export async function bookCartActivities(
  items:           CartItemCompact[],
  holder:          BookingHolder,
  stripeSessionId: string,
  totalAmount:     number,
  currency:        string,
  tripId?:         string | null,
): Promise<ProcessedBooking[]> {
  const activityItems = items.filter(i => i.t === 'activity')
  if (!activityItems.length) return []

  // Advance trip status to CONFIRMING — supplier fulfillment is beginning.
  if (tripId) void setTripConfirming(tripId)

  const results: ProcessedBooking[] = []

  for (const item of activityItems) {
    const cartItemId = item.cid ?? String(items.indexOf(item))

    // ── 1. Idempotency: exact match on (stripeSessionId, cartItemId) ──────────
    const existing = await prisma.activityBooking.findFirst({
      where: {
        stripeSessionId,
        cartItemId,
      },
      select: {
        id: true, walzReference: true, supplierReference: true,
        status: true, supplier: true, activityTitle: true, failureReason: true,
      },
    })
    if (existing) {
      log('viator_supplier_claim_rejected', {
        reason: 'already_processed',
        walzRef: existing.walzReference,
        status: existing.status,
      })
      results.push({
        walzReference:     existing.walzReference ?? '',
        supplierReference: existing.supplierReference ?? null,
        status:            existing.status,
        supplier:          existing.supplier,
        activityTitle:     existing.activityTitle ?? item.title,
        failureReason:     existing.failureReason ?? undefined,
      })
      continue
    }

    // ── 2. Also check by walzReference if a record was partially created ──────
    // (handles crash between create and status update)
    // No action needed here — the DB create below is our canonical first write.

    const walzRef = generateWalzRef()

    // ── 3. Persist at PAYMENT_RECEIVED — durable anchor before any API call ───
    let bookingId: string
    try {
      const created = await prisma.activityBooking.create({
        data: {
          supplier:          item.s || 'MANUAL',
          supplierProductId: item.pc || null,
          walzReference:     walzRef,
          bookingSource:     'CUSTOMER_WEB',
          cartItemId,
          clientName:        holder.name,
          clientEmail:       holder.email,
          clientPhone:       holder.phone ?? null,
          activityTitle:     item.title,
          location:          item.loc || null,
          travelDate:        item.d || null,
          adults:            item.a || 1,
          children:          item.c || 0,
          infants:           item.i || 0,
          totalAmount,
          currency,
          status:            'PAYMENT_RECEIVED',
          paymentStatus:     'PAID',
          stripeSessionId,
          // 3A: Attribution persistence — survives the reconciliation path
          commercialSource:  item.cs  || null,
          tripItemId:        item.tid || null,
        },
      })
      bookingId = created.id
      log('viator_booking_started', { walzRef, bookingId, cartItemId, supplier: item.s })

      // 2D.1: Back-write bookingRef to TripItem so fulfillment status is queryable.
      // Non-fatal — booking proceeds even if TripItem link fails.
      if (item.tid) {
        prisma.tripItem.update({
          where: { id: item.tid },
          data:  { bookingRef: walzRef },
        }).catch(err => console.warn('[2D.1] TripItem.bookingRef back-write failed:', (err as Error).message))
      }
    } catch (err) {
      // Likely a duplicate — the unique index on (stripeSessionId, cartItemId) fired.
      // Re-check and return existing.
      const retry = await prisma.activityBooking.findFirst({
        where: { stripeSessionId, cartItemId },
        select: {
          id: true, walzReference: true, supplierReference: true,
          status: true, supplier: true, activityTitle: true, failureReason: true,
        },
      })
      if (retry) {
        log('viator_supplier_claim_rejected', { reason: 'unique_violation_retry', cartItemId })
        results.push({
          walzReference:     retry.walzReference ?? '',
          supplierReference: retry.supplierReference ?? null,
          status:            retry.status,
          supplier:          retry.supplier,
          activityTitle:     retry.activityTitle ?? item.title,
          failureReason:     retry.failureReason ?? undefined,
        })
        continue
      }
      console.error('[ActivityBooking] DB create failed:', err)
      results.push({
        walzReference: walzRef, supplierReference: null,
        status: 'RECONCILIATION_REQUIRED', supplier: item.s, activityTitle: item.title,
        error: 'DB write failed',
      })
      continue
    }

    // ── 4. Payment receipt email (idempotent) ─────────────────────────────────
    sendPaymentReceiptEmailIfNotSent(bookingId, holder, walzRef, item.title).catch(() => {})

    // ── 5. Pre-flight: availability and price revalidation ────────────────────
    if (item.s === 'VIATOR' && item.pc && item.d && isViatorEnabled()) {
      const validation = await revalidateViatorPrice(item.pc, item.d, item.p, item.cur)

      if (validation.soldOut) {
        log('viator_booking_failed', { walzRef, reason: 'SOLD_OUT' })
        await prisma.activityBooking.update({
          where: { id: bookingId },
          data:  { status: 'SUPPLIER_BOOKING_FAILED', failureReason: 'SOLD_OUT',
                   notes: 'Date sold out at time of booking attempt' },
        })
        sendFailureAlertIfNotSent(bookingId, walzRef, item.s, item.title, 'SOLD_OUT',
          `Date ${item.d} is no longer available`).catch(() => {})
        results.push({
          walzReference: walzRef, supplierReference: null,
          status: 'SUPPLIER_BOOKING_FAILED', supplier: item.s,
          activityTitle: item.title, failureReason: 'SOLD_OUT',
        })
        continue
      }

      if (validation.priceIncreasePct !== null && validation.priceIncreasePct > PRICE_TOLERANCE_PERCENT) {
        log('viator_booking_failed', { walzRef, reason: 'PRICE_CHANGE', pct: validation.priceIncreasePct })
        await prisma.activityBooking.update({
          where: { id: bookingId },
          data: {
            status: 'PRICE_CHANGE_REQUIRES_ACTION', failureReason: 'PRICE_CHANGE',
            notes: `Supplier price increased ${validation.priceIncreasePct.toFixed(1)}% — beyond ${PRICE_TOLERANCE_PERCENT}% tolerance`,
          },
        })
        sendFailureAlertIfNotSent(bookingId, walzRef, item.s, item.title, 'PRICE_CHANGE',
          `Supplier net increased ${validation.priceIncreasePct.toFixed(1)}%`).catch(() => {})
        results.push({
          walzReference: walzRef, supplierReference: null,
          status: 'PRICE_CHANGE_REQUIRES_ACTION', supplier: item.s,
          activityTitle: item.title, failureReason: 'PRICE_CHANGE',
        })
        continue
      }
    }

    // ── 6. Atomic claim: PAYMENT_RECEIVED → SUPPLIER_CONFIRMING ──────────────
    // Only the process that updates count=1 is permitted to call Viator.
    const claim = await prisma.activityBooking.updateMany({
      where: { id: bookingId, status: 'PAYMENT_RECEIVED' },
      data:  { status: 'SUPPLIER_CONFIRMING', supplierConfirmingAt: new Date() },
    })
    if (claim.count !== 1) {
      log('viator_supplier_claim_rejected', { walzRef, reason: 'race_lost' })
      results.push({
        walzReference: walzRef, supplierReference: null,
        status: 'SUPPLIER_CONFIRMING', supplier: item.s, activityTitle: item.title,
      })
      continue
    }
    log('viator_supplier_claim_success', { walzRef, bookingId })

    // ── 7. Create booking attempt record ──────────────────────────────────────
    const existingAttempts = await prisma.activityBookingAttempt.count({
      where: { activityBookingId: bookingId },
    })
    const attemptId = await createAttempt(bookingId, item.s, walzRef, existingAttempts + 1)

    // ── 8. Call supplier API (25s timeout — within Stripe's 30s window) ───────
    let supplierResult: ActivityBookingResult
    let timedOut = false
    try {
      supplierResult = await Promise.race([
        callSupplierAPI(item, holder, walzRef, attemptId),
        new Promise<ActivityBookingResult>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 25_000)
        ),
      ])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      timedOut = msg === 'timeout'
      supplierResult = {
        success: false, walzReference: walzRef, status: 'FAILED',
        error: timedOut ? 'Supplier API timed out' : msg,
      }
    }

    // ── 9. Resolve attempt record ─────────────────────────────────────────────
    if (timedOut) {
      await markAttemptUnknown(attemptId, 'Supplier API timed out')
    } else {
      await resolveAttempt(attemptId, supplierResult)
    }

    // ── 10. Determine final status ────────────────────────────────────────────
    let finalStatus: string
    let failureReason: string | null = null

    if (timedOut) {
      finalStatus = 'RECONCILIATION_REQUIRED'
      failureReason = 'TIMEOUT'
    } else if (supplierResult.success && supplierResult.status === 'CONFIRMED') {
      finalStatus = 'CONFIRMED'
    } else if (supplierResult.status === 'PENDING') {
      // Feature flag off → manual admin confirmation
      finalStatus = 'PAYMENT_RECEIVED'
    } else {
      finalStatus = 'SUPPLIER_BOOKING_FAILED'
      failureReason = 'REJECTED'
    }

    // ── 11. Persist final state ───────────────────────────────────────────────
    await prisma.activityBooking.update({
      where: { id: bookingId },
      data: {
        status:            finalStatus,
        supplierReference: supplierResult.supplierReference ?? null,
        failureReason:     failureReason,
        notes: supplierResult.error ? `${finalStatus}: ${supplierResult.error}` : null,
      },
    })

    // 2D.1: Set TripItem.confirmed when authoritative supplier confirmation received.
    // This upgrades deriveTripStatus from a planning proxy to an authoritative signal.
    if (finalStatus === 'CONFIRMED' && item.tid) {
      prisma.tripItem.update({
        where: { id: item.tid },
        data:  { confirmed: true },
      }).catch(err => console.warn('[2D.1] TripItem.confirmed back-write failed:', (err as Error).message))
    }

    // ── 12. Post-confirmation emails + durable commercial events ─────────────
    // Events fire AFTER authoritative DB state is persisted (step 11).
    if (finalStatus === 'CONFIRMED') {
      log('viator_booking_confirmed', { walzRef, supplierRef: supplierResult.supplierReference })
      sendConfirmedEmailIfNotSent(bookingId, holder, walzRef, supplierResult.supplierReference, item).catch(() => {})
      recordBookingConfirmed({
        bookingId,
        productType: 'activity',
        supplier:    item.s,
        amount:      totalAmount,
        currency,
        metadata:    { walzReference: walzRef, supplierReference: supplierResult.supplierReference },
      }).catch(err => console.warn('[CommercialEvent] booking_confirmed failed:', (err as Error).message))

      // 2D.3: Server-authoritative purchase attribution with idempotency.
      // Only fires when the item has a commercial attribution tag AND a TripItem ID.
      if (item.tid && item.cs === 'cross_sell') {
        recordCrossSellPurchased({
          tripItemId:  item.tid,
          bookingId,
          productType: 'activity',
          amount:      totalAmount,
          currency,
        }).catch(err => console.warn('[CommercialEvent] cross_sell_purchased failed:', (err as Error).message))
      } else if (item.tid && item.cs === 'post_booking_upsell') {
        recordPostBookingUpsellPurchased({
          tripItemId:  item.tid,
          bookingId,
          productType: 'activity',
          amount:      totalAmount,
          currency,
        }).catch(err => console.warn('[CommercialEvent] post_booking_upsell_purchased failed:', (err as Error).message))
      }
    }
    if (finalStatus === 'SUPPLIER_BOOKING_FAILED') {
      log('viator_booking_failed', { walzRef, reason: failureReason })
      sendFailureAlertIfNotSent(bookingId, walzRef, item.s, item.title, failureReason ?? 'REJECTED',
        supplierResult.error ?? 'Unknown').catch(() => {})
      recordSupplierBookingFailed({
        bookingId,
        productType: 'activity',
        supplier:    item.s,
        amount:      totalAmount,
        currency,
        metadata:    { walzReference: walzRef, reason: failureReason },
      }).catch(err => console.warn('[CommercialEvent] supplier_booking_failed failed:', (err as Error).message))
    }
    if (finalStatus === 'RECONCILIATION_REQUIRED') {
      log('viator_booking_timeout', { walzRef })
      sendFailureAlertIfNotSent(bookingId, walzRef, item.s, item.title, 'TIMEOUT',
        supplierResult.error ?? 'Timeout').catch(() => {})
      recordReconciliationRequired({
        bookingId,
        productType: 'activity',
        supplier:    item.s,
        amount:      totalAmount,
        currency,
        metadata:    { walzReference: walzRef, reason: 'TIMEOUT' },
      }).catch(err => console.warn('[CommercialEvent] reconciliation_required failed:', (err as Error).message))
    }

    results.push({
      walzReference:     walzRef,
      supplierReference: supplierResult.supplierReference ?? null,
      status:            finalStatus,
      supplier:          item.s,
      activityTitle:     item.title,
      failureReason:     failureReason ?? undefined,
      error:             finalStatus !== 'CONFIRMED' ? supplierResult.error : undefined,
    })
  }

  // Derive and apply final trip status from item outcomes (CONFIRMED / PARTIALLY_CONFIRMED)
  if (tripId) void applyDerivedTripStatus(tripId)

  return results
}

// ── Reconciliation helper (used by cron) ──────────────────────────────────────
//
// Attempts to recover a booking in RECONCILIATION_REQUIRED state.
// 1. Queries Viator by supplierReference (if we have one)
// 2. Falls back to partnerOrderId lookup (walzReference)
// 3. If found → CONFIRMED; if not found after max attempts → flag for manual
//
// Returns 'CONFIRMED' | 'STILL_UNKNOWN' | 'MANUAL_REQUIRED'

export async function reconcileViatorBooking(bookingId: string): Promise<string> {
  const booking = await prisma.activityBooking.findUnique({
    where:  { id: bookingId },
    select: {
      id: true, walzReference: true, supplierReference: true,
      supplier: true, activityTitle: true, clientName: true, clientEmail: true, clientPhone: true,
      adults: true, children: true, infants: true, travelDate: true,
      supplierProductId: true, reconciliationAttempts: true, currency: true,
      confirmationEmailSentAt: true,
      // 3A: Attribution persistence fields (may be null for pre-3A bookings)
      commercialSource: true,
      tripItemId:       true,
    },
  })
  if (!booking) return 'MANUAL_REQUIRED'
  if (booking.supplier !== 'VIATOR') return 'MANUAL_REQUIRED'

  log('viator_reconciliation_started', { bookingId, walzRef: booking.walzReference })

  const provider = new ViatorActivityProvider()
  let found: ActivityBookingResult | null = null

  // Try by supplierReference first (most reliable if we have it)
  if (booking.supplierReference) {
    try {
      const r = await provider.getBooking(booking.supplierReference)
      if (r.success && r.supplierReference) found = r
    } catch { /* continue */ }
  }

  // Fall back to partnerOrderId lookup (walzReference passed at booking time)
  if (!found && booking.walzReference) {
    found = await provider.getBookingByPartnerRef(booking.walzReference)
  }

  const maxAttempts = 24 // ~2 hours at 5-minute intervals

  if (found?.success && found.supplierReference) {
    // Viator booking found — transition to CONFIRMED
    await prisma.activityBooking.update({
      where: { id: bookingId },
      data: {
        status:            'CONFIRMED',
        supplierReference: found.supplierReference,
        supplierConfirmedAt: new Date(),
        lastReconciledAt:  new Date(),
        reconciliationAttempts: { increment: 1 },
      },
    })

    // Send confirmation email if not already sent
    if (!booking.confirmationEmailSentAt) {
      const holder = { name: booking.clientName, email: booking.clientEmail, phone: booking.clientPhone ?? undefined }
      const item: CartItemCompact = {
        cid: '', t: 'activity', title: booking.activityTitle ?? '',
        s: 'VIATOR', pc: booking.supplierProductId ?? '', poc: '',
        d: booking.travelDate ?? '', a: booking.adults, c: booking.children, i: booking.infants,
        st: '', p: 0, cur: booking.currency, loc: '', dur: '',
      }
      sendConfirmedEmailIfNotSent(bookingId, holder, booking.walzReference ?? '', found.supplierReference, item).catch(() => {})
    }

    log('viator_reconciliation_confirmed', { bookingId, supplierRef: found.supplierReference })
    // booking_confirmed fires here — this is the authoritative moment for reconciled bookings.
    recordBookingConfirmed({
      bookingId,
      productType: 'activity',
      supplier:    booking.supplier,
      metadata:    { walzReference: booking.walzReference, supplierReference: found.supplierReference, via: 'reconciliation' },
    }).catch(err => console.warn('[CommercialEvent] reconciled booking_confirmed failed:', (err as Error).message))

    // 3A: Viator reconciliation attribution fix.
    // If this booking originally came from a cross-sell or post-booking upsell,
    // fire the purchase event now. Idempotency is via eventId = "cross_sell_purchased:<tripItemId>",
    // so this fires at most once even if reconciliation is retried.
    if (booking.tripItemId && booking.commercialSource === 'cross_sell') {
      recordCrossSellPurchased({
        tripItemId:  booking.tripItemId,
        bookingId,
        productType: 'activity',
        amount:      undefined,  // amount unknown at reconcile time — don't double-record
        currency:    booking.currency,
      }).catch(err => console.warn('[CommercialEvent] reconciled cross_sell_purchased failed:', (err as Error).message))
    } else if (booking.tripItemId && booking.commercialSource === 'post_booking_upsell') {
      recordPostBookingUpsellPurchased({
        tripItemId:  booking.tripItemId,
        bookingId,
        productType: 'activity',
        amount:      undefined,
        currency:    booking.currency,
      }).catch(err => console.warn('[CommercialEvent] reconciled post_booking_upsell_purchased failed:', (err as Error).message))
    }

    return 'CONFIRMED'
  }

  // Not found
  const newAttemptCount = booking.reconciliationAttempts + 1
  if (newAttemptCount >= maxAttempts) {
    await prisma.activityBooking.update({
      where: { id: bookingId },
      data: {
        reconciliationAttempts: { increment: 1 },
        lastReconciledAt: new Date(),
        notes: `Reconciliation exhausted after ${newAttemptCount} attempts. Manual review required.`,
      },
    })
    log('viator_reconciliation_manual_required', { bookingId, attempts: newAttemptCount })
    return 'MANUAL_REQUIRED'
  }

  await prisma.activityBooking.update({
    where: { id: bookingId },
    data: {
      reconciliationAttempts: { increment: 1 },
      lastReconciledAt: new Date(),
    },
  })
  return 'STILL_UNKNOWN'
}
