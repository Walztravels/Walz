/**
 * Orbit — FAL.ai video adapter for image-to-video generation.
 *
 * Server-side only. NEVER import from client components.
 * FALAI_API_KEY must never be exposed to the browser.
 *
 * Supports:
 *   - image-to-video generation (primary)
 *
 * Gated by ORBIT_AI_VIDEO_ENABLED=true (default: false).
 *
 * Required env vars:
 *   FALAI_API_KEY
 *   ORBIT_AI_VIDEO_ENABLED=true
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env vars:
 *   ORBIT_FAL_VIDEO_MODEL  — overrides the Kling endpoint
 *   ORBIT_VIDEO_PROVIDER   — must be 'fal' (default)
 *
 * Security: FALAI_API_KEY is read from process.env at call time.
 * Only campaign creative assets (never customer documents) may be
 * submitted to FAL.ai.
 */

import { resolveVideoModel } from './video-models'

const FAL_QUEUE_BASE = 'https://queue.fal.run'

// ── Configuration ─────────────────────────────────────────────────────────────

export function isFalVideoConfigured(): boolean {
  return !!(
    process.env.FALAI_API_KEY &&
    process.env.ORBIT_AI_VIDEO_ENABLED === 'true'
  )
}

function falHeaders(): Record<string, string> {
  if (!process.env.FALAI_API_KEY) throw new Error('FALAI_API_KEY is not set')
  return {
    Authorization:  `Key ${process.env.FALAI_API_KEY}`,
    'Content-Type': 'application/json',
  }
}

// ── Submit image-to-video job ─────────────────────────────────────────────────

export async function submitFalImageToVideo(opts: {
  modelKey:        string   // must exist in video-models registry; validated server-side
  imageUrl:        string   // must be a campaign creative asset URL (never customer docs)
  prompt:          string
  duration:        number
  aspectRatio:     string   // e.g. '9:16'
  negativePrompt?: string
}): Promise<{ requestId: string; falEndpoint: string; costEstimate: number }> {
  if (!isFalVideoConfigured()) {
    throw new Error('FAL.ai video is not configured. Set FALAI_API_KEY and ORBIT_AI_VIDEO_ENABLED=true.')
  }

  const model = resolveVideoModel(opts.modelKey)
  if (!model) {
    throw new Error(`Unknown video model key: "${opts.modelKey}". Allowed: kling, veo, seedance.`)
  }

  const input: Record<string, unknown> = {
    image_url:    opts.imageUrl,
    prompt:       opts.prompt,
    duration:     String(opts.duration),
    aspect_ratio: opts.aspectRatio,
  }
  if (opts.negativePrompt) input.negative_prompt = opts.negativePrompt

  const res = await fetch(`${FAL_QUEUE_BASE}/${model.falEndpoint}`, {
    method:  'POST',
    headers: falHeaders(),
    body:    JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`FAL.ai submit error ${res.status}: ${err.slice(0, 300)}`)
  }

  const data = await res.json() as { request_id: string }

  return {
    requestId:    data.request_id,
    falEndpoint:  model.falEndpoint,
    costEstimate: opts.duration * model.costPerSecond,
  }
}

// ── Poll job status ───────────────────────────────────────────────────────────

export type FalVideoStatus = 'queued' | 'processing' | 'completed' | 'failed'

export interface FalPollResult {
  status:    FalVideoStatus
  videoUrl?: string
  error?:    string
}

export async function pollFalVideoTask(opts: {
  requestId:   string
  falEndpoint: string
}): Promise<FalPollResult> {
  if (!process.env.FALAI_API_KEY) throw new Error('FALAI_API_KEY is not set')

  const statusRes = await fetch(
    `${FAL_QUEUE_BASE}/${opts.falEndpoint}/requests/${opts.requestId}/status`,
    { headers: { Authorization: `Key ${process.env.FALAI_API_KEY}` } },
  )

  if (!statusRes.ok) {
    const err = await statusRes.text()
    throw new Error(`FAL.ai status poll error ${statusRes.status}: ${err.slice(0, 200)}`)
  }

  const data = await statusRes.json() as { status: string; error?: string }

  if (data.status === 'FAILED') {
    return { status: 'failed', error: data.error ?? 'FAL.ai generation failed' }
  }

  if (data.status === 'COMPLETED') {
    const resultRes = await fetch(
      `${FAL_QUEUE_BASE}/${opts.falEndpoint}/requests/${opts.requestId}`,
      { headers: { Authorization: `Key ${process.env.FALAI_API_KEY}` } },
    )
    const result = await resultRes.json() as { video?: { url: string } }
    const videoUrl = result.video?.url
    if (!videoUrl) return { status: 'failed', error: 'FAL.ai returned no video URL' }
    return { status: 'completed', videoUrl }
  }

  return { status: data.status === 'IN_QUEUE' ? 'queued' : 'processing' }
}

// ── Upload completed video to Supabase (permanent storage) ───────────────────
// FAL CDN URLs expire; re-uploading to Supabase ensures permanent access.

export async function uploadFalVideoToStorage(opts: {
  videoUrl: string
  mediaId:  string
}): Promise<{ storagePath: string; publicUrl: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const storagePath = `orbit/${opts.mediaId}.mp4`
  const uploadUrl   = `${supabaseUrl}/storage/v1/object/orbit-media/${storagePath}`

  const videoRes = await fetch(opts.videoUrl)
  if (!videoRes.ok) throw new Error(`Failed to download FAL.ai video: ${videoRes.status}`)
  const videoBuffer = await videoRes.arrayBuffer()

  const upRes = await fetch(uploadUrl, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${serviceKey}`,
      'Content-Type': 'video/mp4',
      'x-upsert':     'true',
    },
    body: videoBuffer,
  })

  if (!upRes.ok) {
    const body = await upRes.text()
    throw new Error(`Supabase storage upload failed: ${upRes.status} ${body.slice(0, 200)}`)
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/orbit-media/${storagePath}`
  return { storagePath, publicUrl }
}
