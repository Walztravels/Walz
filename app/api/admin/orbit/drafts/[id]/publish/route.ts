import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const draft = await prisma.orbitContentDraft.findUnique({
    where: { id: params.id },
    include: { brief: true },
  })
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (draft.status !== 'approved') {
    return NextResponse.json({ error: 'Draft must be approved before publishing' }, { status: 400 })
  }

  const now  = new Date()
  const slug = toSlug(draft.title)

  // Check if a blog post already exists for this draft
  let post
  if (draft.publishedPostId) {
    post = await prisma.blogPost.update({
      where: { id: draft.publishedPostId },
      data: {
        title:           draft.title,
        content:         draft.content,
        excerpt:         draft.excerpt     ?? undefined,
        metaDescription: draft.metaDescription ?? undefined,
        focusKeyword:    draft.focusKeyword ?? undefined,
        tags:            draft.tags,
        published:       true,
        publishedAt:     now,
        source:          'orbit',
      },
    })
  } else {
    // Try to find by slug first
    const existing = await prisma.blogPost.findUnique({ where: { slug } })
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug

    post = await prisma.blogPost.create({
      data: {
        title:           draft.title,
        slug:            finalSlug,
        content:         draft.content,
        excerpt:         draft.excerpt     ?? '',
        metaDescription: draft.metaDescription ?? '',
        focusKeyword:    draft.focusKeyword ?? '',
        tags:            draft.tags,
        category:        categoryFromContentType(draft.brief.contentType),
        published:       true,
        publishedAt:     now,
        source:          'orbit',
      },
    })
  }

  // Mark draft and brief as published
  await Promise.all([
    prisma.orbitContentDraft.update({
      where: { id: params.id },
      data: { status: 'published', publishedAt: now, publishedPostId: post.id },
    }),
    prisma.orbitContentBrief.update({
      where: { id: draft.briefId },
      data: { status: 'published', linkedPostId: post.id },
    }),
  ])

  return NextResponse.json({ ok: true, postId: post.id, slug: post.slug })
}

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function categoryFromContentType(ct: string): string {
  const map: Record<string, string> = {
    visa:              'Visa Guides',
    destination_guide: 'Destinations',
    itinerary:         'Destinations',
    flight:            'Travel Tips',
    hotel:             'Travel Tips',
    travel_tips:       'Travel Tips',
    comparison:        'Travel Tips',
    faq:               'Travel Tips',
    promotional:       'Travel Tips',
    refresh:           'Travel Tips',
  }
  return map[ct] ?? 'Travel Tips'
}
