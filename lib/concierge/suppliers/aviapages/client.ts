// server-only — authenticated HTTP client for the Aviapages Charter API.
// Security: API key is never logged, never returned, never goes near the browser.

import type { AviapagesConfig } from './config'
import type {
  APAirport,
  APFlightCalculatorResult,
  APCharterSearchParams,
  APCharterSearchResult,
  APQuoteRequestPayload,
  APQuoteRequestResponse,
  APCharterPrice,
} from './types'

export class AviapagesClient {
  private readonly baseUrl:   string
  private readonly timeoutMs: number

  constructor(private readonly config: AviapagesConfig) {
    this.baseUrl   = config.baseUrl
    this.timeoutMs = config.timeoutMs
  }

  // ── Airport search ──────────────────────────────────────────────────────────

  async searchAirports(query: string): Promise<APAirport[]> {
    const data = await this.get<{ results: APAirport[] } | APAirport[]>(
      `/airports/?search=${encodeURIComponent(query)}&limit=10`,
    )
    return Array.isArray(data) ? data : (data.results ?? [])
  }

  // ── Flight calculator — route distance + time estimate ───────────────────────

  async calculateFlight(params: {
    from:       string
    to:         string
    passengers: number
    date?:      string
  }): Promise<APFlightCalculatorResult> {
    const qs = new URLSearchParams({
      from:       params.from,
      to:         params.to,
      passengers: String(params.passengers),
    })
    if (params.date) qs.set('date', params.date)
    return this.get<APFlightCalculatorResult>(`/flight_calculator/?${qs}`)
  }

  // ── Charter search — available aircraft for a route ──────────────────────────

  async searchCharters(params: APCharterSearchParams): Promise<APCharterSearchResult[]> {
    const qs = new URLSearchParams({
      from:       params.from,
      to:         params.to,
      date:       params.date,
      passengers: String(params.passengers),
    })
    if (params.aircraft_category) qs.set('aircraft_category', params.aircraft_category)
    const data = await this.get<{ results: APCharterSearchResult[] } | APCharterSearchResult[]>(
      `/charter_searches/?${qs}`,
    )
    return Array.isArray(data) ? data : (data.results ?? [])
  }

  // ── Charter price range ──────────────────────────────────────────────────────

  async getCharterPrices(from: string, to: string): Promise<APCharterPrice[]> {
    const data = await this.get<{ results: APCharterPrice[] } | APCharterPrice[]>(
      `/charter_prices/?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    )
    return Array.isArray(data) ? data : (data.results ?? [])
  }

  // ── Quote request — creates a charter_quote_request ─────────────────────────
  // NOTE: free tier limit is 30 — use sparingly, only after payment intent.

  async createQuoteRequest(payload: APQuoteRequestPayload): Promise<APQuoteRequestResponse> {
    return this.post<APQuoteRequestResponse>('/charter_quote_requests/', payload)
  }

  // ── HTTP primitives ─────────────────────────────────────────────────────────

  private buildHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,   // never logged
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'X-Client':      'walz-concierge/1.0',
    }
  }

  private async get<T>(path: string): Promise<T> {
    const url        = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), this.timeoutMs)

    console.info(`[Aviapages] GET ${path}`)

    try {
      const res = await fetch(url, {
        method:  'GET',
        headers: this.buildHeaders(),
        signal:  controller.signal,
      })

      if (!res.ok) {
        let body: unknown
        try { body = await res.json() } catch { body = {} }
        const msg = (body as Record<string, unknown>)?.detail
          ?? (body as Record<string, unknown>)?.message
          ?? `HTTP ${res.status}`
        throw new Error(`[Aviapages] GET ${path} failed: ${msg}`)
      }

      return res.json() as Promise<T>
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new Error(`[Aviapages] GET ${path} timed out after ${this.timeoutMs}ms`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url        = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), this.timeoutMs)

    console.info(`[Aviapages] POST ${path}`)

    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: this.buildHeaders(),
        body:    JSON.stringify(body),
        signal:  controller.signal,
      })

      if (!res.ok) {
        let errBody: unknown
        try { errBody = await res.json() } catch { errBody = {} }
        const msg = (errBody as Record<string, unknown>)?.detail
          ?? (errBody as Record<string, unknown>)?.message
          ?? `HTTP ${res.status}`
        throw new Error(`[Aviapages] POST ${path} failed: ${msg}`)
      }

      return res.json() as Promise<T>
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new Error(`[Aviapages] POST ${path} timed out after ${this.timeoutMs}ms`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}
