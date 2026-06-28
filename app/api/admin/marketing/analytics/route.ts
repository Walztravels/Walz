import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

const GRAPH = 'https://graph.facebook.com/v19.0'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period') ?? '30d'
  const days   = ({ '7d': 7, '30d': 30, '90d': 90 } as Record<string, number>)[period] ?? 30
  const since  = new Date(Date.now() - days * 86_400_000)

  const [published, failed, scheduled, draft, recentPosts] = await Promise.all([
    prisma.socialPost.count({ where: { status: 'published', publishedAt: { gte: since } } }),
    prisma.socialPost.count({ where: { status: 'failed',    updatedAt:  { gte: since } } }),
    prisma.socialPost.count({ where: { status: 'scheduled' } }),
    prisma.socialPost.count({ where: { status: 'draft'     } }),
    prisma.socialPost.findMany({
      where:   { status: 'published', publishedAt: { gte: since } },
      orderBy: { publishedAt: 'desc' },
      take:    50,
      select:  {
        id: true, caption: true, platform: true, postType: true,
        publishedAt: true, metaPostId: true, imageUrls: true, status: true,
      },
    }),
  ])

  // Platform breakdown
  const igCount = recentPosts.filter(p => p.platform === 'instagram' || p.platform === 'both').length
  const fbCount = recentPosts.filter(p => p.platform === 'facebook'  || p.platform === 'both').length

  // Meta Graph API (if token configured)
  let metaStats: Record<string, unknown> | null = null
  const token = process.env.META_PAGE_ACCESS_TOKEN
  const pageId = process.env.META_PAGE_ID
  const igId   = process.env.META_INSTAGRAM_ACCOUNT_ID

  if (token && pageId) {
    try {
      const sinceTs = Math.floor(since.getTime() / 1000)

      const [fbRes, igRes] = await Promise.all([
        fetch(
          `${GRAPH}/${pageId}/insights?metric=page_impressions,page_reach,page_engaged_users,page_fans&period=day&since=${sinceTs}&access_token=${token}`
        ),
        igId
          ? fetch(
              `${GRAPH}/${igId}/insights?metric=impressions,reach,profile_views,follower_count&period=day&since=${sinceTs}&access_token=${token}`
            )
          : Promise.resolve(null),
      ])

      const fbData = await fbRes.json() as { data?: unknown; error?: { message: string } }
      const igData = igRes ? await igRes.json() as { data?: unknown; error?: { message: string } } : null

      metaStats = {
        facebook:  fbData.data  ?? null,
        instagram: igData?.data ?? null,
        fbError:   fbData.error?.message  ?? null,
        igError:   igData?.error?.message ?? null,
      }
    } catch {
      metaStats = { error: 'Meta API unavailable' }
    }
  }

  return NextResponse.json({
    period,
    days,
    since: since.toISOString(),
    internal: { published, failed, scheduled, draft, igCount, fbCount, recentPosts },
    meta:     metaStats,
  })
}
