/**
 * Orbit Creative Studio — campaign creative asset generation.
 *
 * POST /api/admin/orbit/campaigns/[id]/creative
 *   Generate a new image (OpenAI or Replicate) or start a FAL video job.
 *   Synchronous for images; async for FAL (returns pending asset immediately).
 *
 * GET /api/admin/orbit/campaigns/[id]/creative
 *   List all creative assets for the campaign.
 *
 * RBAC: super_admin only.
 * Gates: ORBIT_AI_IMAGE_ENABLED / ORBIT_AI_VIDEO_ENABLED feature flags.
 *
 * Error taxonomy (errorCode field in all non-2xx responses):
 *   REQUEST_VALIDATION_FAILED  — bad or missing request parameters
 *   CAMPAIGN_NOT_FOUND         — campaign ID doesn't exist
 *   IMAGE_FEATURE_DISABLED     — ORBIT_AI_IMAGE_ENABLED not true
 *   OPENAI_KEY_MISSING         — OPENAI_API_KEY env var absent
 *   PROMPT_BUILD_FAILED        — prompt construction threw
 *   ORBIT_MEDIA_CREATE_FAILED  — Prisma create/update threw
 *   OPENAI_AUTH_FAILED         — 401 / invalid_api_key
 *   OPENAI_ACCESS_DENIED       — 403 / model_not_found
 *   OPENAI_QUOTA_OR_BILLING    — billing not active / quota exhausted
 *   OPENAI_RATE_LIMIT          — 429 rate-limit
 *   OPENAI_INVALID_REQUEST     — 4xx bad request parameters
 *   OPENAI_UPSTREAM_ERROR      — 5xx from OpenAI
 *   OPENAI_GENERATION_FAILED   — image not returned / other OpenAI error
 *   STORAGE_UPLOAD_FAILED      — Supabase upload or config error
 *   INTERNAL_SERVER_ERROR      — catch-all; always returns JSON, never HTML
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { assertContentSafe } from '@/lib/orbit/content-filter'
import { buildCreativePrompt } from '@/lib/orbit/creative-presets'
import {
  isOpenAIImageEnabled,
  generateOpenAIImage,
  editOpenAIImage,
  getOpenAIImageModel,
  OrbitImageError,
  envFlag,
} from '@/lib/orbit/openai-image-adapter'
import {
  isReplicateConfigured,
  generateBackground,
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

// ── Error code mapping — adapter codes → route taxonomy ──────────────────────

function mapOrbitCode(code: string, httpStatus?: number): string {
  switch (code) {
    case 'INVALID_API_KEY':      return 'OPENAI_AUTH_FAILED'
    case 'BILLING_OR_QUOTA':     return 'OPENAI_QUOTA_OR_BILLING'
    case 'RATE_LIMIT':           return 'OPENAI_RATE_LIMIT'
    case 'MODEL_NOT_AVAILABLE':  return 'OPENAI_ACCESS_DENIED'
    case 'OPENAI_REQUEST_FAILED':
      if ((httpStatus ?? 0) >= 500) return 'OPENAI_UPSTREAM_ERROR'
      if ((httpStatus ?? 0) >= 400) return 'OPENAI_INVALID_REQUEST'
      return 'OPENAI_GENERATION_FAILED'
    case 'STORAGE_UPLOAD_FAILED':
    case 'STORAGE_NOT_CONFIGURED':
      return 'STORAGE_UPLOAD_FAILED'
    default: return code
  }
}

// ── GET — list creative assets for campaign ───────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session)                     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  let assets: Awaited<ReturnType<typeof prisma.orbitMedia.findMany>> = []
  try {
    assets = await prisma.orbitMedia.findMany({
      where:   { campaignId: params.id },
      orderBy: { createdAt: 'desc' },
    })
  } catch (dbErr) {
    console.error('[Orbit Creative GET] DB query failed:', dbErr instanceof Error ? dbErr.message : String(dbErr))
  }

  const health = getProviderHealth()

  return NextResponse.json({
    assets,
    openaiEnabled:        isOpenAIImageEnabled(),
    replicateEnabled:     isReplicateConfigured(),
    runwayEnabled:        false,
    falVideoEnabled:      isFalVideoConfigured(),
    availableVideoModels: listVideoModels(),
    imageHealth:          health.image,
    videoHealth:          health.video,
  })
}

// ── POST — generate a new creative asset ─────────────────────────────────────

interface GenerateBody {
  mode:              'image' | 'video'
  provider:          'openai' | 'replicate' | 'fal' | 'runway'
  format:            string
  prompt?:           string
  promptHint?:       string
  brandPreset?:      string
  aspectRatio?:      string
  duration?:         5 | 10
  referenceMediaId?: string
  quality?:          'low' | 'medium' | 'high' | 'auto'
  videoModelKey?:    string
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Unique trace ID — correlates this request across Vercel function logs
  const traceId = `orb_${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 4)}`

  // ── TOP-LEVEL GUARD — always returns JSON, never HTML ─────────────────────
  try {

    // STAGE: authentication
    const session = await getAdminSession()
    if (!session)                     return NextResponse.json({ error: 'Unauthorized',  errorCode: 'UNAUTHORIZED', traceId }, { status: 401 })
    if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden',   errorCode: 'FORBIDDEN',    traceId }, { status: 403 })
    console.log(`[Orbit Creative] traceId=${traceId} stage=auth_passed user=${session.email}`)

    // STAGE: campaign lookup
    let campaign: Awaited<ReturnType<typeof prisma.orbitCampaign.findUnique>>
    try {
      campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
      console.error(`[Orbit Creative] traceId=${traceId} stage=campaign_lookup_failed error="${msg}"`)
      return NextResponse.json({ error: 'Database error looking up campaign.', errorCode: 'INTERNAL_SERVER_ERROR', traceId }, { status: 500 })
    }
    if (!campaign) return NextResponse.json({ error: 'Campaign not found', errorCode: 'CAMPAIGN_NOT_FOUND', traceId }, { status: 404 })
    console.log(`[Orbit Creative] traceId=${traceId} stage=campaign_loaded campaignId=${params.id}`)

    // STAGE: parse request
    const body = await req.json().catch(() => ({})) as GenerateBody
    const { mode = 'image', provider, format, promptHint, brandPreset, quality } = body
    const aspectRatio = body.aspectRatio ?? '9:16'
    const duration    = body.duration === 10 ? 10 : 5

    if (!provider)                  return NextResponse.json({ error: 'provider is required',           errorCode: 'REQUEST_VALIDATION_FAILED', traceId }, { status: 400 })
    if (!format && mode === 'image') return NextResponse.json({ error: 'format is required for images', errorCode: 'REQUEST_VALIDATION_FAILED', traceId }, { status: 400 })
    console.log(`[Orbit Creative] traceId=${traceId} stage=request_parsed mode=${mode} provider=${provider} format=${format ?? 'n/a'}`)

    // ── Image generation ────────────────────────────────────────────────────

    if (mode === 'image') {

      // ── OpenAI GPT-Image-2 ────────────────────────────────────────────────
      if (provider === 'openai') {
        if (!envFlag('ORBIT_AI_IMAGE_ENABLED')) {
          return NextResponse.json({
            error: 'OpenAI image generation is disabled. Set ORBIT_AI_IMAGE_ENABLED=true.',
            errorCode: 'IMAGE_FEATURE_DISABLED',
            notConfigured: true, traceId,
          }, { status: 503 })
        }
        if (!process.env.OPENAI_API_KEY) {
          return NextResponse.json({
            error: 'OPENAI_API_KEY is not configured.',
            errorCode: 'OPENAI_KEY_MISSING',
            notConfigured: true, traceId,
          }, { status: 503 })
        }

        // STAGE: cap check (non-fatal if DB unavailable — generation continues)
        let used = 0
        try {
          const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
          const cap = settings?.imageCapPerCampaign ?? 8
          used = await prisma.orbitMedia.count({ where: { campaignId: params.id, isReference: false } })
          if (used >= cap) {
            return NextResponse.json({ error: `Image cap of ${cap} reached`, capReached: true, traceId }, { status: 429 })
          }
        } catch (capErr) {
          // Log but don't fail the request — cap is advisory; generation is the goal
          console.error(`[Orbit Creative] traceId=${traceId} stage=cap_check_failed error="${capErr instanceof Error ? capErr.message : String(capErr)}"`)
        }
        console.log(`[Orbit Creative] traceId=${traceId} stage=cap_checked used=${used} model=${getOpenAIImageModel()}`)

        // STAGE: build prompt
        let prompt: string
        try {
          prompt = body.prompt?.trim() || buildCreativePrompt({
            destination: campaign.destination,
            objective:   campaign.objective,
            promptHint:  promptHint ?? campaign.promotionDetails,
            brandPreset,
          })
        } catch (promptErr) {
          const msg = promptErr instanceof Error ? promptErr.message : String(promptErr)
          console.error(`[Orbit Creative] traceId=${traceId} stage=prompt_build_failed error="${msg}"`)
          return NextResponse.json({ error: 'Could not build generation prompt.', errorCode: 'PROMPT_BUILD_FAILED', traceId }, { status: 500 })
        }
        console.log(`[Orbit Creative] traceId=${traceId} stage=prompt_built length=${prompt.length}`)

        // STAGE: create placeholder row
        console.log(`[Orbit Creative] traceId=${traceId} stage=db_create_start`)
        let placeholder: Awaited<ReturnType<typeof prisma.orbitMedia.create>>
        try {
          placeholder = await prisma.orbitMedia.create({
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
        } catch (dbErr) {
          const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
          console.error(`[Orbit Creative] traceId=${traceId} stage=db_create_failed error="${msg}"`)
          return NextResponse.json({
            error: 'Could not initialize generation record.',
            errorCode: 'ORBIT_MEDIA_CREATE_FAILED',
            traceId,
          }, { status: 500 })
        }
        console.log(`[Orbit Creative] traceId=${traceId} stage=db_create_complete mediaId=${placeholder.id}`)

        try {
          let result: Awaited<ReturnType<typeof generateOpenAIImage>>

          if (body.referenceMediaId) {
            // STAGE: resolve reference image
            const ref = await prisma.orbitMedia.findFirst({
              where: { id: body.referenceMediaId, campaignId: params.id, isReference: true },
            })
            if (!ref?.publicUrl) {
              await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
              return NextResponse.json({ error: 'Reference image not found', errorCode: 'REQUEST_VALIDATION_FAILED', traceId }, { status: 400 })
            }
            console.log(`[Orbit Creative] traceId=${traceId} stage=openai_request_start type=edit refId=${ref.id}`)
            result = await editOpenAIImage({ prompt, referenceImageUrl: ref.publicUrl, format, mediaId: placeholder.id, quality })
          } else {
            console.log(`[Orbit Creative] traceId=${traceId} stage=openai_request_start type=generate`)
            result = await generateOpenAIImage({ prompt, format, mediaId: placeholder.id, quality })
          }
          console.log(`[Orbit Creative] traceId=${traceId} stage=openai_response_received storagePath=${result.storagePath}`)

          // Alt text via Claude (non-fatal)
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
            try { assertContentSafe(raw); altText = raw } catch { /* fallback */ }
          } catch { /* non-fatal — altText keeps default */ }

          // STAGE: persist completed record
          console.log(`[Orbit Creative] traceId=${traceId} stage=db_update_start mediaId=${placeholder.id}`)
          let media: Awaited<ReturnType<typeof prisma.orbitMedia.update>>
          try {
            media = await prisma.orbitMedia.update({
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
          } catch (updateErr) {
            const msg = updateErr instanceof Error ? updateErr.message : String(updateErr)
            console.error(`[Orbit Creative] traceId=${traceId} stage=db_update_failed error="${msg}"`)
            await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
            return NextResponse.json({
              error: 'Image was generated but could not be saved.',
              errorCode: 'ORBIT_MEDIA_CREATE_FAILED',
              traceId,
            }, { status: 500 })
          }

          console.log(`[Orbit Creative] traceId=${traceId} stage=complete mediaId=${media.id}`)
          return NextResponse.json({ media, prompt, traceId })

        } catch (err) {
          await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})

          if (err instanceof OrbitImageError) {
            const errorCode  = mapOrbitCode(err.code, err.httpStatus)
            const httpStatus = err.httpStatus && err.httpStatus >= 400 ? err.httpStatus : 500
            console.error(`[Orbit Creative] traceId=${traceId} stage=generation_failed errorCode=${errorCode} httpStatus=${httpStatus} detail="${err.message.slice(0, 120)}"`)
            return NextResponse.json({ error: err.message, errorCode, traceId }, { status: httpStatus })
          }
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[Orbit Creative] traceId=${traceId} stage=generation_failed_untyped error="${msg.slice(0, 200)}"`)
          return NextResponse.json({ error: 'Image generation failed.', errorCode: 'OPENAI_GENERATION_FAILED', traceId }, { status: 500 })
        }
      }

      // ── Replicate / Flux ──────────────────────────────────────────────────
      if (provider === 'replicate') {
        if (!isReplicateConfigured()) {
          return NextResponse.json({
            error: 'Replicate is not configured. Add REPLICATE_API_TOKEN.',
            notConfigured: true, traceId,
          }, { status: 503 })
        }

        let usedReplicate = 0
        try {
          const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
          const cap = settings?.imageCapPerCampaign ?? 8
          usedReplicate = await prisma.orbitMedia.count({ where: { campaignId: params.id, isReference: false } })
          if (usedReplicate >= cap) {
            return NextResponse.json({ error: `Image cap of ${cap} reached`, capReached: true, traceId }, { status: 429 })
          }
        } catch (capErr) {
          console.error(`[Orbit Creative] traceId=${traceId} stage=cap_check_failed (replicate) error="${capErr instanceof Error ? capErr.message : String(capErr)}"`)
        }

        const prompt = body.prompt?.trim() || buildCreativePrompt({
          destination: campaign.destination,
          objective:   campaign.objective,
          promptHint:  promptHint ?? campaign.promotionDetails,
          brandPreset,
        })

        console.log(`[Orbit Creative] traceId=${traceId} stage=db_create_start provider=replicate`)
        let placeholder: Awaited<ReturnType<typeof prisma.orbitMedia.create>>
        try {
          placeholder = await prisma.orbitMedia.create({
            data: {
              source: 'generated', storagePath: '',
              format, destination: campaign.destination || null,
              campaignType: campaign.objective || null,
              prompt, campaignId: params.id, createdBy: session.email,
              provider: 'replicate', model: 'flux-dev',
              generationStatus: 'processing',
            },
          })
        } catch (dbErr) {
          const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
          console.error(`[Orbit Creative] traceId=${traceId} stage=db_create_failed (replicate) error="${msg}"`)
          return NextResponse.json({ error: 'Could not initialize generation record.', errorCode: 'ORBIT_MEDIA_CREATE_FAILED', traceId }, { status: 500 })
        }
        console.log(`[Orbit Creative] traceId=${traceId} stage=db_create_complete (replicate) mediaId=${placeholder.id}`)

        try {
          const { buildPrompt } = await import('@/lib/orbit/replicate-adapter')
          const finalPrompt = buildPrompt(campaign.destination, campaign.objective, promptHint ?? campaign.promotionDetails)
          console.log(`[Orbit Creative] traceId=${traceId} stage=replicate_request_start`)
          const result = await generateBackground(finalPrompt, format as Parameters<typeof generateBackground>[1], placeholder.id)
          console.log(`[Orbit Creative] traceId=${traceId} stage=replicate_response_received`)

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

          let media: Awaited<ReturnType<typeof prisma.orbitMedia.update>>
          try {
            media = await prisma.orbitMedia.update({
              where: { id: placeholder.id },
              data: {
                storagePath: result.storagePath, publicUrl: result.publicUrl,
                altText, costUsd: result.costUsd, generationStatus: 'completed',
              },
            })
          } catch (updateErr) {
            const msg = updateErr instanceof Error ? updateErr.message : String(updateErr)
            console.error(`[Orbit Creative] traceId=${traceId} stage=db_update_failed (replicate) error="${msg}"`)
            await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
            return NextResponse.json({ error: 'Image was generated but could not be saved.', errorCode: 'ORBIT_MEDIA_CREATE_FAILED', traceId }, { status: 500 })
          }

          return NextResponse.json({ media, prompt: finalPrompt, traceId })

        } catch (err) {
          await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[Orbit Creative] traceId=${traceId} stage=replicate_failed error="${msg.slice(0, 200)}"`)
          return NextResponse.json({ error: msg, errorCode: 'OPENAI_GENERATION_FAILED', traceId }, { status: 500 })
        }
      }

      return NextResponse.json({ error: `Unknown provider: ${provider}`, errorCode: 'REQUEST_VALIDATION_FAILED', traceId }, { status: 400 })
    }

    // ── Video generation (FAL.ai — async, DB-tracked) ─────────────────────

    if (mode === 'video' && provider === 'fal') {
      if (!envFlag('ORBIT_AI_VIDEO_ENABLED')) {
        return NextResponse.json({
          error: 'FAL.ai video generation is disabled. Set ORBIT_AI_VIDEO_ENABLED=true.',
          errorCode: 'VIDEO_FEATURE_DISABLED',
          notConfigured: true, traceId,
        }, { status: 503 })
      }
      if (!process.env.FALAI_API_KEY?.trim()) {
        return NextResponse.json({
          error: 'FALAI_API_KEY is not configured.',
          errorCode: 'FAL_KEY_MISSING',
          notConfigured: true, traceId,
        }, { status: 503 })
      }

      const prompt   = (body.prompt ?? '').trim()
      const modelKey = body.videoModelKey ?? 'kling'

      if (!prompt) return NextResponse.json({ error: 'prompt required for video', errorCode: 'REQUEST_VALIDATION_FAILED', traceId }, { status: 400 })
      if (!body.referenceMediaId) {
        return NextResponse.json({ error: 'referenceMediaId required for image-to-video', errorCode: 'REQUEST_VALIDATION_FAILED', traceId }, { status: 400 })
      }

      const resolvedModel = resolveVideoModel(modelKey)
      if (!resolvedModel) {
        return NextResponse.json({
          error: `Unknown video model key: "${modelKey}". Allowed: kling, veo, seedance.`,
          errorCode: 'REQUEST_VALIDATION_FAILED', traceId,
        }, { status: 400 })
      }

      // Source image lookup
      let sourceMedia: Awaited<ReturnType<typeof prisma.orbitMedia.findFirst>>
      try {
        sourceMedia = await prisma.orbitMedia.findFirst({
          where: { id: body.referenceMediaId, campaignId: params.id },
        })
      } catch (dbErr) {
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
        console.error(`[Orbit Creative] traceId=${traceId} stage=source_lookup_failed (fal) error="${msg}"`)
        return NextResponse.json({ error: 'Database error looking up source image.', errorCode: 'INTERNAL_SERVER_ERROR', traceId }, { status: 500 })
      }
      if (!sourceMedia?.publicUrl) {
        return NextResponse.json({ error: 'Source image not found', errorCode: 'REQUEST_VALIDATION_FAILED', traceId }, { status: 404 })
      }

      // Duplicate-click guard
      let existing: Awaited<ReturnType<typeof prisma.orbitMedia.findFirst>>
      try {
        existing = await prisma.orbitMedia.findFirst({
          where: { campaignId: params.id, provider: 'fal', generationStatus: { in: ['pending', 'processing'] } },
        })
      } catch { existing = null }
      if (existing) {
        return NextResponse.json(
          { error: 'A video is already being generated for this campaign', mediaId: existing.id, traceId },
          { status: 409 },
        )
      }

      console.log(`[Orbit Creative] traceId=${traceId} stage=db_create_start provider=fal model=${resolvedModel.key}`)
      let placeholder: Awaited<ReturnType<typeof prisma.orbitMedia.create>>
      try {
        placeholder = await prisma.orbitMedia.create({
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
            model:            resolvedModel.key,
            generationStatus: 'pending',
            costUsd:          duration * resolvedModel.costPerSecond,
          },
        })
      } catch (dbErr) {
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
        console.error(`[Orbit Creative] traceId=${traceId} stage=db_create_failed (fal) error="${msg}"`)
        return NextResponse.json({ error: 'Could not initialize video record.', errorCode: 'ORBIT_MEDIA_CREATE_FAILED', traceId }, { status: 500 })
      }
      console.log(`[Orbit Creative] traceId=${traceId} stage=db_create_complete (fal) mediaId=${placeholder.id}`)

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
        }).catch(e => console.error(`[Orbit Creative] traceId=${traceId} stage=fal_jobid_update_failed`, e))

        return NextResponse.json({
          media:     { ...placeholder, providerJobId: requestId },
          requestId,
          status:    'pending',
          traceId,
        })

      } catch (err) {
        await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Orbit Creative] traceId=${traceId} stage=fal_submit_failed error="${msg.slice(0, 200)}"`)
        return NextResponse.json({ error: msg, errorCode: 'VIDEO_GENERATION_FAILED', traceId }, { status: 500 })
      }
    }

    if (mode === 'video' && provider === 'runway') {
      return NextResponse.json({
        error: 'Runway video provider has been replaced by FAL.ai. Use provider: "fal" instead.',
        migrated: true, traceId,
      }, { status: 503 })
    }

    return NextResponse.json({ error: `Unsupported mode/provider combination: ${mode}/${provider}`, errorCode: 'REQUEST_VALIDATION_FAILED', traceId }, { status: 400 })

  // ── TOP-LEVEL GUARD — catches any exception not handled above ─────────────
  } catch (fatal) {
    const msg = fatal instanceof Error ? fatal.message : String(fatal)
    console.error(`[Orbit Creative] traceId=${traceId} stage=fatal_unhandled error="${msg.slice(0, 300)}"`, fatal)
    return NextResponse.json({
      error: 'An unexpected server error occurred.',
      errorCode: 'INTERNAL_SERVER_ERROR',
      traceId,
    }, { status: 500 })
  }
}
