import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/visa/prices?country=United+Arab+Emirates
// Public endpoint — no auth required. Returns active VisaService rows for a country.
export async function GET(req: NextRequest) {
  const country = req.nextUrl.searchParams.get('country')?.trim()
  if (!country) {
    return NextResponse.json({ error: 'country query param required' }, { status: 400 })
  }

  const services = await prisma.visaService.findMany({
    where:   { country, active: true },
    orderBy: { createdAt: 'asc' },
    select: {
      id:             true,
      visaType:       true,
      fee:            true,
      expressFeeUsd:  true,
      currency:       true,
      processingTime: true,
    },
  })

  return NextResponse.json({ services })
}
