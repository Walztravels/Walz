/**
 * Viator Partner API v2 — minimal client
 *
 * Base URLs (from official OpenAPI spec):
 *   Sandbox:    https://api.sandbox.viator.com/partner
 *   Production: https://api.viator.com/partner
 *
 * Auth:    exp-api-key header
 * Version: Accept: application/json;version=2.0 (required on every request)
 */

const BASE_URL =
  process.env.VIATOR_API_ENV === 'production'
    ? 'https://api.viator.com/partner'
    : 'https://api.sandbox.viator.com/partner'

function viatorHeaders(): HeadersInit {
  const key = process.env.VIATOR_API_KEY
  if (!key) throw new Error('VIATOR_API_KEY is not set')
  return {
    'exp-api-key':    key,
    'Accept':         'application/json;version=2.0',
    'Accept-Language': 'en-US',
    'Content-Type':   'application/json;version=2.0',
  }
}

/** POST wrapper — resolves to the parsed JSON body */
async function viatorPost<T = unknown>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: viatorHeaders(),
    body: JSON.stringify(body),
  })
  const data = await res.json() as T
  return { status: res.status, data }
}

/**
 * Connectivity probe — calls POST /products/search with the minimum valid body:
 *   - filtering.destination is required (77 = London, a reliable sandbox destination)
 *   - currency is required
 *   - pagination.count: 3 — enough to inspect the response shape without hitting rate limits
 *
 * Returns the raw API response so the caller can log or inspect it.
 */
export async function viatorTestConnection() {
  return viatorPost('/products/search', {
    filtering: {
      destination: '77', // London — active sandbox destination with plenty of products
    },
    sorting: {
      sort:  'POPULARITY',
      order: 'DESCENDING',
    },
    pagination: {
      start: 1,
      count: 3,
    },
    currency: 'GBP',
  })
}
