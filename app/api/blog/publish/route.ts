import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'

/**
 * POST /api/blog/publish
 *
 * Authenticated endpoint for Soro AI to publish blog posts.
 * Authentication: Authorization: Bearer <SORO_API_KEY>
 *
 * Body fields:
 *   title, slug, content, category, featured_image_url?,
 *   meta_description?, excerpt?
 *
 * Posts are auto-published immediately.
 * If a post with the same slug exists it is updated (upsert).
 */

const CATEGORIES = ['Visa Guides', 'Destinations', 'Travel Tips', 'News'] as const

const schema = z.object({
  title:               z.string().min(2),
  slug:                z.string().min(2).regex(/^[a-z0-9-]+$/, 'slug must be lowercase-hyphenated'),
  content:             z.string().min(10),
  category:            z.string().refine((c) => CATEGORIES.includes(c as typeof CATEGORIES[number]), {
    message: `category must be one of: ${CATEGORIES.join(', ')}`,
  }),
  featured_image_url:  z.string().url().optional().or(z.literal('')),
  meta_description:    z.string().max(320).optional(),
  excerpt:             z.string().max(500).optional(),
})

function extractExcerpt(content: string): string {
  return content.replace(/<[^>]+>/g, '').slice(0, 200).trim() + '…'
}

export async function POST(request: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const apiKey = process.env.SORO_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Soro API not configured' }, { status: 503 })
  }

  const authHeader = request.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')

  if (token !== apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Validate body ─────────────────────────────────────────────────────────
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const d = parsed.data

  const data = {
    title:            d.title,
    content:          d.content,
    category:         d.category,
    featuredImageUrl: d.featured_image_url || null,
    metaDescription:  d.meta_description   || null,
    excerpt:          d.excerpt             || extractExcerpt(d.content),
    published:        true,
  }

  // ── Upsert ────────────────────────────────────────────────────────────────
  const post = await prisma.blogPost.upsert({
    where:  { slug: d.slug },
    create: { ...data, slug: d.slug },
    update: data,
  })

  return NextResponse.json({ success: true, post }, { status: 201 })
}
