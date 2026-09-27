'use client'

// QUOTE BUILDER V1.2 (desktop) — Flight search workspace (center column).
// Same search fields/behavior as the current CreateQuoteDrawer flight tab —
// only the layout is new. All search-in-progress state (flFromQuery,
// mcLegs, etc.) lives in `state`, not locally, so switching rail services
// never loses in-progress search fields.

import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AirportDropdown } from '@/app/admin/inbox/components/AirportDropdown'
import type { QuoteBuilderState } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import type { NormalizedFlightOffer } from '@/lib/travel-search/types'
import { inputCls, labelCls } from '@/app/admin/inbox/components/quote-builder/styles'
import { MultiCityLegsDesktop, mcLegsChronologyError } from './MultiCityLegsDesktop'
import { FlightResultCard } from '../cards/FlightResultCard'

// V1.4 (Agent A) — stops search-form control: values match the route's
// STOPS_MAP keys exactly (app/api/admin/travel-search/flights/route.ts),
// sent verbatim as `stops` in the search request body via state.flStops.
const STOPS_SEARCH_OPTIONS: { value: string; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'direct', label: 'Direct' },
  { value: 'max-1-stop', label: 'Max 1 Stop' },
  { value: 'max-2-stops', label: 'Max 2 Stops' },
]

// V1.4 (Agent A) — client-side RESULT filters over the already-returned
// `flightResults` array (no new API call). Convention (documented per the
// brief):
//  - Stops filter is evaluated against the WORST (highest-stop) journey of
//    the offer — an offer with a 2-stop outbound and a direct return is a
//    "2+ stops" offer for filtering purposes, since staff filtering by
//    stops care about the least convenient leg of the trip.
//  - Departure time bucket is read from the OUTBOUND journey's first
//    segment's departure time (journeys[0], falling back to the legacy
//    flattened `segments[0]` if journeys is ever empty).
type ResultStopsFilter = 'any' | 'direct' | '1' | '2+'
type DepartureFilter = 'any' | 'morning' | 'afternoon' | 'evening' | 'night'

function worstJourneyStops(offer: NormalizedFlightOffer): number {
  const journeys = offer.journeys ?? []
  return journeys.reduce((max, j) => Math.max(max, j.stops), 0)
}

function matchesStopsFilter(offer: NormalizedFlightOffer, filter: ResultStopsFilter): boolean {
  if (filter === 'any') return true
  const worst = worstJourneyStops(offer)
  if (filter === 'direct') return worst === 0
  if (filter === '1') return worst === 1
  return worst >= 2 // '2+'
}

function departureBucket(offer: NormalizedFlightOffer): DepartureFilter | null {
  const iso = offer.journeys?.[0]?.segments?.[0]?.departureAt ?? offer.segments[0]?.departureAt
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const hour = d.getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

export interface FlightPanelProps {
  state: QuoteBuilderState
}

export function FlightPanel({ state }: FlightPanelProps) {
  const {
    flTrip, setFlTrip, flFromQuery, flFrom, flFromSug, flToQuery, flTo, flToSug,
    flDepart, setFlDepart, flReturn, setFlReturn, flCabin, setFlCabin, flStops, setFlStops, flAdults, setFlAdults,
    onFlFromChange, onFlToChange, selectFlFrom, selectFlTo, mcLegs,
    flightResults, searchFlightsLive, liveSearching, liveError, openPending,
  } = state
  // Closing QA fix: "no results" must only ever appear AFTER a real search
  // — a naive `results.length === 0` check (mobile avoids this for free via
  // its search/results screen split) would show "No flights found" on the
  // very first paint, before staff has searched anything. Purely local UI
  // state — not business state, so it stays out of useQuoteBuilderState.ts.
  const [hasSearched, setHasSearched] = useState(false)
  // V1.4 — multi-city chronology pre-check (mirrors the server rule in
  // route.ts): MultiCityLegsDesktop already shows its own inline error for
  // this (computed live off mcLegs); here we just also disable the Search
  // button while it's in that state, so the search function is never
  // actually invoked with an out-of-order leg — same click handler as
  // before (QA finding #6's exact-onClick invariant), just conditionally
  // disabled rather than early-returning inside it.
  const mcChronoBlocked = flTrip === 'multi-city' && mcLegsChronologyError(mcLegs) != null

  // V1.4 — result filters are purely local UI state (like hasSearched
  // above), never persisted in useQuoteBuilderState.ts: they only narrow
  // what's already in flightResults, never trigger a new search.
  const [filterStops, setFilterStops] = useState<ResultStopsFilter>('any')
  const [filterAirline, setFilterAirline] = useState('all')
  const [filterDeparture, setFilterDeparture] = useState<DepartureFilter>('any')

  const airlineOptions = useMemo(
    () => Array.from(new Set(flightResults.map(o => o.airline).filter(Boolean))).sort(),
    [flightResults],
  )

  const filteredResults = useMemo(
    () => flightResults.filter(o =>
      matchesStopsFilter(o, filterStops)
      && (filterAirline === 'all' || o.airline === filterAirline)
      && (filterDeparture === 'any' || departureBucket(o) === filterDeparture),
    ),
    [flightResults, filterStops, filterAirline, filterDeparture],
  )

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-walz-deep-navy uppercase tracking-wide">Flight</h2>
        <p className="text-xs text-walz-muted-strong">Search live inventory and add a fare to this quote.</p>
      </div>

      {liveError && <p role="alert" className="text-xs text-red-700">{liveError}</p>}

      <div className="rounded-xl border border-walz-border bg-white p-4 space-y-3">
        <div>
          <label className={labelCls} htmlFor="dw-fl-trip">Trip type</label>
          <select id="dw-fl-trip" value={flTrip} onChange={e => setFlTrip(e.target.value as typeof flTrip)} className={inputCls}>
            <option value="one-way">One-way</option>
            <option value="round-trip">Return</option>
            <option value="multi-city">Multi-city</option>
          </select>
        </div>

        {flTrip === 'multi-city' ? (
          <MultiCityLegsDesktop state={state} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <label className={labelCls} htmlFor="dw-fl-from">From</label>
              <input id="dw-fl-from" value={flFromQuery} onChange={e => onFlFromChange(e.target.value)}
                placeholder="City or airport" aria-label="Departure city or airport" className={inputCls} />
              {flFromSug.length > 0 && <AirportDropdown airports={flFromSug} onSelect={selectFlFrom} />}
            </div>
            <div className="relative">
              <label className={labelCls} htmlFor="dw-fl-to">To</label>
              <input id="dw-fl-to" value={flToQuery} onChange={e => onFlToChange(e.target.value)}
                placeholder="City or airport" aria-label="Destination city or airport" className={inputCls} />
              {flToSug.length > 0 && <AirportDropdown airports={flToSug} onSelect={selectFlTo} />}
            </div>
            <div>
              <label className={labelCls} htmlFor="dw-fl-depart">Depart</label>
              <input id="dw-fl-depart" type="date" value={flDepart} onChange={e => setFlDepart(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="dw-fl-return">Return</label>
              <input id="dw-fl-return" type="date" value={flReturn} onChange={e => setFlReturn(e.target.value)}
                disabled={flTrip === 'one-way'} className={`${inputCls} disabled:opacity-40`} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="dw-fl-cabin">Cabin</label>
            <select id="dw-fl-cabin" value={flCabin} onChange={e => setFlCabin(e.target.value)} className={inputCls}>
              <option value="economy">Economy</option>
              <option value="premium_economy">Premium Economy</option>
              <option value="business">Business</option>
              <option value="first">First</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-fl-adults">Adults</label>
            <input id="dw-fl-adults" type="number" min={1} max={9} value={flAdults}
              onChange={e => setFlAdults(Number(e.target.value))} className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls} id="dw-fl-stops-label">Stops</label>
          <div role="group" aria-labelledby="dw-fl-stops-label" className="grid grid-cols-4 gap-1.5">
            {STOPS_SEARCH_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFlStops(opt.value)}
                aria-pressed={flStops === opt.value}
                className={`min-h-[36px] px-1 rounded-lg border text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60 ${
                  flStops === opt.value
                    ? 'bg-walz-navy text-white border-walz-navy'
                    : 'bg-white text-walz-deep-navy border-walz-border hover:bg-walz-navy/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => { setHasSearched(true); void searchFlightsLive() }}
          disabled={liveSearching || mcChronoBlocked}
          className="w-full min-h-[44px] rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60 flex items-center justify-center gap-2"
        >
          {liveSearching ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Searching…</>) : 'Search flights'}
        </button>
      </div>

      {hasSearched && !liveSearching && !liveError && flightResults.length === 0 && (
        <p className="text-xs text-walz-muted-strong">No flights found. Try adjusting your search.</p>
      )}

      {flightResults.length > 0 && (
        <div className="rounded-xl border border-walz-border bg-white p-3 grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls} htmlFor="dw-fl-filter-stops">Stops</label>
            <select id="dw-fl-filter-stops" value={filterStops} onChange={e => setFilterStops(e.target.value as ResultStopsFilter)} className={inputCls}>
              <option value="any">Any</option>
              <option value="direct">Direct</option>
              <option value="1">1 stop</option>
              <option value="2+">2+ stops</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-fl-filter-airline">Airline</label>
            <select id="dw-fl-filter-airline" value={filterAirline} onChange={e => setFilterAirline(e.target.value)} className={inputCls}>
              <option value="all">All airlines</option>
              {airlineOptions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-fl-filter-departure">Departure</label>
            <select id="dw-fl-filter-departure" value={filterDeparture} onChange={e => setFilterDeparture(e.target.value as DepartureFilter)} className={inputCls}>
              <option value="any">Any time</option>
              <option value="morning">Morning (&lt;12:00)</option>
              <option value="afternoon">Afternoon (12:00-17:00)</option>
              <option value="evening">Evening (17:00-21:00)</option>
              <option value="night">Night (&gt;=21:00)</option>
            </select>
          </div>
        </div>
      )}

      {flightResults.length > 0 && filteredResults.length === 0 && (
        <p className="text-xs text-walz-muted-strong">No flights match the selected filters.</p>
      )}

      {filteredResults.length > 0 && (
        <ul className="space-y-2">
          {filteredResults.map((o, i) => (
            <FlightResultCard
              key={i}
              offer={o}
              onSelect={() => openPending(
                'flight', o,
                `${o.airline} · ${o.segments[0]?.originCode} → ${o.segments[o.segments.length - 1]?.destinationCode}`,
                o.supplierTotalMinor, o.supplierCurrency,
              )}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
