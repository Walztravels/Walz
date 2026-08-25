// Viator Partner API v2 — full client
// Auth: exp-api-key header (NO Bearer prefix)
// Version: Accept: application/json;version=2.0 (required on every request)

const BASE_URL =
  process.env.VIATOR_API_ENV === 'production'
    ? 'https://api.viator.com/partner'
    : 'https://api.sandbox.viator.com/partner'

export function viatorHeaders(): HeadersInit {
  const key = process.env.VIATOR_API_KEY
  if (!key) throw new Error('VIATOR_API_KEY is not set')
  return {
    'exp-api-key':     key,
    'Accept':          'application/json;version=2.0',
    'Accept-Language': 'en-US',
    'Content-Type':    'application/json;version=2.0',
  }
}

export async function viatorPost<T = unknown>(
  path: string,
  body: unknown,
): Promise<{ status: number; data: T }> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    method:  'POST',
    headers: viatorHeaders(),
    body:    JSON.stringify(body),
  })
  const data = await res.json() as T
  return { status: res.status, data }
}

export async function viatorGet<T = unknown>(path: string): Promise<{ status: number; data: T }> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    method:  'GET',
    headers: viatorHeaders(),
  })
  const data = await res.json() as T
  return { status: res.status, data }
}

/** Connectivity probe — London, 3 products */
export async function viatorTestConnection() {
  return viatorPost('/products/search', {
    filtering:  { destination: '77' },
    pagination: { start: 1, count: 3 },
    currency:   'GBP',
  })
}
