import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const BUCKET = 'orbit-media'

// Buffer/Instagram enforce 300 MB for video; 50 MB is ample for images.
const MAX_VIDEO_BYTES = 300 * 1024 * 1024
const MAX_IMAGE_BYTES =  50 * 1024 * 1024

function fileExt(mimeType: string): string {
  const map: Record<string, string> = {
    'video/mp4':       'mp4',
    'video/quicktime': 'mov',
    'image/png':       'png',
    'image/gif':       'gif',
    'image/webp':      'webp',
  }
  return map[mimeType] ?? 'jpg'
}

// POST /api/admin/orbit/media/presign
// Returns a signed Supabase upload URL so the browser uploads directly,
// bypassing Vercel's 4.5 MB serverless-function payload limit.
// Creates an OrbitMedia placeholder record before returning; the file
// is expected to arrive at storagePath shortly after this call returns.
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    fileSize?:   number
    mimeType?:   string
    format?:     string
    destination?: string
    campaignId?: string
    mediaType?:  string
    durationMs?: number
  }

  const {
    fileSize   = 0,
    mimeType   = 'image/jpeg',
    format,
    destination,
    campaignId,
    mediaType  = 'image',
    durationMs,
  } = body

  if (!format) return NextResponse.json({ error: 'format is required' }, { status: 400 })

  const maxBytes = mediaType === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
  if (fileSize > maxBytes) {
    const limit = mediaType === 'video' ? '300 MB' : '50 MB'
    return NextResponse.json({ error: `File exceeds the ${limit} limit` }, { status: 413 })
  }

  const supabase    = getSupabaseAdmin()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

  // Create a placeholder with storagePath empty; fill it once we know the ID.
  const placeholder = await prisma.orbitMedia.create({
    data: {
      source:      'uploaded',
      storagePath: '',
      format,
      mediaType,
      durationMs:  durationMs ?? null,
      destination: destination || null,
      campaignId:  campaignId  || null,
      createdBy:   session.email,
    },
  })

  const storagePath = `orbit/${placeholder.id}.${fileExt(mimeType)}`
  const publicUrl   = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`

  await prisma.orbitMedia.update({
    where: { id: placeholder.id },
    data:  { storagePath, publicUrl },
  })

  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath)

  if (uploadErr || !uploadData?.signedUrl) {
    console.error('[orbit/presign] createSignedUploadUrl failed:', uploadErr?.message)
    await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
    return NextResponse.json({ error: 'Could not create upload URL. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({
    mediaId:     placeholder.id,
    uploadUrl:   uploadData.signedUrl,
    storagePath,
    publicUrl,
  })
}
