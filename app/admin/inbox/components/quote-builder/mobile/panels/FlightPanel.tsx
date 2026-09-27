'use client'

// QUOTE BUILDER V1.2 (Agent B — Mobile/Tablet) — Flight search/results,
// mobile framing. `screen` splits the single desktop-style search+results
// block into two full mobile screens: 'search' shows only the form,
// 'results' shows only the list — MobileWorkspace decides which is
// current; this component just renders whichever half it's asked for.
import { useMemo, useState } from 'react'
import { AirportDropdown } from '@/app/admin/inbox/components/AirportDropdown'
import { RefreshCw, ArrowLeft } from 'lucide-react'
import { type QuoteBuilderState } from '../../useQuoteBuilderState'
import { inputCls, labelCls } from '../../styles'
import { MultiCityMobileCards } from '../MultiCityMobileCards'
import { FlightResultCard } from '../../desktop/cards/FlightResultCard'
import type { NormalizedFlightOffer } from '@/lib/travel-search/types'

// V1.4 (Agent A) — same stops search-form control as desktop FlightPanel.tsx
// (app/admin/inbox/components/quote-builder/desktop/panels/FlightPanel.tsx),
// values matching the route's STOPS_MAP keys exactly.
const STOPS_SEARCH_OPTIONS: { value: string; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'direct', label: 'Direct' },
  { value: 'max-1-stop', label: 'Max 1 Stop' },
  { value: 'max-2-stops', label: 'Max 2 Stops' },
]

// V1.4 (Agent A) — same client-side RESULT filter convention as desktop
// FlightPanel.tsx: stops filter uses the WORST journey's stop count,
// departure bucket reads the outbound journey's first segment.
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
  return worst >= 2
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
  screen: 'search' | 'results'
  onSearched: () => void
  onEditSearch: () => void
  /** QUOTE BUILDER V1.2 closing fix (QA finding #8) — tablet mounts this
   *  results view with onEditSearch as a no-op (its search form and results
   *  are already shown stacked together, so there's nothing to "go back"
   *  to). Defaults to true so mobile's own usage needs zero changes; tablet
   *  passes false to hide what would otherwise be a dead, confusing
   *  control. */
  showEditSearch?: boolean
}

export function FlightPanel({ state, screen, onSearched, onEditSearch, showEditSearch = true }: FlightPanelProps) {
  const {
    flTrip, setFlTrip, flFromQuery, flFromSug, flToQuery, flToSug,
    flDepart, setFlDepart, flReturn, setFlReturn, flCabin, setFlCabin, flStops, setFlStops, flAdults, setFlAdults,
    flightResults, onFlFromChange, onFlToChange, selectFlFrom, selectFlTo,
    searchFlightsLive, liveSearching, liveError, openPending,
  } = state

  // V1.4 — result filters are local UI state, never persisted in
  // useQuoteBuilderState.ts: they only narrow flightResults, never trigger
  // a new search. Same convention as desktop FlightPanel.tsx.
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

  async function runSearch() {
    await searchFlightsLive()
    onSearched()
  }

  if (screen === 'results') {
    return (
      <div className="p-4 space-y-3">
        {showEditSearch && (
          <button type="button" onClick={onEditSearch} className="inline-flex items-center gap-1 text-xs font-semibold text-walz-navy min-h-[44px]">
            <ArrowLeft className="w-4 h-4" /> Edit search
          </button>
        )}
        {liveSearching && (
          <p className="text-xs text-walz-muted-strong flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5 motion-safe:animate-spin" /> Searching…</p>
        )}
        {liveError && <p role="alert" className="text-xs text-red-700">{liveError}</p>}
        {!liveSearching && !liveError && flightResults.length === 0 && (
          <p className="text-xs text-walz-muted-strong">No flights found. Try adjusting your search.</p>
        )}
        {flightResults.length > 0 && (
          <div className="rounded-xl border border-walz-border bg-white p-3 grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls} htmlFor="mobile-fl-filter-stops">Stops</label>
              <select id="mobile-fl-filter-stops" value={filterStops} onChange={e => setFilterStops(e.target.value as ResultStopsFilter)} className={inputCls}>
                <option value="any">Any</option>
                <option value="direct">Direct</option>
                <option value="1">1 stop</option>
                <option value="2+">2+ stops</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="mobile-fl-filter-airline">Airline</label>
              <select id="mobile-fl-filter-airline" value={filterAirline} onChange={e => setFilterAirline(e.target.value)} className={inputCls}>
                <option value="all">All airlines</option>
                {airlineOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="mobile-fl-filter-departure">Departure</label>
              <select id="mobile-fl-filter-departure" value={filterDeparture} onChange={e => setFilterDeparture(e.target.value as DepartureFilter)} className={inputCls}>
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
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <div>
        <label className={labelCls} htmlFor="mobile-flight-trip">Trip type</label>
        <select id="mobile-flight-trip" value={flTrip} onChange={e => setFlTrip(e.target.value as typeof flTrip)} className={inputCls}>
          <option value="one-way">One-way</option>
          <option value="round-trip">Return</option>
          <option value="multi-city">Multi-city</option>
        </select>
      </div>

      {flTrip === 'multi-city' ? (
        <MultiCityMobileCards state={state} onSearch={() => void runSearch()} />
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <label className={labelCls} htmlFor="mobile-flight-from">From</label>
            <input id="mobile-flight-from" value={flFromQuery} onChange={e => onFlFromChange(e.target.value)} placeholder="City or airport" aria-label="Departure city or airport" className={inputCls} />
            {flFromSug.length > 0 && <AirportDropdown airports={flFromSug} onSelect={selectFlFrom} />}
          </div>
          <div className="relative">
            <label className={labelCls} htmlFor="mobile-flight-to">To</label>
            <input id="mobile-flight-to" value={flToQuery} onChange={e => onFlToChange(e.target.value)} placeholder="City or airport" aria-label="Destination city or airport" className={inputCls} />
            {flToSug.length > 0 && <AirportDropdown airports={flToSug} onSelect={selectFlTo} />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="mobile-flight-depart">Depart</label>
              <input id="mobile-flight-depart" type="date" value={flDepart} onChange={e => setFlDepart(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="mobile-flight-return">Return</label>
              <input id="mobile-flight-return" type="date" value={flReturn} onChange={e => setFlReturn(e.target.value)} disabled={flTrip === 'one-way'} className={`${inputCls} disabled:opacity-40`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="mobile-flight-cabin">Cabin</label>
              <select id="mobile-flight-cabin" value={flCabin} onChange={e => setFlCabin(e.target.value)} className={inputCls}>
                <option value="economy">Economy</option>
                <option value="premium_economy">Premium Economy</option>
                <option value="business">Business</option>
                <option value="first">First</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="mobile-flight-adults">Adults</label>
              <input id="mobile-flight-adults" type="number" min={1} max={9} value={flAdults} onChange={e => setFlAdults(Number(e.target.value))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls} id="mobile-flight-stops-label">Stops</label>
            <div role="group" aria-labelledby="mobile-flight-stops-label" className="grid grid-cols-4 gap-1.5">
              {STOPS_SEARCH_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFlStops(opt.value)}
                  aria-pressed={flStops === opt.value}
                  className={`min-h-[40px] px-1 rounded-lg border text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60 ${
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
            onClick={() => void runSearch()}
            disabled={liveSearching}
            className="w-full min-h-[48px] rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-60"
          >
            {liveSearching ? 'Searching…' : 'Search flights'}
          </button>
          {liveError && <p role="alert" className="text-xs text-red-700">{liveError}</p>}
        </div>
      )}
    </div>
  )
}
