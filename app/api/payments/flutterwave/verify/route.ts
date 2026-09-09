import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  reconcileFlutterwavePayment,
  PAYMENT_RECONCILIATION_REQUIRED,
} from '@/lib/payments/authority'

/**
 * Package-deposit verification. The amount authority is server-side:
 *  1. Preferred — the transaction's verified tx_ref matches a server
 *     payment-intent snapshot (created by /api/payments/intent) and the
 *     verified charge equals the snapshot.
 *  2. Legacy fallback (older clients where tx_ref === booking_ref) — the
 *     verified charge must cover the booking row's own deposit in the
 *     package currency. Converted-currency legacy payments cannot be
 *     server-verified and are queued for reconciliation, never confirmed.
 * Browser-supplied expected_amount / expected_currency are ignored.
 */
export async function POST(req: Request) {
  try {
    const { transaction_id, booking_ref } = await req.json() as {
      transaction_id?: string | number
      booking_ref?:    string
    }

    if (!transaction_id || !booking_ref) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const markDepositPaid = async (amountMajor: number, currency: string) => {
      await prisma.$executeRawUnsafe(
        `UPDATE package_bookings
         SET payment_status = 'deposit_paid',
             payment_gateway = 'flutterwave',
             payment_intent_id = $1,
             deposit_paid_at = NOW(),
             deposit_amount_paid = $2,
             payment_currency = $3,
             updated_at = NOW()
         WHERE booking_ref = $4`,
        String(transaction_id),
        amountMajor,
        currency,
        booking_ref,
      )
    }

    // ── 1. Intent-snapshot reconciliation ─────────────────────────────────────
    const recon = await reconcileFlutterwavePayment(transaction_id)
    if (recon.ok && recon.verified?.amount && recon.verified.currency) {
      await markDepositPaid(recon.verified.amount, recon.verified.currency)
      return NextResponse.json({ verified: true })
    }
    if (recon.code === PAYMENT_RECONCILIATION_REQUIRED) {
      // Real money moved but not the amount we quoted — a human settles it.
      return NextResponse.json(
        { verified: false, error: PAYMENT_RECONCILIATION_REQUIRED },
        { status: 409 },
      )
    }

    // ── 2. Legacy fallback: verify against the booking's own deposit ─────────
    if (recon.code === 'INTENT_NOT_FOUND' && recon.verified?.ok && recon.verified.amount && recon.verified.currency) {
      const rows = await prisma.$queryRawUnsafe<Array<{ deposit_amount: number | string | null; total_price: number | string | null; currency: string | null }>>(
        `SELECT deposit_amount, total_price, currency FROM package_bookings WHERE booking_ref = $1 LIMIT 1`,
        booking_ref,
      )
      const booking = rows?.[0]
      if (booking) {
        const due         = Number(booking.deposit_amount ?? booking.total_price ?? 0)
        const pkgCurrency = (booking.currency ?? 'USD').toUpperCase()
        if (due > 0 && recon.verified.currency === pkgCurrency && recon.verified.amount >= due - 1) {
          await markDepositPaid(recon.verified.amount, recon.verified.currency)
          return NextResponse.json({ verified: true })
        }
      }
      console.error(`[flw-verify] PAYMENT_RECONCILIATION_REQUIRED booking=${booking_ref} verified=${recon.verified.currency} ${recon.verified.amount}`)
      return NextResponse.json(
        { verified: false, error: PAYMENT_RECONCILIATION_REQUIRED },
        { status: 409 },
      )
    }

    // Not verified at all — do not touch the booking.
    return NextResponse.json(
      { verified: false, error: 'Payment verification failed' },
      { status: 400 },
    )
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Verification error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
