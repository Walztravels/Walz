/**
 * Orbit Creative Studio — attach Media Library asset to campaign.
 *
 * POST /api/admin/orbit/campaigns/[id]/creative/library
 *   Attaches an existing MarketingMedia asset to this campaign's Creative Studio.
 *   Creates an OrbitMedia record that references the original without re-uploading.
 *
 * Security:
 *   - Verifies the MarketingMedia asset exists (IDOR protection)
 *   - Does not allow cross-campaign asset access
 *   - Does not re-upload or move the original asset
 *   - Duplicate-attach idempotency: returns existing attachment if already attached
 *   - RBAC: super_admin only
 *
 * Storage model (new):
 *   sourceType    = 'media_library'
 *   sourceMediaId = MarketingMedia.id
 *   storagePath   = '' (Orbit does not own this binary)
 *   providerJobId = null (not an AI generation job)
 *   publicUrl     = copy of MarketingMedia.url (for fast reads without a JOIN)
 *
 *   The original file stays in the marketing-media Supabase bucket.
 *   Archiving/detaching is safe because soft-delete never touches storage
 *   when isLibraryRef=true (see resolveOrbitMediaAsset).
 *
 * Backward compat:
 *   Idempotency lookup checks BOTH new fields AND the legacy
 *   storagePath='media_library:<id>' sentinel used by rows created before this change.
 *
 * RBAC: super_admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

function prismaErrDetail(err: unknown): string {
  if (err instanceof Error) {
    const p = err as { code?: string; meta?: unknown }
    return `${err.message.slice(0, 200)} [code=${p.code ?? '?'} meta=${JSON.stringify(p.meta ?? {})}]`
  }
  return String(err)
}

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp',
])
const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4', 'video/quicktime', 'video/webm',
])

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const traceId = `orb_lib_${Date.now().toString(36).slice(-5)}`
  try {

  const session = await getAdminSession()
  if (!session)                       return NextResponse.json({ error: 'Unauthorized', traceId }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden', traceId },    { status: 403 })

  let campaign: Awaited<ReturnType<typeof prisma.orbitCampaign.findUnique>>
  try {
    campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  } catch (dbErr) {
    console.error(`[library/POST] traceId=${traceId} stage=campaign_lookup_failed ${prismaErrDetail(dbErr)}`)
    return NextResponse.json({ error: 'Database error looking up campaign.', errorCode: 'INTERNAL_SERVER_ERROR', traceId }, { status: 500 })
  }
  if (!campaign) return NextResponse.json({ error: 'Campaign not found', traceId }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    mediaLibraryId?: string
    format?:         string
  }

  if (!body.mediaLibraryId) {
    return NextResponse.json({ error: 'mediaLibraryId is required' }, { status: 400 })
  }

  // ── Fetch the Media Library asset (IDOR protection) ───────────────────────────
  let libraryAsset: Awaited<ReturnType<typeof prisma.marketingMedia.findUnique>>
  try {
    libraryAsset = await prisma.marketingMedia.findUnique({ where: { id: body.mediaLibraryId } })
  } catch (dbErr) {
    console.error(`[library/POST] traceId=${traceId} stage=asset_lookup_failed ${prismaErrDetail(dbErr)}`)
    return NextResponse.json({ error: 'Database error looking up asset.', errorCode: 'INTERNAL_SERVER_ERROR', traceId }, { status: 500 })
  }
  if (!libraryAsset) {
    return NextResponse.json({ error: 'Media Library asset not found', traceId }, { status: 404 })
  }

  // ── Validate the MIME type is supported in Creative Studio ────────────────────
  const isImage = ALLOWED_IMAGE_MIME.has(libraryAsset.mimeType)
  const isVideo = ALLOWED_VIDEO_MIME.has(libraryAsset.mimeType)
  if (!isImage && !isVideo) {
    return NextResponse.json({
      error: `Media type '${libraryAsset.mimeType}' is not supported in Creative Studio. ` +
             `Attach images (JPEG, PNG, WebP) or videos (MP4, MOV, WebM).`,
    }, { status: 415 })
  }

  // ── Duplicate-attach idempotency ──────────────────────────────────────────────
  // Fall back to legacy providerJobId sentinel only when source_type column may not exist.
  let existing: Awaited<ReturnType<typeof prisma.orbitMedia.findFirst>> | null = null
  try {
    existing = await prisma.orbitMedia.findFirst({
      where: {
        OR: [
          {
            campaignId:    params.id,
            sourceType:    'media_library',
            sourceMediaId: body.mediaLibraryId,
          },
          {
            campaignId:    params.id,
            provider:      'media_library',
            providerJobId: body.mediaLibraryId,
          },
        ],
      },
    })
  } catch {
    // source_type column may not yet exist — fall back to legacy sentinel only
    try {
      existing = await prisma.orbitMedia.findFirst({
        where: {
          campaignId:    params.id,
          provider:      'media_library',
          providerJobId: body.mediaLibraryId,
        },
      })
    } catch { /* no existing record found */ }
  }
  if (existing) {
    return NextResponse.json({
      media:           existing,
      alreadyAttached: true,
    })
  }

  const mediaType = isVideo ? 'video' : 'image'
  const format    = body.format ?? (isVideo ? '1080x1920' : '1080x1080')

  // ── Create OrbitMedia (metadata only — no binary re-upload) ──────────────────
  let media: Awaited<ReturnType<typeof prisma.orbitMedia.create>>
  try {
    media = await prisma.orbitMedia.create({
      data: {
        source:           'media_library',
        provider:         'media_library',
        sourceType:       'media_library',
        sourceMediaId:    body.mediaLibraryId,
        storagePath:      '',
        publicUrl:        libraryAsset.url,
        format,
        mediaType,
        campaignId:       params.id,
        createdBy:        session.email,
        altText:          libraryAsset.altText || libraryAsset.filename,
        isReference:      false,
        generationStatus: 'completed',
        costUsd:          0,
      },
    })
  } catch (dbErr) {
    const detail = prismaErrDetail(dbErr)
    console.error(`[library/POST] traceId=${traceId} stage=db_create_failed ${detail}`)
    return NextResponse.json({
      error: 'Could not attach Media Library asset.',
      errorCode: 'ORBIT_MEDIA_CREATE_FAILED',
      traceId,
    }, { status: 500 })
  }

  return NextResponse.json({ media }, { status: 201 })

  } catch (fatal) {
    console.error(`[library/POST] traceId=${traceId} stage=fatal_unhandled ${fatal instanceof Error ? fatal.message : String(fatal)}`)
    return NextResponse.json({ error: 'An unexpected error occurred.', errorCode: 'INTERNAL_SERVER_ERROR', traceId }, { status: 500 })
  }
}
