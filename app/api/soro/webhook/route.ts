import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// Soro dashboard → Settings → Integration → Webhook URL:
// https://www.walztravels.com/api/soro/webhook
// Add SORO_WEBHOOK_SECRET to Vercel env vars.

export async function GET() {
  return NextResponse.json({
    connected: true,
    platform:  'walztravels.com',
    cms:       'Next.js + Prisma',
    version:   '1.0',
  })
}

export async function POST(req: NextRequest) {
  try {
    // Verify secret
    const secret = process.env.SORO_WEBHOOK_SECRET
    if (secret) {
      const auth = req.headers.get('authorization') ?? ''
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
      }
    }

    const body = await req.json()

    const {
      title,
      slug,
      content,
      excerpt,
      featured_image,
      meta_title,
      meta_description,
      focus_keyword,
      tags     = [],
      category,
      status,
      article_id,
    } = body

    if (!title || !slug || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: title, slug, content' },
        { status: 400 }
      )
    }

    const wordCount = content.replace(/<[^>]*>/g, '').split(/\s+/).length
    const readTime  = Math.max(1, Math.ceil(wordCount / 200))
    const isPublish = status === 'publish'

    const shared = {
      title,
      content,
      excerpt:         excerpt || content.replace(/<[^>]*>/g, '').slice(0, 200).trim() + '…',
      featuredImageUrl: featured_image || null,
      metaTitle:       meta_title       || title,
      metaDescription: meta_description || null,
      focusKeyword:    focus_keyword     || null,
      tags:            Array.isArray(tags) ? tags : [],
      category:        category || 'Travel Tips',
      source:          'soro',
      soroArticleId:   article_id || null,
      author:          'Walz Travels',
      readTime,
      published:       isPublish,
      publishedAt:     isPublish ? new Date() : null,
    }

    const post = await prisma.blogPost.upsert({
      where:  { slug },
      create: { ...shared, slug },
      update: shared,
    })

    console.log(`[soro] ${isPublish ? 'published' : 'drafted'} → ${post.slug}`)

    return NextResponse.json({
      success: true,
      id:      post.id,
      slug:    post.slug,
      status:  post.published ? 'published' : 'draft',
      url:     `https://www.walztravels.com/blog/${post.slug}`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[soro] webhook error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
