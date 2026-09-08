/**
 * Orbit Creative OS — sanitized provider health summary.
 *
 * Super-admin-safe: statuses and capability names only. NEVER includes
 * URLs, tokens, API keys, or raw provider error bodies. The local GPU is
 * reported as optional infrastructure, not a dependency.
 */

import { providerEnabled } from './registry'
import { checkLocalAIHealth, LOCAL_ENDPOINT_FOR } from './local-health'
import type { LocalAIStatus } from './local-health'

export interface ProviderHealthSummary {
  local: {
    configured:   boolean
    status:       LocalAIStatus
    capabilities: string[]
  }
  openai:    { configured: boolean; status: 'ready' | 'not_configured' }
  fal:       { configured: boolean; status: 'ready' | 'not_configured' }
  replicate: { configured: boolean; status: 'ready' | 'not_configured' }
  /** Friendly note for the UI when local is intentionally absent. */
  note: string | null
}

export async function getProviderHealthSummary(): Promise<ProviderHealthSummary> {
  const local = await checkLocalAIHealth()
  const cloudReady = providerEnabled('openai') || providerEnabled('fal') || providerEnabled('replicate')
  return {
    local: {
      configured:   local.configured,
      status:       local.status,
      // Only endpoint names ever leave the server — no URLs, no error bodies
      capabilities: local.status === 'healthy'
        ? (local.capabilities.length ? local.capabilities : Object.values(LOCAL_ENDPOINT_FOR).filter((v): v is string => !!v))
        : [],
    },
    openai:    { configured: providerEnabled('openai'),    status: providerEnabled('openai')    ? 'ready' : 'not_configured' },
    fal:       { configured: providerEnabled('fal'),       status: providerEnabled('fal')       ? 'ready' : 'not_configured' },
    replicate: { configured: providerEnabled('replicate'), status: providerEnabled('replicate') ? 'ready' : 'not_configured' },
    note: !local.configured && cloudReady
      ? 'Local AI is optional. Cloud generation remains available.'
      : null,
  }
}
