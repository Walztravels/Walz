import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const category  = searchParams.get('category') ?? ''
  const search    = searchParams.get('search')   ?? ''
  const page      = Math.max(1, parseInt(searchParams.get('page')  || '1'))
  const limit     = Math.min(50, parseInt(searchParams.get('limit') || '9'))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    published: true,
    ...(category && category !== 'all' ? { category } : {}),
    ...(search ? {
      OR: [
        { title:   { contains: search, mode: 'insensitive' } },
        { excerpt: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ],
    } : {}),
  }

  const [posts, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        category: true,
        featuredImageUrl: true,
        createdAt: true,
      },
    }),
    prisma.blogPost.count({ where }),
  ])

  return NextResponse.json({
    posts,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  })
}
