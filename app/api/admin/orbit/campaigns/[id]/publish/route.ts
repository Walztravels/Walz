import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { publishToBuffer, isBufferConfigured } from '@/lib/orbit/buffer-publisher'
import { notifyPublishComplete } from '@/lib/orbit/notify'

const SUPER_ADMIN = 'super_admin'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Maps DB platform display names → Buffer short keys
const TO_KEY: Record<string, string> = {
  'Instagram':           'instagram',
  'Meta (Facebook)':     'facebook',
  'LinkedIn':            'linkedin',
  'X (Twitter)':         'twitter',
  'TikTok':              'tiktok',
  'Google Business':     'googlebusiness',
  'Google My Business':  'googlebusiness',
  'Google':              'googlebusiness',
  instagram:      'instagram',
  facebook:       'facebook',
  linkedin:       'linkedin',
  twitter:        'twitter',
  tiktok:         'tiktok',
  googlebusiness: 'googlebusiness',
}

// Maps Buffer short keys → content extractor from the content JSON blob.
// Falls back to similar-format content for campaigns generated before
// tiktok_caption / google_business_post were added to the generator.
const EXTRACT: Record<string, (c: Record<string, unknown>) => string> = {
  instagram: (c) => {
    const caps = c.instagram_captions as string[] | undefined
    return caps?.[0] ?? ''
  },
  facebook: (c) => {
    const ads = c.meta_ads as Array<{ headline: string; body: string }> | undefined
    const ad = ads?.[0]
    return ad ? `${ad.headline}\n\n${ad.body}` : ''
  },
  linkedin:       (c) => String(c.linkedin_post ?? ''),
  twitter:        (c) => { const t = String(c.x_post ?? ''); return t.length > 255 ? t.slice(0, 252) + '…' : t },
  tiktok: (c) => {
    if (c.tiktok_caption) return String(c.tiktok_caption)
    // Fallback: use first Instagram caption (similar short-form style)
    const caps = c.instagram_captions as string[] | undefined
    return caps?.[0] ?? ''
  },
  googlebusiness: (c) => {
    if (c.google_business_post) return String(c.google_business_post)
    // Fallback: use first meta ad as headline + body
    const ads = c.meta_ads as Array<{ headline: string; body: string }> | undefined
    const ad = ads?.[0]
    return ad ? `${ad.headline}\n\n${ad.body}` : ''
  },
}

// GET — return publish log for this campaign
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const logs = await prisma.orbitPublishLog.findMany({
    where: { campaignId: params.id },
    orderBy: { sentAt: 'desc' },
  })

  return NextResponse.json({ logs })
}

// POST — publish campaign to Buffer
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (campaign.status !== 'approved' && campaign.status !== 'published') {
    return NextResponse.json({ error: 'Campaign must be approved before publishing to Buffer' }, { status: 400 })
  }

  // Load Buffer integration
  const integration = await prisma.orbitIntegration.findUnique({ where: { id: 'buffer' } })
  const meta = (integration?.meta ?? {}) as Record<string, unknown>

  if (!integration?.connected || !isBufferConfigured(meta)) {
    return NextResponse.json({
      error: 'Buffer is not connected. Add your access token in Orbit → Settings → Integrations.',
    }, { status: 400 })
  }

  const accessToken = meta.accessToken as string
  const channels = (meta.channels ?? {}) as Record<string, string>

  // Which platforms to publish — normalize display names to Buffer short keys
  const body = await req.json().catch(() => ({})) as { platforms?: string[] }
  const rawPlatforms = body.platforms ?? campaign.platforms
  const platforms = [...new Set(rawPlatforms.map(p => TO_KEY[p] ?? p).filter(p => EXTRACT[p]))]

  const content = campaign.content as Record<string, unknown>

  // Grab all approved media, sorted by the user-defined mediaOrder
  const approvedMedia = await prisma.orbitMedia.findMany({
    where: { campaignId: params.id, status: 'approved' },
    orderBy: { createdAt: 'asc' },
  })
  const savedOrder = (campaign.mediaOrder as string[]) ?? []
  const sortedMedia = [
    ...savedOrder.map(id => approvedMedia.find(m => m.id === id)).filter(Boolean),
    ...approvedMedia.filter(m => !savedOrder.includes(m.id)),
  ] as typeof approvedMedia

  const videoItems = sortedMedia.filter(m => m.mediaType === 'video')
  const imageItems = sortedMedia.filter(m => !m.mediaType || m.mediaType === 'image')

  // Buffer/Meta Content API does not support mixed image+video posts or multi-video carousels.
  if (videoItems.length > 0 && imageItems.length > 0) {
    return NextResponse.json({
      error: 'Cannot mix images and videos in a single post. Remove either all images or all videos from the approved list before publishing.',
    }, { status: 400 })
  }
  if (videoItems.length > 1) {
    return NextResponse.json({
      error: 'Buffer does not support posting multiple videos at once. Keep only one approved video.',
    }, { status: 400 })
  }

  const isVideoPost  = videoItems.length === 1
  const publishMedia = isVideoPost ? videoItems : imageItems
  const mediaUrls    = publishMedia.map(m => m.publicUrl).filter((u): u is string => Boolean(u))
  const mediaType    = isVideoPost ? 'video' as const : 'image' as const
  const videoFormat  = isVideoPost ? (videoItems[0].format ?? 'reel') : undefined

  type LogResult = { platform: string; status: string; bufferUpdateId?: string; error?: string }
  const results: LogResult[] = []

  for (const platform of platforms) {
    const channelId = channels[platform]
    const text = EXTRACT[platform]?.(content) ?? ''

    if (!text.trim()) {
      const entry: LogResult = { platform, status: 'skipped', error: 'No content generated for this platform' }
      results.push(entry)
      await prisma.orbitPublishLog.create({
        data: { campaignId: params.id, platform, status: 'skipped', error: entry.error, createdBy: session.email },
      })
      continue
    }

    if (!channelId) {
      const entry: LogResult = { platform, status: 'skipped', error: 'No Buffer channel ID configured — add it in Orbit Settings' }
      results.push(entry)
      await prisma.orbitPublishLog.create({
        data: { campaignId: params.id, platform, status: 'skipped', error: entry.error, createdBy: session.email },
      })
      continue
    }

    // TikTok photo posts have a 2,073,600 pixel max — too restrictive for general images.
    // Post text-only to TikTok for image campaigns; video campaigns still pass the video.
    const platformMediaUrls = (platform === 'tiktok' && !isVideoPost)
      ? undefined
      : (mediaUrls.length ? mediaUrls : undefined)

    try {
      const result = await publishToBuffer(
        { accessToken, channels },
        {
          channelId,
          platform,
          text,
          mediaUrls:   platformMediaUrls,
          mediaType:   platformMediaUrls ? mediaType : undefined,
          videoFormat,
          postNow:     true,
        },
      )
      results.push({ platform, status: 'sent', bufferUpdateId: result.bufferUpdateId })
      await prisma.orbitPublishLog.create({
        data: {
          campaignId: params.id,
          platform,
          bufferUpdateId: result.bufferUpdateId,
          status: 'sent',
          createdBy: session.email,
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ platform, status: 'error', error: msg })
      await prisma.orbitPublishLog.create({
        data: { campaignId: params.id, platform, status: 'error', error: msg, createdBy: session.email },
      })
    }
  }

  // Mark campaign published if any platform succeeded and not yet published
  const anySucceeded = results.some(r => r.status === 'sent')
  if (anySucceeded && campaign.status === 'approved') {
    await prisma.orbitCampaign.update({
      where: { id: params.id },
      data: { status: 'published', publishedAt: new Date() },
    })
  }

  // Email notification (non-blocking)
  if (anySucceeded) {
    const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
    if (settings?.notificationsEmail) {
      notifyPublishComplete({
        email: settings.notificationsEmail,
        campaignId: params.id,
        destination: campaign.destination,
        platforms: results.filter(r => r.status === 'sent').map(r => r.platform),
        publishedBy: session.email,
      })
    }
  }

  return NextResponse.json({ results, published: anySucceeded })
}
