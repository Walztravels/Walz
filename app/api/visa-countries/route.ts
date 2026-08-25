import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const revalidate = 3600 // country list changes at most weekly; 1-hr cache

export async function GET() {
  try {
    const portals = await prisma.countryPortal.findMany({
      orderBy: [{ region: 'asc' }, { countryName: 'asc' }],
      // Select only what the UI needs — avoids shipping large JSON columns client-side
      select: {
        destinationIso2: true,
        countryName:     true,
        region:          true,
        flagEmoji:       true,
        advisoryLevel:   true,
      },
    })

    const byRegion: Record<string, typeof portals> = {}
    for (const p of portals) {
      const r = p.region || 'Other'
      if (!byRegion[r]) byRegion[r] = []
      byRegion[r].push(p)
    }

    return NextResponse.json({ portals, byRegion })
  } catch (err) {
    console.error('visa-countries error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
