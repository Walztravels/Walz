import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import prisma from '@/lib/db'

const MEDIA_BUCKET = 'walz-images'

// ── Row type ──────────────────────────────────────────────────────────────────
interface SiteMediaRow {
  id:           string
  media_key:    string
  label:        string
  page:         string
  section:      string
  media_type:   string
  current_url:  string | null
  original_url: string | null
  file_name:    string | null
  file_size:    number | null
  alt_text:     string | null
  updated_at:   string | null
  updated_by:   string | null
}

// ── Helper: check super_admin ─────────────────────────────────────────────────
async function requireSuperAdmin(session: Awaited<ReturnType<typeof getAdminSession>>) {
  if (!session) return false
  if ((session.staffRole ?? '') === 'super_admin') return true
  const staff = await prisma.staff.findUnique({ where: { email: session.email }, select: { role: true } })
  return staff?.role === 'super_admin'
}

// ── Helper: Supabase admin client (for Storage only) ─────────────────────────
function trySupabase() {
  try { return getSupabaseAdmin() } catch { return null }
}

// ── GET — fetch all media records ─────────────────────────────────────────────
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Use raw SQL — bypasses PostgREST schema cache (table created outside Supabase API)
    const data = await prisma.$queryRawUnsafe<SiteMediaRow[]>(
      'SELECT * FROM site_media ORDER BY page, section, label',
    )

    const grouped: Record<string, SiteMediaRow[]> = {}
    for (const item of data) {
      if (!grouped[item.page]) grouped[item.page] = []
      grouped[item.page].push(item)
    }

    return NextResponse.json({ media: data, grouped })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[GET /api/admin/media]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── PATCH — replace image or update alt text ──────────────────────────────────
export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requireSuperAdmin(session))) {
    return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })
  }

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const mediaKey = formData.get('media_key') as string | null
  const file     = formData.get('file')      as File | null
  const altText  = formData.get('alt_text')  as string | null

  if (!mediaKey) return NextResponse.json({ error: 'media_key is required' }, { status: 400 })

  // Fetch existing record via Prisma (bypasses PostgREST)
  const rows = await prisma.$queryRawUnsafe<SiteMediaRow[]>(
    'SELECT * FROM site_media WHERE media_key = $1 LIMIT 1',
    mediaKey,
  ).catch(() => [] as SiteMediaRow[])

  const existing = rows[0] ?? null
  if (!existing) return NextResponse.json({ error: `Media key '${mediaKey}' not found` }, { status: 404 })

  // Resolve uploader name
  const staffRecord = await prisma.staff.findUnique({
    where:  { email: session.email },
    select: { id: true, name: true },
  })
  const updaterName = staffRecord?.name ?? session.email

  let newUrl = existing.current_url

  // ── Upload file if provided ────────────────────────────────────────────────
  if (file) {
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large — maximum 10 MB' }, { status: 400 })
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type — use JPG, PNG, WebP, SVG or GIF' }, { status: 400 })
    }

    const supabase = trySupabase()
    if (!supabase) return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })

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

    // Preserve original_url on first custom upload
    if (!existing.original_url) {
      await prisma.$executeRawUnsafe(
        'UPDATE site_media SET original_url = $1 WHERE media_key = $2 AND original_url IS NULL',
        existing.current_url,
        mediaKey,
      ).catch(() => {})
    }
  }

  // Build dynamic SET clause — use NOW() for timestamptz column to avoid text cast error
  const setCols: string[]  = ['current_url = $1', 'updated_at = NOW()', 'updated_by = $2']
  const values:  unknown[] = [newUrl, updaterName]
  let   p                  = 3

  if (file) {
    setCols.push(`file_name = $${p++}`, `file_size = $${p++}`)
    values.push(file.name, file.size)
  }
  if (altText !== null) {
    setCols.push(`alt_text = $${p++}`)
    values.push(altText)
  }

  values.push(mediaKey)
  await prisma.$executeRawUnsafe(
    `UPDATE site_media SET ${setCols.join(', ')} WHERE media_key = $${p}`,
    ...values,
  )

  // Return updated record
  const updated = (await prisma.$queryRawUnsafe<SiteMediaRow[]>(
    'SELECT * FROM site_media WHERE media_key = $1 LIMIT 1',
    mediaKey,
  ))[0]

  // Activity log
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

  const body = await req.json().catch(() => ({})) as { media_key?: string }
  if (!body.media_key) return NextResponse.json({ error: 'media_key is required' }, { status: 400 })

  const rows = await prisma.$queryRawUnsafe<SiteMediaRow[]>(
    'SELECT * FROM site_media WHERE media_key = $1 LIMIT 1',
    body.media_key,
  ).catch(() => [] as SiteMediaRow[])

  const existing = rows[0] ?? null
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const staffRecord = await prisma.staff.findUnique({
    where:  { email: session.email },
    select: { id: true, name: true },
  })

  await prisma.$executeRawUnsafe(
    `UPDATE site_media
     SET current_url = $1, file_name = NULL, file_size = NULL,
         updated_at = NOW(), updated_by = $2
     WHERE media_key = $3`,
    existing.original_url ?? existing.current_url,
    staffRecord?.name ?? session.email,
    body.media_key,
  )

  const reset = (await prisma.$queryRawUnsafe<SiteMediaRow[]>(
    'SELECT * FROM site_media WHERE media_key = $1 LIMIT 1',
    body.media_key,
  ))[0]

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
