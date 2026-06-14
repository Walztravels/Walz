import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { z } from 'zod'

const hotelSchema = z.object({
  name:          z.string().min(2),
  location:      z.string().min(2),
  searchQuery:   z.string().min(2),
  propertyType:  z.string().default('Hotel'),
  rating:        z.number().nullable().optional(),
  reviewCount:   z.number().int().nullable().optional(),
  reviewLabel:   z.string().nullable().optional(),
  priceFrom:     z.number().nullable().optional(),
  priceOriginal: z.number().nullable().optional(),
  currency:      z.string().default('USD'),
  caption:       z.string().nullable().optional(),
  badge:         z.string().nullable().optional(),
  photos:        z.string().default('[]'),
  bookingUrl:    z.string().nullable().optional(),
  active:        z.boolean().default(true),
  order:         z.number().default(0),
})

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const hotels = await prisma.featuredHotel.findMany({ orderBy: { order: 'asc' } })
  return NextResponse.json(hotels)
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const parsed = hotelSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  const hotel = await prisma.featuredHotel.create({ data: parsed.data })
  return NextResponse.json(hotel, { status: 201 })
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, ...rest } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const parsed = hotelSchema.partial().safeParse(rest)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  const hotel = await prisma.featuredHotel.update({ where: { id }, data: parsed.data })
  return NextResponse.json(hotel)
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  await prisma.featuredHotel.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
