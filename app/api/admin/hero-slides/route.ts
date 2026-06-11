import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { z } from 'zod'

const slideSchema = z.object({
  imageUrl:         z.string().min(1),
  headline:         z.string().min(1).max(60),
  subheadline:      z.string().max(120).optional().nullable(),
  badgeEmoji:       z.string().max(4).optional().nullable(),
  badgeText:        z.string().max(40).optional().nullable(),
  ctaPrimaryText:   z.string().min(1),
  ctaPrimaryLink:   z.string().min(1),
  ctaSecondaryText: z.string().optional().nullable(),
  ctaSecondaryLink: z.string().optional().nullable(),
  overlayDarkness:  z.number().min(30).max(80).default(55),
  slideOrder:       z.number().default(0),
  active:           z.boolean().default(true),
})

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const slides = await prisma.heroSlide.findMany({ orderBy: { slideOrder: 'asc' } })
  return NextResponse.json(slides)
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const parsed = slideSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
  }
  const slide = await prisma.heroSlide.create({ data: parsed.data })
  revalidatePath('/')
  return NextResponse.json(slide, { status: 201 })
}
