import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { can } from '@/lib/permissions-registry'
import { getSupabaseAdmin } from '@/lib/supabase'
import prisma from '@/lib/db'

const BUCKET = 'marketing-media'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tag = searchParams.get('tag')

  const media = await prisma.marketingMedia.findMany({
    where: tag
      ? { tags: { array_contains: [tag] } }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ media })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!can(session, 'manage_marketing')) return NextResponse.json({ error: 'Marketing access not granted. Contact your admin.' }, { status: 403 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file    = formData.get('file') as File | null
  const tagsRaw = formData.get('tags') as string | null
  const altText = formData.get('altText') as string | null

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  const tags  = tagsRaw ? JSON.parse(tagsRaw) as string[] : []
  const ext   = file.name.split('.').pop() ?? 'bin'
  const key   = `${session.email.split('@')[0]}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const supabase = getSupabaseAdmin()

  // Ensure bucket exists
  const { error: bucketErr } = await supabase.storage.createBucket(BUCKET, { public: true })
  // Ignore "already exists" error
  if (bucketErr && !bucketErr.message?.includes('already exists')) {
    return NextResponse.json({ error: `Bucket error: ${bucketErr.message}` }, { status: 500 })
  }

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, { contentType: file.type || 'application/octet-stream', upsert: false })

  if (uploadErr) {
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(key)

  const media = await prisma.marketingMedia.create({
    data: {
      filename:   file.name,
      url:        publicUrl,
      mimeType:   file.type || 'application/octet-stream',
      sizeBytes:  file.size,
      tags,
      altText:    altText ?? '',
      uploadedBy: session.email,
    },
  })

  return NextResponse.json({ media }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!can(session, 'manage_marketing')) return NextResponse.json({ error: 'Marketing access not granted. Contact your admin.' }, { status: 403 })

  const { id } = await req.json() as { id: string }

  const media = await prisma.marketingMedia.findUnique({ where: { id } })
  if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Extract storage key from URL
  const urlParts = media.url.split(`/${BUCKET}/`)
  if (urlParts[1]) {
    const supabase = getSupabaseAdmin()
    await supabase.storage.from(BUCKET).remove([urlParts[1]])
  }

  await prisma.marketingMedia.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
