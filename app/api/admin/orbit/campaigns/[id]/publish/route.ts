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
  'Instagram':       'instagram',
  'Meta (Facebook)': 'facebook',
  'LinkedIn':        'linkedin',
  'X (Twitter)':     'twitter',
  instagram: 'instagram',
  facebook:  'facebook',
  linkedin:  'linkedin',
  twitter:   'twitter',
}

// Maps Buffer short keys → content extractor from the content JSON blob
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
  linkedin: (c) => String(c.linkedin_post ?? ''),
  twitter:  (c) => String(c.x_post ?? ''),
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

  // Grab all approved images for the campaign (carousel support)
  const approvedMedia = await prisma.orbitMedia.findMany({
    where: { campaignId: params.id, status: 'approved' },
    orderBy: { createdAt: 'asc' },
  })
  const mediaUrls = approvedMedia.map(m => m.publicUrl).filter((u): u is string => Boolean(u))

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

    try {
      const result = await publishToBuffer(
        { accessToken, channels },
        { channelId, platform, text, mediaUrls: mediaUrls.length ? mediaUrls : undefined, postNow: true },
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
