/**
 * Orbit Creative Studio — campaign creative asset generation.
 *
 * POST /api/admin/orbit/campaigns/[id]/creative
 *   Generate a new image (OpenAI or Replicate) or start a Runway video job.
 *   Synchronous for images; async for Runway (returns pending asset immediately).
 *
 * GET /api/admin/orbit/campaigns/[id]/creative
 *   List all creative assets for the campaign.
 *
 * RBAC: super_admin only (consistent with all Orbit routes).
 * Gates: ORBIT_AI_IMAGE_ENABLED / ORBIT_RUNWAY_VIDEO_ENABLED feature flags.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { assertContentSafe } from '@/lib/orbit/content-filter'
import { buildCreativePrompt } from '@/lib/orbit/creative-presets'
import {
  isOpenAIImageEnabled,
  isOpenAIImageConfigured,
  generateOpenAIImage,
  editOpenAIImage,
  getOpenAIImageModel,
  OrbitImageError,
} from '@/lib/orbit/openai-image-adapter'
import {
  isReplicateConfigured,
  generateBackground,
  FLUX_COST_USD,
} from '@/lib/orbit/replicate-adapter'
import {
  isFalVideoConfigured,
  submitFalImageToVideo,
} from '@/lib/orbit/fal-video-adapter'
import {
  resolveVideoModel,
  listVideoModels,
} from '@/lib/orbit/video-models'
import { getProviderHealth } from '@/lib/orbit/provider-health'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic   = 'force-dynamic'
export const maxDuration = 90

const anthropic = new Anthropic()

// ── GET — list creative assets for campaign ───────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session)                     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const assets = await prisma.orbitMedia.findMany({
    where:   { campaignId: params.id },
    orderBy: { createdAt: 'desc' },
  })

  const health = getProviderHealth()

  return NextResponse.json({
    assets,
    // Backward-compat booleans
    openaiEnabled:    isOpenAIImageEnabled(),
    replicateEnabled: isReplicateConfigured(),
    runwayEnabled:    false,                    // Runway removed; kept for client backward compat
    falVideoEnabled:  isFalVideoConfigured(),
    availableVideoModels: listVideoModels(),    // display metadata only, no endpoints
    // Structured provider health (no secrets)
    imageHealth: health.image,
    videoHealth: health.video,
  })
}

// ── POST — generate a new creative asset ─────────────────────────────────────

interface GenerateBody {
  mode:            'image' | 'video'
  provider:        'openai' | 'replicate' | 'fal' | 'runway'  // runway=legacy, returns 503
  format:          string
  prompt?:         string
  promptHint?:     string
  brandPreset?:    string
  aspectRatio?:    string
  duration?:       5 | 10
  referenceMediaId?: string    // OrbitMedia ID of a reference image (isReference=true)
  quality?:        'low' | 'medium' | 'high' | 'auto'
  videoModelKey?:  string      // 'kling' | 'veo' | 'seedance'; validated server-side
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session)                     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as GenerateBody
  const { mode = 'image', provider, format, promptHint, brandPreset, quality } = body
  const aspectRatio = body.aspectRatio ?? '9:16'
  const duration    = body.duration === 10 ? 10 : 5

  if (!provider) return NextResponse.json({ error: 'provider is required' }, { status: 400 })
  if (!format && mode === 'image') return NextResponse.json({ error: 'format is required for images' }, { status: 400 })

  // ── Image generation ──────────────────────────────────────────────────────

  if (mode === 'image') {
    if (provider === 'openai') {
      if (!isOpenAIImageConfigured()) {
        return NextResponse.json({
          error: 'OpenAI image generation is not enabled. Set ORBIT_AI_IMAGE_ENABLED=true and OPENAI_API_KEY.',
          notConfigured: true,
        }, { status: 503 })
      }

      // Cap check
      const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
      const cap  = settings?.imageCapPerCampaign ?? 8
      const used = await prisma.orbitMedia.count({ where: { campaignId: params.id, isReference: false } })
      if (used >= cap) {
        return NextResponse.json({ error: `Image cap of ${cap} reached`, capReached: true }, { status: 429 })
      }

      // Build prompt
      const prompt = body.prompt?.trim() || buildCreativePrompt({
        destination: campaign.destination,
        objective:   campaign.objective,
        promptHint:  promptHint ?? campaign.promotionDetails,
        brandPreset,
      })

      // Create placeholder
      const placeholder = await prisma.orbitMedia.create({
        data: {
          source:           'generated',
          storagePath:      '',
          format,
          destination:      campaign.destination || null,
          campaignType:     campaign.objective   || null,
          prompt,
          campaignId:       params.id,
          createdBy:        session.email,
          provider:         'openai',
          model:            getOpenAIImageModel(),
          generationStatus: 'processing',
        },
      })

      try {
        // Resolve optional reference image
        let result: Awaited<ReturnType<typeof generateOpenAIImage>>

        if (body.referenceMediaId) {
          const ref = await prisma.orbitMedia.findFirst({
            where: { id: body.referenceMediaId, campaignId: params.id, isReference: true },
          })
          if (!ref?.publicUrl) {
            await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
            return NextResponse.json({ error: 'Reference image not found' }, { status: 400 })
          }
          result = await editOpenAIImage({
            prompt,
            referenceImageUrl: ref.publicUrl,
            format,
            mediaId: placeholder.id,
            quality,
          })
        } else {
          result = await generateOpenAIImage({ prompt, format, mediaId: placeholder.id, quality })
        }

        // Alt text via Claude
        let altText = `Travel scene of ${campaign.destination || 'destination'}`
        try {
          const altMsg = await anthropic.messages.create({
            model:      'claude-sonnet-4-6',
            max_tokens: 120,
            messages:   [{ role: 'user', content:
              `Write a concise, factual alt text (max 100 chars) for a travel background image of ` +
              `${campaign.destination || 'a travel destination'} used in a ${campaign.objective} campaign. ` +
              `No marketing language.`,
            }],
          })
          const raw = altMsg.content[0].type === 'text' ? altMsg.content[0].text.trim() : ''
          try { assertContentSafe(raw); altText = raw } catch { /* fallback already set */ }
        } catch { /* non-fatal */ }

        const media = await prisma.orbitMedia.update({
          where: { id: placeholder.id },
          data: {
            storagePath:      result.storagePath,
            publicUrl:        result.publicUrl,
            altText,
            costUsd:          result.costUsd,
            width:            result.width,
            height:           result.height,
            generationStatus: 'completed',
          },
        })

        return NextResponse.json({ media, prompt })

      } catch (err) {
        await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
        if (err instanceof OrbitImageError) {
          const httpStatus = err.httpStatus && err.httpStatus >= 400 ? err.httpStatus : 500
          return NextResponse.json({ error: err.message, errorCode: err.code }, { status: httpStatus })
        }
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }

    if (provider === 'replicate') {
      if (!isReplicateConfigured()) {
        return NextResponse.json({
          error: 'Replicate is not configured. Add REPLICATE_API_TOKEN.',
          notConfigured: true,
        }, { status: 503 })
      }

      const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
      const cap  = settings?.imageCapPerCampaign ?? 8
      const used = await prisma.orbitMedia.count({ where: { campaignId: params.id, isReference: false } })
      if (used >= cap) {
        return NextResponse.json({ error: `Image cap of ${cap} reached`, capReached: true }, { status: 429 })
      }

      const prompt = body.prompt?.trim() || buildCreativePrompt({
        destination: campaign.destination,
        objective:   campaign.objective,
        promptHint:  promptHint ?? campaign.promotionDetails,
        brandPreset,
      })

      const placeholder = await prisma.orbitMedia.create({
        data: {
          source: 'generated', storagePath: '',
          format, destination: campaign.destination || null,
          campaignType: campaign.objective || null,
          prompt, campaignId: params.id, createdBy: session.email,
          provider: 'replicate', model: 'flux-dev',
          generationStatus: 'processing',
        },
      })

      try {
        const { buildPrompt } = await import('@/lib/orbit/replicate-adapter')
        const finalPrompt = buildPrompt(campaign.destination, campaign.objective, promptHint ?? campaign.promotionDetails)
        const result = await generateBackground(finalPrompt, format as Parameters<typeof generateBackground>[1], placeholder.id)

        let altText = `Travel scene of ${campaign.destination || 'destination'}`
        try {
          const altMsg = await anthropic.messages.create({
            model: 'claude-sonnet-4-6', max_tokens: 120,
            messages: [{ role: 'user', content:
              `Write a concise, factual alt text (max 100 chars) for a travel background image of ` +
              `${campaign.destination || 'a travel destination'} for a ${campaign.objective} campaign. No marketing language.`,
            }],
          })
          const raw = altMsg.content[0].type === 'text' ? altMsg.content[0].text.trim() : ''
          try { assertContentSafe(raw); altText = raw } catch { /* fallback */ }
        } catch { /* non-fatal */ }

        const media = await prisma.orbitMedia.update({
          where: { id: placeholder.id },
          data: {
            storagePath: result.storagePath, publicUrl: result.publicUrl,
            altText, costUsd: result.costUsd, generationStatus: 'completed',
          },
        })
        return NextResponse.json({ media, prompt: finalPrompt })

      } catch (err) {
        await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
      }
    }

    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 })
  }

  // ── Video generation (FAL.ai — async, DB-tracked) ─────────────────────────

  if (mode === 'video' && provider === 'fal') {
    if (!isFalVideoConfigured()) {
      return NextResponse.json({
        error: 'FAL.ai video is not enabled. Set ORBIT_AI_VIDEO_ENABLED=true and FALAI_API_KEY.',
        notConfigured: true,
      }, { status: 503 })
    }

    const prompt    = (body.prompt ?? '').trim()
    const modelKey  = body.videoModelKey ?? 'kling'

    if (!prompt) return NextResponse.json({ error: 'prompt required for video' }, { status: 400 })
    if (!body.referenceMediaId) {
      return NextResponse.json({ error: 'referenceMediaId required for image-to-video' }, { status: 400 })
    }

    // Validate model key server-side — browser cannot inject arbitrary FAL endpoints
    const resolvedModel = resolveVideoModel(modelKey)
    if (!resolvedModel) {
      return NextResponse.json({
        error: `Unknown video model key: "${modelKey}". Allowed: kling, veo, seedance.`,
      }, { status: 400 })
    }

    const sourceMedia = await prisma.orbitMedia.findFirst({
      where: { id: body.referenceMediaId, campaignId: params.id },
    })
    if (!sourceMedia?.publicUrl) {
      return NextResponse.json({ error: 'Source image not found' }, { status: 404 })
    }

    // Duplicate-click guard: only one pending/processing FAL job per campaign
    const existing = await prisma.orbitMedia.findFirst({
      where: {
        campaignId:       params.id,
        provider:         'fal',
        generationStatus: { in: ['pending', 'processing'] },
      },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'A video is already being generated for this campaign', mediaId: existing.id },
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
        destination:      campaign.destination || null,
        campaignType:     campaign.objective   || null,
        prompt,
        campaignId:       params.id,
        createdBy:        session.email,
        provider:         'fal',
        model:            resolvedModel.key,     // e.g. 'kling' — never the raw FAL endpoint
        generationStatus: 'pending',
        costUsd:          duration * resolvedModel.costPerSecond,
      },
    })

    try {
      const { requestId } = await submitFalImageToVideo({
        modelKey:    resolvedModel.key,
        imageUrl:    sourceMedia.publicUrl,
        prompt,
        duration,
        aspectRatio,
      })

      await prisma.orbitMedia.update({
        where: { id: placeholder.id },
        data:  { providerJobId: requestId },
      })

      return NextResponse.json({
        media:    { ...placeholder, providerJobId: requestId },
        requestId,
        status:   'pending',
      })

    } catch (err) {
      await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
  }

  // Runway removed — backward compat message for any legacy callers
  if (mode === 'video' && provider === 'runway') {
    return NextResponse.json({
      error: 'Runway video provider has been replaced by FAL.ai. Use provider: "fal" instead.',
      migrated: true,
    }, { status: 503 })
  }

  return NextResponse.json({ error: `Unsupported mode/provider combination: ${mode}/${provider}` }, { status: 400 })
}
