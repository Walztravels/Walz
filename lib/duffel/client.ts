const BASE = 'https://api.duffel.com'
const DUFFEL_VERSION = 'v2'

// ── Typed Duffel API error ─────────────────────────────────────────────────────

interface DuffelErrorDetail {
  type: string          // e.g. "airline_error", "validation_error"
  code: string          // e.g. "airline_internal", "offer_no_longer_available"
  title: string
  message: string
  source?: string       // e.g. "british_airways"
  documentation_url?: string
}

interface DuffelErrorResponse {
  errors: DuffelErrorDetail[]
  meta?: { status: number; request_id: string }
}

export class DuffelApiError extends Error {
  readonly status: number
  readonly errors: DuffelErrorDetail[]
  readonly requestId?: string

  constructor(status: number, body: DuffelErrorResponse, path: string, method: string) {
    const primary = body.errors[0]
    super(
      primary
        ? `Duffel [${status}] ${method} ${path}: ${primary.title} — ${primary.message}`
        : `Duffel [${status}] ${method} ${path}`
    )
    this.name = 'DuffelApiError'
    this.status = status
    this.errors = body.errors ?? []
    this.requestId = body.meta?.request_id
  }

  /** True if the primary error is a transient airline-side issue worth retrying */
  get isTransientAirlineError(): boolean {
    const e = this.errors[0]
    return e?.type === 'airline_error' && ['airline_internal', 'airline_timeout'].includes(e.code)
  }

  /** True when the offer has expired or been taken by another passenger */
  get isOfferExpired(): boolean {
    return this.errors.some(
      (e) =>
        e.code === 'offer_no_longer_available' ||
        e.code === 'offer_expired' ||
        e.title?.toLowerCase().includes('no longer available')
    )
  }

  /** True when the Duffel account balance is insufficient */
  get isInsufficientBalance(): boolean {
    return this.errors.some((e) => e.code === 'insufficient_balance')
  }

  /** Human-readable summary of the primary error */
  get primaryMessage(): string {
    return this.errors[0]?.message ?? this.message
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const token = process.env.DUFFEL_ACCESS_TOKEN
  if (!token) throw new Error('DUFFEL_ACCESS_TOKEN is not set')
  return {
    Authorization: `Bearer ${token}`,
    'Duffel-Version': DUFFEL_VERSION,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip',
  }
}

async function throwIfError(res: Response, method: string, path: string): Promise<void> {
  if (res.ok) return
  let body: DuffelErrorResponse | null = null
  try {
    body = await res.json() as DuffelErrorResponse
  } catch { /* fall through */ }

  if (body?.errors?.length) {
    throw new DuffelApiError(res.status, body, path, method)
  }
  throw new Error(`Duffel [${res.status}] ${method} ${path}: ${res.statusText}`)
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── Public API ────────────────────────────────────────────────────────────────

export async function duffelGet<T>(
  path: string,
  query?: Record<string, string>
): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), { headers: getHeaders() })
  await throwIfError(res, 'GET', path)
  return res.json() as Promise<T>
}

export async function duffelPost<T>(
  path: string,
  body: unknown,
  query?: Record<string, string>
): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })
  await throwIfError(res, 'POST', path)
  return res.json() as Promise<T>
}

export async function duffelPatch<T>(
  path: string,
  body: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })
  await throwIfError(res, 'PATCH', path)
  return res.json() as Promise<T>
}

/**
 * Wraps `duffelPost` with a single automatic retry for transient airline errors.
 * Use this for order creation where the airline's system may be momentarily unavailable.
 */
export async function duffelPostWithRetry<T>(
  path: string,
  body: unknown,
  query?: Record<string, string>,
  retryDelayMs = 3000
): Promise<T> {
  try {
    return await duffelPost<T>(path, body, query)
  } catch (err) {
    if (err instanceof DuffelApiError && err.isTransientAirlineError) {
      console.warn(`[Duffel] Transient airline error on ${path} — retrying in ${retryDelayMs}ms`)
      await delay(retryDelayMs)
      return duffelPost<T>(path, body, query) // let the second failure propagate
    }
    throw err
  }
}
