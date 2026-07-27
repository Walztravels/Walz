// GET  /api/admin/concierge/images  — list current concierge category images
// POST /api/admin/concierge/images  — upsert a category image (multipart/form-data)
// DELETE /api/admin/concierge/images — reset a category to Unsplash default

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { getSupabaseAdmin }          from '@/lib/supabase'
import prisma                        from '@/lib/db'

const BUCKET = 'walz-images'

// Default Unsplash images (same as lib/concierge/imagery.ts)
const DEFAULTS: Record<string, string> = {
  'airport-services':      'https://images.unsplash.com/photo-1570710891163-6d3b5c47248b?w=800&q=75&auto=format&fit=crop',
  'executive-transport':   'https://images.unsplash.com/photo-1558980664-2cd663cf8dde?w=800&q=75&auto=format&fit=crop',
  'private-aviation':      'https://images.unsplash.com/photo-1540339832862-474599807836?w=800&q=75&auto=format&fit=crop',
  'yacht-marine':          'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&q=75&auto=format&fit=crop',
  'lifestyle-concierge':   'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=75&auto=format&fit=crop',
  'tickets-entertainment': 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=75&auto=format&fit=crop',
  'vip-experiences':       'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=75&auto=format&fit=crop',
}

interface ConciergeImageRow {
  id:          string
  slug:        string
  label:       string
  current_url: string
  custom_url:  string | null
  file_name:   string | null
  updated_at:  string | null
  updated_by:  string | null
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const rows = await prisma.$queryRawUnsafe<ConciergeImageRow[]>(
      `SELECT * FROM concierge_images ORDER BY slug`,
    ).catch(() => [] as ConciergeImageRow[])

    // Merge DB rows with defaults — if DB has no row for a slug, use Unsplash
    const images = Object.entries(DEFAULTS).map(([slug, defaultUrl]) => {
      const row = rows.find(r => r.slug === slug)
      return {
        slug,
        label:       row?.label      ?? slugToLabel(slug),
        currentUrl:  row?.custom_url ?? defaultUrl,
        defaultUrl,
        isCustom:    !!row?.custom_url,
        fileName:    row?.file_name  ?? null,
        updatedAt:   row?.updated_at ?? null,
        updatedBy:   row?.updated_by ?? null,
      }
    })

    return NextResponse.json({ images })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const slug = formData.get('slug') as string | null
  const file = formData.get('file') as File | null

  if (!slug || !DEFAULTS[slug]) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large — max 10 MB' }, { status: 400 })
  }
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type — use JPG, PNG, WebP or GIF' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path     = `concierge/${slug}-${Date.now()}.${ext}`
  const buf      = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: true })

  if (uploadErr) {
    return NextResponse.json({ error: 'Upload failed: ' + uploadErr.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)

  // Get current staff name
  const staffRow = await prisma.staff.findUnique({
    where: { email: session.email }, select: { name: true },
  }).catch(() => null)
  const updaterName = staffRow?.name ?? session.email

  // Upsert into concierge_images table
  await prisma.$executeRawUnsafe(`
    INSERT INTO concierge_images (slug, label, current_url, custom_url, file_name, updated_at, updated_by)
    VALUES ($1, $2, $3, $4, $5, NOW(), $6)
    ON CONFLICT (slug) DO UPDATE SET
      custom_url  = EXCLUDED.custom_url,
      file_name   = EXCLUDED.file_name,
      updated_at  = NOW(),
      updated_by  = EXCLUDED.updated_by
  `, slug, slugToLabel(slug), DEFAULTS[slug], publicUrl, file.name, updaterName)

  return NextResponse.json({ success: true, customUrl: publicUrl })
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { slug?: string }
  if (!body.slug || !DEFAULTS[body.slug]) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  await prisma.$executeRawUnsafe(
    `UPDATE concierge_images SET custom_url = NULL, file_name = NULL, updated_at = NOW() WHERE slug = $1`,
    body.slug,
  ).catch(() => {})

  return NextResponse.json({ success: true, defaultUrl: DEFAULTS[body.slug] })
}

function slugToLabel(slug: string): string {
  const labels: Record<string, string> = {
    'airport-services':      'Airport Services',
    'executive-transport':   'Executive Transport',
    'private-aviation':      'Private Aviation',
    'yacht-marine':          'Yacht & Marine',
    'lifestyle-concierge':   'Lifestyle Concierge',
    'tickets-entertainment': 'Tickets & Entertainment',
    'vip-experiences':       'VIP Experiences',
  }
  return labels[slug] ?? slug
}
