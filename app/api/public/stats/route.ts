import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const items = await prisma.homeStat.findMany({
      where:   { active: true },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
