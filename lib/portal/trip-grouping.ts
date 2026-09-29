// lib/portal/trip-grouping.ts — My Walz Phase 1: My Trips bucketing.
//
// Extracted as its own pure function (not inlined in the page component) so
// the mutual-exclusivity guarantee — every trip lands in exactly one of
// Upcoming / Saved-Planning / Past, never zero, never two — can be unit
// tested directly with real trip fixtures, rather than only via source-grep
// assertions on the page's JSX.
//
// Found by independent review: a trip whose status is COMPLETED but whose
// startDate is (data-anomalously) in the future used to slip into BOTH
// "Upcoming" and "Past" — CANCELLED already had an explicit exclusion guard
// keeping it out of Upcoming, COMPLETED did not get the mirror guard. A
// trip's terminal status (COMPLETED/CANCELLED) is now always authoritative
// over a stale/anomalous date for bucketing purposes.

export interface GroupableTrip {
  id: string
  startDate: Date | null
  endDate: Date | null
  status: string
}

export interface GroupedTrips<T extends GroupableTrip> {
  upcoming: T[]
  saved: T[]
  past: T[]
}

const TERMINAL_STATUSES = ['CANCELLED', 'COMPLETED'] as const
const DRAFT_STATUSES = ['DRAFT', 'PLANNING'] as const

export function groupTrips<T extends GroupableTrip>(trips: T[], now: number = Date.now()): GroupedTrips<T> {
  const upcoming = trips.filter(t =>
    (!TERMINAL_STATUSES.includes(t.status as (typeof TERMINAL_STATUSES)[number])
      && !DRAFT_STATUSES.includes(t.status as (typeof DRAFT_STATUSES)[number]))
    || (t.startDate != null && new Date(t.startDate).getTime() >= now),
  ).filter(t => !TERMINAL_STATUSES.includes(t.status as (typeof TERMINAL_STATUSES)[number]))

  const saved = trips.filter(t =>
    DRAFT_STATUSES.includes(t.status as (typeof DRAFT_STATUSES)[number]) && !upcoming.includes(t),
  )

  const past = trips.filter(t =>
    TERMINAL_STATUSES.includes(t.status as (typeof TERMINAL_STATUSES)[number])
    || (t.endDate != null && new Date(t.endDate).getTime() < now && !upcoming.includes(t) && !saved.includes(t)),
  )

  return { upcoming, saved, past }
}
