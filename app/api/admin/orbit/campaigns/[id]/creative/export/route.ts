/**
 * Orbit Creative Studio — save a rendered design export to the Media Library.
 *
 * Every poster export is persisted here BEFORE the user sees "Saved":
 *   1. create the OrbitMedia row (readiness 'saving')
 *   2. upload the rendered file to owned storage (deterministic path)
 *   3. mark READY
 * The editable design (designProjectId + designSnapshot) is linked so the
 * exact layer configuration that produced this export can be reproduced.
 * Works for campaigns and the standalone studio scope alike.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { isStudioScope, scopedCampaignId } from '@/lib/orbit/studio-scope'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'orbit-media'
const MAX_BYTES = 30 * 1024 * 1024

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!isStudioScope(params.id)) {
    const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id }, select: { id: true } })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof Blob)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
    if (file.size === 0)         return NextResponse.json({ error: 'file is empty' }, { status: 400 })
    if (file.size > MAX_BYTES)   return NextResponse.json({ error: 'Export exceeds 30 MB' }, { status: 400 })

    const contentType = file.type || 'image/jpeg'
    if (!/^image\/(jpeg|png|webp)$/.test(contentType)) {
      return NextResponse.json({ error: `Unsupported export type: ${contentType}` }, { status: 400 })
    }
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'

    const title           = String(form.get('title') ?? '').trim().slice(0, 160) || 'Poster export'
    const format          = String(form.get('format') ?? '1080x1350').slice(0, 20)
    const designProjectId = String(form.get('designProjectId') ?? '').trim() || null
    let designSnapshot: Record<string, unknown> | null = null
    const snapRaw = form.get('designSnapshot')
    if (typeof snapRaw === 'string' && snapRaw) {
      try { designSnapshot = JSON.parse(snapRaw) } catch { /* snapshot optional */ }
    }
    const [wStr, hStr] = format.split('x')

    // 1. Row first (readiness 'saving') — the id gives the deterministic path
    const row = await prisma.orbitMedia.create({
      data: {
        source:          'generated',
        storagePath:     '',
        format,
        mediaType:       'image',
        provider:        'compositor',
        model:           'poster-compositor',
        generationStatus:'completed',
        readiness:       'saving',
        title,
        campaignId:      scopedCampaignId(params.id),
        createdBy:       session.email,
        width:           Number(wStr) || null,
        height:          Number(hStr) || null,
        mimeType:        contentType,
        sizeBytes:       file.size,
        designProjectId,
        designSnapshot:  designSnapshot === null ? undefined : JSON.parse(JSON.stringify(designSnapshot)),
      },
      select: { id: true },
    })

    // 2. Upload to owned storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      await prisma.orbitMedia.update({ where: { id: row.id }, data: { readiness: 'save_failed', saveError: 'Storage not configured' } })
      return NextResponse.json({ error: 'Storage is not configured' }, { status: 500 })
    }
    const storagePath = `library/export_${row.id}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const upRes = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: buffer as unknown as BodyInit,
    })
    if (!upRes.ok) {
      const detail = (await upRes.text().catch(() => '')).slice(0, 200)
      await prisma.orbitMedia.update({
        where: { id: row.id },
        data:  { readiness: 'save_failed', saveError: `Storage upload failed (HTTP ${upRes.status}): ${detail}` },
      })
      return NextResponse.json({ error: `Export was NOT saved — storage upload failed (HTTP ${upRes.status})`, mediaId: row.id }, { status: 502 })
    }

    // 3. READY — only now may the UI say "Saved"
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`
    const media = await prisma.orbitMedia.update({
      where: { id: row.id },
      data:  { storagePath, publicUrl, readiness: 'ready', saveError: null },
    })
    return NextResponse.json({ ok: true, media })
  } catch (err) {
    console.error('[creative/export]', err)
    return NextResponse.json({ error: 'Failed to save export' }, { status: 500 })
  }
}
