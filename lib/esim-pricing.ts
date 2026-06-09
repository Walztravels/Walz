/**
 * Jade Connect — eSIM Access API helpers and pricing logic.
 *
 * eSIM Access API facts (from docs):
 *  - price  → wholesale price in USD (plain decimal, e.g. 0.76)
 *  - volume → data in MB (e.g. 1024 = 1 GB)
 *  - duration / durationUnit → e.g. 30 / "DAY"
 *  - Order body: amount & price in same USD decimal units
 */

// ── Auth headers ─────────────────────────────────────────────────────────────
export function esimHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'RT-AccessCode': process.env.ESIM_ACCESS_CODE ?? '',
    'RT-SecretKey':  process.env.ESIM_SECRET_KEY  ?? '',
  }
}

export const ESIM_BASE = 'https://api.esimaccess.com/api/v1'

// ── Pricing markups ───────────────────────────────────────────────────────────
export function applyMarkup(wholesaleUsd: number): number {
  let retail: number
  if      (wholesaleUsd < 5)  retail = wholesaleUsd * 3.5
  else if (wholesaleUsd < 10) retail = wholesaleUsd * 2.8
  else if (wholesaleUsd < 20) retail = wholesaleUsd * 2.2
  else                         retail = wholesaleUsd * 1.8
  // Round up to nearest .99
  return Math.ceil(retail) - 0.01
}

export function calcMargin(wholesale: number, retail: number): number {
  return Math.round((retail - wholesale) * 100) / 100
}

// ── Data label ────────────────────────────────────────────────────────────────
/** volume is in MB as returned by eSIM Access API */
export function formatData(volumeMb: number | null | undefined): { label: string; amount: number | null; unit: string } {
  if (!volumeMb || volumeMb <= 0) return { label: 'Unlimited', amount: null, unit: 'Unlimited' }
  if (volumeMb >= 1024) {
    const gb = Math.round((volumeMb / 1024) * 10) / 10
    return { label: `${gb} GB`, amount: volumeMb, unit: 'MB' }
  }
  return { label: `${volumeMb} MB`, amount: volumeMb, unit: 'MB' }
}

// ── Unique order ref ──────────────────────────────────────────────────────────
export function generateOrderRef(): string {
  const ts  = Date.now()
  const rnd = Math.floor(100000 + Math.random() * 900000)
  return `JADE-ESIM-${ts}-${rnd}`
}

// ── Typed package from eSIM Access raw response ───────────────────────────────
export interface EsimPackage {
  packageCode:   string
  name:          string
  slug:          string
  locationCode:  string
  locationName:  string
  durationDays:  number
  dataLabel:     string
  dataAmount:    number | null   // raw MB
  dataUnit:      string
  wholesaleUsd:  number
  retailUsd:     number
  marginUsd:     number
  speed:         string
}

export function parsePackage(raw: Record<string, unknown>, countryCode: string): EsimPackage | null {
  const code = String(raw.packageCode ?? raw.productCode ?? '')
  if (!code) return null

  // Price is a plain USD decimal in the API
  const wholesale = Number(raw.price ?? 0)
  if (wholesale <= 0) return null

  const retail  = applyMarkup(wholesale)
  const { label: dataLabel, amount: dataAmount, unit: dataUnit } = formatData(Number(raw.volume ?? 0))

  return {
    packageCode:  code,
    name:         String(raw.name ?? raw.packageName ?? code),
    slug:         code.toLowerCase(),
    locationCode: countryCode,
    locationName: String(Array.isArray(raw.locationNetworkList) ? raw.locationNetworkList[0] : raw.location ?? countryCode),
    durationDays: Number(raw.duration ?? 0),
    dataLabel,
    dataAmount,
    dataUnit,
    wholesaleUsd: Math.round(wholesale * 1000) / 1000,
    retailUsd:    retail,
    marginUsd:    calcMargin(wholesale, retail),
    speed:        String(raw.speed ?? '4G/LTE'),
  }
}
