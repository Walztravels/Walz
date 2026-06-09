import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import prisma from '@/lib/db'

const MEDIA_BUCKET = 'site-media'

// ── Helper: check super_admin ─────────────────────────────────────────────────
async function requireSuperAdmin(session: Awaited<ReturnType<typeof getAdminSession>>) {
  if (!session) return false
  if ((session.staffRole ?? '') === 'super_admin') return true
  const staff = await prisma.staff.findUnique({ where: { email: session.email }, select: { role: true } })
  return staff?.role === 'super_admin'
}

// ── Helper: get supabase (returns null if not configured) ─────────────────────
function trySupabase() {
  try { return getSupabaseAdmin() } catch { return null }
}

// ── GET — fetch all media records, grouped by page ────────────────────────────
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = trySupabase()
  if (!supabase) return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })

  const { data, error } = await supabase
    .from('site_media')
    .select('*')
    .order('page')
    .order('section')
    .order('label')

  if (error) {
    console.error('[GET /api/admin/media]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group by page
  const grouped: Record<string, unknown[]> = {}
  for (const item of data ?? []) {
    const page = (item as { page: string }).page
    if (!grouped[page]) grouped[page] = []
    grouped[page].push(item)
  }

  return NextResponse.json({ media: data ?? [], grouped })
}

// ── PATCH — replace image ─────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requireSuperAdmin(session))) {
    return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })
  }

  const supabase = trySupabase()
  if (!supabase) return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const mediaKey  = formData.get('media_key') as string | null
  const file      = formData.get('file')      as File | null
  const altText   = formData.get('alt_text')  as string | null

  if (!mediaKey) return NextResponse.json({ error: 'media_key is required' }, { status: 400 })

  // Fetch existing record
  const { data: existing, error: fetchErr } = await supabase
    .from('site_media')
    .select('*')
    .eq('media_key', mediaKey)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: `Media key '${mediaKey}' not found` }, { status: 404 })
  }

  // Resolve uploader name
  const staffRecord = await prisma.staff.findUnique({
    where:  { email: session.email },
    select: { id: true, name: true },
  })
  const updaterName = staffRecord?.name ?? session.email

  let newUrl = existing.current_url as string

  // ── Upload file if provided ────────────────────────────────────────────────
  if (file) {
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large — maximum 10 MB' }, { status: 400 })
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type — use JPG, PNG, WebP, SVG or GIF' }, { status: 400 })
    }

    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${mediaKey}-${Date.now()}.${ext}`
    const buf  = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true })

    if (uploadErr) {
      console.error('[PATCH /api/admin/media] upload error:', uploadErr.message)
      return NextResponse.json({ error: 'Upload failed: ' + uploadErr.message }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path)
    newUrl = publicUrl

    // If this is the first custom upload, preserve original_url
    if (!existing.original_url) {
      await supabase
        .from('site_media')
        .update({ original_url: existing.current_url })
        .eq('media_key', mediaKey)
    }
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    current_url:  newUrl,
    updated_at:   new Date().toISOString(),
    updated_by:   updaterName,
  }
  if (file) {
    updatePayload.file_name  = file.name
    updatePayload.file_size  = file.size
  }
  if (altText !== null) {
    updatePayload.alt_text = altText
  }

  const { data: updated, error: updateErr } = await supabase
    .from('site_media')
    .update(updatePayload)
    .eq('media_key', mediaKey)
    .select()
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // ── Activity log ─────────────────────────────────────────────────────────
  if (staffRecord) {
    await prisma.activityLog.create({
      data: {
        staffId:   staffRecord.id,
        staffName: staffRecord.name,
        action:    'Image Updated',
        detail:    `${staffRecord.name} updated "${existing.label}" on ${existing.page} page`,
      },
    }).catch(() => {})
  }

  return NextResponse.json({ success: true, media: updated })
}

// ── DELETE — reset to original_url ────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requireSuperAdmin(session))) {
    return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })
  }

  const supabase = trySupabase()
  if (!supabase) return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({})) as { media_key?: string }
  if (!body.media_key) return NextResponse.json({ error: 'media_key is required' }, { status: 400 })

  const { data: existing } = await supabase
    .from('site_media')
    .select('*')
    .eq('media_key', body.media_key)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const staffRecord = await prisma.staff.findUnique({
    where:  { email: session.email },
    select: { id: true, name: true },
  })

  const { data: reset, error: resetErr } = await supabase
    .from('site_media')
    .update({
      current_url: existing.original_url ?? existing.current_url,
      file_name:   null,
      file_size:   null,
      updated_at:  new Date().toISOString(),
      updated_by:  staffRecord?.name ?? session.email,
    })
    .eq('media_key', body.media_key)
    .select()
    .single()

  if (resetErr) return NextResponse.json({ error: resetErr.message }, { status: 500 })

  if (staffRecord) {
    await prisma.activityLog.create({
      data: {
        staffId:   staffRecord.id,
        staffName: staffRecord.name,
        action:    'Image Reset',
        detail:    `${staffRecord.name} reset "${existing.label}" on ${existing.page} page to default`,
      },
    }).catch(() => {})
  }

  return NextResponse.json({ success: true, media: reset })
}
