import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { z } from 'zod'

const patchSchema = z.object({
  imageUrl:         z.string().min(1).optional(),
  headline:         z.string().min(1).max(60).optional(),
  subheadline:      z.string().max(120).nullable().optional(),
  badgeEmoji:       z.string().max(4).nullable().optional(),
  badgeText:        z.string().max(40).nullable().optional(),
  ctaPrimaryText:   z.string().min(1).optional(),
  ctaPrimaryLink:   z.string().min(1).optional(),
  ctaSecondaryText: z.string().nullable().optional(),
  ctaSecondaryLink: z.string().nullable().optional(),
  overlayDarkness:  z.number().min(30).max(80).optional(),
  slideOrder:       z.number().optional(),
  active:           z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
  }
  const slide = await prisma.heroSlide.update({
    where: { id: params.id },
    data: parsed.data,
  })
  revalidatePath('/')
  return NextResponse.json(slide)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await prisma.heroSlide.delete({ where: { id: params.id } })
  revalidatePath('/')
  return NextResponse.json({ success: true })
}
