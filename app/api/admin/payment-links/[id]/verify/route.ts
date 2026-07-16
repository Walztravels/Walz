import { NextRequest, NextResponse }                    from 'next/server'
import { getAdminSession }                               from '@/lib/admin-auth'
import { getFLWKey }                                     from '@/lib/flutterwave-banks'
import { verifyPagaCheckout, verifyPagaTransaction }     from '@/lib/paga'
import { prisma }                                        from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    if (!session.permissions?.payments_create && !session.permissions?.payments_edit && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied', required: 'payments_create' }, { status: 403 })
    }

    const link = await prisma.paymentLink.findUnique({ where: { id: params.id } })
    if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // ── Paga payments ─────────────────────────────────────────────────────────
    if (link.type?.startsWith('paga_')) {
      // If already marked paid in DB (e.g. by the customer redirect), return immediately
      if (link.status === 'paid') {
        return NextResponse.json({
          paid:      true,
          pagaCode:  '0',
          amount:    Number(link.amount),
          currency:  link.currency ?? 'NGN',
          reference: link.txRef,
          message:   'Payment confirmed',
          found:     true,
        })
      }

      let result

      if (link.type === 'paga_checkout') {
        // Checkout verify via Paga API (best-effort — DB check above is the primary path)
        result = await verifyPagaCheckout({
          paymentReference: link.txRef,
          amount:           Number(link.amount),
          currency:         link.currency ?? 'NGN',
        })
      } else {
        // Dynamic / persistent — Collect API verify by reference number
        result = await verifyPagaTransaction(link.txRef)
      }

      if (result.isPaid && link.status !== 'paid') {
        await prisma.paymentLink.update({
          where: { id: link.id },
          data:  { status: 'paid', paidAt: new Date() },
        })
      }

      return NextResponse.json({
        paid:      result.isPaid,
        pagaCode:  String(result.responseCode),
        amount:    result.amount ?? Number(link.amount),
        currency:  result.currency ?? link.currency,
        reference: result.paymentReference ?? link.txRef,
        message:   result.message ?? null,
        found:     true,
      })
    }

    // ── Flutterwave payments ──────────────────────────────────────────────────
    const FLW_KEY = getFLWKey()

    const res  = await fetch(
      `https://api.flutterwave.com/v3/transactions?tx_ref=${encodeURIComponent(link.txRef)}`,
      { headers: { Authorization: `Bearer ${FLW_KEY}` } }
    )
    const data = await res.json()
    const tx   = data.data?.[0]

    const isPaid = tx?.status === 'successful' || tx?.status === 'succeeded'

    if (isPaid && link.status !== 'paid') {
      await prisma.paymentLink.update({
        where: { id: link.id },
        data: {
          status:    'paid',
          paidAt:    new Date(),
          payerName: tx.customer?.name ?? null,
        },
      })
    }

    return NextResponse.json({
      paid:      isPaid,
      flwStatus: tx?.status ?? null,
      amount:    tx?.amount ?? null,
      currency:  tx?.currency ?? null,
      payer:     tx?.customer?.name ?? null,
      found:     !!tx,
    })
  } catch (err: unknown) {
    console.error('[payment-links/verify]', (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
