import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  try {
    const bookings = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
      SELECT
        pb.*,
        tp.title AS package_title,
        tp.slug  AS package_slug
      FROM package_bookings pb
      LEFT JOIN travel_packages tp ON tp.id = pb.package_id
      ORDER BY pb.created_at DESC
    `)

    return NextResponse.json(bookings)
  } catch (error) {
    console.error('[GET /api/admin/package-bookings]', error)
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }
}
