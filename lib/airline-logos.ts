/**
 * Airline logo utilities for Walz Travels.
 *
 * Logo sources used:
 *   AirHex square  — https://content.airhex.com/content/logos/airlines_{IATA}_200_200_s.png
 *   Travelpayouts  — https://pics.avs.io/200/200/{IATA}.png
 *
 * This module is pure (no HTTP requests). Network validation happens server-side
 * in /app/api/admin/airlines/logo/route.ts.
 */

// ---------------------------------------------------------------------------
// Curated map of well-known airline IATA codes → AirHex square logo URL.
// Kept as a fallback / hint layer; resolveAirlineLogo() builds the URL
// dynamically, so the map is mainly for documentation / pre-validation.
// ---------------------------------------------------------------------------
export const KNOWN_AIRLINE_LOGOS: Record<string, string> = {
  BA:  'https://content.airhex.com/content/logos/airlines_BA_200_200_s.png',
  VS:  'https://content.airhex.com/content/logos/airlines_VS_200_200_s.png',
  AC:  'https://content.airhex.com/content/logos/airlines_AC_200_200_s.png',
  EK:  'https://content.airhex.com/content/logos/airlines_EK_200_200_s.png',
  ET:  'https://content.airhex.com/content/logos/airlines_ET_200_200_s.png',
  QR:  'https://content.airhex.com/content/logos/airlines_QR_200_200_s.png',
  AA:  'https://content.airhex.com/content/logos/airlines_AA_200_200_s.png',
  UA:  'https://content.airhex.com/content/logos/airlines_UA_200_200_s.png',
  DL:  'https://content.airhex.com/content/logos/airlines_DL_200_200_s.png',
  LH:  'https://content.airhex.com/content/logos/airlines_LH_200_200_s.png',
  AF:  'https://content.airhex.com/content/logos/airlines_AF_200_200_s.png',
  KL:  'https://content.airhex.com/content/logos/airlines_KL_200_200_s.png',
  TK:  'https://content.airhex.com/content/logos/airlines_TK_200_200_s.png',
  SQ:  'https://content.airhex.com/content/logos/airlines_SQ_200_200_s.png',
  CX:  'https://content.airhex.com/content/logos/airlines_CX_200_200_s.png',
  MH:  'https://content.airhex.com/content/logos/airlines_MH_200_200_s.png',
  EY:  'https://content.airhex.com/content/logos/airlines_EY_200_200_s.png',
  WY:  'https://content.airhex.com/content/logos/airlines_WY_200_200_s.png',
  MS:  'https://content.airhex.com/content/logos/airlines_MS_200_200_s.png',
  AT:  'https://content.airhex.com/content/logos/airlines_AT_200_200_s.png',
  RJ:  'https://content.airhex.com/content/logos/airlines_RJ_200_200_s.png',
}

// ---------------------------------------------------------------------------
// resolveAirlineLogo
// ---------------------------------------------------------------------------

/**
 * Build an AirHex square logo URL for the given IATA code.
 *
 * - Normalises the code to UPPERCASE and trims whitespace.
 * - Returns `null` for empty / invalid input (< 2 chars after trim).
 * - Does NOT make HTTP requests.
 */
export function resolveAirlineLogo(iataCode: string): string | null {
  const code = iataCode.trim().toUpperCase()
  if (code.length < 2) return null
  return `https://content.airhex.com/content/logos/airlines_${code}_200_200_s.png`
}

// ---------------------------------------------------------------------------
// getAirlineLogoUrl
// ---------------------------------------------------------------------------

/**
 * Resolve the best logo URL for a flight segment.
 *
 * Priority:
 *   1. customLogoUrl — if provided and non-empty, use it as-is.
 *   2. iataCode      — delegate to resolveAirlineLogo().
 *   3. null          — no logo available.
 *
 * Does NOT make HTTP requests.
 */
export function getAirlineLogoUrl(
  iataCode: string | null | undefined,
  customLogoUrl?: string | null,
): string | null {
  if (customLogoUrl && customLogoUrl.trim().length > 0) {
    return customLogoUrl.trim()
  }
  if (iataCode) {
    return resolveAirlineLogo(iataCode)
  }
  return null
}
