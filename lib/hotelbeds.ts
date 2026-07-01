import crypto from 'crypto'

type HotelbedsAPI = 'hotel' | 'content' | 'activities' | 'activities-cache' | 'activities-content' | 'transfers' | 'transfers-cache'

const CREDENTIALS: Record<HotelbedsAPI, { key: string; secret: string }> = {
  hotel: {
    key:    process.env.HOTELBEDS_HOTEL_API_KEY!,
    secret: process.env.HOTELBEDS_HOTEL_SECRET!,
  },
  content: {
    key:    process.env.HOTELBEDS_HOTEL_API_KEY!,
    secret: process.env.HOTELBEDS_HOTEL_SECRET!,
  },
  activities: {
    key:    process.env.HOTELBEDS_ACTIVITIES_API_KEY!,
    secret: process.env.HOTELBEDS_ACTIVITIES_SECRET!,
  },
  'activities-cache': {
    key:    process.env.HOTELBEDS_ACTIVITIES_API_KEY!,
    secret: process.env.HOTELBEDS_ACTIVITIES_SECRET!,
  },
  'activities-content': {
    key:    process.env.HOTELBEDS_ACTIVITIES_API_KEY!,
    secret: process.env.HOTELBEDS_ACTIVITIES_SECRET!,
  },
  transfers: {
    key:    process.env.HOTELBEDS_TRANSFERS_API_KEY ?? '3bc0e240098af5c828736f59bf7ecbf2',
    secret: process.env.HOTELBEDS_TRANSFERS_SECRET  ?? 'wMfgvPkvyl',
  },
  'transfers-cache': {
    key:    process.env.HOTELBEDS_TRANSFERS_API_KEY ?? '3bc0e240098af5c828736f59bf7ecbf2',
    secret: process.env.HOTELBEDS_TRANSFERS_SECRET  ?? 'wMfgvPkvyl',
  },
}

const BASE_URLS: Record<HotelbedsAPI, string> = {
  hotel:                'https://api.test.hotelbeds.com/hotel-api/1.0',
  content:              'https://api.test.hotelbeds.com/hotel-content-api/1.0',
  activities:           'https://api.test.hotelbeds.com/activity-booking-api/1.0',
  'activities-cache':   'https://api.test.hotelbeds.com/activity-cache-api/1.0',
  'activities-content': 'https://api.test.hotelbeds.com/activity-content-api/3.0',
  transfers:            'https://api.test.hotelbeds.com/transfer-api/1.0',
  'transfers-cache':    'https://api.test.hotelbeds.com/transfer-cache-api/1.0',
}

function makeSignature(api: HotelbedsAPI): string {
  const { key, secret } = CREDENTIALS[api]
  const timestamp = Math.floor(Date.now() / 1000).toString()
  return crypto.createHash('sha256').update(key + secret + timestamp).digest('hex')
}

export async function hotelbedsRequest(
  api: HotelbedsAPI,
  path: string,
  opts: { method?: string; body?: unknown; params?: Record<string, string | number | string[] | undefined> } = {},
): Promise<any> {
  const { key } = CREDENTIALS[api]
  const signature = makeSignature(api)
  const method = opts.method ?? 'GET'

  let url = `${BASE_URLS[api]}${path}`
  if (opts.params) {
    const qs = new URLSearchParams(
      Object.entries(opts.params)
        .filter(([, v]) => v !== undefined && v !== null)
        .flatMap(([k, v]) => Array.isArray(v) ? v.map(item => [k, String(item)]) : [[k, String(v)]])
    )
    url += `?${qs.toString()}`
  }

  const res = await fetch(url, {
    method,
    headers: {
      'Api-key':         key,
      'X-Signature':     signature,
      'Accept':          'application/json',
      'Accept-Encoding': 'gzip',
      'Content-Type':    'application/json',
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hotelbeds ${api} ${method} ${path} → ${res.status}: ${text}`)
  }

  return res.json()
}
