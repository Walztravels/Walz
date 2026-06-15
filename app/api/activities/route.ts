import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const featured = searchParams.get('featured') === 'true'
  const category = searchParams.get('category')

  const activities = await prisma.activity.findMany({
    where: {
      isPublished: true,
      ...(featured ? { isFeatured: true } : {}),
      ...(category ? { category }          : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ activities })
}
