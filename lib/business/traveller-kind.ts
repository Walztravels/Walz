// lib/business/traveller-kind.ts — Walz Business (Release 2.1)
//
// The closed list of BusinessTraveller classifications. EMPLOYEE is the
// schema default and the backfilled value for every pre-R2.1 row. CLIENT
// marks a traveller who is an agency's own end customer rather than the
// agency's staff — it does NOT introduce any new identity model or
// ownership pathway: a claimed CLIENT row is claimed via the exact same
// lib/business/claim.ts flow and counts as ownership evidence via the exact
// same lib/business/services.ts::OWNERSHIP_CLAIMED_TRAVELLER predicate as an
// EMPLOYEE row. travellerKind is presentation/classification only.

export const VALID_TRAVELLER_KINDS = ['EMPLOYEE', 'CLIENT'] as const
export type TravellerKind = (typeof VALID_TRAVELLER_KINDS)[number]

export const DEFAULT_TRAVELLER_KIND: TravellerKind = 'EMPLOYEE'

export function isTravellerKind(value: unknown): value is TravellerKind {
  return typeof value === 'string' && (VALID_TRAVELLER_KINDS as readonly string[]).includes(value)
}

export function parseTravellerKind(value: unknown): TravellerKind | null {
  if (value === undefined || value === null) return DEFAULT_TRAVELLER_KIND
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  return isTravellerKind(normalized) ? normalized : null
}
