import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { publishToBuffer, isBufferConfigured } from '@/lib/orbit/buffer-publisher'
import { notifyPublishComplete } from '@/lib/orbit/notify'
import { canPublishAsset } from '@/lib/orbit/media-library'
import {
  preflightChannel, summarizeResults, latestPerChannel, normalizeLogStatus,
  RETRYABLE_STATUSES, isStaleSubmitting, isAmbiguousSubmitError,
} from '@/lib/orbit/publish-preflight'

const SUPER_ADMIN = 'super_admin'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    const caps = c.instagram_captions as string[] | undefined
    return caps?.[0] ?? ''
  },
  googlebusiness: (c) => {
    if (c.google_business_post) return String(c.google_business_post)
    const ads = c.meta_ads as Array<{ headline: string; body: string }> | undefined
    const ad = ads?.[0]
    return ad ? `${ad.headline}\n\n${ad.body}` : ''
  },
}

// GET — publish log + latest per-channel state
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
  const latest = [...latestPerChannel(logs).entries()].map(([platform, log]) => ({
    platform,
    status: normalizeLogStatus(log.status),
    stale:  isStaleSubmitting(log),
  }))
  return NextResponse.json({ logs, latest })
}

/**
 * Resolve the campaign's publishable media: legacy owned rows (approved,
 * campaignId) UNION shared-library attachments — deduped, in attachment/
 * mediaOrder order, split into ready vs not-ready.
 */
async function loadPublishableMedia(campaignId: string, mediaOrder: string[]) {
  const [legacy, links] = await Promise.all([
    prisma.orbitMedia.findMany({
      where: { campaignId, status: 'approved', isReference: false },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.orbitCampaignMedia.findMany({
      where:   { campaignId },
      orderBy: { position: 'asc' },
      include: { media: true },
    }),
  ])
  const seen = new Set<string>()
  const ordered: typeof legacy = []
  for (const l of links) {
    if (!seen.has(l.media.id)) { seen.add(l.media.id); ordered.push(l.media) }
  }
  const sortedLegacy = [
    ...mediaOrder.map(id => legacy.find(m => m.id === id)).filter(Boolean),
    ...legacy.filter(m => !mediaOrder.includes(m.id)),
  ] as typeof legacy
  for (const m of sortedLegacy) {
    if (!seen.has(m.id)) { seen.add(m.id); ordered.push(m) }
  }
  const ready    = ordered.filter(m => canPublishAsset(m))
  const notReady = ordered.filter(m => !canPublishAsset(m))
  return { ready, notReady }
}

interface PublishBody {
  platforms?:        string[]
  customText?:       string
  retryFailedOnly?:  boolean
  dryRun?:           boolean
}

// POST — validate and queue the campaign to Buffer, one durable record per
// channel attempt. Never resubmits queued/published channels; ambiguous
// timeouts become 'unknown' and require reconciliation before resending.
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

  const integration = await prisma.orbitIntegration.findUnique({ where: { id: 'buffer' } })
  const meta = (integration?.meta ?? {}) as Record<string, unknown>
  if (!integration?.connected || !isBufferConfigured(meta)) {
    return NextResponse.json({
      error: 'Buffer is not connected. Add your access token in Orbit → Settings → Integrations.',
    }, { status: 400 })
  }
  const accessToken = meta.accessToken as string
  const channels = (meta.channels ?? {}) as Record<string, string>

  const body = await req.json().catch(() => ({})) as PublishBody
  const rawPlatforms = body.platforms ?? campaign.platforms
  let platforms = [...new Set(rawPlatforms.map(p => TO_KEY[p] ?? p).filter(p => EXTRACT[p]))]

  const content    = campaign.content as Record<string, unknown>
  const customText = typeof body.customText === 'string' && body.customText.trim() ? body.customText : undefined

  // Per-channel history (newest first) for dedupe/retry decisions
  const allLogs = await prisma.orbitPublishLog.findMany({
    where: { campaignId: params.id }, orderBy: { sentAt: 'desc' },
  })
  const latest = latestPerChannel(allLogs)

  // Reconcile stale 'submitting' rows (a crash/timeout mid-submit): their
  // outcome is unknowable from here → mark unknown, require manual check.
  for (const [, log] of latest) {
    if (isStaleSubmitting(log)) {
      await prisma.orbitPublishLog.update({
        where: { id: log.id },
        data:  {
          status: 'unknown', checkedAt: new Date(),
          error: 'Submission was interrupted — check Buffer for this post, then use Mark as failed / Mark as queued before retrying.',
        },
      })
      log.status = 'unknown'
    }
  }

  const skippedProtected: Array<{ platform: string; reason: string }> = []

  // Retry-failed-only: resubmit ONLY channels whose latest state is
  // retryable. queued/published/submitting/unknown channels are protected.
  if (body.retryFailedOnly) {
    const retryable: string[] = []
    for (const p of platforms) {
      const last = latest.get(p)
      const status = last ? normalizeLogStatus(last.status) : 'draft'
      if (last && RETRYABLE_STATUSES.includes(status)) retryable.push(p)
      else if (last) skippedProtected.push({
        platform: p,
        reason: status === 'unknown'
          ? 'Outcome unknown — reconcile (Mark as failed / queued) before retrying'
          : `Already ${status.replace('_', ' ')} — not resubmitted`,
      })
      else skippedProtected.push({ platform: p, reason: 'Never attempted — use the normal Queue action' })
    }
    platforms = retryable
  } else {
    // Double-click / concurrent-worker protection: a fresh 'submitting'
    // row means another request is in flight for that channel right now.
    for (const p of [...platforms]) {
      const last = latest.get(p)
      if (last && last.status === 'submitting' && !isStaleSubmitting(last)) {
        platforms = platforms.filter(x => x !== p)
        skippedProtected.push({ platform: p, reason: 'A submission for this channel is already in progress' })
      }
    }
  }

  // Load publishable media (legacy + shared-library attachments)
  const { ready: publishMediaAll, notReady } = await loadPublishableMedia(
    params.id, (campaign.mediaOrder as string[]) ?? [],
  )
  const videoItems = publishMediaAll.filter(m => m.mediaType === 'video')
  const imageItems = publishMediaAll.filter(m => !m.mediaType || m.mediaType === 'image')
  const isVideoPost  = videoItems.length === 1 && imageItems.length === 0
  const publishMedia = isVideoPost ? videoItems : imageItems
  const mediaUrls    = publishMedia.map(m => m.publicUrl).filter((u): u is string => Boolean(u))
  const mediaIds     = publishMedia.map(m => m.id)

  // ── Preflight every requested channel; blockers stop the send ────────────
  const preflight = platforms.map(platform => ({
    platform,
    channelId: channels[platform] ?? null,
    blockers: preflightChannel({
      platform,
      channelId: channels[platform] ?? null,
      text: customText ?? EXTRACT[platform]?.(content) ?? '',
      media: {
        imageCount: imageItems.length,
        videoCount: videoItems.length,
        allOwnedAndReady: notReady.length === 0,
        notReadyTitles: notReady.map(m => m.title ?? m.id),
      },
    }),
  }))

  if (body.dryRun) {
    return NextResponse.json({ preflight, skippedProtected, mediaCount: publishMedia.length })
  }

  const blocked = preflight.filter(p => p.blockers.length > 0)
  if (blocked.length > 0) {
    // Shown to staff BEFORE anything is sent — nothing is silently skipped.
    return NextResponse.json({
      error: 'Some channels have blockers — fix them or deselect those channels. Nothing was sent.',
      preflight,
      skippedProtected,
    }, { status: 422 })
  }

  if (platforms.length === 0) {
    const counts = { queued: 0, failed: 0, skipped: skippedProtected.length, unknown: 0 }
    return NextResponse.json({ results: [], skippedProtected, counts, ...summarizeResults(counts), published: false })
  }

  type LogResult = { platform: string; status: string; bufferUpdateId?: string; error?: string; attempt: number }
  const results: LogResult[] = []

  for (const platform of platforms) {
    const channelId = channels[platform]!
    const text = customText ?? EXTRACT[platform]?.(content) ?? ''
    const attempt = allLogs.filter(l => l.platform === platform).length + 1

    // Durable per-channel record BEFORE the provider call — a crash between
    // here and the update leaves a 'submitting' row that reconciliation
    // turns into 'unknown' rather than a silent duplicate send later.
    const logRow = await prisma.orbitPublishLog.create({
      data: {
        campaignId: params.id, platform, status: 'submitting',
        createdBy: session.email, attempt, channelId,
        mediaIds: mediaIds,
      },
    })

    try {
      const result = await publishToBuffer(
        { accessToken, channels },
        {
          channelId, platform, text,
          mediaUrls:   mediaUrls.length ? mediaUrls : undefined,
          mediaType:   isVideoPost ? 'video' : 'image',
          videoFormat: isVideoPost ? (videoItems[0].format ?? 'reel') : undefined,
          postNow:     true,
        },
      )
      // Buffer acknowledged the QUEUE — that is not publication.
      await prisma.orbitPublishLog.update({
        where: { id: logRow.id },
        data:  { status: 'queued_buffer', bufferUpdateId: result.bufferUpdateId, providerStatus: 'queued' },
      })
      results.push({ platform, status: 'queued_buffer', bufferUpdateId: result.bufferUpdateId, attempt })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (isAmbiguousSubmitError(err)) {
        // We cannot know whether Buffer accepted it — never blind-retry.
        await prisma.orbitPublishLog.update({
          where: { id: logRow.id },
          data:  { status: 'unknown', error: `Timed out after submission — check Buffer before retrying. (${msg.slice(0, 200)})` },
        })
        results.push({ platform, status: 'unknown', error: msg, attempt })
      } else {
        await prisma.orbitPublishLog.update({
          where: { id: logRow.id },
          data:  { status: 'failed', error: msg.slice(0, 500) },
        })
        results.push({ platform, status: 'failed', error: msg, attempt })
      }
    }
  }

  const counts = {
    queued:  results.filter(r => r.status === 'queued_buffer').length,
    failed:  results.filter(r => r.status === 'failed').length,
    skipped: skippedProtected.length,
    unknown: results.filter(r => r.status === 'unknown').length,
  }
  const { summary, tone } = summarizeResults(counts)

  // Campaign lifecycle: 'published' here means "at least one channel queued
  // on Buffer" (historical meaning kept); per-channel truth lives in the log.
  if (counts.queued > 0 && campaign.status === 'approved') {
    await prisma.orbitCampaign.update({
      where: { id: params.id },
      data: { status: 'published', publishedAt: new Date() },
    })
  }

  if (counts.queued > 0) {
    const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
    if (settings?.notificationsEmail) {
      notifyPublishComplete({
        email: settings.notificationsEmail,
        campaignId: params.id,
        destination: campaign.destination,
        platforms: results.filter(r => r.status === 'queued_buffer').map(r => r.platform),
        publishedBy: session.email,
      })
    }
  }

  return NextResponse.json({ results, skippedProtected, counts, summary, tone, published: counts.queued > 0 })
}

// PATCH — manual reconciliation of an 'unknown' channel outcome. Staff check
// Buffer's dashboard, then record what actually happened; retry stays
// blocked until this is done.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { logId?: string; resolvedStatus?: string }
  if (!body.logId || !['failed', 'queued_buffer'].includes(body.resolvedStatus ?? '')) {
    return NextResponse.json({ error: 'logId and resolvedStatus (failed | queued_buffer) are required' }, { status: 400 })
  }
  const log = await prisma.orbitPublishLog.findFirst({
    where: { id: body.logId, campaignId: params.id },
  })
  if (!log) return NextResponse.json({ error: 'Log entry not found' }, { status: 404 })
  const current = normalizeLogStatus(log.status)
  if (current !== 'unknown' && !(current === 'submitting' && isStaleSubmitting(log))) {
    return NextResponse.json({ error: `Only unknown/stale entries can be reconciled (this one is ${current})` }, { status: 400 })
  }
  const updated = await prisma.orbitPublishLog.update({
    where: { id: log.id },
    data: {
      status:    body.resolvedStatus!,
      checkedAt: new Date(),
      error:     `${log.error ?? ''} · Reconciled as ${body.resolvedStatus} by ${session.email}`.slice(0, 500),
    },
  })
  return NextResponse.json({ log: updated })
}
