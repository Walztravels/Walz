// server-only — never import from client components, Jade prompts, or NEXT_PUBLIC_ vars

export interface AviapagesConfig {
  readonly baseUrl:   string
  readonly apiKey:    string   // never logged, never returned in any response
  readonly timeoutMs: number
}

export function getConfig(): AviapagesConfig | null {
  if (process.env.AVIAPAGES_ENABLED !== 'true') return null

  const apiKey = process.env.AVIAPAGES_API_KEY ?? ''
  if (!apiKey) {
    console.error('[Aviapages] AVIAPAGES_API_KEY not set — adapter unavailable')
    return null
  }

  return {
    // Correct base URL per spec: https://api.aviapages.com/v3
    baseUrl:   process.env.AVIAPAGES_BASE_URL ?? 'https://api.aviapages.com/v3',
    apiKey,
    timeoutMs: Number(process.env.AVIAPAGES_REQUEST_TIMEOUT_MS ?? '20000'),
  }
}

export function isEnabled(): boolean {
  return process.env.AVIAPAGES_ENABLED === 'true' && !!process.env.AVIAPAGES_API_KEY
}
