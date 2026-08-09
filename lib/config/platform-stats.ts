// Platform statistics — single source of truth for marketing claims.
//
// OWNER INPUT REQUIRED:
//   airlineCount:     0 → pending decision. Site currently shows BOTH 400+ (17 locations)
//                     AND 900+ (15 locations) — contradictory. Only Seyi knows the true figure.
//                     Set to the verified count and run find/replace on static strings.
//
//   esimCountryCount: 0 → pending decision. Site currently shows BOTH 150+ (13 locations)
//                     AND 215+ (5 locations, including the Airalo-backed EsimHero).
//                     Airalo's API can derive the real number — prefer a live query over
//                     a hardcoded value.
//
// While any value is 0, components must render nothing rather than "0+ airlines".

export const PLATFORM_STATS = {
  airlineCount:     0,   // OWNER INPUT — 400 or 900? Verify before setting.
  esimCountryCount: 0,   // OWNER INPUT — or derive live from Airalo API.
  countryCoverage:  199,
  visaApprovalPct:  90,  // Leave alone in this job — Job 3 decision.
  lastVerified:     '',
} as const

/** Renders `${count}+` when count > 0, otherwise `null` (renders nothing). */
export const statLabel = (count: number, suffix = '+') =>
  count > 0 ? `${count}${suffix}` : null
