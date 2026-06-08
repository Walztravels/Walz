import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const tour = await prisma.tourListing.findUnique({
    where: { slug: params.slug },
  })
  if (!tour || !tour.active) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(tour)
}
