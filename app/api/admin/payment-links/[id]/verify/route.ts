import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { getFLWKey }                 from '@/lib/flutterwave-banks'
import { prisma }                    from '@/lib/db'

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
  } catch (err: any) {
    console.error('[payment-links/verify]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
