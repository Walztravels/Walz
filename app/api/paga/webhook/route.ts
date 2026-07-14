import { NextRequest, NextResponse } from 'next/server'
import { verifyPagaWebhookHash }     from '@/lib/paga'
import { prisma }                    from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Paga Collect webhook — POST notifications for completed payments.
 *
 * Set your webhook URL in the Paga merchant dashboard to:
 *   https://walztravels.com/api/paga/webhook
 *
 * Paga sends a JSON payload with at least:
 *   { amount, timeStamp, paymentReference, hash, ... }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>

    const amount           = String(body.amount ?? '')
    const timestamp        = String(body.timeStamp ?? body.timestamp ?? '')
    const paymentReference = String(body.paymentReference ?? body.reference ?? '')
    const receivedHash     = String(body.hash ?? '')

    // Verify webhook authenticity before processing
    if (!verifyPagaWebhookHash({ amount, timestamp, paymentReference, receivedHash })) {
      console.warn('[paga/webhook] Hash mismatch — possible tampered payload', {
        paymentReference,
        amount,
        timestamp,
      })
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Find the matching PaymentLink by txRef
    const txRef = String(body.merchantReference ?? body.txRef ?? paymentReference)
    if (!txRef) {
      return NextResponse.json({ error: 'No reference found' }, { status: 400 })
    }

    const link = await prisma.paymentLink.findUnique({ where: { txRef } })
    if (!link) {
      // Not necessarily an error — may be a checkout payment without a DB record
      console.info('[paga/webhook] No PaymentLink found for txRef:', txRef)
      return NextResponse.json({ received: true })
    }

    if (link.status !== 'paid') {
      await prisma.paymentLink.update({
        where: { txRef },
        data: {
          status:    'paid',
          paidAt:    new Date(),
          payerName: (body.payerName ?? body.sourceAccountName ?? null) as string | null,
          payerBank: (body.payerBank ?? body.sourceBank         ?? null) as string | null,
        },
      })
    }

    return NextResponse.json({ received: true })
  } catch (err: unknown) {
    console.error('[paga/webhook] ERROR:', (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
