/**
 * Jade Connect — eSIM Access API helpers and pricing logic.
 *
 * eSIM Access API facts (confirmed from live responses):
 *  - price          → wholesale cost in thousandths of USD (e.g. 5399 = $5.40, 9990 = $9.99)
 *  - wholesalePrice → same unit as price (divide by 1000 for USD)
 *  - volume         → data in BYTES (e.g. 104857600 = 100 MB, 1073741824 = 1 GB)
 *  - duration       → plan length in days (plain integer)
 *  - locationNetworkList → array of { locationName, locationLogo, operatorList }
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
/** Convert raw API volume (bytes) to human-readable label */
export function bytesToHuman(bytes: number | null | undefined): { label: string; amount: number | null; unit: string } {
  if (!bytes || bytes <= 0) return { label: 'Unlimited', amount: null, unit: 'Unlimited' }
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) {
    const rounded = parseFloat(gb.toFixed(2))
    const label   = rounded % 1 === 0 ? `${rounded} GB` : `${rounded} GB`
    return { label, amount: bytes, unit: 'GB' }
  }
  const mb      = bytes / (1024 * 1024)
  const rounded = parseFloat(mb.toFixed(1))
  const label   = rounded % 1 === 0 ? `${Math.round(mb)} MB` : `${rounded} MB`
  return { label, amount: bytes, unit: 'MB' }
}

/** Legacy alias — kept for any callers that still pass MB values directly */
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

// ── Location name helper ──────────────────────────────────────────────────────
function extractLocationName(raw: Record<string, unknown>, countryCode: string): string {
  const list = raw.locationNetworkList
  if (Array.isArray(list) && list.length > 0) {
    const first = list[0] as Record<string, unknown>
    if (typeof first.locationName === 'string' && first.locationName.trim()) {
      return first.locationName.trim()
    }
  }
  // Fallback to top-level location field, then country code
  const loc = raw.location ?? raw.locationName ?? raw.countryName
  if (typeof loc === 'string' && loc.trim()) return loc.trim()
  return countryCode
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
  dataAmount:    number | null   // raw bytes
  dataUnit:      string
  wholesaleUsd:  number
  retailUsd:     number
  marginUsd:     number
  speed:         string
}

export function parsePackage(raw: Record<string, unknown>, countryCode: string): EsimPackage | null {
  const code = String(raw.packageCode ?? raw.productCode ?? '')
  if (!code) return null

  // API returns price in thousandths of USD — divide by 1000 to get actual USD
  const rawPrice = Number(raw.price ?? raw.retailPrice ?? 0)
  if (rawPrice <= 0) return null
  const wholesale = rawPrice / 1000

  const retail = applyMarkup(wholesale)

  // API returns volume in bytes
  const { label: dataLabel, amount: dataAmount, unit: dataUnit } = bytesToHuman(Number(raw.volume ?? 0))

  return {
    packageCode:  code,
    name:         String(raw.name ?? raw.packageName ?? code),
    slug:         code.toLowerCase(),
    locationCode: countryCode,
    locationName: extractLocationName(raw, countryCode),
    durationDays: Number(raw.duration ?? 0),
    dataLabel,
    dataAmount,
    dataUnit,
    wholesaleUsd: Math.round(wholesale * 100) / 100,
    retailUsd:    retail,
    marginUsd:    calcMargin(wholesale, retail),
    speed:        String(raw.speed ?? '4G/LTE'),
  }
}
