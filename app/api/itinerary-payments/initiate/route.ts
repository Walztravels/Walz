// POST /api/itinerary-payments/initiate
//
// Phase 0 security hotfix: the browser supplies ONLY intent (reference +
// payment type + method). The server resolves all monetary values from the
// immutable AcceptanceSnapshot. The browser never controls amount, currency,
// deposit, or total.
//
// Supported methods in Phase 0: STRIPE, PAYSTACK, BANK_TRANSFER.
// CRYPTO and MANUAL return a pending record (no provider call yet).

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual, randomBytes, createHmac } from 'crypto'
import { prisma } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { parseOptions } from '@/lib/itinerary-options'
import { getSupabaseAdmin } from '@/lib/supabase'
import { isCurrencySupported } from '@/lib/payments/processors'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentType   = 'DEPOSIT' | 'BALANCE' | 'FULL'
type PaymentMethod = 'STRIPE' | 'PAYSTACK' | 'BANK_TRANSFER' | 'CRYPTO' | 'MANUAL'

const VALID_PAYMENT_TYPES:   PaymentType[]   = ['DEPOSIT', 'BALANCE', 'FULL']
const VALID_PAYMENT_METHODS: PaymentMethod[] = ['STRIPE', 'PAYSTACK', 'BANK_TRANSFER', 'CRYPTO', 'MANUAL']

interface AcceptanceSnapshot {
  version?:      1 | 2
  acceptedAt?:   string
  acceptedBy?:   string
  acceptedTotal?: number
  deposit?:      number
  currency?:     string
  termsAccepted?: boolean
}

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try { return JSON.parse(json) as T } catch { return fallback }
}

// ─── Server-authoritative amount resolution ───────────────────────────────────
// paidTotal is queried from confirmed PaymentRecords so the browser cannot
// lie about what has already been paid. The resolver rejects invalid initiations
// (balance without deposit, overpayment, duplicate deposit).

function resolvePayableAmount(
  snapshot: AcceptanceSnapshot,
  paymentType: PaymentType,
  paidTotal: number,
  itineraryCurrency: string,
): { amount: number; currency: string } | { error: string } {
  const total    = snapshot.acceptedTotal
  const deposit  = snapshot.deposit
  const currency = (snapshot.currency ?? itineraryCurrency).toUpperCase()

  if (typeof total !== 'number' || total <= 0) {
    return { error: 'Accepted total is missing or invalid in the acceptance snapshot' }
  }
  if (!Number.isFinite(total)) {
    return { error: 'Accepted total is not a finite number' }
  }

  switch (paymentType) {
    case 'DEPOSIT': {
      if (typeof deposit !== 'number' || deposit <= 0 || !Number.isFinite(deposit)) {
        return { error: 'Deposit amount is not set or is invalid in the acceptance snapshot' }
      }
      if (paidTotal >= deposit) {
        return { error: 'Deposit has already been paid' }
      }
      return { amount: deposit, currency }
    }
    case 'FULL': {
      if (paidTotal >= total) {
        return { error: 'This itinerary has already been paid in full' }
      }
      return { amount: total - paidTotal, currency }
    }
    case 'BALANCE': {
      if (typeof deposit !== 'number' || paidTotal < deposit) {
        return { error: 'A deposit must be paid before the balance can be initiated' }
      }
      const balance = total - paidTotal
      if (balance <= 0) {
        return { error: 'No outstanding balance — this itinerary has already been paid in full' }
      }
      return { amount: balance, currency }
    }
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    itineraryReference?: unknown
    paymentType?:        unknown
    method?:             unknown
    approvalToken?:      unknown
    callbackUrl?:        unknown
  }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // ── 1. Validate intent fields (NOT monetary values) ────────────────────────
  const itineraryReference = typeof body.itineraryReference === 'string'
    ? body.itineraryReference.trim()
    : null
  const paymentType = typeof body.paymentType === 'string'
    ? body.paymentType.trim().toUpperCase()
    : null
  const method = typeof body.method === 'string'
    ? body.method.trim().toUpperCase()
    : null
  const approvalToken = typeof body.approvalToken === 'string' ? body.approvalToken : null

  if (!itineraryReference) {
    return NextResponse.json({ error: 'itineraryReference is required' }, { status: 400 })
  }
  if (!paymentType || !VALID_PAYMENT_TYPES.includes(paymentType as PaymentType)) {
    return NextResponse.json(
      { error: `paymentType must be one of: ${VALID_PAYMENT_TYPES.join(', ')}` },
      { status: 400 },
    )
  }
  if (!method || !VALID_PAYMENT_METHODS.includes(method as PaymentMethod)) {
    return NextResponse.json(
      { error: `method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}` },
      { status: 400 },
    )
  }
  if (!approvalToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Optional: Paystack callback URL — must be https, never trusted for payment proof
  const callbackUrl = typeof body.callbackUrl === 'string' && body.callbackUrl.startsWith('https://')
    ? body.callbackUrl
    : undefined

  // ── 2. Resolve itinerary from DB ───────────────────────────────────────────
  const itinerary = await prisma.itinerary.findUnique({
    where: { referenceNumber: itineraryReference },
    select: {
      id:             true,
      status:         true,
      selectedOption: true,
      options:        true,
      currency:       true,
      clientEmail:    true,
      clientName:     true,
      title:          true,
    },
  }).catch(() => null)

  if (!itinerary) {
    return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
  }

  // ── 3. H-5: Validate payment token — server-verifiable entitlement ──────────
  // HMAC token: portal/page.tsx generates HMAC-SHA256(secret, ref:version:hourSlot).
  // Payload binds reference + acceptance version + hour slot so a token from one
  // itinerary cannot be replayed against another, and stale tokens expire automatically.
  // Valid for current hour OR previous hour to absorb page-load time and clock drift.
  //
  // Production rule: PAYMENT_HMAC_SECRET or NEXTAUTH_SECRET MUST be set.
  // If neither is present in production, payment is refused with 503.
  // Raw approvalToken fallback is development-only and must never run in production.

  // Pre-parse acceptance version to bind it in the HMAC (full snapshot parse at step 4)
  const acceptanceVersion: number = (() => {
    try {
      const s = JSON.parse(itinerary.selectedOption ?? '{}') as { version?: number }
      return typeof s.version === 'number' ? s.version : 1
    } catch { return 1 }
  })()

  const PAYMENT_SECRET = process.env.PAYMENT_HMAC_SECRET ?? process.env.NEXTAUTH_SECRET ?? ''
  const isProduction   = process.env.NODE_ENV === 'production'

  if (!PAYMENT_SECRET && isProduction) {
    console.error('[itinerary-payments/initiate] PAYMENT_CONFIGURATION_ERROR — PAYMENT_HMAC_SECRET not set in production')
    return NextResponse.json(
      { error: 'Payment service configuration error', code: 'PAYMENT_CONFIGURATION_ERROR' },
      { status: 503 },
    )
  }

  const hourSlot = Math.floor(Date.now() / (60 * 60 * 1000))

  function isTimingSafeEqual(a: string, b: string): boolean {
    try {
      const ba = Buffer.from(a); const bb = Buffer.from(b)
      return ba.length === bb.length && timingSafeEqual(ba, bb)
    } catch { return false }
  }

  function hmacFor(slot: number): string {
    // Payload: ref:acceptanceVersion:hourSlot — binds token to this specific itinerary + snapshot
    return createHmac('sha256', PAYMENT_SECRET)
      .update(`${itineraryReference}:${acceptanceVersion}:${slot}`)
      .digest('hex')
  }

  let tokenValid = false
  if (approvalToken && PAYMENT_SECRET) {
    tokenValid = isTimingSafeEqual(approvalToken, hmacFor(hourSlot)) ||
                 isTimingSafeEqual(approvalToken, hmacFor(hourSlot - 1))
  }
  if (!tokenValid && !isProduction) {
    // Dev / legacy: fall back to stored raw approvalToken (never runs in production)
    const opts        = parseOptions(itinerary.options) as Record<string, unknown>
    const storedToken = opts.approvalToken as string | undefined
    if (storedToken && approvalToken) {
      tokenValid = isTimingSafeEqual(storedToken, approvalToken)
    }
  }
  if (!tokenValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (itinerary.status !== 'approved' && itinerary.status !== 'revision_accepted') {
    return NextResponse.json(
      { error: `Itinerary must be accepted to initiate payment (current: ${itinerary.status})` },
      { status: 409 },
    )
  }

  // ── 4. Read immutable AcceptanceSnapshot ───────────────────────────────────
  const snapshot = safeParse<AcceptanceSnapshot>(itinerary.selectedOption, {})

  if (typeof snapshot.acceptedTotal !== 'number') {
    return NextResponse.json(
      { error: 'Acceptance snapshot does not contain a valid acceptedTotal — cannot authorise payment' },
      { status: 422 },
    )
  }

  // ── 5. H-6: Query confirmed payment records to prevent overpayment ─────────
  // The browser must never control what has been paid. We query actual PAID
  // records so BALANCE cannot be initiated before DEPOSIT, and duplicate
  // deposits are rejected.
  let paidTotal = 0
  try {
    const sb = getSupabaseAdmin()
    const { data: paidRows } = await sb
      .from('itinerary_payments')
      .select('amount')
      .eq('itinerary_id', itineraryReference)  // stored as reference string by webhooks
      .eq('status', 'PAID')
    if (paidRows) {
      paidTotal = paidRows.reduce((sum, r) => sum + Number(r.amount), 0)
    }
  } catch (err) {
    console.error('[itinerary-payments/initiate] Failed to query payment records:', err)
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
  }

  // ── 6. Calculate authoritative payable amount (server-side only) ───────────
  const amountResult = resolvePayableAmount(snapshot, paymentType as PaymentType, paidTotal, itinerary.currency ?? 'GBP')
  if ('error' in amountResult) {
    return NextResponse.json({ error: amountResult.error }, { status: 422 })
  }

  const { amount, currency } = amountResult

  // ── 6b. Gateway-currency compatibility check ───────────────────────────────
  // Reject before calling any external API — never silently convert currency.
  if (!isCurrencySupported(method, currency)) {
    return NextResponse.json(
      { error: `${method} does not support ${currency} payments. Please choose a compatible payment method.` },
      { status: 422 },
    )
  }

  // L-9: Always use authoritative clientEmail from DB. Never trust browser-supplied email.
  const clientEmail = itinerary.clientEmail || ''
  const label = itinerary.title ?? itineraryReference

  // ── 7. Create payment with the chosen provider ─────────────────────────────
  if (method === 'STRIPE') {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
    }

    try {
      const intent = await stripe.paymentIntents.create({
        amount:   Math.round(amount * 100),
        currency: currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        receipt_email: clientEmail || undefined,
        description:   `Walz Travels — ${paymentType} — ${label}`,
        metadata: {
          itinerary_reference: itineraryReference,
          payment_type:        paymentType,
          accepted_total:      String(snapshot.acceptedTotal),
          currency,
          source:              'v2_itinerary_payment',
        },
      })

      return NextResponse.json({
        method:              'STRIPE',
        clientSecret:        intent.client_secret,
        paymentIntentId:     intent.id,
        amount,
        currency,
        paymentType,
        itineraryReference,
      })
    } catch (err: unknown) {
      console.error('[itinerary-payments/initiate] Stripe error:', err instanceof Error ? err.message : err)
      return NextResponse.json({ error: 'Payment provider error' }, { status: 502 })
    }
  }

  if (method === 'PAYSTACK') {
    const PS_SECRET = process.env.PAYSTACK_SECRET_KEY
    if (!PS_SECRET) {
      return NextResponse.json({ error: 'Paystack is not configured' }, { status: 503 })
    }

    // M-11: Use cryptographically random suffix to prevent txRef collision
    const txRef = `WALZ-V2-${itineraryReference}-${paymentType}-${randomBytes(4).toString('hex')}`
    const amountMinor = Math.round(amount * 100)

    try {
      const res  = await fetch('https://api.paystack.co/transaction/initialize', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${PS_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email:     clientEmail || 'noreply@walztravels.com',
          amount:    amountMinor,
          currency:  currency.toUpperCase(),
          reference: txRef,
          ...(callbackUrl ? { callback_url: callbackUrl } : {}),
          metadata: {
            itinerary_reference: itineraryReference,
            payment_type:        paymentType,
            accepted_total:      snapshot.acceptedTotal,
            currency:            currency.toUpperCase(),
            source:              'v2_itinerary_payment',
          },
        }),
      })
      const data = await res.json() as { status: boolean; data?: { authorization_url?: string } }

      if (!data.status || !data.data?.authorization_url) {
        return NextResponse.json({ error: 'Failed to initialise Paystack transaction' }, { status: 502 })
      }

      return NextResponse.json({
        method:            'PAYSTACK',
        url:               data.data.authorization_url,
        reference:         txRef,
        amount,
        currency,
        paymentType,
        itineraryReference,
      })
    } catch (err: unknown) {
      console.error('[itinerary-payments/initiate] Paystack error:', err instanceof Error ? err.message : err)
      return NextResponse.json({ error: 'Payment provider error' }, { status: 502 })
    }
  }

  if (method === 'BANK_TRANSFER') {
    // Create PENDING record so the admin dashboard shows the transfer intent and can
    // promote it to PAID after verifying receipt. The client is NOT marked as paid here.
    const bankRef = `BANK-${itineraryReference}-${randomBytes(4).toString('hex')}`
    let pendingId: string | null = null
    try {
      const sb = getSupabaseAdmin()
      const { data: inserted } = await sb
        .from('itinerary_payments')
        .insert({
          itinerary_id:       itineraryReference,
          acceptance_version: snapshot.version ?? 1,
          amount,
          currency,
          type:               paymentType,
          method:             'BANK_TRANSFER',
          status:             'PENDING',
          provider_reference: bankRef,
          paid_at:            null,
          notes:              'Bank transfer initiated from client portal — awaiting admin confirmation',
        })
        .select('id')
        .single()
      if (inserted) pendingId = (inserted as { id: string }).id
    } catch (err) {
      console.error('[initiate] Bank transfer PENDING record insert failed:', err)
      // Non-fatal — instructions still returned; admin can manually record
    }

    return NextResponse.json({
      method:            'BANK_TRANSFER',
      amount,
      currency,
      paymentType,
      itineraryReference,
      pendingReference:  bankRef,
      pendingId,
      instructions: {
        message:   'Bank transfer details have been noted. An advisor will send bank details to your email. Please quote your reference in the transfer description.',
        reference: itineraryReference,
      },
    })
  }

  // MANUAL / CRYPTO — no provider call; advisor action required
  return NextResponse.json({
    method,
    amount,
    currency,
    paymentType,
    itineraryReference,
    pending: true,
    message: `${method} payment noted. An advisor will contact you to complete this payment.`,
  })
}
