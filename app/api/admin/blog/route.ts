import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { z } from 'zod'

const CATEGORIES = ['Visa Guides', 'Destinations', 'Travel Tips', 'News'] as const

const blogSchema = z.object({
  title:            z.string().min(2),
  slug:             z.string().min(2).regex(/^[a-z0-9-]+$/),
  content:          z.string().min(1),
  excerpt:          z.string().optional(),
  category:         z.enum(CATEGORIES),
  featuredImageUrl: z.string().url().optional().or(z.literal('')).transform(v => v || null),
  metaDescription:  z.string().max(320).optional().transform(v => v || null),
  published:        z.boolean().default(false),
})

function autoExcerpt(content: string) {
  return content.replace(/<[^>]+>/g, '').slice(0, 200).trim() + '…'
}

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  // Single post fetch (for edit modal)
  if (id) {
    const post = await prisma.blogPost.findUnique({ where: { id } })
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(post)
  }

  const posts = await prisma.blogPost.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, slug: true, category: true,
      published: true, createdAt: true, featuredImageUrl: true, excerpt: true,
    },
  })

  return NextResponse.json(posts)
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = blogSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data
  const post = await prisma.blogPost.create({
    data: {
      ...d,
      excerpt: d.excerpt || autoExcerpt(d.content),
    },
  })

  return NextResponse.json(post, { status: 201 })
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const { id, ...rest } = body ?? {}
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const parsed = blogSchema.partial().safeParse(rest)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
  }

  const post = await prisma.blogPost.update({
    where: { id },
    data: parsed.data,
  })

  return NextResponse.json(post)
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.blogPost.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
