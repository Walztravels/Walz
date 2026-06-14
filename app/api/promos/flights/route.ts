import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  const deals = await prisma.featuredDeal.findMany({
    where: { active: true },
    orderBy: { order: 'asc' },
    take: 12,
  })
  return NextResponse.json(deals)
}
