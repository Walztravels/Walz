/**
 * Orbit — server-side provider health diagnostics.
 *
 * Server-side only. NEVER import from client components.
 * Returns safe status values — never API keys or secrets.
 *
 * Statuses:
 *   configured          — feature enabled AND key present AND model resolves
 *   disabled            — feature flag is not set to true
 *   missing_key         — feature enabled but API key absent
 *   invalid_configuration — key present but model resolution failed
 */

import { getOpenAIImageModel } from './openai-image-adapter'
import { resolveVideoModel } from './video-models'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProviderStatus =
  | 'configured'
  | 'disabled'
  | 'missing_key'
  | 'invalid_configuration'

export interface ImageProviderHealth {
  status:     ProviderStatus
  provider:   'openai' | 'replicate' | 'none'
  model:      string    // safe display name only — never an API key
  enabled:    boolean
  configured: boolean
  reason:     string    // human-readable safe description
}

export interface VideoProviderHealth {
  status:     ProviderStatus
  provider:   'fal' | 'none'
  model:      string    // e.g. 'Kling 3.0 Pro'
  modelKey:   string    // e.g. 'kling'
  enabled:    boolean
  configured: boolean
  reason:     string
}

export interface EnvPresence {
  OPENAI_API_KEY:           boolean  // true = present, never the value
  ORBIT_AI_IMAGE_ENABLED:   boolean
  ORBIT_OPENAI_IMAGE_MODEL: boolean
  FALAI_API_KEY:            boolean
  ORBIT_AI_VIDEO_ENABLED:   boolean
  ORBIT_VIDEO_PROVIDER:     boolean
  ORBIT_FAL_VIDEO_MODEL:    boolean
}

export interface ProviderHealthReport {
  image:       ImageProviderHealth
  video:       VideoProviderHealth
  envPresence: EnvPresence
  checkedAt:   string  // ISO timestamp
}

// ── Health check ──────────────────────────────────────────────────────────────

export function getProviderHealth(): ProviderHealthReport {
  // ── OpenAI image ─────────────────────────────────────────────────────
  const imageEnabled = process.env.ORBIT_AI_IMAGE_ENABLED === 'true'
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY
  const imageModel   = getOpenAIImageModel()  // returns model name, never the key

  let imageStatus: ProviderStatus
  let imageReason: string
  if (!imageEnabled) {
    imageStatus = 'disabled'
    imageReason = 'Set ORBIT_AI_IMAGE_ENABLED=true to enable'
  } else if (!hasOpenAIKey) {
    imageStatus = 'missing_key'
    imageReason = 'OPENAI_API_KEY is not configured'
  } else {
    imageStatus = 'configured'
    imageReason = 'Ready'
  }

  // ── FAL video ─────────────────────────────────────────────────────────
  const videoEnabled = process.env.ORBIT_AI_VIDEO_ENABLED === 'true'
  const hasFalKey    = !!process.env.FALAI_API_KEY

  // resolveVideoModel reads ORBIT_FAL_VIDEO_MODEL from env if set
  const klingResolved = resolveVideoModel('kling')

  let videoStatus: ProviderStatus
  let videoReason: string
  if (!videoEnabled) {
    videoStatus = 'disabled'
    videoReason = 'Set ORBIT_AI_VIDEO_ENABLED=true to enable'
  } else if (!hasFalKey) {
    videoStatus = 'missing_key'
    videoReason = 'FALAI_API_KEY is not configured'
  } else if (!klingResolved) {
    videoStatus = 'invalid_configuration'
    videoReason = 'Video model registry failed to resolve "kling"'
  } else {
    videoStatus = 'configured'
    videoReason = 'Ready'
  }

  const videoModelDisplay = klingResolved?.name ?? 'Unknown'

  return {
    image: {
      status:     imageStatus,
      provider:   'openai',
      model:      imageModel,
      enabled:    imageEnabled,
      configured: imageStatus === 'configured',
      reason:     imageReason,
    },
    video: {
      status:     videoStatus,
      provider:   'fal',
      model:      videoModelDisplay,
      modelKey:   'kling',
      enabled:    videoEnabled,
      configured: videoStatus === 'configured',
      reason:     videoReason,
    },
    envPresence: {
      OPENAI_API_KEY:           hasOpenAIKey,
      ORBIT_AI_IMAGE_ENABLED:   process.env.ORBIT_AI_IMAGE_ENABLED !== undefined,
      ORBIT_OPENAI_IMAGE_MODEL: !!process.env.ORBIT_OPENAI_IMAGE_MODEL,
      FALAI_API_KEY:            hasFalKey,
      ORBIT_AI_VIDEO_ENABLED:   process.env.ORBIT_AI_VIDEO_ENABLED !== undefined,
      ORBIT_VIDEO_PROVIDER:     !!process.env.ORBIT_VIDEO_PROVIDER,
      ORBIT_FAL_VIDEO_MODEL:    !!process.env.ORBIT_FAL_VIDEO_MODEL,
    },
    checkedAt: new Date().toISOString(),
  }
}
