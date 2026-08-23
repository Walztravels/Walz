import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { notifyCampaignNeedsApproval, notifyPublishComplete } from '@/lib/orbit/notify'
import { publishToBuffer, isBufferConfigured } from '@/lib/orbit/buffer-publisher'

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

// Maps Buffer short keys → content extractor
const EXTRACT: Record<string, (c: Record<string, unknown>) => string> = {
  instagram:      (c) => { const caps = c.instagram_captions as string[] | undefined; return caps?.[0] ?? '' },
  facebook:       (c) => { const ads = c.meta_ads as Array<{ headline: string; body: string }> | undefined; const ad = ads?.[0]; return ad ? `${ad.headline}\n\n${ad.body}` : '' },
  linkedin:       (c) => String(c.linkedin_post ?? ''),
  twitter:        (c) => { const t = String(c.x_post ?? ''); return t.length > 280 ? t.slice(0, 277) + '…' : t },
  tiktok:         (c) => String(c.tiktok_caption ?? (c.instagram_captions as string[] | undefined)?.[0] ?? ''),
  googlebusiness: (c) => {
    if (c.google_business_post) return String(c.google_business_post)
    const ads = c.meta_ads as Array<{ headline: string; body: string }> | undefined
    const ad = ads?.[0]
    return ad ? `${ad.headline}\n\n${ad.body}` : ''
  },
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Per-campaign image cost (sum of orbit_media.cost_usd)
  const imageAgg = await prisma.orbitMedia.aggregate({
    where: { campaignId: params.id },
    _sum: { costUsd: true },
    _count: true,
  })

  return NextResponse.json({
    campaign,
    imageCostUsd: imageAgg._sum.costUsd ?? 0,
    imageCount: imageAgg._count,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { action, rejectionReason } = body

  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()

  if (action === 'approve') {
    if (campaign.status !== 'review') {
      return NextResponse.json({ error: 'Can only approve a campaign in review status' }, { status: 400 })
    }
    await prisma.orbitCampaign.update({
      where: { id: params.id },
      data: { status: 'approved', approvedBy: session.email, approvedAt: now },
    })
  } else if (action === 'reject') {
    await prisma.orbitCampaign.update({
      where: { id: params.id },
      data: { status: 'rejected', rejectedBy: session.email, rejectedAt: now, rejectionReason: rejectionReason ?? '' },
    })
  } else if (action === 'publish') {
    if (campaign.status !== 'approved') {
      return NextResponse.json({ error: 'Campaign must be approved before publishing' }, { status: 400 })
    }
    if (!campaign.approvedBy) {
      return NextResponse.json({ error: 'No approver recorded — cannot publish' }, { status: 400 })
    }

    // Mark published in DB
    await prisma.orbitCampaign.update({
      where: { id: params.id },
      data: { status: 'published', publishedAt: now },
    })

    // Push to Buffer if configured (non-fatal — DB status already saved)
    try {
      const integration = await prisma.orbitIntegration.findUnique({ where: { id: 'buffer' } })
      const bufMeta = (integration?.meta ?? {}) as Record<string, unknown>
      if (integration?.connected && isBufferConfigured(bufMeta)) {
        const accessToken  = bufMeta.accessToken as string
        const channels     = (bufMeta.channels ?? {}) as Record<string, string>
        const content      = campaign.content as Record<string, unknown>
        const approvedMedia = await prisma.orbitMedia.findMany({
          where: { campaignId: params.id, status: 'approved' },
          orderBy: { createdAt: 'asc' },
        })
        const savedOrder = (campaign.mediaOrder as string[]) ?? []
        const sortedMedia = [
          ...savedOrder.map(id => approvedMedia.find(m => m.id === id)).filter(Boolean),
          ...approvedMedia.filter(m => !savedOrder.includes(m.id)),
        ] as typeof approvedMedia
        const mediaUrls = sortedMedia.map(m => m.publicUrl).filter((u): u is string => Boolean(u))

        type LogResult = { platform: string; status: string; bufferUpdateId?: string; error?: string }
        const results: LogResult[] = []

        const bufferPlatforms = [...new Set(campaign.platforms.map(p => TO_KEY[p]).filter(Boolean))]
        for (const platform of bufferPlatforms.filter(p => EXTRACT[p])) {
          const channelId = channels[platform]
          const text      = EXTRACT[platform]?.(content) ?? ''

          if (!text.trim() || !channelId) {
            const reason = !text.trim() ? 'No content for platform' : 'No Buffer channel ID configured'
            results.push({ platform, status: 'skipped', error: reason })
            await prisma.orbitPublishLog.create({
              data: { campaignId: params.id, platform, status: 'skipped', error: reason, createdBy: session.email },
            })
            continue
          }

          try {
            const res = await publishToBuffer(
              { accessToken, channels },
              { channelId, platform, text, mediaUrls: mediaUrls.length ? mediaUrls : undefined, postNow: true },
            )
            results.push({ platform, status: 'sent', bufferUpdateId: res.bufferUpdateId })
            await prisma.orbitPublishLog.create({
              data: { campaignId: params.id, platform, bufferUpdateId: res.bufferUpdateId, status: 'sent', createdBy: session.email },
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            results.push({ platform, status: 'error', error: msg })
            await prisma.orbitPublishLog.create({
              data: { campaignId: params.id, platform, status: 'error', error: msg, createdBy: session.email },
            })
          }
        }

        const anySucceeded = results.some(r => r.status === 'sent')
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
      }
    } catch {
      // Buffer publish failed — campaign is still marked published in DB
    }
  } else if (action === 'reorder') {
    const { mediaOrder } = body as { mediaOrder?: string[] }
    if (!Array.isArray(mediaOrder)) return NextResponse.json({ error: 'mediaOrder must be an array' }, { status: 400 })
    await prisma.orbitCampaign.update({
      where: { id: params.id },
      data: { mediaOrder },
    })
  } else if (action === 'draft') {
    await prisma.orbitCampaign.update({
      where: { id: params.id },
      data: { status: 'draft' },
    })
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const updated = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })

  // Notify on review (non-blocking)
  if (action === 'review' && updated) {
    const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
    if (settings?.notificationsEmail) {
      notifyCampaignNeedsApproval({
        email:       settings.notificationsEmail,
        campaignId:  params.id,
        destination: updated.destination,
        objective:   updated.objective,
        platforms:   updated.platforms,
        generatedBy: updated.generatedBy ?? session.email,
      })
    }
  }

  return NextResponse.json({ campaign: updated })
}
