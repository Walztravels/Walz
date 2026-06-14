import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const revalidate = 60

export async function GET() {
  try {
    const packages = await prisma.tourListing.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json(packages)
  } catch (err) {
    console.error('[api/packages GET]', err)
    return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 })
  }
}
