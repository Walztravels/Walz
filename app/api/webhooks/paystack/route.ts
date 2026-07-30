import { NextRequest, NextResponse } from 'next/server'
import { createHmac }               from 'crypto'
import { prisma }                   from '@/lib/db'

export const dynamic = 'force-dynamic'

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
    if (event === 'charge.success' && data?.channel === 'dedicated_nuban') {
      const meta     = data.metadata as Record<string, unknown> | undefined
      const authData = data.authorization as Record<string, unknown> | undefined
      const customer = data.customer     as Record<string, unknown> | undefined

      const txRef   = (meta?.walz_tx_ref as string | undefined) ?? null
      const acctNum = authData?.receiver_bank_account_number as string | undefined

      const payerName = customer?.first_name
        ? `${customer.first_name} ${customer.last_name ?? ''}`.trim()
        : null
      const payerBank = (authData?.sender_bank as string | undefined) ?? null

      // ── Match PaymentLink ─────────────────────────────────────────────────
      let updated = 0

      if (txRef) {
        const res = await prisma.paymentLink.updateMany({
          where: { txRef, status: 'pending' },   // status guard — idempotency
          data:  { status: 'paid', paidAt: new Date(), payerName, payerBank },
        })
        updated = res.count
        console.log('[ps-hook] PaymentLink update by txRef', { txRef, updated })
      }

      // Fallback: match by account number if metadata txRef was absent
      if (updated === 0 && acctNum) {
        const res = await prisma.paymentLink.updateMany({
          where: { accountNumber: acctNum, status: 'pending' },
          data:  { status: 'paid', paidAt: new Date(), payerName, payerBank },
        })
        updated = res.count
        console.log('[ps-hook] PaymentLink update by accountNumber', { acctNum, updated })
      }

      if (updated === 0) {
        console.warn('[ps-hook] NO_MATCH: no pending PaymentLink found', { txRef, acctNum })
      }

      // ── Mirror FLW webhook: update package_bookings ───────────────────────
      // For dedicated VA payments, booking_ref is the walz_tx_ref (WALZ-PS-…).
      // This matches 0 rows in package_bookings — pre-existing behaviour mirrored
      // from the FLW webhook; not a bug to fix inside this scope.
      const booking_ref = txRef ?? (data.reference as string | undefined)
      if (booking_ref) {
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
          data.amount,
          (data.currency as string | undefined) ?? 'NGN',
          booking_ref,
        )
        console.log('[ps-hook] package_bookings rows updated:', pkgRows)
      }
    }
  } catch (err) {
    console.error('[ps-hook] handler error:', err)
    // always 200 — non-200 causes Paystack to retry indefinitely
  }

  return new NextResponse('', { status: 200 })
}
