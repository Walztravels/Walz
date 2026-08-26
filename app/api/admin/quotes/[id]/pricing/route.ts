import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { calculateProposalPricing } from '@/lib/pricing/proposal-pricing'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { markupMinor = 0, serviceChargeMinor = 0, discountMinor = 0 } = await req.json()

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: { items: { select: { sellingPriceMinor: true } } },
  })
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const subtotalMinor = quote.items.reduce((s, i) => s + i.sellingPriceMinor, BigInt(0))
  const result = calculateProposalPricing({
    subtotalMinor,
    markupMinor:        BigInt(Math.round(Number(markupMinor))),
    serviceChargeMinor: BigInt(Math.round(Number(serviceChargeMinor))),
    discountMinor:      BigInt(Math.round(Number(discountMinor))),
  })

  const updated = await prisma.quote.update({
    where: { id: params.id },
    data: {
      markupMinor:        result.markupMinor,
      serviceChargeMinor: result.serviceChargeMinor,
      discountMinor:      result.discountMinor,
      subtotalMinor:      result.subtotalMinor,
      totalMinor:         result.totalMinor,
    } as Parameters<typeof prisma.quote.update>[0]['data'],
  })

  return NextResponse.json({
    subtotalMinor:      Number(updated.subtotalMinor),
    markupMinor:        Number((updated as any).markupMinor ?? 0),
    serviceChargeMinor: Number((updated as any).serviceChargeMinor ?? 0),
    discountMinor:      Number((updated as any).discountMinor ?? 0),
    totalMinor:         Number(updated.totalMinor),
  })
}
