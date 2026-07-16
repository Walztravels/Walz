import { NextRequest, NextResponse } from 'next/server'
import crypto                        from 'crypto'
import prisma                        from '@/lib/db'
import { getSupabaseAdmin }          from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// NOWPayments requires the IPN body to be sorted recursively before HMAC
function sortObjectDeep(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sortObjectDeep)
  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortObjectDeep((obj as Record<string, unknown>)[key])
      return acc
    }, {})
}

export async function POST(req: NextRequest) {
  // ── 1. Signature verification (critical — reject unsigned requests) ────────
  const signature = req.headers.get('x-nowpayments-sig')
  if (!signature) {
    console.error('[NOWPayments IPN] Missing x-nowpayments-sig header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const rawBody = await req.text()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const sorted     = sortObjectDeep(parsed)
  const sortedJson = JSON.stringify(sorted)

  const expected = crypto
    .createHmac('sha512', process.env.NOWPAYMENTS_IPN_SECRET!)
    .update(sortedJson)
    .digest('hex')

  if (expected !== signature) {
    console.error('[NOWPayments IPN] HMAC mismatch — rejecting')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // ── 2. Map NOWPayments status → our enums ─────────────────────────────────
  const {
    order_id,
    payment_status,
    actually_paid,
    pay_currency,
  } = parsed as {
    order_id:       string
    payment_status: string
    actually_paid?: number
    pay_currency?:  string
  }

  if (!order_id || !payment_status) {
    return NextResponse.json({ error: 'Missing order_id or payment_status' }, { status: 400 })
  }

  // PaymentStatus enum: PENDING | PROCESSING | SUCCEEDED | FAILED | REFUNDED | CANCELLED
  // BookingStatus enum: PENDING | CONFIRMED | CANCELLED | COMPLETED | FAILED
  const nowToPaymentStatus: Record<string, string> = {
    waiting:         'PENDING',
    confirming:      'PROCESSING',
    confirmed:       'PROCESSING',
    sending:         'PROCESSING',
    partially_paid:  'PROCESSING',  // do NOT confirm — flag for ops review
    finished:        'SUCCEEDED',
    failed:          'FAILED',
    refunded:        'REFUNDED',
    expired:         'CANCELLED',
  }

  const paymentStatus = nowToPaymentStatus[payment_status] ?? 'PROCESSING'

  // Only flip booking status to CONFIRMED on a fully finished payment
  const isFullyPaid    = payment_status === 'finished'
  const isPartiallyPaid = payment_status === 'partially_paid'

  // ── 3. Update booking ────────────────────────────────────────────────────
  // Try Prisma first (tour / hotel bookings). If not found, fall back to the
  // Supabase FlightBooking table (flight crypto bookings use a separate table).
  let updatedViaPrisma = false
  try {
    await prisma.booking.update({
      where: { bookingReference: order_id },
      data: {
        paymentStatus:        paymentStatus as any,
        cryptoPaidCurrency:   pay_currency   ?? undefined,
        cryptoAmountReceived: actually_paid  ?? undefined,
        ...(isFullyPaid     ? { status: 'CONFIRMED' as any } : {}),
        ...(isPartiallyPaid ? {
          notes: `⚠️ Underpayment: received ${actually_paid} ${pay_currency}. Manual review required.`,
        } : {}),
      },
    })
    updatedViaPrisma = true

    if (isPartiallyPaid) {
      console.warn(
        `[NOWPayments IPN] UNDERPAYMENT on booking ${order_id}: ` +
        `received ${actually_paid} ${pay_currency} — ops review required, NOT auto-confirmed`
      )
    }
  } catch {
    // Not a Prisma booking — try FlightBooking (Supabase)
  }

  if (!updatedViaPrisma) {
    const supabase = getSupabaseAdmin()
    const flightStatus =
      isFullyPaid                                              ? 'confirmed'
      : payment_status === 'failed' || payment_status === 'expired' ? 'cancelled'
      : 'pending_review'

    const { error: sbError } = await supabase
      .from('FlightBooking')
      .update({
        status: flightStatus,
        ...(isFullyPaid ? { paidAmount: String(actually_paid ?? '') } : {}),
        ...(isPartiallyPaid ? {
          notes: `⚠️ Underpayment: received ${actually_paid} ${pay_currency}. Manual review required.`,
        } : {}),
      })
      .eq('reference', order_id)

    if (sbError) {
      console.error('[NOWPayments IPN] FlightBooking update failed:', sbError, 'order_id:', order_id)
    } else if (isPartiallyPaid) {
      console.warn(
        `[NOWPayments IPN] UNDERPAYMENT on flight booking ${order_id}: ` +
        `received ${actually_paid} ${pay_currency} — NOT auto-confirmed`
      )
    }
  }

  // ── 4. Update AdminPaymentLink if one matches this order_id ───────────────
  const adminLinkStatus = isFullyPaid             ? 'paid'
    : payment_status === 'expired'                ? 'expired'
    : payment_status === 'failed'                 ? 'failed'
    : 'pending'

  await prisma.adminPaymentLink.updateMany({
    where: { orderId: order_id },
    data:  { status: adminLinkStatus },
  }).catch(() => {}) // Non-critical

  console.log(`[NOWPayments IPN] order=${order_id} payment_status=${payment_status} → paymentStatus=${paymentStatus} confirmed=${isFullyPaid}`)

  return NextResponse.json({ received: true })
}
