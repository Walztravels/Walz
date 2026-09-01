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
 * Storage:
 *   The original file stays in the marketing-media Supabase bucket.
 *   Only metadata (publicUrl, mimeType, etc.) is copied to OrbitMedia.
 *   storagePath is set to 'media_library:<marketingMediaId>' as a sentinel.
 *   The DELETE (archive) route uses soft-delete and does not touch storage,
 *   so detaching is safe.
 *
 * RBAC: super_admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

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
  const session = await getAdminSession()
  if (!session)                       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    mediaLibraryId?: string
    format?:         string
  }

  if (!body.mediaLibraryId) {
    return NextResponse.json({ error: 'mediaLibraryId is required' }, { status: 400 })
  }

  // ── Fetch the Media Library asset (IDOR protection) ───────────────────────────
  const libraryAsset = await prisma.marketingMedia.findUnique({
    where: { id: body.mediaLibraryId },
  })
  if (!libraryAsset) {
    return NextResponse.json({ error: 'Media Library asset not found' }, { status: 404 })
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
  // providerJobId stores the MarketingMedia ID when provider='media_library'
  const existing = await prisma.orbitMedia.findFirst({
    where: {
      campaignId:    params.id,
      provider:      'media_library',
      providerJobId: body.mediaLibraryId,
    },
  })
  if (existing) {
    return NextResponse.json({
      media:          existing,
      alreadyAttached: true,
    })
  }

  const mediaType = isVideo ? 'video' : 'image'
  const format    = body.format ?? (isVideo ? '1080x1920' : '1080x1080')

  // ── Create OrbitMedia (metadata only, no binary re-upload) ────────────────────
  const media = await prisma.orbitMedia.create({
    data: {
      source:           'media_library',
      provider:         'media_library',
      providerJobId:    body.mediaLibraryId,        // sentinel: source MarketingMedia ID
      storagePath:      `media_library:${body.mediaLibraryId}`,
      publicUrl:        libraryAsset.url,            // points to marketing-media bucket
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

  return NextResponse.json({ media }, { status: 201 })
}
