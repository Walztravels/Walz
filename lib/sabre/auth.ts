import redis, { CACHE_KEYS } from '@/lib/redis'

const SABRE_ENV = process.env.SABRE_ENV || 'cert'
const SABRE_BASE_URL =
  SABRE_ENV === 'prod'
    ? 'https://api.sabre.com'
    : 'https://api.cert.sabre.com'

export class SabreError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public sabreCode?: string
  ) {
    super(message)
    this.name = 'SabreError'
  }
}

interface SabreTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export async function getSabreToken(): Promise<string> {
  const cached = await redis.get(CACHE_KEYS.sabreToken)
  if (cached) return cached

  const clientId = process.env.SABRE_CLIENT_ID
  const clientSecret = process.env.SABRE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new SabreError('Sabre credentials not configured')
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch(`${SABRE_BASE_URL}/v2/auth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new SabreError(
      `Failed to obtain Sabre token: ${errorText}`,
      response.status
    )
  }

  const data = (await response.json()) as SabreTokenResponse
  const token = data.access_token

  // Cache with 60s buffer before expiry
  const ttl = data.expires_in - 60
  await redis.setex(CACHE_KEYS.sabreToken, ttl, token)

  return token
}

export async function sabreRequest<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: unknown
    headers?: Record<string, string>
  } = {}
): Promise<T> {
  const token = await getSabreToken()

  const { method = 'GET', body, headers = {} } = options

  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...headers,
  }

  const requestInit: RequestInit = {
    method,
    headers: requestHeaders,
  }

  if (body) {
    requestInit.body = JSON.stringify(body)
  }

  const url = `${SABRE_BASE_URL}${endpoint}`

  const response = await fetch(url, requestInit)

  if (!response.ok) {
    let errorMessage = `Sabre API error: ${response.status} ${response.statusText}`
    let sabreCode: string | undefined

    try {
      const errorData = await response.json() as { message?: string; code?: string }
      errorMessage = errorData.message || errorMessage
      sabreCode = errorData.code
    } catch {
      // Ignore JSON parse errors on error responses
    }

    throw new SabreError(errorMessage, response.status, sabreCode)
  }

  const data = await response.json() as T
  return data
}

export { SABRE_BASE_URL }
