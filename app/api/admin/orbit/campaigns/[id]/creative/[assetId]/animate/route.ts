/**
 * Orbit Creative Studio — animate an existing image asset with FAL.ai.
 *
 * POST /api/admin/orbit/campaigns/[id]/creative/[assetId]/animate
 *   Submits the image at [assetId] to FAL.ai for image-to-video animation.
 *   Returns immediately with a new pending video asset.
 *   Poll /api/admin/orbit/campaigns/[id]/creative/[videoAssetId] for status.
 *
 * RBAC: super_admin only.
 * Gate: ORBIT_AI_VIDEO_ENABLED=true.
 *
 * Security: FALAI_API_KEY is server-side only. Only campaign creative assets
 * (never customer documents) may be submitted to FAL.ai.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import {
  isFalVideoConfigured,
  submitFalImageToVideo,
} from '@/lib/orbit/fal-video-adapter'
import { resolveVideoModel } from '@/lib/orbit/video-models'

export const dynamic   = 'force-dynamic'
export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; assetId: string } },
) {
  const session = await getAdminSession()
  if (!session)                     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  if (!isFalVideoConfigured()) {
    return NextResponse.json({
      error: 'FAL.ai video is not enabled. Set ORBIT_AI_VIDEO_ENABLED=true and FALAI_API_KEY.',
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
    prompt?:       string
    duration?:     5 | 10
    aspectRatio?:  string
    videoModelKey?: string   // 'kling' | 'veo' | 'seedance'; validated server-side
  }

  const prompt      = (body.prompt ?? 'Slow cinematic camera movement, gentle parallax, golden hour light').trim()
  const duration    = body.duration === 10 ? 10 : 5
  const aspectRatio = body.aspectRatio ?? (
    sourceAsset.format === '1080x1920' ? '9:16' :
    sourceAsset.format === '1024x1024' ? '1:1'  : '16:9'
  )
  const modelKey    = body.videoModelKey ?? 'kling'

  // Validate model key server-side — browser cannot inject arbitrary FAL endpoints
  const resolvedModel = resolveVideoModel(modelKey)
  if (!resolvedModel) {
    return NextResponse.json({
      error: `Unknown video model key: "${modelKey}". Allowed: kling, veo, seedance.`,
    }, { status: 400 })
  }

  // Duplicate-click guard
  const existing = await prisma.orbitMedia.findFirst({
    where: {
      campaignId:       params.id,
      provider:         'fal',
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
      provider:         'fal',
      model:            resolvedModel.key,       // e.g. 'kling' — never the raw FAL endpoint
      generationStatus: 'pending',
      costUsd:          duration * resolvedModel.costPerSecond,
    },
  })

  try {
    const { requestId } = await submitFalImageToVideo({
      modelKey:    resolvedModel.key,
      imageUrl:    sourceAsset.publicUrl,
      prompt,
      duration,
      aspectRatio,
    })

    const media = await prisma.orbitMedia.update({
      where: { id: placeholder.id },
      data:  { providerJobId: requestId },
    })

    return NextResponse.json({
      media,
      requestId,
      status:        'pending',
      sourceAssetId: params.assetId,
    })

  } catch (err) {
    await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
