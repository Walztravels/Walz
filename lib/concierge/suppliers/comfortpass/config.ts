// server-only — never import from client components, Jade prompts, or NEXT_PUBLIC_ vars

export interface ComfortPassConfig {
  readonly baseUrl:             string
  readonly apiKey:              string   // never logged, never returned in any response
  readonly env:                 'sandbox' | 'production'
  readonly timeoutMs:           number
  readonly lowBalanceThreshold: number
}

export function getConfig(): ComfortPassConfig | null {
  if (process.env.COMFORTPASS_ENABLED !== 'true') return null

  const env = (process.env.COMFORTPASS_ENV ?? 'sandbox') as 'sandbox' | 'production'

  const sandboxUrl    = process.env.COMFORTPASS_SANDBOX_BASE_URL
    ?? 'https://comfortpass-b2b-api-preview.comfortpass.workers.dev/partner/v2'
  const productionUrl = process.env.COMFORTPASS_PRODUCTION_BASE_URL
    ?? 'https://comfortpass-b2b-api.comfortpass.workers.dev/partner/v2'

  const baseUrl = env === 'production' ? productionUrl : sandboxUrl

  const sandboxKey    = process.env.COMFORTPASS_SANDBOX_API_KEY    ?? ''
  const productionKey = process.env.COMFORTPASS_PRODUCTION_API_KEY ?? ''
  const apiKey        = env === 'production' ? productionKey : sandboxKey

  if (!apiKey) {
    console.error(`[ComfortPass] COMFORTPASS_${env.toUpperCase()}_API_KEY not set — adapter unavailable`)
    return null
  }

  // Safety guard: never allow production key in sandbox mode
  if (env === 'sandbox' && productionKey && apiKey === productionKey) {
    console.error('[ComfortPass] Refusing to use production key in sandbox environment')
    return null
  }

  return {
    baseUrl,
    apiKey,
    env,
    timeoutMs:           Number(process.env.COMFORTPASS_REQUEST_TIMEOUT_MS     ?? '15000'),
    lowBalanceThreshold: Number(process.env.COMFORTPASS_LOW_BALANCE_THRESHOLD_USD ?? '250'),
  }
}

export function isEnabled(): boolean {
  return process.env.COMFORTPASS_ENABLED === 'true'
}
