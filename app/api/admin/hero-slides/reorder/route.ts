import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { slides } = await req.json().catch(() => ({ slides: [] }))
  if (!Array.isArray(slides)) {
    return NextResponse.json({ error: 'slides array required' }, { status: 400 })
  }
  await Promise.all(
    slides.map(({ id, slide_order }: { id: string; slide_order: number }) =>
      prisma.heroSlide.update({ where: { id }, data: { slideOrder: slide_order } }),
    ),
  )
  revalidatePath('/')
  return NextResponse.json({ success: true })
}
