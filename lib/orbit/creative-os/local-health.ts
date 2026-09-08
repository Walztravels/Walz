/**
 * Orbit Creative OS — canonical local-provider health state.
 *
 * The local GPU is an OPTIONAL cost lane, never a platform dependency.
 * Nothing here throws at import time; missing env vars simply yield
 * 'missing_configuration'. Health checks are short-timeout and cached
 * server-side so UI renders and routing never hang on a dead GPU box
 * and never probe on every request.
 */

import { isLocalAIConfigured } from './local-adapter'
import type { CapabilityKind } from './types'

export type LocalAIStatus =
  | 'healthy'
  | 'disabled'
  | 'missing_configuration'
  | 'unreachable'
  | 'timeout'
  | 'model_unavailable'

export interface LocalAIHealth {
  configured:   boolean
  status:       LocalAIStatus
  /** Capabilities the live service reports (endpoint names). */
  capabilities: string[]
  checkedAt:    number
}

/** Service endpoint name per capability (mirrors the registry's local entries). */
export const LOCAL_ENDPOINT_FOR: Partial<Record<CapabilityKind, string>> = {
  text_to_image:      'sdxl',
  image_to_image:     'img2img',
  image_edit:         'inpaint',
  image_to_video:     'img2vid',
  text_to_video:      'txt2vid',
  upscale:            'upscale',
  background_remove:  'rembg',
  vectorize:          'vectorize',
}

const HEALTH_TTL_MS    = 20_000   // cache window — no per-render remote calls
const HEALTH_TIMEOUT_MS = 3_500   // connection/health probe must be fast

let cache: LocalAIHealth | null = null

function snapshot(status: LocalAIStatus, capabilities: string[] = []): LocalAIHealth {
  cache = { configured: isLocalAIConfigured(), status, capabilities, checkedAt: Date.now() }
  return cache
}

/** Synchronous cached view — safe for the router; never triggers a network call. */
export function getLocalAIHealth(): LocalAIHealth {
  if (!isLocalAIConfigured()) return snapshot('missing_configuration')
  if (cache && Date.now() - cache.checkedAt < HEALTH_TTL_MS) return cache
  // Unknown-but-configured: report configured with stale/unknown status; callers
  // that are about to USE local should await checkLocalAIHealth() first.
  return cache ?? { configured: true, status: 'unreachable', capabilities: [], checkedAt: 0 }
}

/** Active health check (cached). Short timeout — never holds a request open. */
export async function checkLocalAIHealth(): Promise<LocalAIHealth> {
  if (!isLocalAIConfigured()) return snapshot('missing_configuration')
  if (cache && Date.now() - cache.checkedAt < HEALTH_TTL_MS) return cache

  const base  = (process.env.ORBIT_LOCAL_AI_URL ?? '').replace(/\/$/, '')
  const token = process.env.ORBIT_LOCAL_AI_TOKEN ?? ''
  try {
    const res = await fetch(`${base}/api/v1/health`, {
      headers: { Authorization: `Bearer ${token}` },
      cache:   'no-store',
      signal:  AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
    if (!res.ok) return snapshot('unreachable')
    const data = await res.json().catch(() => ({})) as { ok?: boolean; capabilities?: string[] }
    if (!data.ok) return snapshot('unreachable')
    return snapshot('healthy', Array.isArray(data.capabilities) ? data.capabilities : [])
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return snapshot(timedOut ? 'timeout' : 'unreachable')
  }
}

/**
 * Is the local provider usable RIGHT NOW for a capability, per the cached
 * health? 'Unknown' (never probed) counts as usable-if-configured so the
 * executor can attempt after an explicit checkLocalAIHealth() call.
 */
export function localCapabilityUsable(capability: CapabilityKind, health: LocalAIHealth): boolean {
  if (!health.configured) return false
  if (health.status !== 'healthy') return false
  const endpoint = LOCAL_ENDPOINT_FOR[capability]
  if (!endpoint) return false
  // A healthy service that doesn't list the endpoint's model → model_unavailable
  return health.capabilities.length === 0 || health.capabilities.includes(endpoint)
}

/** Structured error surface for LOCAL_ONLY when local cannot serve. */
export const LOCAL_AI_UNAVAILABLE = 'LOCAL_AI_UNAVAILABLE'
export const LOCAL_AI_UNAVAILABLE_MESSAGE =
  'Local AI is currently unavailable. Start the GPU service or choose another generation mode.'

/** Test hook: clear the cache between scenarios. */
export function _resetLocalHealthCache(): void { cache = null }
