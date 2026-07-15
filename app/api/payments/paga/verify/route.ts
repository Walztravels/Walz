import { NextRequest, NextResponse } from 'next/server'
import { verifyPagaTransaction }    from '@/lib/paga'
import { prisma }                   from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref')

  if (!ref) {
    return NextResponse.json({ verified: false, error: 'No reference' }, { status: 400 })
  }

  try {
    const result = await verifyPagaTransaction(ref)

    if (result.isPaid) {
      try {
        await prisma.paymentLink.updateMany({
          where: { txRef: ref },
          data:  { status: 'paid', paidAt: new Date() },
        })
      } catch (dbErr: unknown) {
        console.warn('[paga/verify] DB update skipped:', (dbErr as Error).message)
      }
    }

    return NextResponse.json({
      verified:  result.isPaid,
      amount:    result.amount,
      currency:  result.currency ?? 'NGN',
      reference: result.paymentReference ?? ref,
      message:   result.message,
    })
  } catch (err: unknown) {
    console.error('[paga/verify] ERROR:', (err as Error).message)
    return NextResponse.json(
      { verified: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
