import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Public endpoint — returns all active tour listings ordered by `order` field
export async function GET() {
  try {
    const tours = await prisma.tourListing.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json(tours)
  } catch {
    return NextResponse.json([], { status: 200 }) // graceful fallback
  }
}
