// server-only — authenticated HTTP client for the Aviapages Charter API v3.
// Security: API key is never logged, never returned, never goes near the browser.

import type { AviapagesConfig } from './config'
import type {
  APAirport,
  APFlightCalculatorResult,
  APCharterPriceRequest,
  APCharterPriceResponse,
  APCharterSearchAircraftRequest,
  APCharterSearchAircraftResult,
  APQuoteRequestBody,
  APQuoteRequestResponse,
  APEmptyLeg,
  APAircraftCategory,
} from './types'
import { AP_AC_CLASS as AC_CLASS_MAP } from './types'

const MAX_RETRIES       = 3
const RETRY_BASE_MS     = 500

// Date helper: YYYY-MM-DD or any ISO string → YYYY-MM-DDThh:mm (no seconds, no TZ)
// The API validation error is explicit: "Use one of these formats: YYYY-MM-DDThh:mm"
export function fmtDatetime(d: string, defaultTime = '10:00'): string {
  if (!d) return ''
  if (d.length === 10) return `${d}T${defaultTime}`   // YYYY-MM-DD only
  return d.slice(0, 16)                                // trim seconds/ms/TZ
}

// Airport code → object format used by charter_prices / charter_search / quote_requests
// ICAO = 4 chars, IATA = 3 chars
export function icaoOrIata(code: string): { icao?: string; iata?: string } {
  const c = code.trim().toUpperCase()
  return c.length === 4 ? { icao: c } : { iata: c }
}

export function acClass(category?: APAircraftCategory): string {
  return category ? AC_CLASS_MAP[category] ?? 'Heavy' : 'Heavy'
}

export class AviapagesClient {
  private readonly baseUrl:   string
  private readonly timeoutMs: number

  constructor(private readonly config: AviapagesConfig) {
    this.baseUrl   = config.baseUrl
    this.timeoutMs = config.timeoutMs
  }

  // ── Airport search ──────────────────────────────────────────────────────────
  // GET /v3/airports/?search=<query>
  // Response: paginated envelope { results: APAirport[] }

  async searchAirports(query: string): Promise<APAirport[]> {
    const data = await this.get<{ results?: APAirport[] }>(
      `/airports/?search=${encodeURIComponent(query)}&limit=10`,
    )
    return data.results ?? []
  }

  // ── Flight calculator ───────────────────────────────────────────────────────
  // POST /v3/flight_calculator/
  // Airport format: plain string (ICAO or IATA) — NOT an object.
  // All output fields are opt-in via boolean flags.
  // Returns HTTP 200 even on errors — always check result.errors[].

  async calculateFlight(params: {
    from:       string    // ICAO or IATA string
    to:         string
    aircraft?:  string    // model name, defaults to "Global 6000"
    pax?:       number
    datetime?:  string    // YYYY-MM-DD or YYYY-MM-DDThh:mm
  }): Promise<APFlightCalculatorResult> {
    return this.post<APFlightCalculatorResult>('/flight_calculator/', {
      departure_airport: params.from.toUpperCase(),
      arrival_airport:   params.to.toUpperCase(),
      aircraft:          params.aircraft ?? 'Global 6000',
      pax:               params.pax ?? 1,
      ...(params.datetime && { departure_datetime: fmtDatetime(params.datetime) }),
      // All output fields are opt-in
      airway_time_weather_impacted:             true,
      airway_distance:                          true,
      arrival_datetime:                         !!params.datetime,
      airway_carbon_emissions_weather_impacted: true,
      advise_techstops:                         true,
    })
  }

  // ── Charter price estimate ──────────────────────────────────────────────────
  // POST /v3/charter_prices/
  // range: true → price_min + price_max for an honest "est. £X–£Y" display.
  // Airport format: OBJECT { icao } or { iata }.

  async getCharterPrices(params: {
    from:       string
    to:         string
    pax:        number
    datetime:   string
    category?:  APAircraftCategory
    currency?:  string
  }): Promise<APCharterPriceResponse> {
    const body: APCharterPriceRequest = {
      legs: [{
        departure_airport:  icaoOrIata(params.from),
        arrival_airport:    icaoOrIata(params.to),
        pax:                params.pax,
        departure_datetime: fmtDatetime(params.datetime),
      }],
      aircraft:      [{ ac_class: acClass(params.category) }],
      currency_code: params.currency ?? 'USD',
      range:         true,
    }
    return this.post<APCharterPriceResponse>('/charter_prices/', body)
  }

  // ── Charter search ──────────────────────────────────────────────────────────
  // POST /v3/charter_search_aircraft/  (replaces deprecated /charter_searches/)
  // Airport format: OBJECT. Response: paginated { results: [...] } or bare array.

  async searchCharters(params: {
    from:       string
    to:         string
    datetime:   string
    pax:        number
    category?:  APAircraftCategory
  }): Promise<APCharterSearchAircraftResult[]> {
    const body: APCharterSearchAircraftRequest = {
      legs: [{
        departure_airport:  icaoOrIata(params.from),
        arrival_airport:    icaoOrIata(params.to),
        pax:                params.pax,
        departure_datetime: fmtDatetime(params.datetime),
      }],
      ...(params.category && { aircraft: [{ ac_class: acClass(params.category) }] }),
    }
    const data = await this.post<
      { results?: APCharterSearchAircraftResult[] } | APCharterSearchAircraftResult[]
    >('/charter_search_aircraft/', body)
    return Array.isArray(data) ? data : (data.results ?? [])
  }

  // ── Charter quote request ───────────────────────────────────────────────────
  // POST /v3/charter_quote_requests/
  // post_to_trip_board MUST be false — true publishes client data to public board.
  // channels: ["Email"] only — "Fos"/"Telegram" in docs example are not in the spec enum.

  async createQuoteRequest(body: APQuoteRequestBody): Promise<APQuoteRequestResponse> {
    return this.post<APQuoteRequestResponse>('/charter_quote_requests/', {
      ...body,
      post_to_trip_board: false,   // hard override — must never be true
      send_to_self:       false,
      channels:           ['Email'],
    })
  }

  // ── Empty legs ──────────────────────────────────────────────────────────────
  // GET /v3/empty_legs/
  // has_price=true and has_arrival_airport=true are effectively mandatory
  // to get useful records. company + registration_number are stripped by adapter.

  async getEmptyLegs(params: {
    depCountries?: string    // ISO alpha-2 codes, comma-separated e.g. "GB,AE,FR"
    arrCountries?: string    // e.g. "NG,GH"
    fromDate?:     string    // YYYY-MM-DDThh:mm
    toDate?:       string
  }): Promise<APEmptyLeg[]> {
    const qs = new URLSearchParams({
      has_price:           'true',
      has_arrival_airport: 'true',
      ordering:            'dep_date_utc',
    })
    if (params.depCountries) qs.set('dep_airport_country_iso_alpha2_in', params.depCountries)
    if (params.arrCountries) qs.set('arr_airport_country_iso_alpha2_in', params.arrCountries)
    if (params.fromDate)     qs.set('from_date_utc', params.fromDate)
    if (params.toDate)       qs.set('to_date_utc',   params.toDate)

    const data = await this.get<{ results?: APEmptyLeg[] }>(`/empty_legs/?${qs}`)
    return data.results ?? []
  }

  // ── HTTP primitives ─────────────────────────────────────────────────────────

  private buildHeaders(): Record<string, string> {
    return {
      // Spec: apiKey with prefix "Token " (not "Bearer", not "AUTH-TOKEN")
      'Authorization': `Token ${this.config.apiKey}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'X-Client':      'walz-concierge/1.0',
    }
  }

  private async get<T>(path: string, attempt = 1): Promise<T> {
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

      if (res.status === 429) {
        return this.handle429<T>(res, path, () => this.get<T>(path, attempt + 1), attempt)
      }

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

  private async post<T>(path: string, body: unknown, attempt = 1): Promise<T> {
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

      if (res.status === 429) {
        return this.handle429<T>(res, path, () => this.post<T>(path, body, attempt + 1), attempt)
      }

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

  // 429 handling: monthly limit (circuit-break) vs per-minute throttle (retry)
  private async handle429<T>(
    res:     Response,
    path:    string,
    retry:   () => Promise<T>,
    attempt: number,
  ): Promise<T> {
    let detail = ''
    try {
      const body = await res.json() as Record<string, unknown>
      detail = String(body?.detail ?? '')
    } catch { /* ignore */ }

    if (detail.includes('Monthly API limit exceeded')) {
      // Non-retryable — alert ops, circuit-break
      console.error('[Aviapages] MONTHLY API LIMIT EXCEEDED — ops must rotate plan or wait for reset')
      throw new Error('[Aviapages] Monthly API rate limit exceeded. Please contact support.')
    }

    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1)
      console.warn(`[Aviapages] 429 throttled on ${path} — retry in ${delay}ms (attempt ${attempt})`)
      await sleep(delay)
      return retry()
    }

    throw new Error(`[Aviapages] Rate limited on ${path} after ${attempt} attempts: ${detail}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
