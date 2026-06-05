import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { z } from 'zod'

const dealSchema = z.object({
  origin: z.string().min(2),
  destination: z.string().min(2),
  price: z.number().positive(),
  currency: z.string().default('GBP'),
  airline: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  active: z.boolean().default(true),
  order: z.number().default(0),
})

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const deals = await prisma.featuredDeal.findMany({ orderBy: { order: 'asc' } })
  return NextResponse.json(deals)
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const parsed = dealSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
  }
  const deal = await prisma.featuredDeal.create({ data: parsed.data })
  return NextResponse.json(deal, { status: 201 })
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const { id, ...rest } = body ?? {}
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const parsed = dealSchema.partial().safeParse(rest)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }
  const deal = await prisma.featuredDeal.update({ where: { id }, data: parsed.data })
  return NextResponse.json(deal)
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.featuredDeal.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
