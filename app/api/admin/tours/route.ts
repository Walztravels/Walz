import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { z } from 'zod'

const tourSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().min(10),
  highlights: z.string().default('[]'),
  price: z.number().positive(),
  currency: z.string().default('GBP'),
  duration: z.string().min(1),
  location: z.string().min(2),
  imageUrl: z.string().url().optional().or(z.literal('')),
  photos: z.array(z.string()).optional().default([]),
  active: z.boolean().default(true),
  order: z.number().default(0),
})

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const tours = await prisma.tourListing.findMany({
      where: { type: 'tour' },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json(tours)
  } catch (err) {
    console.error('[tours GET]', err)
    return NextResponse.json({ error: 'Failed to load tours' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const parsed = tourSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
  }
  try {
    const data = parsed.data
    const tour = await prisma.tourListing.create({ data: { ...data, type: 'tour' } })
    revalidatePath('/')
    revalidatePath('/tours')
    revalidatePath(`/tours/${tour.slug}`)
    return NextResponse.json(tour, { status: 201 })
  } catch (err) {
    console.error('[tours POST]', err)
    return NextResponse.json({ error: 'Failed to create tour' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const { id, ...rest } = body ?? {}
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const parsed = tourSchema.partial().safeParse(rest)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }
  try {
    const tour = await prisma.tourListing.update({ where: { id }, data: parsed.data })
    revalidatePath('/')
    revalidatePath('/tours')
    revalidatePath(`/tours/${tour.slug}`)
    return NextResponse.json(tour)
  } catch (err) {
    console.error('[tours PUT]', err)
    return NextResponse.json({ error: 'Failed to update tour' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await prisma.tourListing.delete({ where: { id } })
    revalidatePath('/')
    revalidatePath('/tours')
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[tours DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete tour' }, { status: 500 })
  }
}
