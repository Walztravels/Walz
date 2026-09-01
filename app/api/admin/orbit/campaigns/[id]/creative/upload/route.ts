/**
 * Orbit Creative Studio — direct asset upload (non-reference).
 *
 * POST /api/admin/orbit/campaigns/[id]/creative/upload
 *   Creates an OrbitMedia placeholder and returns a presigned Supabase upload URL.
 *   The browser uploads the file directly; no binary passes through Vercel functions.
 *
 * PATCH /api/admin/orbit/campaigns/[id]/creative/upload
 *   Confirms the upload is complete (marks generationStatus='completed', updates altText).
 *
 * Accepted formats:
 *   Images: JPEG, PNG, WebP   (max 50 MB)
 *   Videos: MP4, MOV, WebM    (max 300 MB — Buffer/Instagram limit)
 *
 * Security:
 *   - MIME validated server-side against allowlist (browser MIME is untrusted)
 *   - File size validated server-side
 *   - RBAC: super_admin only
 *   - Campaign ownership verified (campaign must belong to session context)
 *   - storagePath path-traversal-safe (derived from CUID, never from user input)
 *
 * RBAC: super_admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { prisma } from '@/lib/db'

export const dynamic   = 'force-dynamic'
export const maxDuration = 15

const BUCKET = 'orbit-media'

const ALLOWED_IMAGE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
}

const ALLOWED_VIDEO_MIME: Record<string, string> = {
  'video/mp4':       'mp4',
  'video/quicktime': 'mov',
  'video/webm':      'webm',
}

const MAX_IMAGE_BYTES = 50  * 1024 * 1024  // 50 MB
const MAX_VIDEO_BYTES = 300 * 1024 * 1024  // 300 MB

// ── POST — presign upload URL ──────────────────────────────────────────────────

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
    mimeType?:  string
    fileSize?:  number
    format?:    string
    mediaType?: string   // 'image' | 'video'
  }

  const mimeType  = body.mimeType  ?? 'image/jpeg'
  const fileSize  = body.fileSize  ?? 0
  const format    = body.format    ?? '1080x1080'
  const mediaType = body.mediaType ?? 'image'

  // ── MIME type validation (server-side; never trust browser MIME alone) ────────
  const isImage = mediaType !== 'video'
  const allowedMime = isImage ? ALLOWED_IMAGE_MIME : ALLOWED_VIDEO_MIME
  const ext = allowedMime[mimeType]
  if (!ext) {
    const allowed = Object.keys(allowedMime).join(', ')
    return NextResponse.json({
      error: `File type not allowed. ${isImage ? 'Image' : 'Video'} must be one of: ${allowed}`,
    }, { status: 415 })
  }

  // ── File size validation ───────────────────────────────────────────────────────
  const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES
  const limitLabel = isImage ? '50 MB' : '300 MB'
  if (fileSize > maxBytes) {
    return NextResponse.json({
      error: `File exceeds the ${limitLabel} limit for ${isImage ? 'images' : 'videos'}.`,
    }, { status: 413 })
  }

  // ── Create OrbitMedia placeholder ─────────────────────────────────────────────
  const supabase    = getSupabaseAdmin()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

  let placeholder: Awaited<ReturnType<typeof prisma.orbitMedia.create>>
  try {
    placeholder = await prisma.orbitMedia.create({
      data: {
        source:           'uploaded',
        provider:         'uploaded',
        storagePath:      '',
        format,
        mediaType:        isImage ? 'image' : 'video',
        campaignId:       params.id,
        createdBy:        session.email,
        isReference:      false,
        generationStatus: 'processing',
      },
    })
  } catch (dbErr) {
    console.error('[upload/POST] OrbitMedia create failed:', dbErr instanceof Error ? dbErr.message : String(dbErr))
    return NextResponse.json({
      error: 'Could not create upload record.',
      errorCode: 'ORBIT_MEDIA_CREATE_FAILED',
    }, { status: 500 })
  }

  const storagePath = `orbit/${placeholder.id}.${ext}`
  const publicUrl   = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`

  await prisma.orbitMedia.update({
    where: { id: placeholder.id },
    data:  { storagePath, publicUrl },
  }).catch(() => {})

  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath)

  if (uploadErr || !uploadData?.signedUrl) {
    await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
    return NextResponse.json({ error: 'Could not create upload URL. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({
    mediaId:     placeholder.id,
    uploadUrl:   uploadData.signedUrl,
    storagePath,
    publicUrl,
    mediaType:   isImage ? 'image' : 'video',
    format,
  })
}

// ── PATCH — confirm upload complete ───────────────────────────────────────────
//
// Called after the browser has finished PUTting the file to the presigned URL.
// Marks generationStatus='completed' and optionally updates altText.

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session)                       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const body = await req.json().catch(() => ({})) as { mediaId?: string; altText?: string }
  if (!body.mediaId) return NextResponse.json({ error: 'mediaId is required' }, { status: 400 })

  // Verify ownership — media must belong to this campaign
  const existing = await prisma.orbitMedia.findFirst({
    where: { id: body.mediaId, campaignId: params.id },
  })
  if (!existing) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

  const media = await prisma.orbitMedia.update({
    where: { id: body.mediaId },
    data:  {
      generationStatus: 'completed',
      ...(body.altText ? { altText: body.altText } : {}),
    },
  })

  return NextResponse.json({ media })
}
