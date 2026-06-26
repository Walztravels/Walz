import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const revalidate = 60 // revalidate every 60 seconds

export async function GET() {
  try {
    const items = await prisma.homeStat.findMany({
      where:   { active: true },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json({ items }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
