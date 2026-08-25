import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const revalidate = 300 // re-fetch every 5 min; testimonials change infrequently

export async function GET() {
  try {
    const items = await prisma.testimonial.findMany({
      where:   { active: true },
      orderBy: { sortOrder: 'asc' },
      select:  { id: true, name: true, role: true, body: true, rating: true, sortOrder: true },
    })
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
