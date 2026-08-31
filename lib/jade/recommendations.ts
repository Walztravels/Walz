// lib/jade/recommendations.ts
// Release 5B — Smart Recommendations & Next-Best-Action
// Release 7.3 — jade_cross_sell_eligible / jade_cross_sell_offered events wired
//
// Context-aware commercial recommendations. Extends and supersedes
// lib/commercial/cross-sell.ts for Jade-driven recommendation contexts.
//
// SECURITY:
//   - Never exposes internal priority scores, markup, or supplier net rates
//   - Budget comparison only within the same currency — never cross-currency
//   - Schedule conflict detection prevents impossible recommendations

import { trackCommercialEvent } from '@/lib/commercial/track'

export type RecommendationType = 'HOTEL' | 'TRANSFER' | 'ACTIVITY' | 'ESIM' | 'FLIGHT'

export interface Recommendation {
  type:     RecommendationType
  reason:   string
  ctaLabel: string
  ctaHref?: string
  searchHint?: {
    destination?: string
    date?:        string
    adults?:      number
    currency?:    string
  }
}

// ─── Trip item shape expected by the recommendation engine ────────────────────

export interface TripItemForRec {
  type:     string  // TripItemType
  metadata: Record<string, unknown>
  startTime?: string | null
  endTime?:   string | null
}

export interface TripForRec {
  destination:  string
  origin:       string | null
  startDate:    Date | null
  endDate:      Date | null
  adults:       number
  children:     number
  currency:     string
  budget:       number | null
  items:        TripItemForRec[]
}

// Internal scored recommendation
interface ScoredRec extends Recommendation {
  _priority: number
}

// ─── Main Recommendation Engine ───────────────────────────────────────────────

const MAX_RECS = 3

export function getSmartRecommendations(trip: TripForRec, tripId?: string): Recommendation[] {
  const candidates: ScoredRec[] = [
    ...flightRecommendations(trip),
    ...hotelRecommendations(trip),
    ...transferRecommendations(trip),
    ...activityRecommendations(trip),
    ...esimRecommendations(trip),
  ]

  // Release 7.3 — jade_cross_sell_eligible: fires once candidates are known
  trackCommercialEvent('jade_cross_sell_eligible', {
    metadata: { tripId, candidateCount: candidates.length },
  })

  const final = candidates
    .sort((a, b) => b._priority - a._priority)
    .slice(0, MAX_RECS)
    .map(({ _priority: _p, ...rec }) => rec)

  // Release 7.3 — jade_cross_sell_offered: fires after final list is determined
  trackCommercialEvent('jade_cross_sell_offered', {
    metadata: { tripId, offeredCount: final.length },
  })

  return final
}

// ─── Product-specific rules ───────────────────────────────────────────────────

function flightRecommendations(trip: TripForRec): ScoredRec[] {
  const recs: ScoredRec[] = []
  const hasHotel    = hasType(trip, 'HOTEL')
  const hasActivity = hasType(trip, 'ACTIVITY', 'TOUR')
  const hasFlight   = hasType(trip, 'FLIGHT')
  const dest        = trip.destination.trim()
  const origin      = trip.origin?.trim() ?? ''

  if (!hasFlight && (hasHotel || hasActivity)) {
    const href = dest && origin
      ? `/flights?from=${enc(origin)}&to=${enc(dest)}${dateParam(trip)}`
      : '/flights'
    recs.push({
      type:      'FLIGHT',
      reason:    dest ? `You have a hotel in ${dest} but no flight booked` : 'Hotel added — flight still needed',
      ctaLabel:  `Find flights to ${dest || 'your destination'}`,
      ctaHref:   href,
      searchHint: { destination: dest, date: firstDate(trip) ?? undefined, adults: trip.adults },
      _priority: 85,
    })
  }

  return recs
}

function hotelRecommendations(trip: TripForRec): ScoredRec[] {
  const recs: ScoredRec[] = []
  const hasFlight = hasType(trip, 'FLIGHT')
  const hasHotel  = hasType(trip, 'HOTEL')
  const dest      = trip.destination.trim()

  if (hasFlight && !hasHotel) {
    const checkIn = firstDate(trip)
    const href = dest
      ? `/hotels?destination=${enc(dest)}${checkIn ? `&checkIn=${checkIn}` : ''}${trip.adults > 1 ? `&guests=${trip.adults + trip.children}` : ''}`
      : '/hotels'
    recs.push({
      type:      'HOTEL',
      reason:    dest ? `Your flight to ${dest} is booked — find a hotel there` : 'Flight added — no hotel yet',
      ctaLabel:  dest ? `Hotels in ${dest}` : 'Find a hotel',
      ctaHref:   href,
      searchHint: { destination: dest, date: checkIn ?? undefined, adults: trip.adults, currency: trip.currency },
      _priority: 100,
    })
  }

  return recs
}

function transferRecommendations(trip: TripForRec): ScoredRec[] {
  const recs: ScoredRec[] = []
  const hasFlight   = hasType(trip, 'FLIGHT')
  const hasHotel    = hasType(trip, 'HOTEL')
  const hasTransfer = hasType(trip, 'TRANSFER', 'TRANSPORT')
  const dest        = trip.destination.trim()
  const origin      = trip.origin?.trim() ?? ''

  if ((hasFlight || hasHotel) && !hasTransfer) {
    const href = dest
      ? `/transfers?to=${enc(dest)}${origin ? `&from=${enc(origin)}` : ''}${trip.adults > 0 ? `&adults=${trip.adults}` : ''}`
      : '/transfers'
    recs.push({
      type:      'TRANSFER',
      reason:    'No airport transfer booked — arrange pickup from the airport',
      ctaLabel:  dest ? `Transfer to ${dest}` : 'Book a transfer',
      ctaHref:   href,
      searchHint: { destination: dest, adults: trip.adults },
      _priority: 75,
    })
  }

  return recs
}

function activityRecommendations(trip: TripForRec): ScoredRec[] {
  const recs: ScoredRec[] = []
  const hasActivity = hasType(trip, 'ACTIVITY', 'TOUR')
  const hasFlight   = hasType(trip, 'FLIGHT')
  const dest        = trip.destination.trim()

  // Only recommend activities when we know the destination
  if (!dest) return recs

  if (!hasActivity) {
    const date = firstDate(trip)
    // Schedule conflict check: don't recommend activities on departure/arrival day without times
    const conflictNote = hasFlightConflict(trip) ? ' (check your flight times)' : ''
    recs.push({
      type:      'ACTIVITY',
      reason:    `Explore things to do in ${dest}${conflictNote}`,
      ctaLabel:  `Activities in ${dest}`,
      ctaHref:   `/activities?destination=${enc(dest)}${date ? `&date=${date}` : ''}`,
      searchHint: { destination: dest, date: date ?? undefined, adults: trip.adults },
      _priority: 60,
    })
  } else if (hasFlight) {
    // Already has an activity — check for schedule conflicts
    const conflicts = detectScheduleConflicts(trip)
    if (conflicts.length) {
      // Don't add more activities — surface the conflict to Jade instead
      recs.push({
        type:      'ACTIVITY',
        reason:    `Schedule conflict detected: ${conflicts[0]}`,
        ctaLabel:  'Review activity schedule',
        _priority: 50,
      })
    }
  }

  return recs
}

function esimRecommendations(trip: TripForRec): ScoredRec[] {
  const recs: ScoredRec[] = []
  const hasEsim = hasType(trip, 'ESIM')
  const dest    = trip.destination.trim()

  // Always suggest eSIM for international trips without one
  if (!hasEsim && dest) {
    recs.push({
      type:      'ESIM',
      reason:    `Stay connected in ${dest} — no eSIM in your trip`,
      ctaLabel:  `eSIM for ${dest}`,
      ctaHref:   `/esim?country=${enc(dest)}`,
      searchHint: { destination: dest },
      _priority: 45,
    })
  }

  return recs
}

// ─── Schedule Conflict Detection ─────────────────────────────────────────────

function detectScheduleConflicts(trip: TripForRec): string[] {
  const conflicts: string[] = []
  const flights    = trip.items.filter(i => i.type === 'FLIGHT')
  const activities = trip.items.filter(i => i.type === 'ACTIVITY' || i.type === 'TOUR')

  for (const activity of activities) {
    const actDate  = activityDate(activity)
    if (!actDate) continue

    for (const flight of flights) {
      const flightDep = flightDate(flight, 'departure')
      const flightArr = flightDate(flight, 'arrival')

      if (flightDep && actDate === flightDep) {
        const actTime  = activity.startTime
        const fltTime  = flightDepTime(flight)
        if (actTime && fltTime && actTime >= fltTime) {
          conflicts.push(`Activity on departure day (${actDate}) may conflict with your flight`)
        }
      }

      if (flightArr && actDate === flightArr) {
        const actTime  = activity.startTime
        const fltTime  = flightArrTime(flight)
        if (actTime && fltTime && actTime <= fltTime) {
          conflicts.push(`Activity on arrival day (${actDate}) may start before your flight lands`)
        }
      }
    }
  }

  return conflicts
}

function hasFlightConflict(trip: TripForRec): boolean {
  return detectScheduleConflicts(trip).length > 0
}

// ─── Budget Awareness ─────────────────────────────────────────────────────────

export interface BudgetCheck {
  withinBudget: boolean
  note:         string | null
}

export function checkBudgetCompatibility(
  trip: TripForRec,
  productCurrency: string,
  productPrice: number,
): BudgetCheck {
  if (!trip.budget) return { withinBudget: true, note: null }

  // CRITICAL: Never compare budgets across currencies without authoritative FX
  if (trip.currency !== productCurrency) {
    return {
      withinBudget: true,
      note: `Budget is in ${trip.currency}, product priced in ${productCurrency} — exact comparison unavailable`,
    }
  }

  // Current spend (only same-currency items)
  const currentSpend = trip.items.reduce((sum, item) => {
    const m = item.metadata as Record<string, unknown>
    const itemCurrency = (m.currency as string | undefined) ?? trip.currency
    if (itemCurrency !== trip.currency) return sum
    return sum + ((m.sellingPrice as number | undefined) ?? 0)
  }, 0)

  const remaining = trip.budget - currentSpend
  if (productPrice <= remaining) {
    return { withinBudget: true, note: null }
  }
  return {
    withinBudget: false,
    note:         `${trip.currency} ${productPrice.toLocaleString()} exceeds remaining budget of ${trip.currency} ${remaining.toLocaleString()}`,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasType(trip: TripForRec, ...types: string[]): boolean {
  const upper = types.map(t => t.toUpperCase())
  return trip.items.some(i => upper.includes(i.type.toUpperCase()))
}

function enc(s: string): string {
  return encodeURIComponent(s)
}

function firstDate(trip: TripForRec): string | null {
  if (trip.startDate) return trip.startDate.toISOString().slice(0, 10)
  const dates = trip.items
    .map(i => {
      const m = i.metadata as Record<string, unknown>
      return (m.travelDate ?? m.date ?? m.departureDate) as string | undefined
    })
    .filter((d): d is string => typeof d === 'string' && d.length >= 10)
    .sort()
  return dates[0] ?? null
}

function dateParam(trip: TripForRec): string {
  const d = firstDate(trip)
  return d ? `&date=${d}` : ''
}

function activityDate(item: TripItemForRec): string | null {
  const m = item.metadata as Record<string, unknown>
  return ((m.date ?? m.travelDate) as string | undefined)?.slice(0, 10) ?? null
}

function flightDate(item: TripItemForRec, direction: 'departure' | 'arrival'): string | null {
  const m = item.metadata as Record<string, unknown>
  const key = direction === 'departure' ? 'departureDate' : 'arrivalDate'
  return ((m[key] ?? m.date) as string | undefined)?.slice(0, 10) ?? null
}

function flightDepTime(item: TripItemForRec): string | null {
  const m = item.metadata as Record<string, unknown>
  return (m.departureTime as string | undefined) ?? null
}

function flightArrTime(item: TripItemForRec): string | null {
  const m = item.metadata as Record<string, unknown>
  return (m.arrivalTime as string | undefined) ?? null
}
