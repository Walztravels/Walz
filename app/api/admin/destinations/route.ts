import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const destinations = await prisma.featuredDestination.findMany({
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json({ destinations })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    city: string; country: string; tag?: string; imageUrl: string
    flightFrom?: string; hotelFrom?: string; visaFrom?: string
    description?: string; isActive?: boolean; sortOrder?: number
  }

  if (!body.city?.trim() || !body.imageUrl?.trim()) {
    return NextResponse.json({ error: 'city and imageUrl are required' }, { status: 400 })
  }

  const dest = await prisma.featuredDestination.create({
    data: {
      city:        body.city.trim(),
      country:     body.country?.trim() ?? '',
      tag:         body.tag?.trim() ?? '',
      imageUrl:    body.imageUrl.trim(),
      flightFrom:  body.flightFrom?.trim() ?? null,
      hotelFrom:   body.hotelFrom?.trim() ?? null,
      visaFrom:    body.visaFrom?.trim()   ?? null,
      description: body.description?.trim() ?? null,
      isActive:    body.isActive  ?? true,
      sortOrder:   body.sortOrder ?? 0,
    },
  })
  return NextResponse.json(dest, { status: 201 })
}
