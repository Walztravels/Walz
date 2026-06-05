import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase'
import prisma from '@/lib/db'

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const images = await prisma.siteImage.findMany({ orderBy: { updatedAt: 'desc' } })
  return NextResponse.json(images)
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const file = formData.get('file') as File | null
  const key = formData.get('key') as string | null
  const label = formData.get('label') as string | null

  if (!file || !key || !label) {
    return NextResponse.json({ error: 'file, key and label are required' }, { status: 400 })
  }

  let supabase
  try {
    supabase = getSupabaseAdmin()
  } catch {
    return NextResponse.json(
      { error: 'Image storage is not configured. Please add Supabase credentials.' },
      { status: 503 }
    )
  }

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${key}-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  // Delete old image from storage if it exists
  const existing = await prisma.siteImage.findUnique({ where: { key } })
  if (existing?.path) {
    await supabase.storage.from(STORAGE_BUCKET).remove([existing.path])
  }

  // Upload new image
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  })

  if (error) {
    console.error('[Images] Upload error:', error)
    return NextResponse.json({ error: 'Upload failed: ' + error.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)

  const image = await prisma.siteImage.upsert({
    where: { key },
    update: { url: publicUrl, path, label },
    create: { key, label, url: publicUrl, bucket: STORAGE_BUCKET, path },
  })

  return NextResponse.json(image)
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { key } = await req.json().catch(() => ({}))
  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 })

  const image = await prisma.siteImage.findUnique({ where: { key } })
  if (!image) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const supabase = getSupabaseAdmin()
    await supabase.storage.from(STORAGE_BUCKET).remove([image.path])
  } catch {
    // Storage not configured — still delete the DB record
  }

  await prisma.siteImage.delete({ where: { key } })
  return NextResponse.json({ success: true })
}
