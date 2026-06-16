import { NextRequest, NextResponse } from 'next/server'
import { generateVoucherPDF, type VoucherData } from '@/lib/voucher/generateVoucher'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { ref: string } }
) {
  const ref = params.ref

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const booking = await prisma.booking.findUnique({
    where: { bookingReference: ref },
  }).catch(() => null)

  const data: VoucherData = {
    bookingReference: ref,
    customerName:     booking?.contactEmail?.split('@')[0] ?? 'Valued Customer',
    customerEmail:    booking?.contactEmail ?? '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items:            JSON.parse((booking as any)?.metadata ?? '[]'),
    total:            booking?.totalAmount ?? 0,
    currency:         booking?.currency    ?? 'USD',
    createdAt:        booking?.createdAt?.toISOString() ?? new Date().toISOString(),
  }

  try {
    const pdfBuffer = await generateVoucherPDF(data)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status:  200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="walz-voucher-${ref}.pdf"`,
        'Cache-Control':       'private, no-store',
      },
    })
  } catch (err) {
    console.error('[Voucher PDF]', err)
    return NextResponse.json({ error: 'Failed to generate voucher' }, { status: 500 })
  }
}
