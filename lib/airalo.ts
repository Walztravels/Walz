/**
 * Airalo Partner API client.
 * Handles OAuth2 token management (client_credentials, 24-hour TTL)
 * and typed wrappers for GET / POST endpoints.
 *
 * Base URL: https://partners-api.airalo.com/v2
 * Auth:     POST /token → Bearer token
 */

const AIRALO_BASE = 'https://partners-api.airalo.com/v2'

// ── In-process token cache (per server instance) ──────────────────────────────
let _token: { value: string; expiresAt: number } | null = null

export async function getAiraloToken(): Promise<string> {
  // Return cached token if still valid (with 60 s buffer)
  if (_token && _token.expiresAt > Date.now() + 60_000) {
    return _token.value
  }

  const res = await fetch(`${AIRALO_BASE}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.AIRALO_CLIENT_ID,
      client_secret: process.env.AIRALO_CLIENT_SECRET,
      grant_type:    'client_credentials',
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Airalo auth failed: ${res.status} — ${text}`)
  }

  const json = await res.json() as {
    data: { access_token: string; expires_in: number; token_type: string }
    meta: { message: string }
  }

  const token     = json.data.access_token
  const expiresIn = json.data.expires_in // seconds (86400 = 24 h)
  _token = { value: token, expiresAt: Date.now() + expiresIn * 1000 }
  return token
}

async function airaloHeaders() {
  const token = await getAiraloToken()
  return { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }
}

// ── GET helper ────────────────────────────────────────────────────────────────
export async function airaloGet<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${AIRALO_BASE}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v))
    }
  }

  const res = await fetch(url.toString(), {
    headers: await airaloHeaders(),
    cache:   'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Airalo GET ${path}: ${res.status} — ${text}`)
  }

  return res.json() as Promise<T>
}

// ── POST helper ───────────────────────────────────────────────────────────────
export async function airaloPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${AIRALO_BASE}${path}`, {
    method:  'POST',
    headers: await airaloHeaders(),
    body:    JSON.stringify(body),
    cache:   'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Airalo POST ${path}: ${res.status} — ${text}`)
  }

  return res.json() as Promise<T>
}

// ── Airalo response types ─────────────────────────────────────────────────────

export interface AiraloPackage {
  id:                   string
  type:                 string
  price:                number   // Airalo's suggested retail USD
  day:                  number
  is_unlimited:         boolean
  title:                string
  data:                 string   // "1 GB" | "Unlimited" | "500 MB"
  voice:                string | null
  text:                 string | null
  is_fair_usage_policy: boolean
  fair_usage_policy:    string | null
}

export interface AiraloOperator {
  id:             number
  title:          string
  type:           'local' | 'regional' | 'global'
  gradient_start: string
  gradient_end:   string
  image:          { url: string } | null
  packages:       AiraloPackage[]
  info:           string[]
  plan_type:      string
  is_roaming:     boolean
}

export interface AiraloCountry {
  slug:         string
  country_code: string
  title:        string
  image:        { url: string } | null
  operators:    AiraloOperator[]
}

export interface AiraloPackagesResponse {
  pricing: { model: string; discount_percentage: number }
  data:    AiraloCountry[]
  links:   { first: string; last: string; prev: string | null; next: string | null }
  meta:    {
    message:      string
    current_page: number
    last_page:    number
    per_page:     string
    total:        number
    from:         number | null
    to:           number | null
    path:         string
  }
}

export interface AiraloSimEntry {
  id:                           number
  iccid:                        string
  lpa:                          string    // SM-DP+ address
  matching_id:                  string    // activation code
  qrcode:                       string    // "LPA:1$lpa.airalo.com$MATCHING_ID"
  qrcode_url:                   string    // hosted QR image URL
  direct_apple_installation_url: string
  apn:                          { ios: { apn_type: string; apn_value: string }; android: { apn_type: string; apn_value: string } }
  apn_type:                     string
  apn_value:                    string
  is_roaming:                   boolean
  confirmation_code:            string | null
}

export interface AiraloOrderData {
  id:                   number
  code:                 string   // e.g. "20260710-079523"
  currency:             string
  package_id:           string
  quantity:             number
  type:                 string
  description:          string
  data:                 string
  validity:             number
  package:              string
  price:                number   // Airalo's suggested retail
  pricing_model:        string
  discount_percentage:  number
  discount_amount:      number
  unit_paid_price:      number   // what we actually pay
  total_amount_paid:    number
  created_at:           string
  manual_installation:  string
  qrcode_installation:  string
  sims:                 AiraloSimEntry[]
}

export interface AiraloOrderResponse {
  data: AiraloOrderData
  meta: { message: string }
}

// ── Installation instructions (structured JSON, not HTML blobs) ───────────────
// GET /v2/sims/{iccid}/instructions — returns typed step arrays, QR URL,
// and the iOS 17.4+ direct_apple_installation_url for tap-to-install.

export interface AiraloInstallSteps {
  [stepNumber: string]: string   // e.g. { "1": "Open Settings", "2": "Tap Mobile Data" }
}

export interface AiraloInstallPlatform {
  installation_via_qr_code?: {
    steps:                          AiraloInstallSteps
    qr_code_url?:                   string
    direct_apple_installation_url?: string  // iOS 17.4+ tap-to-install
  }
  installation_manual?: {
    steps: AiraloInstallSteps
  }
  network_setup?: {
    steps: AiraloInstallSteps
  }
}

export interface AiraloInstallInstructions {
  ios:     AiraloInstallPlatform[]
  android: AiraloInstallPlatform[]
}

/**
 * Fetch structured install instructions for an activated SIM.
 * Always use this for delivery (WhatsApp, SMS, push) — not the HTML blobs
 * from the order response, which are unsuitable for plain-text channels.
 */
export async function getInstallInstructions(iccid: string): Promise<AiraloInstallInstructions | null> {
  try {
    const res = await airaloGet<{ data: AiraloInstallInstructions }>(`/sims/${iccid}/instructions`)
    return res.data ?? null
  } catch (err) {
    console.error(`[airalo] getInstallInstructions(${iccid}):`, err)
    return null
  }
}

// ── SIM usage / status ────────────────────────────────────────────────────────

export interface AiraloSimUsage {
  iccid:          string
  status:         string          // "active" | "inactive" | "expired" | "not_active"
  remaining:      number | null   // bytes remaining
  total:          number | null   // bytes total
  expired_at:     string | null   // ISO date
}

/**
 * Fetch live SIM status and usage from Airalo.
 * Returns null (without throwing) if the ICCID is unknown or the call fails.
 */
export async function getSimDetails(iccid: string): Promise<AiraloSimUsage | null> {
  try {
    const res = await airaloGet<{ data: AiraloSimUsage }>(`/sims/${iccid}`)
    return res.data ?? null
  } catch (err) {
    console.error(`[airalo] getSimDetails(${iccid}):`, err)
    return null
  }
}
