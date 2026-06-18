import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const items = await prisma.featuredDeal.findMany({ orderBy: { order: 'asc' } })
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await req.json()
  const item = await prisma.featuredDeal.create({
    data: {
      origin:      data.origin,
      destination: data.destination,
      fromLabel:   data.fromLabel  ?? '',
      toLabel:     data.toLabel    ?? '',
      tripType:    data.tripType   ?? 'ROUNDTRIP',
      departDate:  data.departDate ?? null,
      returnDate:  data.returnDate ?? null,
      price:       parseFloat(data.price),
      currency:    data.currency   ?? 'GBP',
      airline:     data.airline    ?? null,
      caption:     data.caption    ?? null,
      badge:       data.badge      ?? null,
      imageUrl:    data.imageUrl   ?? null,
      active:      data.active     ?? true,
      order:       data.order      ?? 0,
    },
  })
  return NextResponse.json({ item })
}
