/**
 * Orbit Creative Studio — reference image upload.
 *
 * POST /api/admin/orbit/campaigns/[id]/creative/reference
 *   Creates an OrbitMedia placeholder with isReference=true and returns
 *   a presigned Supabase upload URL for direct browser upload.
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
const MAX_BYTES      = 20 * 1024 * 1024  // 20 MB — reference images must be smaller

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session)                     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    mimeType?:  string
    fileSize?:  number
    label?:     string
  }

  const mimeType = body.mimeType ?? 'image/jpeg'
  const fileSize = body.fileSize ?? 0

  const ext = ALLOWED_MIME[mimeType]
  if (!ext) {
    return NextResponse.json({
      error: `File type not allowed. Upload JPEG, PNG, WebP, or GIF only.`,
    }, { status: 415 })
  }

  if (fileSize > MAX_BYTES) {
    return NextResponse.json({ error: 'Reference image must be under 20 MB' }, { status: 413 })
  }

  const supabase    = getSupabaseAdmin()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

  const placeholder = await prisma.orbitMedia.create({
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

  const storagePath = `orbit/${placeholder.id}.${ext}`
  const publicUrl   = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`

  await prisma.orbitMedia.update({
    where: { id: placeholder.id },
    data:  { storagePath, publicUrl },
  })

  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath)

  if (uploadErr || !uploadData?.signedUrl) {
    await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
    return NextResponse.json({ error: 'Could not create upload URL' }, { status: 500 })
  }

  return NextResponse.json({
    mediaId:     placeholder.id,
    uploadUrl:   uploadData.signedUrl,
    storagePath,
    publicUrl,
  })
}
