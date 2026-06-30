import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const revalidate = 3600

export async function GET() {
  try {
    const rows = await prisma.featuredDestination.findMany({
      where:   { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
    // Map to the shape the homepage FeaturedDestination interface expects
    const destinations = rows.map(r => ({
      city:       r.city,
      country:    r.country,
      tag:        r.tag,
      image:      r.imageUrl,
      flightFrom: r.flightFrom ?? '',
      hotelFrom:  r.hotelFrom ?? '',
      visaFrom:   r.visaFrom  ?? undefined,
    }))
    return NextResponse.json(destinations, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    })
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
