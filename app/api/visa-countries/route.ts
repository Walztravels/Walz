import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const portals = await prisma.countryPortal.findMany({
      orderBy: [{ region: 'asc' }, { countryName: 'asc' }],
    })

    // Group by region
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
