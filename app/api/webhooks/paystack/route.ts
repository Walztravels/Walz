import { NextRequest, NextResponse }       from 'next/server'
import { createHmac }                      from 'crypto'
import { prisma }                          from '@/lib/db'
import { recordPaymentSucceeded }          from '@/lib/commercial/payment'
import { setTripPaid }                     from '@/lib/trips/lifecycle'
import { handleSuccessfulTripPayment }     from '@/lib/payments/handle-success'
import { paystackMinorToMajor, paystackMajorToMinor } from '@/lib/currency'

export const dynamic = 'force-dynamic'

/**
 * Mark a PaymentLink paid ONLY when the webhook's verified amount matches
 * the amount the link was created for — EXACT minor-unit equality: the
 * webhook's `data.amount` is an exact kobo/pesewa integer and the link's
 * Decimal(10,2) amount converts losslessly, so there is no tolerance to
 * grant. Any under/overpayment or currency mismatch becomes
 * `reconciliation_required` — visible to staff, never silently accepted,
 * and NEVER treated as paid. Links created without an amount (legacy)
 * keep the old match-by-ref behaviour.
 */
async function settlePaymentLink(
  where: { txRef: string } | { accountNumber: string },
  paidMinor: number,
  currency: string,
  extra: { payerName: string | null; payerBank: string | null },
): Promise<number> {
  const row = await prisma.paymentLink.findFirst({
    where: { ...where, status: 'pending' },
    select: { id: true, txRef: true, amount: true, currency: true },
  })
  if (!row) return 0

  const expected = row.amount != null ? Number(row.amount) : null
  const matches  = expected == null ||
    (row.currency.toUpperCase() === currency.toUpperCase() &&
     paidMinor === paystackMajorToMinor(expected, row.currency))

  if (!matches) {
    console.error(`[ps-hook] PAYMENT_RECONCILIATION_REQUIRED txRef=${row.txRef} expected=${row.currency} ${expected} got=${currency} ${paystackMinorToMajor(paidMinor, currency)}`)
    await prisma.paymentLink.update({
      where: { id: row.id },
      data:  { status: 'reconciliation_required', payerName: extra.payerName, payerBank: extra.payerBank },
    })
    return 0
  }

  await prisma.paymentLink.update({
    where: { id: row.id },
    data:  { status: 'paid', paidAt: new Date(), payerName: extra.payerName, payerBank: extra.payerBank },
  })
  return 1
}

export async function POST(req: NextRequest) {
  const raw  = await req.text()
  const hash = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(raw).digest('hex')

  if (hash !== req.headers.get('x-paystack-signature')) {
    console.warn('[ps-hook] BLOCKED: signature mismatch')
    return new NextResponse('', { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    // malformed but signature-verified — ack so Paystack doesn't retry
    return new NextResponse('', { status: 200 })
  }

  const event = body.event as string
  const data  = body.data  as Record<string, unknown>
  console.log('[ps-hook]', { event, ref: data?.reference })

  try {
    if (event === 'charge.success') {
      const meta     = data.metadata as Record<string, unknown> | undefined
      const authData = data.authorization as Record<string, unknown> | undefined
      const customer = data.customer     as Record<string, unknown> | undefined
      const channel  = data.channel as string | undefined

      // ── Top-level idempotency gate ─────────────────────────────────────────
      // Paystack always receives 200 to prevent retries; without a pre-check,
      // recordPaymentSucceeded + handleSuccessfulTripPayment fire on every retry.
      // Check by Paystack reference first; fall back to walz_tx_ref.
      const paystackRef = (data.reference as string | undefined) ?? null
      const txRefForGate = paystackRef ?? (meta?.walz_tx_ref as string | undefined) ?? null
      if (txRefForGate) {
        const existing = await prisma.paymentLink.findFirst({
          where: { txRef: txRefForGate, status: 'paid' },
          select: { id: true },
        })
        if (existing) {
          console.log('[ps-hook] Duplicate charge.success ignored for ref', txRefForGate)
          return new NextResponse('', { status: 200 })
        }
      }

      const txRef   = (meta?.walz_tx_ref as string | undefined) ?? null
      const payerName = customer?.first_name
        ? `${customer.first_name} ${customer.last_name ?? ''}`.trim()
        : null

      // Paystack sends `amount` in MINOR units (kobo/pesewas). Business
      // records store MAJOR units — normalize once here, use everywhere.
      const hookCurrency  = ((data.currency as string | undefined) ?? 'NGN').toUpperCase()
      const paidMinor     = typeof data.amount === 'number' ? data.amount : 0
      const paidMajor     = paystackMinorToMajor(paidMinor, hookCurrency)

      // package_bookings settlement — deposit_amount_paid is MAJOR units,
      // and 'deposit_paid' is only written when the paid amount covers the
      // booking's recorded deposit in the same currency context. Anything
      // else is left for reconciliation rather than silently confirmed.
      const settlePackageBooking = async (bookingRef: string, label: string) => {
        const rows = await prisma.$queryRawUnsafe<Array<{ deposit_amount: number | string | null; currency: string | null }>>(
          `SELECT deposit_amount, currency FROM package_bookings WHERE booking_ref = $1 LIMIT 1`,
          bookingRef,
        )
        if (!rows || rows.length === 0) return
        const expected     = rows[0].deposit_amount != null ? Number(rows[0].deposit_amount) : null
        const pkgCurrency  = (rows[0].currency ?? '').toUpperCase()
        // Same-currency payments must cover the deposit; local-currency
        // (converted) payments are matched via the PaymentLink intent above,
        // so a matched link is the authority there.
        const sameCurrency = pkgCurrency && pkgCurrency === hookCurrency
        const covered      = expected == null || !sameCurrency ||
          paystackMajorToMinor(paidMajor, hookCurrency) >= paystackMajorToMinor(expected, hookCurrency)
        if (!covered) {
          console.error(`[ps-hook] ${label}: PAYMENT_RECONCILIATION_REQUIRED booking=${bookingRef} expected=${pkgCurrency} ${expected} got=${hookCurrency} ${paidMajor}`)
          return
        }
        const pkgRows = await prisma.$executeRawUnsafe(
          `UPDATE package_bookings
           SET payment_status     = 'deposit_paid',
               payment_gateway    = 'paystack',
               payment_intent_id  = $1,
               deposit_paid_at    = NOW(),
               deposit_amount_paid = $2,
               payment_currency   = $3,
               updated_at         = NOW()
           WHERE booking_ref = $4`,
          String(data.id ?? data.reference),
          paidMajor,
          hookCurrency,
          bookingRef,
        )
        console.log(`[ps-hook] ${label}: package_bookings rows updated:`, pkgRows)
      }

      if (channel === 'dedicated_nuban') {
        // ── Virtual account path (Phase 1) ────────────────────────────────
        const acctNum   = authData?.receiver_bank_account_number as string | undefined
        const payerBank = (authData?.sender_bank as string | undefined) ?? null

        let updated = 0

        if (txRef) {
          updated = await settlePaymentLink({ txRef }, paidMinor, hookCurrency, { payerName, payerBank })
          console.log('[ps-hook] VA: PaymentLink update by txRef', { txRef, updated })
        }

        if (updated === 0 && acctNum) {
          updated = await settlePaymentLink({ accountNumber: acctNum }, paidMinor, hookCurrency, { payerName, payerBank })
          console.log('[ps-hook] VA: PaymentLink update by accountNumber', { acctNum, updated })
        }

        if (updated === 0) {
          console.warn('[ps-hook] VA: NO_MATCH', { txRef, acctNum })
        }

        const booking_ref = txRef ?? (data.reference as string | undefined)
        if (booking_ref) await settlePackageBooking(booking_ref, 'VA')
      } else {
        // ── Checkout path (Phase 2) — card, bank, ussd, mobile_money, etc. ─
        const refFromData = (data.reference as string | undefined) ?? null
        const resolvedRef = txRef ?? refFromData
        const payerBank   = (authData?.bank as string | undefined) ?? null

        let updated = 0

        if (resolvedRef) {
          updated = await settlePaymentLink({ txRef: resolvedRef }, paidMinor, hookCurrency, { payerName, payerBank })
          console.log('[ps-hook] checkout: PaymentLink update', { ref: resolvedRef, channel, updated })
        }

        if (updated === 0) {
          console.warn('[ps-hook] checkout: NO_MATCH', { ref: resolvedRef, channel })
        }

        if (resolvedRef) await settlePackageBooking(resolvedRef, 'checkout')
      }
    }
    // Normalized payment event — deduplicates by reference, fires once per charge.success
    if (event === 'charge.success') {
      const meta2      = data.metadata as Record<string, unknown> | undefined
      const paystackRef = (data.reference as string | undefined) ?? 'unknown'
      const amountKobo  = typeof data.amount === 'number' ? data.amount : 0
      const currency    = (data.currency as string | undefined)?.toUpperCase() ?? 'NGN'
      const channel     = data.channel as string | undefined
      // dedicated_nuban = bank transfer via Paystack VA; all others = card/USSD/mobile_money
      const provider    = channel === 'dedicated_nuban' ? 'BANK_TRANSFER' : 'PAYSTACK'
      recordPaymentSucceeded({
        provider,
        providerPaymentId: paystackRef,
        amount:   paystackMinorToMajor(amountKobo, currency), // minor → major
        currency,
        metadata: { source: 'paystack_webhook', channel },
      }).catch(err => console.warn('[Payment] Paystack payment_succeeded tracking failed:', (err as Error).message))

      // Advance Trip lifecycle to PAID (non-fatal)
      const psTripId    = meta2?.walz_trip_id    as string | undefined
      const psSessionId = meta2?.walz_session_id as string | undefined
      if (psTripId || psSessionId) {
        void setTripPaid({ tripId: psTripId ?? null, sessionId: psSessionId ?? null })

        // Run shared trip-payment orchestration: CartSession.convertedAt,
        // Jade attribution, jade_checkout_converted event, bookCartActivities.
        const psCustomer = data.customer as Record<string, unknown> | undefined
        const psHolderName = psCustomer?.first_name
          ? `${psCustomer.first_name} ${psCustomer.last_name ?? ''}`.trim()
          : 'Valued Customer'
        handleSuccessfulTripPayment({
          provider:          channel === 'dedicated_nuban' ? 'BANK_TRANSFER' : 'PAYSTACK',
          providerPaymentId: paystackRef,
          tripId:            psTripId    ?? null,
          sessionId:         psSessionId ?? null,
          leadId:            (meta2?.walz_lead_id as string | undefined) ?? null,
          jadeAssisted:      meta2?.jade_assisted === 'true',
          amount:            paystackMinorToMajor(amountKobo, currency),
          currency,
          holder: {
            name:  psHolderName,
            email: (psCustomer?.email as string | undefined) ?? '',
          },
        }).catch(err => console.error('[ps-hook] handleSuccessfulTripPayment failed:', err))
      }
    }
  } catch (err) {
    console.error('[ps-hook] handler error:', err)
    // always 200 — non-200 causes Paystack to retry indefinitely
  }

  return new NextResponse('', { status: 200 })
}
