'use client'

// QUOTE BUILDER V1.2 (desktop) — Flight search workspace (center column).
// Same search fields/behavior as the current CreateQuoteDrawer flight tab —
// only the layout is new. All search-in-progress state (flFromQuery,
// mcLegs, etc.) lives in `state`, not locally, so switching rail services
// never loses in-progress search fields.

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AirportDropdown } from '@/app/admin/inbox/components/AirportDropdown'
import type { QuoteBuilderState } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import { inputCls, labelCls } from '@/app/admin/inbox/components/quote-builder/styles'
import { MultiCityLegsDesktop } from './MultiCityLegsDesktop'
import { FlightResultCard } from '../cards/FlightResultCard'

export interface FlightPanelProps {
  state: QuoteBuilderState
}

export function FlightPanel({ state }: FlightPanelProps) {
  const {
    flTrip, setFlTrip, flFromQuery, flFrom, flFromSug, flToQuery, flTo, flToSug,
    flDepart, setFlDepart, flReturn, setFlReturn, flCabin, setFlCabin, flAdults, setFlAdults,
    onFlFromChange, onFlToChange, selectFlFrom, selectFlTo,
    flightResults, searchFlightsLive, liveSearching, liveError, openPending,
  } = state
  // Closing QA fix: "no results" must only ever appear AFTER a real search
  // — a naive `results.length === 0` check (mobile avoids this for free via
  // its search/results screen split) would show "No flights found" on the
  // very first paint, before staff has searched anything. Purely local UI
  // state — not business state, so it stays out of useQuoteBuilderState.ts.
  const [hasSearched, setHasSearched] = useState(false)

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

        <button
          type="button"
          onClick={() => { setHasSearched(true); void searchFlightsLive() }}
          disabled={liveSearching}
          className="w-full min-h-[44px] rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60 flex items-center justify-center gap-2"
        >
          {liveSearching ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Searching…</>) : 'Search flights'}
        </button>
      </div>

      {hasSearched && !liveSearching && !liveError && flightResults.length === 0 && (
        <p className="text-xs text-walz-muted-strong">No flights found. Try adjusting your search.</p>
      )}

      {flightResults.length > 0 && (
        <ul className="space-y-2">
          {flightResults.map((o, i) => (
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
