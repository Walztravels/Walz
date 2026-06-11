import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const revalidate = 60

export async function GET() {
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT id, slug, title, destination, country_iso2, tagline, images,
             price_per_person, original_price, currency, duration_days,
             duration_nights, departure_date, departure_city, total_seats,
             seats_booked, package_type, visa_included, flight_included,
             hotel_included
      FROM travel_packages
      WHERE is_active = true
        AND is_spotlight = true
      ORDER BY departure_date ASC NULLS LAST
      LIMIT 5
    `)
    return NextResponse.json({ packages: rows })
  } catch (err) {
    console.error('[spotlight GET]', err)
    return NextResponse.json({ packages: [] })
  }
}
