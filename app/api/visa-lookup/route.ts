import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { passport_iso2, destination_iso2 } = await req.json()

    if (!passport_iso2 || !destination_iso2) {
      return NextResponse.json({ error: 'passport_iso2 and destination_iso2 required' }, { status: 400 })
    }

    const p = passport_iso2.toUpperCase()
    const d = destination_iso2.toUpperCase()

    // Same country check
    if (p === d) {
      return NextResponse.json({ error: 'Passport and destination cannot be the same country' }, { status: 400 })
    }

    const [rule, portal, advisory] = await Promise.all([
      prisma.visaRule.findUnique({
        where: { passportIso2_destinationIso2: { passportIso2: p, destinationIso2: d } },
      }),
      prisma.countryPortal.findUnique({ where: { destinationIso2: d } }),
      prisma.travelAdvisory.findUnique({ where: { destinationIso2: d } }),
    ])

    return NextResponse.json({
      found: !!(rule || portal),
      rule: rule ?? null,
      portal: portal ?? null,
      advisory: advisory ?? null,
    })
  } catch (err) {
    console.error('visa-lookup error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
