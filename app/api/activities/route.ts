import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const featured     = searchParams.get('featured') === 'true'
  const category     = searchParams.get('category')
  const destination  = searchParams.get('destination')?.trim()
  const q            = searchParams.get('q')?.trim()
  const search       = q || destination

  const activities = await prisma.activity.findMany({
    where: {
      isPublished: true,
      ...(featured  ? { isFeatured: true } : {}),
      ...(category  ? { category }          : {}),
      ...(search ? {
        OR: [
          { title:    { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ activities })
}
