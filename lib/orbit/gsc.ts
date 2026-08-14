/**
 * Google Search Console API adapter (service account auth).
 *
 * Service account JSON stored in orbit_integrations where id = 'google_search_console', meta.serviceAccountJson
 *
 * One-time setup:
 *   1. GCP Console → IAM → Service Accounts → Create → Download JSON key
 *   2. GSC → Settings → Users and permissions → Add user → paste service account email → Full
 *   3. Paste the JSON key content into Orbit → Integrations → Google Search Console
 */

export interface GscPageData {
  url: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface ServiceAccount {
  client_email: string
  private_key: string
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function buildJwt(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))
  const unsigned = `${enc(header)}.${enc(claim)}`

  const pem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')
  const keyBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  )

  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned))
  return `${unsigned}.${b64url(sig)}`
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const jwt = await buildJwt(sa)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GSC token error ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json() as { access_token: string }
  return data.access_token
}

export async function getPageMetrics(opts: {
  serviceAccountJson: string
  siteUrl: string
  startDate: string
  endDate: string
  pageLimit?: number
}): Promise<GscPageData[]> {
  let sa: ServiceAccount
  try {
    sa = JSON.parse(opts.serviceAccountJson) as ServiceAccount
    if (!sa.client_email || !sa.private_key) throw new Error('missing fields')
  } catch {
    throw new Error('Invalid service account JSON — expected {client_email, private_key}')
  }

  const token = await getAccessToken(sa)
  const encoded = encodeURIComponent(opts.siteUrl)

  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: opts.startDate,
        endDate: opts.endDate,
        dimensions: ['page'],
        rowLimit: opts.pageLimit ?? 500,
        dataState: 'final',
      }),
    },
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GSC API error ${res.status}: ${body.slice(0, 200)}`)
  }

  type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }
  const data = await res.json() as { rows?: GscRow[] }

  return (data.rows ?? []).map(r => ({
    url:         r.keys[0],
    clicks:      r.clicks,
    impressions: r.impressions,
    ctr:         r.ctr,
    position:    r.position,
  }))
}
