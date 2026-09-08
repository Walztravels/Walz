/**
 * Orbit Creative OS — unified capability executor with provider failover.
 *
 * Every studio (Image, Video, Audio, Motion, Lip Sync, Clipping) and every
 * workflow node executes through this single function. It:
 *   1. Resolves the route via the registry (mode/lane policy respected)
 *   2. Dispatches to the chosen provider adapter
 *   3. On provider failure, walks the failover chain — EXCEPT under a
 *      LOCAL policy, where cloud is never used (campaign policy rule)
 *   4. Returns a normalized result (sync output or async provider job)
 *
 * Provider credentials are read server-side only, inside the adapters.
 * Content passed to prompts is pre-screened by the existing content filter.
 */

import { resolveRoute, type RouteRequest } from './registry'
import { submitLocalJob } from './local-adapter'
import { generateOpenAIImage, editOpenAIImage } from '@/lib/orbit/openai-image-adapter'
import { generateBackground } from '@/lib/orbit/replicate-adapter'
import { filterContent } from '@/lib/orbit/content-filter'
import type { CapabilityKind, ModelEntry } from './types'

const FAL_QUEUE_BASE = 'https://queue.fal.run'

function falHeaders(): Record<string, string> {
  if (!process.env.FALAI_API_KEY) throw new Error('FALAI_API_KEY is not set')
  return { Authorization: `Key ${process.env.FALAI_API_KEY}`, 'Content-Type': 'application/json' }
}

export interface ExecuteInput {
  capability:   CapabilityKind
  mode?:        RouteRequest['mode']
  lane?:        RouteRequest['lane']
  prompt?:      string
  imageUrl?:    string
  videoUrl?:    string
  audioUrl?:    string
  format?:      string          // e.g. '1080x1350', '9:16'
  durationSec?: number
  /** OrbitMedia id used for storage pathing by sync adapters. */
  mediaId?:     string
  extra?:       Record<string, unknown>
}

export interface ExecuteResult {
  ok:            boolean
  provider?:     string
  modelKey?:     string
  lane?:         string
  costUsd?:      number | null
  /** Synchronous output (some providers return immediately). */
  outputUrl?:    string
  /** Async job to poll (most providers). */
  providerJobId?: string
  async?:        boolean
  error?:        string
  attempted?:    string[]       // model keys tried, in order
}

/** Map a Creative OS format to provider-ish size/aspect hints. */
function aspectOf(format?: string): string {
  if (!format) return '1:1'
  if (format.includes('1080x1920') || format === '9:16' || format === 'video_9x16') return '9:16'
  if (format.includes('1200x628') || format === '16:9' || format === 'video_16x9')  return '16:9'
  if (format.includes('1080x1350')) return '4:5'
  return '1:1'
}

async function dispatchToEntry(entry: ModelEntry, input: ExecuteInput): Promise<ExecuteResult> {
  const baseResult = { provider: entry.provider, modelKey: entry.key, lane: entry.lane, costUsd: entry.costUsd }

  switch (entry.provider) {
    case 'local': {
      const { providerJobId } = await submitLocalJob({
        endpoint: entry.endpoint,
        payload: {
          prompt: input.prompt, image_url: input.imageUrl, video_url: input.videoUrl,
          audio_url: input.audioUrl, aspect_ratio: aspectOf(input.format),
          duration: input.durationSec, ...input.extra,
        },
      })
      return { ok: true, ...baseResult, providerJobId, async: true }
    }

    case 'openai': {
      const mediaId = input.mediaId ?? `cos_${Date.now()}`
      if (entry.capability === 'image_edit') {
        const r = await editOpenAIImage({
          prompt: input.prompt ?? '', referenceImageUrl: input.imageUrl ?? '',
          format: input.format ?? '1080x1350', mediaId,
        })
        return { ok: true, ...baseResult, outputUrl: r.publicUrl, costUsd: r.costUsd, async: false }
      }
      const r = await generateOpenAIImage({
        prompt: input.prompt ?? '', format: input.format ?? '1080x1350', mediaId,
      })
      return { ok: true, ...baseResult, outputUrl: r.publicUrl, costUsd: r.costUsd, async: false }
    }

    case 'replicate': {
      const r = await generateBackground(
        input.prompt ?? '',
        (input.format ?? '1080x1350') as Parameters<typeof generateBackground>[1],
        input.mediaId ?? `cos_${Date.now()}`,
      )
      return { ok: true, ...baseResult, outputUrl: r.publicUrl, costUsd: r.costUsd, async: false }
    }

    case 'fal': {
      const endpoint = entry.endpoint.startsWith('env:')
        ? (process.env[entry.endpoint.slice(4)] ?? 'fal-ai/kling-video/v1.6/standard/image-to-video')
        : entry.endpoint
      const payload: Record<string, unknown> = { ...input.extra }
      if (input.prompt)      payload.prompt      = input.prompt
      if (input.imageUrl)    payload.image_url   = input.imageUrl
      if (input.videoUrl)    payload.video_url   = input.videoUrl
      if (input.audioUrl)    payload.audio_url   = input.audioUrl
      if (input.durationSec) payload.duration    = String(input.durationSec)
      payload.aspect_ratio = aspectOf(input.format)
      const res = await fetch(`${FAL_QUEUE_BASE}/${endpoint}`, {
        method: 'POST', headers: falHeaders(), body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`FAL_${res.status}: ${(await res.text()).slice(0, 200)}`)
      const data = await res.json() as { request_id?: string }
      if (!data.request_id) throw new Error('FAL_NO_REQUEST_ID')
      return { ok: true, ...baseResult, providerJobId: data.request_id, async: true }
    }
  }
}

/**
 * Execute a capability with routing + failover.
 * A LOCAL policy that cannot be satisfied FAILS — it never falls to cloud.
 */
export async function executeCapability(input: ExecuteInput): Promise<ExecuteResult> {
  // Content safety on any prompt text (existing Walz filter — not optional)
  if (input.prompt) {
    const f = filterContent(input.prompt)
    if (!f.passed) {
      return { ok: false, error: `CONTENT_BLOCKED: ${f.violations.map(v => v.rule).join(', ')}` }
    }
  }

  const route = resolveRoute({ capability: input.capability, mode: input.mode, lane: input.lane })
  if ('error' in route) return { ok: false, error: route.error }

  const localPolicy = input.mode === 'LOCAL_ONLY' || input.lane === 'LOCAL'
  const chain = [route.entry, ...route.failover.filter(e => !localPolicy || e.provider === 'local')]
  const attempted: string[] = []
  let lastError = 'NO_PROVIDER'

  for (const entry of chain) {
    attempted.push(entry.key)
    try {
      const result = await dispatchToEntry(entry, input)
      if (result.ok) return { ...result, attempted }
      lastError = result.error ?? 'UNKNOWN'
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }

  return { ok: false, error: lastError, attempted }
}
