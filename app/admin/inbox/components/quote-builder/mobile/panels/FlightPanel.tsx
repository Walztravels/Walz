'use client'

// QUOTE BUILDER V1.2 (Agent B — Mobile/Tablet) — Flight search/results,
// mobile framing. `screen` splits the single desktop-style search+results
// block into two full mobile screens: 'search' shows only the form,
// 'results' shows only the list — MobileWorkspace decides which is
// current; this component just renders whichever half it's asked for.
import { AirportDropdown } from '@/app/admin/inbox/components/AirportDropdown'
import { RefreshCw, ArrowLeft } from 'lucide-react'
import { fmtMinor, type QuoteBuilderState } from '../../useQuoteBuilderState'
import { inputCls, labelCls } from '../../styles'
import { MultiCityMobileCards } from '../MultiCityMobileCards'

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
    flDepart, setFlDepart, flReturn, setFlReturn, flCabin, setFlCabin, flAdults, setFlAdults,
    flightResults, onFlFromChange, onFlToChange, selectFlFrom, selectFlTo,
    searchFlightsLive, liveSearching, liveError, openPending,
  } = state

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
        <ul className="space-y-2">
          {flightResults.map((o, i) => (
            <li key={i} className="rounded-xl border border-walz-border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-walz-deep-navy truncate">
                  {o.airline} · {o.segments[0]?.originCode} → {o.segments[o.segments.length - 1]?.destinationCode}
                </span>
                <span className="font-mono text-xs text-walz-muted-strong flex-shrink-0">{fmtMinor(o.supplierTotalMinor, o.supplierCurrency)}</span>
              </div>
              <div className="text-xs text-walz-muted-strong mt-1">
                {o.cabinClass} · {o.tripType} · {o.segments.length - 1} stop(s){o.checkedBaggage ? ` · ${o.checkedBaggage}` : ''}
              </div>
              <button
                type="button"
                onClick={() => openPending('flight', o, `${o.airline} · ${o.segments[0]?.originCode} → ${o.segments[o.segments.length - 1]?.destinationCode}`, o.supplierTotalMinor, o.supplierCurrency)}
                className="mt-2 w-full min-h-[44px] rounded-lg bg-walz-navy text-white text-sm font-semibold hover:bg-walz-deep-navy transition-colors"
              >
                Select &amp; price
              </button>
            </li>
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
