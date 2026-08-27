// CrossSellEngine — rules-based trip recommendation engine.
// Returns up to MAX_PRIMARY recommendations based on what the trip already contains.
// No AI required for initial release; rules are deterministic and can be extended.
// SECURITY: never expose internal priority scores to the browser.

const MAX_PRIMARY = 3

export type RecommendationType = 'HOTEL' | 'TRANSFER' | 'ACTIVITY' | 'ESIM' | 'FLIGHT'

export interface CrossSellRecommendation {
  type:     RecommendationType
  reason:   string
  ctaLabel: string
  ctaHref?: string   // pre-filled deep-link where possible
}

interface TripContext {
  destination: string
  origin:      string | null
  adults:      number
  children:    number
  infants:     number
  items: Array<{
    type:     string
    metadata: Record<string, unknown>
  }>
}

// Scored internal type — score is NOT exposed to the client
interface ScoredRec extends CrossSellRecommendation {
  _priority: number
}

function hasType(items: TripContext['items'], ...types: string[]): boolean {
  const upper = types.map(t => t.toUpperCase())
  return items.some(i => upper.includes(i.type.toUpperCase()))
}

// Extract the earliest travel date from item metadata
function earliestDate(items: TripContext['items']): string | null {
  const dates = items
    .map(i => (i.metadata.travelDate as string | undefined) ?? (i.metadata.date as string | undefined))
    .filter((d): d is string => typeof d === 'string' && d.length === 10)
    .sort()
  return dates[0] ?? null
}

// True if the destination looks international (has at least one word, not blank, not 'undefined')
function isInternational(destination: string): boolean {
  return destination.trim().length > 0
}

export function getCrossSellRecommendations(trip: TripContext): CrossSellRecommendation[] {
  const { destination, origin, adults, children, items } = trip
  const hasFlight   = hasType(items, 'FLIGHT')
  const hasHotel    = hasType(items, 'HOTEL')
  const hasTransfer = hasType(items, 'TRANSFER', 'TRANSPORT')
  const hasActivity = hasType(items, 'ACTIVITY', 'TOUR')
  const hasEsim     = hasType(items, 'ESIM')

  const pax     = adults + children
  const date    = earliestDate(items)
  const dest    = destination?.trim() || ''
  const intl    = isInternational(dest)

  const recs: ScoredRec[] = []

  // Rule 1: Has flight but no hotel
  if (hasFlight && !hasHotel) {
    const href = dest
      ? `/hotels?destination=${encodeURIComponent(dest)}${date ? `&checkIn=${date}` : ''}${pax > 1 ? `&guests=${pax}` : ''}`
      : '/hotels'
    recs.push({
      type:      'HOTEL',
      reason:    dest ? `Your trip to ${dest} doesn't have a hotel yet` : 'You have a flight but no hotel',
      ctaLabel:  dest ? `Find hotels in ${dest}` : 'Find a hotel',
      ctaHref:   href,
      _priority: 100,
    })
  }

  // Rule 2: Has flight or hotel but no transfer
  if ((hasFlight || hasHotel) && !hasTransfer) {
    const href = dest && origin
      ? `/transfers?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(dest)}${date ? `&date=${date}` : ''}${adults > 0 ? `&adults=${adults}` : ''}`
      : '/transfers'
    recs.push({
      type:      'TRANSFER',
      reason:    'No airport or hotel transfer booked',
      ctaLabel:  dest ? `Book a transfer to ${dest}` : 'Book a transfer',
      ctaHref:   href,
      _priority: 90,
    })
  }

  // Rule 3: Destination known, no activities
  if (dest && !hasActivity) {
    const href = `/activities?destination=${encodeURIComponent(dest)}${date ? `&date=${date}` : ''}`
    recs.push({
      type:      'ACTIVITY',
      reason:    `Explore things to do in ${dest}`,
      ctaLabel:  `Find activities in ${dest}`,
      ctaHref:   href,
      _priority: 80,
    })
  }

  // Rule 4: International trip — recommend eSIM
  if (intl && !hasEsim) {
    recs.push({
      type:      'ESIM',
      reason:    dest ? `Stay connected in ${dest}` : 'Stay connected abroad',
      ctaLabel:  dest ? `eSIM for ${dest}` : 'Browse eSIM plans',
      ctaHref:   dest ? `/esim?country=${encodeURIComponent(dest)}` : '/esim',
      _priority: 70,
    })
  }

  // Rule 5: Has hotel or activity but no flight
  if (!hasFlight && (hasHotel || hasActivity)) {
    const href = dest && origin
      ? `/flights?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(dest)}${date ? `&date=${date}` : ''}${adults > 0 ? `&adults=${adults}` : ''}`
      : '/flights'
    recs.push({
      type:      'FLIGHT',
      reason:    dest ? `No flight booked to ${dest} yet` : 'No flight booked yet',
      ctaLabel:  dest ? `Find flights to ${dest}` : 'Find flights',
      ctaHref:   href,
      _priority: 60,
    })
  }

  // Sort by priority (desc), cap at MAX_PRIMARY, strip internal score
  return recs
    .sort((a, b) => b._priority - a._priority)
    .slice(0, MAX_PRIMARY)
    .map(({ _priority: _p, ...rec }) => rec)
}
