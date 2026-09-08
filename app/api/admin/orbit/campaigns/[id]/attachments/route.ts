/**
 * Campaign ↔ Media Library attachments (references — files never copied).
 *
 * GET    — attached assets in order (with readiness/dimension details)
 * POST   — attach one or more library assets { mediaIds: string[] }
 * PATCH  — reorder { order: string[] }  (mediaIds in desired order)
 * DELETE — detach { mediaId }  (removes the reference ONLY — the asset
 *          stays in the library untouched)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { attachToCampaign, canPublishAsset } from '@/lib/orbit/media-library'

export const dynamic = 'force-dynamic'

async function guard(campaignId: string) {
  const session = await getAdminSession()
  if (!session) return { error: 'Unauthorized', status: 401 as const }
  if (session.role !== 'super_admin') return { error: 'Forbidden', status: 403 as const }
  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: campaignId }, select: { id: true } })
  if (!campaign) return { error: 'Campaign not found', status: 404 as const }
  return { session }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  try {
    const links = await prisma.orbitCampaignMedia.findMany({
      where:   { campaignId: params.id },
      orderBy: { position: 'asc' },
      include: {
        media: {
          select: {
            id: true, title: true, mediaType: true, format: true, publicUrl: true,
            readiness: true, generationStatus: true, width: true, height: true,
            durationMs: true, sizeBytes: true, version: true, assetGroupId: true,
            status: true, provider: true,
          },
        },
      },
    })
    return NextResponse.json({
      attachments: links.map(l => ({
        linkId:      l.id,
        position:    l.position,
        addedBy:     l.addedBy,
        addedAt:     l.addedAt,
        publishable: canPublishAsset(l.media),
        media:       l.media,
      })),
    })
  } catch (err) {
    console.error('[campaign attachments GET]', err)
    return NextResponse.json({ error: 'Failed to load attachments' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  try {
    const body = await req.json().catch(() => ({}))
    const mediaIds: string[] = Array.isArray(body.mediaIds)
      ? body.mediaIds.filter((m: unknown): m is string => typeof m === 'string')
      : []
    if (mediaIds.length === 0) return NextResponse.json({ error: 'mediaIds is required' }, { status: 400 })
    if (mediaIds.length > 20)  return NextResponse.json({ error: 'Attach at most 20 assets at once' }, { status: 400 })

    const attached: string[] = []
    const failed: Array<{ mediaId: string; error: string }> = []
    for (const mediaId of mediaIds) {
      try {
        await attachToCampaign(params.id, mediaId, g.session.email)
        attached.push(mediaId)
      } catch (err) {
        failed.push({ mediaId, error: err instanceof Error ? err.message : 'attach failed' })
      }
    }
    return NextResponse.json({ attached, failed })
  } catch (err) {
    console.error('[campaign attachments POST]', err)
    return NextResponse.json({ error: 'Failed to attach' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  try {
    const body = await req.json().catch(() => ({}))
    const order: string[] = Array.isArray(body.order) ? body.order : []
    if (order.length === 0) return NextResponse.json({ error: 'order is required' }, { status: 400 })
    await prisma.$transaction(order.map((mediaId, i) =>
      prisma.orbitCampaignMedia.updateMany({
        where: { campaignId: params.id, mediaId },
        data:  { position: i },
      }),
    ))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[campaign attachments PATCH]', err)
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body.mediaId !== 'string' || !body.mediaId) {
      return NextResponse.json({ error: 'mediaId is required' }, { status: 400 })
    }
    // Detach = remove the reference only. The library asset is untouched.
    await prisma.orbitCampaignMedia.deleteMany({
      where: { campaignId: params.id, mediaId: body.mediaId },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[campaign attachments DELETE]', err)
    return NextResponse.json({ error: 'Failed to detach' }, { status: 500 })
  }
}
