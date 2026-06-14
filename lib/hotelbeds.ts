import crypto from 'crypto'

type HotelbedsAPI = 'hotel' | 'activities' | 'transfers'

const CREDENTIALS: Record<HotelbedsAPI, { key: string; secret: string }> = {
  hotel: {
    key:    process.env.HOTELBEDS_HOTEL_API_KEY!,
    secret: process.env.HOTELBEDS_HOTEL_SECRET!,
  },
  activities: {
    key:    process.env.HOTELBEDS_ACTIVITIES_API_KEY!,
    secret: process.env.HOTELBEDS_ACTIVITIES_SECRET!,
  },
  transfers: {
    key:    process.env.HOTELBEDS_TRANSFERS_API_KEY!,
    secret: process.env.HOTELBEDS_TRANSFERS_SECRET!,
  },
}

// Switch to production URLs before certification sign-off
const BASE_URLS: Record<HotelbedsAPI, string> = {
  hotel:      'https://api.test.hotelbeds.com/hotel-api/1.0',
  activities: 'https://api.test.hotelbeds.com/activity-api/1.0',
  transfers:  'https://api.test.hotelbeds.com/transfer-api/1.0',
}

function makeSignature(api: HotelbedsAPI): string {
  const { key, secret } = CREDENTIALS[api]
  const timestamp = Math.floor(Date.now() / 1000).toString()
  return crypto.createHash('sha256').update(key + secret + timestamp).digest('hex')
}

export async function hotelbedsRequest(
  api: HotelbedsAPI,
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<any> {
  const { key } = CREDENTIALS[api]
  const signature = makeSignature(api)
  const method = opts.method ?? 'GET'
  const url = `${BASE_URLS[api]}${path}`

  const res = await fetch(url, {
    method,
    headers: {
      'Api-key':     key,
      'X-Signature': signature,
      'Accept':      'application/json',
      'Content-Type': 'application/json',
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hotelbeds ${api} ${method} ${path} → ${res.status}: ${text}`)
  }

  return res.json()
}
