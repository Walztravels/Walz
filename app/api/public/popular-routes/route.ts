import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const KEY = 'flights_popular_routes'

export async function GET() {
  const row = await prisma.siteContent.findUnique({ where: { key: KEY } })
  if (!row) return NextResponse.json({ routes: null })
  try {
    return NextResponse.json({ routes: JSON.parse(row.value) })
  } catch {
    return NextResponse.json({ routes: null })
  }
}
