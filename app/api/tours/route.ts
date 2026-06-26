import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const revalidate = 300 // revalidate ISR cache every 5 minutes

// Public endpoint — returns active tour listings; ?type=tour|package filters by type
export async function GET(req: NextRequest) {
  try {
    const type = new URL(req.url).searchParams.get('type')
    const where: Record<string, unknown> = { active: true }
    if (type) where.type = type
    const tours = await prisma.tourListing.findMany({
      where,
      orderBy: { order: 'asc' },
    })
    return NextResponse.json(tours, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
