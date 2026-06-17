import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const services = await prisma.visaService.findMany({
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ services })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await req.json().catch(() => ({}))

  const service = await prisma.visaService.create({
    data: {
      country:        data.country        ?? '',
      flag:           data.flag           ?? '',
      visaType:       data.visaType       ?? 'Tourist',
      fee:            parseFloat(data.walzFee ?? data.fee ?? 0),
      currency:       data.walzFeeCurrency ?? data.currency ?? 'GBP',
      processingTime: data.processingTime ?? '',
      active:         data.active         ?? true,
    },
  })
  return NextResponse.json({ service }, { status: 201 })
}
