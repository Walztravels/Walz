import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { z } from 'zod'

const dealSchema = z.object({
  origin:      z.string().min(2),
  destination: z.string().min(2),
  fromLabel:   z.string().default(''),
  toLabel:     z.string().default(''),
  tripType:    z.string().default('ROUNDTRIP'),
  departDate:  z.string().optional().default(''),
  returnDate:  z.string().optional().default(''),
  price:       z.number().positive(),
  currency:    z.string().default('GBP'),
  airline:     z.string().optional(),
  caption:     z.string().optional(),
  badge:       z.string().optional(),
  photos:      z.string().default('[]'),
  imageUrl:    z.string().optional(),
  active:      z.boolean().default(true),
  order:       z.number().default(0),
})

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const deals = await prisma.featuredDeal.findMany({ orderBy: { order: 'asc' } })
    return NextResponse.json(deals)
  } catch (err) {
    console.error('[flights GET]', err)
    return NextResponse.json({ error: 'Failed to load deals' }, { status: 500 })
  }
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
  try {
    const deal = await prisma.featuredDeal.create({ data: parsed.data })
    revalidatePath('/flights')
    revalidatePath('/')
    return NextResponse.json(deal, { status: 201 })
  } catch (err) {
    console.error('[flights POST]', err)
    return NextResponse.json({ error: 'Failed to create deal' }, { status: 500 })
  }
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
  try {
    const deal = await prisma.featuredDeal.update({ where: { id }, data: parsed.data })
    revalidatePath('/flights')
    revalidatePath('/')
    return NextResponse.json(deal)
  } catch (err) {
    console.error('[flights PUT]', err)
    return NextResponse.json({ error: 'Failed to update deal' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await prisma.featuredDeal.delete({ where: { id } })
    revalidatePath('/flights')
    revalidatePath('/')
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[flights DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete deal' }, { status: 500 })
  }
}
