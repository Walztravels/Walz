/**
 * Orbit Creative Studio — reference image upload.
 *
 * POST /api/admin/orbit/campaigns/[id]/creative/reference
 *   Creates an OrbitMedia placeholder with isReference=true and returns
 *   a presigned Supabase upload URL for direct browser upload.
 *
 * DELETE /api/admin/orbit/campaigns/[id]/creative/reference?mediaId=xxx
 *   Removes a reference image (hard-deletes the OrbitMedia row + purges storage).
 *   Allows replacing a reference image with a new one.
 *
 * Staff upload reference images (destination photos, aircraft, hotel, Walz
 * branding assets). These are safe to use as OpenAI image-edit inputs.
 *
 * SECURITY: Never accept private customer documents (passports, IDs, tickets).
 * Validated by: mimeType allowlist + size limit.
 *
 * RBAC: super_admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const BUCKET         = 'orbit-media'
const MAX_BYTES      = 20 * 1024 * 1024  // 20 MB

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
}

function prismaErrDetail(err: unknown): string {
  if (err instanceof Error) {
    const p = err as { code?: string; meta?: unknown }
    return `${err.message.slice(0, 200)} [code=${p.code ?? '?'} meta=${JSON.stringify(p.meta ?? {})}]`
  }
  return String(err)
}

// ── POST — presign reference upload ──────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const traceId = `orb_ref_${Date.now().toString(36).slice(-5)}`

  try {
    const session = await getAdminSession()
    if (!session)                     return NextResponse.json({ error: 'Unauthorized', traceId }, { status: 401 })
    if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden', traceId },    { status: 403 })

    let campaign: Awaited<ReturnType<typeof prisma.orbitCampaign.findUnique>>
    try {
      campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
    } catch (dbErr) {
      console.error(`[reference/POST] traceId=${traceId} stage=campaign_lookup_failed ${prismaErrDetail(dbErr)}`)
      return NextResponse.json({ error: 'Database error looking up campaign.', errorCode: 'INTERNAL_SERVER_ERROR', traceId }, { status: 500 })
    }
    if (!campaign) return NextResponse.json({ error: 'Campaign not found', traceId }, { status: 404 })

    const body = await req.json().catch(() => ({})) as { mimeType?: string; fileSize?: number; label?: string }
    const mimeType = body.mimeType ?? 'image/jpeg'
    const fileSize = body.fileSize ?? 0

    const ext = ALLOWED_MIME[mimeType]
    if (!ext) return NextResponse.json({ error: 'File type not allowed. Upload JPEG, PNG, WebP, or GIF only.', traceId }, { status: 415 })
    if (fileSize > MAX_BYTES) return NextResponse.json({ error: 'Reference image must be under 20 MB', traceId }, { status: 413 })

    const supabase    = getSupabaseAdmin()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

    let placeholder: Awaited<ReturnType<typeof prisma.orbitMedia.create>>
    try {
      placeholder = await prisma.orbitMedia.create({
        data: {
          source:      'uploaded',
          storagePath: '',
          format:      'reference',
          mediaType:   'image',
          campaignId:  params.id,
          createdBy:   session.email,
          isReference: true,
          altText:     body.label ?? 'Reference image',
        },
      })
    } catch (dbErr) {
      const detail = prismaErrDetail(dbErr)
      console.error(`[reference/POST] traceId=${traceId} stage=db_create_failed ${detail}`)
      return NextResponse.json({
        error: 'Could not create reference record.',
        errorCode: 'ORBIT_MEDIA_CREATE_FAILED',
        traceId,
      }, { status: 500 })
    }

    const storagePath = `orbit/${placeholder.id}.${ext}`
    const publicUrl   = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`

    try {
      await prisma.orbitMedia.update({
        where: { id: placeholder.id },
        data:  { storagePath, publicUrl },
      })
    } catch (dbErr) {
      await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
      console.error(`[reference/POST] traceId=${traceId} stage=db_update_failed ${prismaErrDetail(dbErr)}`)
      return NextResponse.json({ error: 'Could not save upload path. Please try again.', errorCode: 'ORBIT_MEDIA_CREATE_FAILED', traceId }, { status: 500 })
    }

    const { data: uploadData, error: uploadErr } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath)

    if (uploadErr || !uploadData?.signedUrl) {
      await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
      return NextResponse.json({ error: 'Could not create upload URL. Check Supabase storage bucket.', errorCode: 'REFERENCE_UPLOAD_URL_INVALID', traceId }, { status: 500 })
    }

    return NextResponse.json({ mediaId: placeholder.id, uploadUrl: uploadData.signedUrl, storagePath, publicUrl })

  } catch (fatal) {
    console.error(`[reference/POST] traceId=${traceId} stage=fatal_unhandled ${fatal instanceof Error ? fatal.message : String(fatal)}`)
    return NextResponse.json({ error: 'An unexpected error occurred.', errorCode: 'INTERNAL_SERVER_ERROR', traceId }, { status: 500 })
  }
}

// ── DELETE — remove reference image ──────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const traceId = `orb_ref_del_${Date.now().toString(36).slice(-5)}`

  try {
    const session = await getAdminSession()
    if (!session)                     return NextResponse.json({ error: 'Unauthorized', traceId }, { status: 401 })
    if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden', traceId },    { status: 403 })

    const { searchParams } = new URL(req.url)
    const mediaId = searchParams.get('mediaId')
    if (!mediaId) return NextResponse.json({ error: 'mediaId query parameter is required', traceId }, { status: 400 })

    // Verify ownership and isReference=true
    let ref: Awaited<ReturnType<typeof prisma.orbitMedia.findFirst>>
    try {
      ref = await prisma.orbitMedia.findFirst({
        where: { id: mediaId, campaignId: params.id, isReference: true },
      })
    } catch (dbErr) {
      console.error(`[reference/DELETE] traceId=${traceId} stage=lookup_failed ${prismaErrDetail(dbErr)}`)
      return NextResponse.json({ error: 'Database error.', errorCode: 'INTERNAL_SERVER_ERROR', traceId }, { status: 500 })
    }
    if (!ref) return NextResponse.json({ error: 'Reference image not found', traceId }, { status: 404 })

    // Hard-delete the DB row
    try {
      await prisma.orbitMedia.delete({ where: { id: mediaId } })
    } catch (dbErr) {
      console.error(`[reference/DELETE] traceId=${traceId} stage=delete_failed ${prismaErrDetail(dbErr)}`)
      return NextResponse.json({ error: 'Could not remove reference image.', errorCode: 'INTERNAL_SERVER_ERROR', traceId }, { status: 500 })
    }

    // Best-effort storage purge — failure here is non-fatal
    if (ref.storagePath && !ref.storagePath.startsWith('http')) {
      const supabase = getSupabaseAdmin()
      await supabase.storage.from(BUCKET).remove([ref.storagePath]).catch(() => {})
    }

    return NextResponse.json({ deleted: true, mediaId })

  } catch (fatal) {
    console.error(`[reference/DELETE] traceId=${traceId} stage=fatal_unhandled ${fatal instanceof Error ? fatal.message : String(fatal)}`)
    return NextResponse.json({ error: 'An unexpected error occurred.', errorCode: 'INTERNAL_SERVER_ERROR', traceId }, { status: 500 })
  }
}
