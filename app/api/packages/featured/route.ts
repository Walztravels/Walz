import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const revalidate = 60

export async function GET() {
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT id, slug, title, destination, country_iso2, tagline, images,
             price_per_person, original_price, currency, duration_days,
             duration_nights, total_seats, seats_booked, departure_date,
             package_type, is_featured
      FROM travel_packages
      WHERE is_active = true
      ORDER BY is_featured DESC, seats_booked DESC, display_order ASC
      LIMIT 6
    `)
    return NextResponse.json(rows)
  } catch (err) {
    console.error('[featured GET]', err)
    return NextResponse.json([], { status: 200 })
  }
}
