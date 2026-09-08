/**
 * Orbit Media Library — the single shared home for creative assets.
 *
 * Every successful generation, upload and design export is registered here
 * with a durable save lifecycle:
 *
 *   GENERATING (generationStatus pending/processing)
 *     → SAVING   (readiness 'saving' — binary being copied into OWNED storage)
 *     → READY    (readiness 'ready' — storage + DB persistence both succeeded)
 *
 * Failure states are explicit and recoverable:
 *   save_failed    — generation succeeded but ingest failed; retrySave()
 *                    re-ingests the existing provider output WITHOUT
 *                    regenerating or re-charging.
 *   missing_source — the only copy is an expired/expiring provider URL
 *                    (legacy rows); retrySave() attempts recovery and
 *                    reports honestly when the provider file is gone.
 *
 * 'ready' is NEVER set while the binary lives only on a provider URL, and
 * ingestion is idempotent — repeated callbacks/retries update the same row.
 */

import { prisma } from '@/lib/db'

export const READINESS = ['draft', 'saving', 'ready', 'save_failed', 'missing_source', 'archived'] as const
export type Readiness = typeof READINESS[number]

const BUCKET = 'orbit-media'

/** True when the URL points at storage WE own (never expires under us). */
export function isOwnedStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return url.includes(`/storage/v1/object/public/${BUCKET}/`)
}

/** Only ready, non-archived, owned-storage assets may be published. */
export function canPublishAsset(media: {
  readiness?: string | null
  publicUrl?: string | null
  generationStatus?: string | null
}): boolean {
  return media.readiness === 'ready'
    && isOwnedStorageUrl(media.publicUrl)
    && (media.generationStatus == null || media.generationStatus === 'completed')
}

function extFor(contentType: string): string {
  if (contentType.includes('png'))  return 'png'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('gif'))  return 'gif'
  if (contentType.includes('mp4'))  return 'mp4'
  if (contentType.includes('webm')) return 'webm'
  if (contentType.includes('quicktime')) return 'mov'
  return 'jpg'
}

function sanitizeError(msg: string): string {
  // Never persist tokens/keys/query secrets in staff-visible errors
  return msg.replace(/(key|token|secret|signature|authorization)=[^&\s"']+/gi, '$1=***').slice(0, 500)
}

/**
 * Download a binary from `sourceUrl` into owned storage and mark the
 * OrbitMedia row READY. Idempotent:
 *  - already-owned URL → just confirms readiness (no duplicate file)
 *  - repeated calls for the same media reuse a deterministic storage path,
 *    so replayed callbacks overwrite the same object instead of duplicating.
 * On failure the row is marked save_failed with a sanitized reason — the
 * provider output URL is kept so retrySave() can try again without
 * regenerating.
 */
export async function ingestToLibrary(opts: {
  mediaId:    string
  sourceUrl?: string          // defaults to the row's current publicUrl
}): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string; recoverable: boolean }> {
  const media = await prisma.orbitMedia.findUnique({ where: { id: opts.mediaId } })
  if (!media) return { ok: false, error: 'Media record not found', recoverable: false }

  const sourceUrl = opts.sourceUrl ?? media.publicUrl ?? ''

  // Already durably saved → idempotent success (replayed callback / retry)
  if (isOwnedStorageUrl(media.publicUrl) && media.readiness === 'ready') {
    return { ok: true, publicUrl: media.publicUrl! }
  }
  if (isOwnedStorageUrl(sourceUrl)) {
    await prisma.orbitMedia.update({
      where: { id: media.id },
      data:  { readiness: 'ready', saveError: null, publicUrl: sourceUrl },
    })
    return { ok: true, publicUrl: sourceUrl }
  }
  if (!sourceUrl) {
    await prisma.orbitMedia.update({
      where: { id: media.id },
      data:  { readiness: 'missing_source', saveError: 'No source URL recorded for this asset' },
    })
    return { ok: false, error: 'No source URL recorded for this asset', recoverable: false }
  }

  // SAVING — visible state; never claim saved before storage+DB succeed
  await prisma.orbitMedia.update({ where: { id: media.id }, data: { readiness: 'saving' } })

  try {
    const res = await fetch(sourceUrl)
    if (!res.ok) throw new Error(`Source fetch failed (HTTP ${res.status}) — the provider file may have expired`)
    const contentType = res.headers.get('content-type') ?? (media.mediaType === 'video' ? 'video/mp4' : 'image/jpeg')
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length === 0) throw new Error('Source file was empty')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) throw new Error('Storage is not configured (missing Supabase env)')

    // Deterministic path per media row → replays overwrite, never duplicate
    const storagePath = `library/${media.id}.${extFor(contentType)}`
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${serviceKey}`,
        'Content-Type': contentType,
        'x-upsert':     'true',
      },
      body: buffer as unknown as BodyInit,
    })
    if (!uploadRes.ok) {
      const detail = await uploadRes.text().catch(() => '')
      throw new Error(`Storage upload failed (HTTP ${uploadRes.status}): ${detail.slice(0, 200)}`)
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`
    await prisma.orbitMedia.update({
      where: { id: media.id },
      data: {
        storagePath,
        publicUrl,
        mimeType:  contentType,
        sizeBytes: buffer.length,
        readiness: 'ready',
        saveError: null,
      },
    })
    return { ok: true, publicUrl }
  } catch (err) {
    const msg = sanitizeError(err instanceof Error ? err.message : String(err))
    const expired = /expired|HTTP 40[34]|HTTP 410/.test(msg)
    await prisma.orbitMedia.update({
      where: { id: media.id },
      data:  { readiness: expired ? 'missing_source' : 'save_failed', saveError: msg },
    }).catch(() => { /* keep original error primary */ })
    return { ok: false, error: msg, recoverable: !expired }
  }
}

/**
 * Retry saving an existing output. NEVER regenerates and never re-charges —
 * it re-runs ingestion against the recorded source URL only.
 */
export async function retrySave(mediaId: string) {
  return ingestToLibrary({ mediaId })
}

/**
 * Create a new version of an asset. The new row shares the assetGroupId,
 * points at the same binary initially (files are never copied per version —
 * a later re-export replaces the binary through ingestToLibrary), and starts
 * as draft so it cannot be published until explicitly made ready.
 */
export async function createAssetVersion(mediaId: string, staffEmail: string): Promise<{ id: string; version: number }> {
  const src = await prisma.orbitMedia.findUnique({ where: { id: mediaId } })
  if (!src) throw new Error('Asset not found')
  const groupId = src.assetGroupId ?? src.id
  const latest = await prisma.orbitMedia.aggregate({
    where: { OR: [{ assetGroupId: groupId }, { id: groupId }] },
    _max:  { version: true },
  })
  const nextVersion = (latest._max.version ?? src.version ?? 1) + 1
  const copy = await prisma.orbitMedia.create({
    data: {
      source:        src.source,
      storagePath:   src.storagePath,
      publicUrl:     src.publicUrl,
      format:        src.format,
      mediaType:     src.mediaType,
      durationMs:    src.durationMs,
      destination:   src.destination,
      campaignType:  src.campaignType,
      prompt:        src.prompt,
      altText:       src.altText,
      provider:      src.provider,
      model:         src.model,
      width:         src.width,
      height:        src.height,
      posterData:    src.posterData ?? undefined,
      sourceType:    src.sourceType,
      sourceMediaId: src.sourceMediaId,
      mimeType:      src.mimeType,
      sizeBytes:     src.sizeBytes,
      title:         src.title,
      tags:          src.tags ?? [],
      readiness:     isOwnedStorageUrl(src.publicUrl) ? 'ready' : 'draft',
      assetGroupId:  groupId,
      version:       nextVersion,
      parentMediaId: src.id,
      designProjectId: src.designProjectId,
      designSnapshot:  src.designSnapshot ?? undefined,
      createdBy:     staffEmail,
    },
    select: { id: true, version: true },
  })
  return copy
}

/** Where is this asset used? (campaign links + legacy ownership + publishes) */
export async function getAssetUsage(mediaId: string) {
  const [links, legacyOwner] = await Promise.all([
    prisma.orbitCampaignMedia.findMany({
      where:   { mediaId },
      include: { campaign: { select: { id: true, objective: true, status: true } } },
    }),
    prisma.orbitMedia.findUnique({
      where:  { id: mediaId },
      select: { campaignId: true, campaign: { select: { id: true, objective: true, status: true } } },
    }),
  ])
  const campaigns = new Map<string, { id: string; objective: string; status: string }>()
  for (const l of links) campaigns.set(l.campaign.id, l.campaign)
  if (legacyOwner?.campaign) campaigns.set(legacyOwner.campaign.id, legacyOwner.campaign)
  return [...campaigns.values()]
}

/**
 * Archive an asset safely. Blocked (with the exact campaigns named) when the
 * asset is attached to an approved or already-published campaign — archiving
 * must never break an active schedule. Archiving never deletes the file.
 */
export async function archiveAsset(mediaId: string): Promise<{ ok: true } | { ok: false; blockedBy: Array<{ id: string; objective: string; status: string }> }> {
  const usage = await getAssetUsage(mediaId)
  const active = usage.filter(c => c.status === 'approved' || c.status === 'published')
  if (active.length > 0) return { ok: false, blockedBy: active }
  await prisma.orbitMedia.update({ where: { id: mediaId }, data: { readiness: 'archived' } })
  return { ok: true }
}

/** Attach an asset to a campaign by reference (no file copy). Idempotent. */
export async function attachToCampaign(campaignId: string, mediaId: string, staffEmail: string, position?: number) {
  const media = await prisma.orbitMedia.findUnique({
    where: { id: mediaId }, select: { id: true, readiness: true },
  })
  if (!media) throw new Error('Asset not found')
  if (media.readiness === 'archived') throw new Error('Asset is archived — restore it before attaching')
  const maxPos = position ?? (await prisma.orbitCampaignMedia.aggregate({
    where: { campaignId }, _max: { position: true },
  }))._max.position ?? -1
  return prisma.orbitCampaignMedia.upsert({
    where:  { campaignId_mediaId: { campaignId, mediaId } },
    update: {},                                        // idempotent — no duplicates
    create: { campaignId, mediaId, position: typeof position === 'number' ? position : maxPos + 1, addedBy: staffEmail },
  })
}
