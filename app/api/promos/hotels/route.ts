import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

// Always live — see app/api/promos/flights/route.ts's identical comment.
export const dynamic = 'force-dynamic'

export async function GET() {
  const hotels = await prisma.featuredHotel.findMany({
    where: { active: true },
    orderBy: { order: 'asc' },
    take: 12,
  })
  return NextResponse.json(hotels)
}
