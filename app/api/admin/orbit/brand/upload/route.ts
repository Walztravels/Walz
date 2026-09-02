/**
 * Orbit Brand Logo Upload API
 *
 * POST /api/admin/orbit/brand/upload
 *   Multipart form: { variant, file }
 *   Uploads a logo variant to Supabase storage and records in DB.
 *
 * RBAC: super_admin only.
 *
 * AI INVARIANT: This route handles real uploaded logo files only.
 * AI must never be called to generate, redraw, or recreate logos.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { prisma }                    from '@/lib/db'
import { createClient }              from '@supabase/supabase-js'

export const dynamic   = 'force-dynamic'
export const maxDuration = 30

const VALID_VARIANTS  = new Set(['PRIMARY', 'LIGHT', 'DARK', 'MONOCHROME', 'ICON'])
const ALLOWED_TYPES   = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
const MAX_BYTES       = 5 * 1024 * 1024   // 5 MB

const STORAGE_BUCKET  = 'orbit-brand-assets'

function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars not configured')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session)                       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const variant = (formData.get('variant') as string | null)?.toUpperCase()
  const file    = formData.get('file') as File | null

  if (!variant || !VALID_VARIANTS.has(variant)) {
    return NextResponse.json({ error: `variant must be one of: ${[...VALID_VARIANTS].join(', ')}` }, { status: 400 })
  }

  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: `File type ${file.type} not allowed. Use PNG, JPEG, WebP, or SVG.` }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max 5 MB, got ${(file.size / 1024 / 1024).toFixed(2)} MB).` }, { status: 400 })
  }

  const ext         = file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[1]
  const storagePath = `logos/${variant.toLowerCase()}-${Date.now()}.${ext}`

  let publicUrl: string
  try {
    const supabase = makeSupabase()
    const buffer   = Buffer.from(await file.arrayBuffer())
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: false })

    if (error) throw new Error(error.message)

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
    publicUrl = data.publicUrl
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Storage upload failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const uploaderId = session.staffId ?? session.id

  const asset = await prisma.orbitBrandAsset.create({
    data: {
      variant,
      storagePath,
      publicUrl,
      mimeType:  file.type,
      width:     null,
      height:    null,
      createdBy: uploaderId,
    },
  })

  return NextResponse.json({ asset }, { status: 201 })
}
