// server-only — authenticated HTTP client for the ComfortPass B2B Partner API.
// Security: AUTH-TOKEN is never logged, never returned, never goes near the browser.

import { randomUUID } from 'crypto'
import {
  ComfortPassError,
  ComfortPassTimeoutError,
  ComfortPassRateLimitError,
  parseApiError,
} from './errors'
import type { ComfortPassConfig } from './config'
import type {
  CPAirport, CPService, CPPrice,
  CPBookingRequest, CPBookingResponse,
  CPVoucher, CPBalance,
  CPBaggageCatalogue, CPBaggageQuoteRequest, CPBaggageQuote,
} from './types'

const MAX_GET_RETRIES = 3
const RETRY_BACKOFF_BASE_MS = 500

/**
 * ComfortPass responses are inconsistently enveloped. Unwrap a list from
 * whatever shape arrives rather than assuming one key. Exported for unit tests.
 */
export function unwrapList<T>(payload: unknown, ...keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    // Check preferred keys first, then common generic envelope keys
    for (const k of [...keys, 'data', 'results', 'items', 'payload', 'list']) {
      if (Array.isArray(obj[k])) return obj[k] as T[]
    }
    // One level of nesting: { data: { airports: [...] } }
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const k of keys) {
          const nested = (v as Record<string, unknown>)[k]
          if (Array.isArray(nested)) return nested as T[]
        }
      }
    }
  }
  return []
}

export class ComfortPassClient {
  private readonly baseUrl:   string
  private readonly timeoutMs: number

  // apiKey is deliberately NOT stored as a property that can be serialised
  // or accidentally logged through `JSON.stringify(client)`.
  constructor(private readonly config: ComfortPassConfig) {
    this.baseUrl   = config.baseUrl
    this.timeoutMs = config.timeoutMs
  }

  // ── Airport search ──────────────────────────────────────────────────────────

  async searchAirports(query: string): Promise<CPAirport[]> {
    const raw = await this.get<unknown>(`/airports?q=${encodeURIComponent(query)}`)
    const list = unwrapList<CPAirport>(raw, 'airports')
    if (list.length === 0) {
      console.warn(`[ComfortPass] searchAirports: empty result for query="${query}" — check envelope shape`, raw)
    }
    return list
  }

  // ── Service search ──────────────────────────────────────────────────────────

  async searchServices(params: {
    q?:          string
    airport?:    string
    date?:       string
    passengers?: number
  }): Promise<CPService[]> {
    const qs = new URLSearchParams()
    if (params.q)          qs.set('q',          params.q)
    if (params.airport)    qs.set('airport',    params.airport)
    if (params.date)       qs.set('date',       params.date)
    if (params.passengers) qs.set('passengers', String(params.passengers))
    const raw = await this.get<unknown>(`/services?${qs.toString()}`)
    const list = unwrapList<CPService>(raw, 'services', 'packages')
    if (list.length === 0) {
      console.warn(`[ComfortPass] searchServices: empty result for params=${JSON.stringify(params)} — check envelope shape`, raw)
    }
    return list
  }

  // getService removed: no such endpoint in the ComfortPass API

  // ── Pricing ─────────────────────────────────────────────────────────────────

  async getPrice(serviceCode: string): Promise<CPPrice> {
    return this.get<CPPrice>(`/prices?code=${encodeURIComponent(serviceCode)}`)
  }

  // ── Baggage ─────────────────────────────────────────────────────────────────

  async getBaggageCatalogue(): Promise<CPBaggageCatalogue> {
    return this.get<CPBaggageCatalogue>('/baggage/catalog')
  }

  async getBaggageQuote(params: CPBaggageQuoteRequest): Promise<CPBaggageQuote> {
    const qs = new URLSearchParams({
      countryId:      params.countryId,
      cityId:         params.cityId,
      serviceTypeId:  params.serviceTypeId,
      deliveryTypeId: params.deliveryTypeId,
      bags:           String(params.bags),
    })
    return this.get<CPBaggageQuote>(`/baggage/quote?${qs.toString()}`)
  }

  // ── Bookings ────────────────────────────────────────────────────────────────

  // POST /bookings: NEVER retried — a duplicate call creates a duplicate booking.
  async createBooking(payload: CPBookingRequest): Promise<CPBookingResponse> {
    return this.postOnce<CPBookingResponse>('/bookings', payload)
  }

  async getBooking(cpBookingId: string): Promise<CPBookingResponse> {
    return this.get<CPBookingResponse>(`/bookings/${encodeURIComponent(cpBookingId)}`)
  }

  // ── Voucher ─────────────────────────────────────────────────────────────────

  async getVoucher(cpBookingId: string): Promise<CPVoucher> {
    return this.get<CPVoucher>(`/bookings/${encodeURIComponent(cpBookingId)}/voucher`)
  }

  // ── Account ─────────────────────────────────────────────────────────────────

  async getBalance(): Promise<CPBalance> {
    return this.get<CPBalance>('/account/balance')
  }

  // ── HTTP primitives ─────────────────────────────────────────────────────────

  private buildHeaders(correlationId: string): Record<string, string> {
    return {
      'AUTH-TOKEN':     this.config.apiKey,   // never logged
      'Content-Type':   'application/json',
      'Accept':         'application/json',
      'X-Correlation-Id': correlationId,
      'X-Client':       'walz-concierge/1.0',
    }
  }

  // GET with exponential backoff retry on 429
  private async get<T>(path: string, attempt = 1): Promise<T> {
    const correlationId = randomUUID()
    const url           = `${this.baseUrl}${path}`
    const controller    = new AbortController()
    const timer         = setTimeout(() => controller.abort(), this.timeoutMs)

    console.info(`[ComfortPass] GET ${path} attempt=${attempt} cid=${correlationId}`)

    try {
      const res = await fetch(url, {
        method:  'GET',
        headers: this.buildHeaders(correlationId),
        signal:  controller.signal,
      })

      if (res.status === 429 && attempt < MAX_GET_RETRIES) {
        const delay = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt - 1)
        console.warn(`[ComfortPass] 429 on GET ${path} — retry in ${delay}ms`)
        await sleep(delay)
        return this.get<T>(path, attempt + 1)
      }

      if (!res.ok) {
        let body: unknown
        try { body = await res.json() } catch { body = {} }
        throw parseApiError(body, res.status)
      }

      return res.json() as Promise<T>
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new ComfortPassTimeoutError('GET', path)
      }
      if (err instanceof ComfortPassError) throw err
      throw new ComfortPassError(
        `ComfortPass GET ${path} failed: ${(err as Error).message}`,
        'CP_NETWORK_ERROR',
        undefined,
        true,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  // POST with retry for non-booking endpoints (quotes, baggage)
  private async post<T>(path: string, body: unknown, attempt = 1): Promise<T> {
    const correlationId = randomUUID()
    const url           = `${this.baseUrl}${path}`
    const controller    = new AbortController()
    const timer         = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: this.buildHeaders(correlationId),
        body:    JSON.stringify(body),
        signal:  controller.signal,
      })

      if (res.status === 429 && attempt < MAX_GET_RETRIES) {
        const delay = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt - 1)
        await sleep(delay)
        return this.post<T>(path, body, attempt + 1)
      }

      if (!res.ok) {
        let errBody: unknown
        try { errBody = await res.json() } catch { errBody = {} }
        throw parseApiError(errBody, res.status)
      }

      return res.json() as Promise<T>
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new ComfortPassTimeoutError('POST', path)
      }
      if (err instanceof ComfortPassError) throw err
      throw new ComfortPassError(
        `ComfortPass POST ${path} failed: ${(err as Error).message}`,
        'CP_NETWORK_ERROR',
        undefined,
        false,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  // POST once — for /bookings specifically. No retry at all.
  // A timeout here is stored as 'manual_review' by the adapter.
  private async postOnce<T>(path: string, body: unknown): Promise<T> {
    const correlationId = randomUUID()
    const url           = `${this.baseUrl}${path}`
    const controller    = new AbortController()
    const timer         = setTimeout(() => controller.abort(), this.timeoutMs)

    console.info(`[ComfortPass] POST ${path} once cid=${correlationId}`)

    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: this.buildHeaders(correlationId),
        body:    JSON.stringify(body),
        signal:  controller.signal,
      })

      if (!res.ok) {
        let errBody: unknown
        try { errBody = await res.json() } catch { errBody = {} }
        throw parseApiError(errBody, res.status)
      }

      return res.json() as Promise<T>
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new ComfortPassTimeoutError('POST', path)
      }
      if (err instanceof ComfortPassError) throw err
      throw new ComfortPassError(
        `ComfortPass POST ${path} failed: ${(err as Error).message}`,
        'CP_NETWORK_ERROR',
        undefined,
        false,
      )
    } finally {
      clearTimeout(timer)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
