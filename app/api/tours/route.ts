import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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
    return NextResponse.json(tours)
  } catch {
    return NextResponse.json([], { status: 200 }) // graceful fallback
  }
}
