/**
 * Orbit Creative Studio — single asset operations.
 *
 * GET  /api/admin/orbit/campaigns/[id]/creative/[assetId]
 *   Returns asset state. If it's a pending Runway job, polls Runway for status.
 *   When Runway completes, downloads the video and persists to Supabase.
 *
 * PATCH /api/admin/orbit/campaigns/[id]/creative/[assetId]
 *   Update posterData, status, or altText.
 *
 * DELETE /api/admin/orbit/campaigns/[id]/creative/[assetId]
 *   Archive (soft delete via status='rejected') unless already published.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import {
  pollRunwayTask,
  uploadRunwayVideoToStorage,
  RUNWAY_COST_PER_SECOND,
  isRunwayConfigured,
} from '@/lib/orbit/runway-adapter'
import {
  pollFalVideoTask,
  uploadFalVideoToStorage,
} from '@/lib/orbit/fal-video-adapter'
import { resolveVideoModel } from '@/lib/orbit/video-models'

export const dynamic   = 'force-dynamic'
export const maxDuration = 30

async function guardAsset(id: string, assetId: string, session: Awaited<ReturnType<typeof getAdminSession>>) {
  if (!session)                     return { error: 'Unauthorized', status: 401 }
  if (session.role !== 'super_admin') return { error: 'Forbidden',    status: 403 }
  const asset = await prisma.orbitMedia.findFirst({ where: { id: assetId, campaignId: id } })
  if (!asset) return { error: 'Asset not found', status: 404 }
  return { asset }
}

// ── GET — asset status (polls Runway if pending) ──────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; assetId: string } },
) {
  const session = await getAdminSession()
  const guard   = await guardAsset(params.id, params.assetId, session)
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status })

  let { asset } = guard

  // Poll Runway job for historical runway assets (only if still configured)
  if (asset.provider === 'runway' && asset.providerJobId && isRunwayConfigured() &&
      (asset.generationStatus === 'pending' || asset.generationStatus === 'processing')) {
    try {
      const task = await pollRunwayTask(asset.providerJobId)

      if (task.status === 'RUNNING') {
        asset = await prisma.orbitMedia.update({
          where: { id: asset.id },
          data:  { generationStatus: 'processing' },
        })
      }

      if (task.status === 'FAILED') {
        asset = await prisma.orbitMedia.update({
          where: { id: asset.id },
          data:  { generationStatus: 'failed' },
        })
      }

      if (task.status === 'SUCCEEDED' && task.output?.[0]) {
        const videoUrl = task.output[0]
        try {
          const { storagePath, publicUrl } = await uploadRunwayVideoToStorage({
            videoUrl,
            mediaId: asset.id,
          })
          const durationS = asset.durationMs ? asset.durationMs / 1000 : 5
          asset = await prisma.orbitMedia.update({
            where: { id: asset.id },
            data: {
              storagePath,
              publicUrl,
              generationStatus: 'completed',
              costUsd: durationS * RUNWAY_COST_PER_SECOND,
            },
          })
        } catch (uploadErr) {
          asset = await prisma.orbitMedia.update({
            where: { id: asset.id },
            data: { storagePath: videoUrl, publicUrl: videoUrl, generationStatus: 'completed' },
          })
          console.error('[creative/assetId] Runway video upload to Supabase failed:', uploadErr)
        }
      }
    } catch (pollErr) {
      console.error('[creative/assetId] Runway poll error:', pollErr)
    }
  }

  // Poll FAL.ai job for pending/processing fal video assets
  if (asset.provider === 'fal' && asset.providerJobId && asset.model &&
      (asset.generationStatus === 'pending' || asset.generationStatus === 'processing')) {
    try {
      const resolvedModel = resolveVideoModel(asset.model)
      if (resolvedModel) {
        const result = await pollFalVideoTask({
          requestId:   asset.providerJobId,
          falEndpoint: resolvedModel.falEndpoint,
        })

        if (result.status === 'processing') {
          asset = await prisma.orbitMedia.update({
            where: { id: asset.id },
            data:  { generationStatus: 'processing' },
          })
        }

        if (result.status === 'failed') {
          asset = await prisma.orbitMedia.update({
            where: { id: asset.id },
            data:  { generationStatus: 'failed' },
          })
        }

        if (result.status === 'completed' && result.videoUrl) {
          try {
            const { storagePath, publicUrl } = await uploadFalVideoToStorage({
              videoUrl: result.videoUrl,
              mediaId:  asset.id,
            })
            const durationS = asset.durationMs ? asset.durationMs / 1000 : 5
            asset = await prisma.orbitMedia.update({
              where: { id: asset.id },
              data: {
                storagePath,
                publicUrl,
                generationStatus: 'completed',
                costUsd: durationS * resolvedModel.costPerSecond,
              },
            })
          } catch (uploadErr) {
            // Fallback: store FAL CDN URL temporarily (expires ~30 days)
            asset = await prisma.orbitMedia.update({
              where: { id: asset.id },
              data: {
                storagePath:      result.videoUrl,
                publicUrl:        result.videoUrl,
                generationStatus: 'completed',
              },
            })
            console.error('[creative/assetId] FAL video upload to Supabase failed:', uploadErr)
          }
        }
      }
    } catch (pollErr) {
      console.error('[creative/assetId] FAL poll error:', pollErr)
    }
  }

  return NextResponse.json({ asset })
}

// ── PATCH — update posterData / status / altText ──────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; assetId: string } },
) {
  const session = await getAdminSession()
  const guard   = await guardAsset(params.id, params.assetId, session)
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const body = await req.json().catch(() => ({})) as {
    posterData?: Record<string, unknown>
    status?:     string
    altText?:    string
  }

  const updateData: Record<string, unknown> = {}
  if (body.posterData !== undefined) updateData.posterData = body.posterData
  if (body.status !== undefined)     updateData.status     = body.status
  if (body.altText !== undefined)    updateData.altText    = body.altText

  const asset = await prisma.orbitMedia.update({
    where: { id: params.assetId },
    data:  updateData,
  })

  return NextResponse.json({ asset })
}

// ── DELETE — archive asset ────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; assetId: string } },
) {
  const session = await getAdminSession()
  const guard   = await guardAsset(params.id, params.assetId, session)
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const { asset } = guard

  // Check campaign publish status — warn before deleting if published
  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  if (campaign?.status === 'published' && asset.status === 'approved') {
    return NextResponse.json({
      error: 'Cannot delete an approved asset from a published campaign without confirmation.',
      requiresConfirmation: true,
    }, { status: 409 })
  }

  // Soft-delete via status change rather than hard delete
  const archived = await prisma.orbitMedia.update({
    where: { id: params.assetId },
    data:  { status: 'rejected', campaignId: null },
  })

  return NextResponse.json({ archived: true, asset: archived })
}
