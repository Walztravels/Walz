import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// GET /api/admin/fees/visa — list all country portal fees
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const portals = await prisma.countryPortal.findMany({
    select: {
      destinationIso2: true,
      countryName:     true,
      flagEmoji:       true,
      walzFeeUsd:      true,
      govtFeeAmount:   true,
      govtFeeCurrency: true,
    },
    orderBy: { countryName: 'asc' },
  })

  const fees = portals.map(p => ({
    id:              p.destinationIso2,
    countryName:     p.countryName,
    flagEmoji:       p.flagEmoji ?? '',
    destinationIso2: p.destinationIso2,
    walzFeeUsd:      p.walzFeeUsd,
    govtFeeAmount:   p.govtFeeAmount,
    govtFeeCurrency: p.govtFeeCurrency,
  }))

  return NextResponse.json({ fees })
}

// PATCH /api/admin/fees/visa — update one country's fees
export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only super_admin can update fees
  if (session.role !== 'super_admin' && session.staffRole !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as {
    id:              string
    walzFeeUsd:      number
    govtFeeAmount:   number
    govtFeeCurrency: string
  }

  const { id, walzFeeUsd, govtFeeAmount, govtFeeCurrency } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const updated = await prisma.countryPortal.update({
    where: { destinationIso2: id },
    data: {
      walzFeeUsd,
      govtFeeAmount,
      govtFeeCurrency: govtFeeCurrency.toUpperCase().slice(0, 3),
    },
    select: {
      destinationIso2: true,
      walzFeeUsd:      true,
      govtFeeAmount:   true,
      govtFeeCurrency: true,
    },
  })

  return NextResponse.json({ ok: true, updated })
}
