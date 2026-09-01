/**
 * Orbit Creative Studio — animate an existing image asset with Runway.
 *
 * POST /api/admin/orbit/campaigns/[id]/creative/[assetId]/animate
 *   Submits the image at [assetId] to Runway for image-to-video animation.
 *   Returns immediately with a new pending video asset.
 *   Poll /api/admin/orbit/campaigns/[id]/creative/[videoAssetId] for status.
 *
 * RBAC: super_admin only.
 * Gate: ORBIT_RUNWAY_VIDEO_ENABLED=true.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import {
  isRunwayConfigured,
  submitRunwayImageToVideo,
  RUNWAY_COST_PER_SECOND,
} from '@/lib/orbit/runway-adapter'

export const dynamic   = 'force-dynamic'
export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; assetId: string } },
) {
  const session = await getAdminSession()
  if (!session)                     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  if (!isRunwayConfigured()) {
    return NextResponse.json({
      error: 'Runway is not enabled. Set ORBIT_RUNWAY_VIDEO_ENABLED=true and RUNWAY_API_SECRET.',
      notConfigured: true,
    }, { status: 503 })
  }

  const sourceAsset = await prisma.orbitMedia.findFirst({
    where: { id: params.assetId, campaignId: params.id, mediaType: 'image' },
  })
  if (!sourceAsset?.publicUrl) {
    return NextResponse.json({ error: 'Source image asset not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({})) as {
    prompt?:      string
    duration?:    5 | 10
    aspectRatio?: string
  }

  const prompt      = (body.prompt ?? 'Slow cinematic camera movement, gentle parallax, golden hour light').trim()
  const duration    = body.duration === 10 ? 10 : 5
  const aspectRatio = body.aspectRatio ?? (
    sourceAsset.format === '1080x1920' ? '9:16' :
    sourceAsset.format === '1024x1024' ? '1:1'  : '16:9'
  )

  // Duplicate-click guard
  const existing = await prisma.orbitMedia.findFirst({
    where: {
      campaignId:       params.id,
      provider:         'runway',
      generationStatus: { in: ['pending', 'processing'] },
    },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'A video is already being generated', mediaId: existing.id },
      { status: 409 },
    )
  }

  const placeholder = await prisma.orbitMedia.create({
    data: {
      source:           'generated',
      storagePath:      '',
      format:           aspectRatio === '9:16' ? '1080x1920' : aspectRatio === '1:1' ? '1024x1024' : '1200x628',
      mediaType:        'video',
      durationMs:       duration * 1000,
      destination:      sourceAsset.destination,
      campaignType:     sourceAsset.campaignType,
      prompt,
      campaignId:       params.id,
      createdBy:        session.email,
      provider:         'runway',
      model:            'gen4_turbo',
      generationStatus: 'pending',
      costUsd:          duration * RUNWAY_COST_PER_SECOND,
    },
  })

  try {
    const { taskId } = await submitRunwayImageToVideo({
      promptImage: sourceAsset.publicUrl,
      promptText:  prompt,
      duration,
      ratio:       aspectRatio,
    })

    const media = await prisma.orbitMedia.update({
      where: { id: placeholder.id },
      data:  { providerJobId: taskId },
    })

    return NextResponse.json({
      media,
      taskId,
      status:       'pending',
      sourceAssetId: params.assetId,
    })

  } catch (err) {
    await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
