/**
 * Orbit Creative OS — central model registry + cost-aware capability router.
 *
 * Single source of truth for every model the Creative OS can use, adapted
 * from open-generative-ai's declarative registry pattern (MIT, clean-room).
 *
 * Staff never see raw model IDs — they pick a RouterMode or CostLane; the
 * server resolves the concrete provider/model here, considering capability,
 * cost, latency, provider health (credential presence + feature flags), and
 * quality requirement, and produces a deterministic failover chain.
 *
 * HARD RULE: LOCAL_ONLY / lane LOCAL never resolves to a paid provider —
 * if the local service is unavailable the route fails, it does not silently
 * fall back to cloud.
 */

import { getLocalAIHealth, localCapabilityUsable, LOCAL_AI_UNAVAILABLE, LOCAL_AI_UNAVAILABLE_MESSAGE } from './local-health'
import type {
  ModelEntry, CapabilityKind, CostLane, RouterMode, RouteDecision, ProviderId,
} from './types'

// ── Environment gates ─────────────────────────────────────────────────────────

function envSet(name: string): boolean {
  return !!process.env[name]?.trim()
}

function envTrue(name: string): boolean {
  return (process.env[name] ?? '').trim().toLowerCase() === 'true'
}

/** Feature flags per provider — additive, default off where risky. */
export function providerEnabled(provider: ProviderId): boolean {
  switch (provider) {
    case 'local':     return envSet('ORBIT_LOCAL_AI_URL') && envSet('ORBIT_LOCAL_AI_TOKEN')
    case 'fal':       return envSet('FALAI_API_KEY')
    case 'openai':    return envSet('OPENAI_API_KEY')
    case 'replicate': return envSet('REPLICATE_API_TOKEN')
  }
}

function entryAvailable(e: ModelEntry): boolean {
  if (!providerEnabled(e.provider)) return false
  return e.requires.every(r => envSet(r) || envTrue(r))
}

// ── Registry ──────────────────────────────────────────────────────────────────
// costUsd values are authoritative published prices where known; null = unknown.

export const MODEL_REGISTRY: ModelEntry[] = [
  // ── Image generation ────────────────────────────────────────────────────────
  { key: 'local-sdxl',        provider: 'local',     capability: 'text_to_image', lane: 'LOCAL',    endpoint: 'sdxl',                                     label: 'Local SDXL',            costUsd: 0,     quality: 62, latency: 'medium', tags: ['photoreal'],            requires: [], async: true },
  { key: 'flux-schnell',      provider: 'replicate', capability: 'text_to_image', lane: 'STANDARD', endpoint: 'black-forest-labs/flux-schnell',           label: 'Flux Schnell',          costUsd: 0.003, quality: 70, latency: 'fast',   tags: ['fast'],                 requires: [], async: false },
  { key: 'flux-dev',          provider: 'replicate', capability: 'text_to_image', lane: 'STANDARD', endpoint: 'black-forest-labs/flux-dev',               label: 'Flux Dev',              costUsd: 0.03,  quality: 80, latency: 'medium', tags: ['photoreal'],            requires: [], async: false },
  { key: 'gpt-image',         provider: 'openai',    capability: 'text_to_image', lane: 'PREMIUM',  endpoint: 'env:ORBIT_OPENAI_IMAGE_MODEL',             label: 'GPT-Image',             costUsd: 0.17,  quality: 92, latency: 'slow',   tags: ['typography'],           requires: ['ORBIT_AI_IMAGE_ENABLED'], async: false },
  { key: 'fal-flux-pro',      provider: 'fal',       capability: 'text_to_image', lane: 'PREMIUM',  endpoint: 'fal-ai/flux-pro/v1.1-ultra',               label: 'Flux Pro Ultra',        costUsd: 0.06,  quality: 90, latency: 'medium', tags: ['photoreal', 'typography'], requires: [], async: true },
  // ── Image edit / image-to-image ────────────────────────────────────────────
  { key: 'local-img2img',     provider: 'local',     capability: 'image_to_image', lane: 'LOCAL',    endpoint: 'img2img',                                 label: 'Local img2img',         costUsd: 0,     quality: 60, latency: 'medium', tags: [],                       requires: [], async: true },
  { key: 'gpt-image-edit',    provider: 'openai',    capability: 'image_edit',     lane: 'PREMIUM',  endpoint: 'env:ORBIT_OPENAI_IMAGE_MODEL',            label: 'GPT-Image Edit',        costUsd: 0.17,  quality: 92, latency: 'slow',   tags: ['typography'],           requires: ['ORBIT_AI_IMAGE_ENABLED'], async: false },
  { key: 'local-edit',        provider: 'local',     capability: 'image_edit',     lane: 'LOCAL',    endpoint: 'inpaint',                                 label: 'Local Inpaint',         costUsd: 0,     quality: 58, latency: 'medium', tags: [],                       requires: [], async: true },
  { key: 'fal-img2img',       provider: 'fal',       capability: 'image_to_image', lane: 'STANDARD', endpoint: 'fal-ai/flux/dev/image-to-image',          label: 'Flux img2img',          costUsd: 0.03,  quality: 78, latency: 'medium', tags: [],                       requires: [], async: true },
  // ── Video ──────────────────────────────────────────────────────────────────
  { key: 'local-video',       provider: 'local',     capability: 'image_to_video', lane: 'LOCAL',    endpoint: 'img2vid',                                 label: 'Local Video (Wan)',     costUsd: 0,     quality: 55, latency: 'slow',   tags: [],                       requires: [], async: true },
  { key: 'fal-kling',         provider: 'fal',       capability: 'image_to_video', lane: 'PREMIUM',  endpoint: 'env:ORBIT_FAL_VIDEO_MODEL',               label: 'Kling',                 costUsd: null,  quality: 90, latency: 'slow',   tags: ['cinematic'],            requires: ['ORBIT_AI_VIDEO_ENABLED'], async: true },
  { key: 'fal-t2v',           provider: 'fal',       capability: 'text_to_video',  lane: 'PREMIUM',  endpoint: 'fal-ai/kling-video/v1.6/standard/text-to-video', label: 'Kling T2V',       costUsd: null,  quality: 88, latency: 'slow',   tags: ['cinematic'],            requires: ['ORBIT_AI_VIDEO_ENABLED'], async: true },
  { key: 'local-t2v',         provider: 'local',     capability: 'text_to_video',  lane: 'LOCAL',    endpoint: 'txt2vid',                                 label: 'Local T2V',             costUsd: 0,     quality: 50, latency: 'slow',   tags: [],                       requires: [], async: true },
  { key: 'fal-motion',        provider: 'fal',       capability: 'motion',         lane: 'STANDARD', endpoint: 'fal-ai/ltx-video/image-to-video',         label: 'LTX Motion',            costUsd: 0.04,  quality: 70, latency: 'medium', tags: ['fast'],                 requires: ['ORBIT_AI_VIDEO_ENABLED'], async: true },
  // ── Enhancement ────────────────────────────────────────────────────────────
  { key: 'local-upscale',     provider: 'local',     capability: 'upscale',            lane: 'LOCAL',    endpoint: 'upscale',                             label: 'Local Upscale',         costUsd: 0,     quality: 70, latency: 'fast',   tags: [],       requires: [], async: true },
  { key: 'fal-upscale',       provider: 'fal',       capability: 'upscale',            lane: 'STANDARD', endpoint: 'fal-ai/clarity-upscaler',             label: 'Clarity Upscaler',      costUsd: 0.02,  quality: 85, latency: 'medium', tags: [],       requires: [], async: true },
  { key: 'local-rembg',       provider: 'local',     capability: 'background_remove',  lane: 'LOCAL',    endpoint: 'rembg',                               label: 'Local RemBG',           costUsd: 0,     quality: 78, latency: 'fast',   tags: [],       requires: [], async: true },
  { key: 'fal-rembg',         provider: 'fal',       capability: 'background_remove',  lane: 'STANDARD', endpoint: 'fal-ai/birefnet',                     label: 'BiRefNet',              costUsd: 0.01,  quality: 88, latency: 'fast',   tags: [],       requires: [], async: true },
  { key: 'fal-vectorize',     provider: 'fal',       capability: 'vectorize',          lane: 'STANDARD', endpoint: 'fal-ai/recraft/vectorize',            label: 'Recraft Vectorize',     costUsd: 0.02,  quality: 85, latency: 'fast',   tags: ['vector'], requires: [], async: true },
  { key: 'local-vectorize',   provider: 'local',     capability: 'vectorize',          lane: 'LOCAL',    endpoint: 'vectorize',                           label: 'Local Potrace',         costUsd: 0,     quality: 60, latency: 'fast',   tags: ['vector'], requires: [], async: true },
  // ── Audio ──────────────────────────────────────────────────────────────────
  { key: 'fal-tts',           provider: 'fal',       capability: 'audio_voiceover',    lane: 'STANDARD', endpoint: 'fal-ai/kokoro',                       label: 'Kokoro TTS',            costUsd: 0.01,  quality: 80, latency: 'fast',   tags: [],       requires: ['ORBIT_AI_AUDIO_ENABLED'], async: true },
  { key: 'fal-narration',     provider: 'fal',       capability: 'audio_narration',    lane: 'PREMIUM',  endpoint: 'fal-ai/elevenlabs/tts/turbo-v2.5',    label: 'ElevenLabs Narration',  costUsd: null,  quality: 92, latency: 'fast',   tags: [],       requires: ['ORBIT_AI_AUDIO_ENABLED'], async: true },
  { key: 'fal-music',         provider: 'fal',       capability: 'audio_music',        lane: 'STANDARD', endpoint: 'fal-ai/stable-audio',                 label: 'Stable Audio Music',    costUsd: 0.03,  quality: 78, latency: 'medium', tags: [],       requires: ['ORBIT_AI_AUDIO_ENABLED'], async: true },
  { key: 'fal-sfx',           provider: 'fal',       capability: 'audio_sfx',          lane: 'STANDARD', endpoint: 'fal-ai/stable-audio',                 label: 'Stable Audio SFX',      costUsd: 0.03,  quality: 74, latency: 'medium', tags: [],       requires: ['ORBIT_AI_AUDIO_ENABLED'], async: true },
  // ── Lip sync ───────────────────────────────────────────────────────────────
  { key: 'fal-lipsync-img',   provider: 'fal',       capability: 'lip_sync_image',     lane: 'PREMIUM',  endpoint: 'fal-ai/sadtalker',                    label: 'SadTalker',             costUsd: null,  quality: 78, latency: 'slow',   tags: [],       requires: ['ORBIT_AI_LIPSYNC_ENABLED'], async: true },
  { key: 'fal-lipsync-vid',   provider: 'fal',       capability: 'lip_sync_video',     lane: 'PREMIUM',  endpoint: 'fal-ai/sync-lipsync',                 label: 'Sync LipSync',          costUsd: null,  quality: 85, latency: 'slow',   tags: [],       requires: ['ORBIT_AI_LIPSYNC_ENABLED'], async: true },
  // ── Clipping ───────────────────────────────────────────────────────────────
  { key: 'fal-clip',          provider: 'fal',       capability: 'clip',               lane: 'STANDARD', endpoint: 'fal-ai/whisper',                      label: 'Whisper Transcribe+Clip', costUsd: 0.01, quality: 82, latency: 'medium', tags: [],      requires: ['ORBIT_AI_CLIP_ENABLED'], async: true },
]

// ── Availability & health ─────────────────────────────────────────────────────

export function availableEntries(capability?: CapabilityKind): ModelEntry[] {
  return MODEL_REGISTRY.filter(e => (!capability || e.capability === capability) && entryAvailable(e))
}

export function capabilityMatrix(): Record<CapabilityKind, { lanes: string[]; available: boolean }> {
  const out = {} as Record<CapabilityKind, { lanes: string[]; available: boolean }>
  for (const e of MODEL_REGISTRY) {
    const cur = out[e.capability] ?? { lanes: [], available: false }
    if (entryAvailable(e)) {
      cur.available = true
      if (!cur.lanes.includes(e.lane)) cur.lanes.push(e.lane)
    }
    out[e.capability] = cur
  }
  return out
}

// ── Router ────────────────────────────────────────────────────────────────────

const MODE_SORT: Record<RouterMode, (a: ModelEntry, b: ModelEntry) => number> = {
  AUTO:            (a, b) => score(b) - score(a),
  BEST_VALUE:      (a, b) => (a.costUsd ?? 0.5) - (b.costUsd ?? 0.5) || b.quality - a.quality,
  BEST_QUALITY:    (a, b) => b.quality - a.quality,
  BEST_TYPOGRAPHY: (a, b) => tag(b, 'typography') - tag(a, 'typography') || b.quality - a.quality,
  CINEMATIC:       (a, b) => tag(b, 'cinematic') - tag(a, 'cinematic') || b.quality - a.quality,
  FAST:            (a, b) => lat(a) - lat(b) || b.quality - a.quality,
  LOCAL_ONLY:      (a, b) => b.quality - a.quality,
}

function tag(e: ModelEntry, t: ModelEntry['tags'][number]): number { return e.tags.includes(t) ? 1 : 0 }
function lat(e: ModelEntry): number { return e.latency === 'fast' ? 0 : e.latency === 'medium' ? 1 : 2 }
/** AUTO balance: quality per (cost + latency) with unknown cost treated conservatively. */
function score(e: ModelEntry): number {
  const cost = e.costUsd ?? 0.10
  return e.quality - cost * 100 - lat(e) * 5
}

export interface RouteRequest {
  capability: CapabilityKind
  mode?:      RouterMode
  lane?:      CostLane
}

/**
 * Resolve a concrete model for a capability under a mode/lane policy.
 * Deterministic. LOCAL_ONLY (or lane LOCAL) NEVER returns a cloud entry.
 *
 * Capability awareness: a configured local provider only participates when
 * the CACHED health snapshot says it is healthy AND reports the requested
 * capability's model (a healthy box without the txt2vid model is excluded).
 * An unknown (never-probed) snapshot keeps local eligible so the executor
 * can probe once before dispatch — resolveRoute itself never touches the
 * network.
 */
export function resolveRoute(req: RouteRequest): RouteDecision | { error: string; code?: string } {
  const mode: RouterMode = req.mode ?? (
    req.lane === 'LOCAL'    ? 'LOCAL_ONLY' :
    req.lane === 'PREMIUM'  ? 'BEST_QUALITY' :
    req.lane === 'STANDARD' ? 'BEST_VALUE' : 'AUTO'
  )
  let pool = availableEntries(req.capability)

  // Health-based exclusion of local entries (cached snapshot only)
  const health = getLocalAIHealth()
  const localKnownBad = health.configured && health.checkedAt > 0 && !localCapabilityUsable(req.capability, health)
  if (localKnownBad && mode !== 'LOCAL_ONLY' && req.lane !== 'LOCAL') {
    pool = pool.filter(e => e.provider !== 'local')
  }

  if (mode === 'LOCAL_ONLY' || req.lane === 'LOCAL') {
    pool = pool.filter(e => e.provider === 'local')
    if (pool.length === 0 || localKnownBad) {
      // Never silently fall back to a paid provider under a LOCAL policy —
      // this is what prevents surprise API charges.
      return { error: LOCAL_AI_UNAVAILABLE_MESSAGE, code: LOCAL_AI_UNAVAILABLE }
    }
  } else if (req.lane === 'PREMIUM') {
    const premium = pool.filter(e => e.lane === 'PREMIUM')
    if (premium.length > 0) pool = premium
  } else if (req.lane === 'STANDARD') {
    const cheap = pool.filter(e => e.lane !== 'PREMIUM')
    if (cheap.length > 0) pool = cheap
  }

  if (pool.length === 0) {
    return { error: `No configured provider supports ${req.capability}. Check provider credentials and feature flags.` }
  }

  const sorted = [...pool].sort(MODE_SORT[mode])
  const chosen = sorted[0]
  return {
    entry:    chosen,
    lane:     chosen.lane,
    failover: sorted.slice(1),
    reason:   `${mode}: ${chosen.label} (${chosen.provider}, ${chosen.lane}${chosen.costUsd != null ? `, ~$${chosen.costUsd}` : ''})`,
  }
}

/** Estimated cost for a capability under a lane, for CreativePlan estimates. */
export function estimateCost(capability: CapabilityKind, lane: CostLane): number | null {
  const r = resolveRoute({ capability, lane })
  return 'error' in r ? null : r.entry.costUsd
}
