'use client'

// QUOTE BUILDER V1.2 (Agent B — Mobile/Tablet) — multi-city legs, mobile
// framing. The brief is explicit: never a horizontal row of legs on
// mobile — vertical stacked cards, one per leg, each independently
// editable/removable. The min-2/max-MC_MAX_LEGS rule is enforced entirely
// inside the hook's addMcLeg/removeMcLeg (both already no-op at the
// boundaries per useQuoteBuilderState.ts) — this component only ever calls
// them, never re-implements the guard.
import { useMemo } from 'react'
import { Trash2, Plane } from 'lucide-react'
import { AirportDropdown } from '@/app/admin/inbox/components/AirportDropdown'
import { MC_MAX_LEGS, type QuoteBuilderState, type FlLeg } from '../useQuoteBuilderState'
import { inputCls, labelCls } from '../styles'

// V1.4 (Agent A) — client-side pre-check mirroring the SAME chronology rule
// the server enforces (app/api/admin/travel-search/flights/route.ts:
// "Segment N: departure date cannot be before Segment N-1's departure
// date."). A UI-level convenience only — never a replacement for the
// server check. Only legs with BOTH dates filled are compared.
function mcLegsChronologyError(legs: FlLeg[]): string | null {
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1].depart
    const cur = legs[i].depart
    if (prev && cur && cur < prev) {
      return `Flight ${i + 1}: departure date cannot be before Flight ${i}'s departure date.`
    }
  }
  return null
}

export interface MultiCityMobileCardsProps {
  state: QuoteBuilderState
  /** Fired on tap of the trailing "Search Flights" button — the caller
   *  (FlightPanel) wraps state.searchFlightsLive() plus its own
   *  search->results screen transition into this one callback so this
   *  component never needs to know about mobile screen navigation. */
  onSearch: () => void
}

// V1.4 (Agent A) — same stops search-form control as FlightPanel.tsx (both
// desktop and mobile), values matching the route's STOPS_MAP keys exactly.
// Multi-city's cabin/adults fields live here (not in mobile FlightPanel.tsx,
// which only renders them for the plain one-way/return branch), so Stops
// needs its own copy here too or a multi-city search on mobile would never
// be able to change it.
const STOPS_SEARCH_OPTIONS: { value: string; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'direct', label: 'Direct' },
  { value: 'max-1-stop', label: 'Max 1 Stop' },
  { value: 'max-2-stops', label: 'Max 2 Stops' },
]

export function MultiCityMobileCards({ state, onSearch }: MultiCityMobileCardsProps) {
  const {
    mcLegs, updateMcLeg, addMcLeg, removeMcLeg, onMcFromChange, onMcToChange, selectMcFrom, selectMcTo,
    flCabin, setFlCabin, flAdults, setFlAdults, flStops, setFlStops, liveSearching,
  } = state
  const chronoError = useMemo(() => mcLegsChronologyError(mcLegs), [mcLegs])

  return (
    <div className="space-y-3">
      <p className={labelCls}>Multi-city</p>
      {mcLegs.map((leg, i) => (
        <div key={i} className="rounded-xl border border-walz-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-walz-deep-navy flex items-center gap-1">
              <Plane className="w-3.5 h-3.5" /> Flight {i + 1}
            </p>
            {/* Leg 1 and Leg 2 (index 0/1) are mandatory — no Remove. Legs
                3+ (index >= 2) may be removed; removeMcLeg's own min-2
                guard stays the source of truth, this is just the affordance. */}
            {i >= 2 && (
              <button
                type="button"
                onClick={() => removeMcLeg(i)}
                aria-label={`Remove flight ${i + 1}`}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-walz-muted-strong hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="relative">
            <input
              value={leg.from} onChange={e => onMcFromChange(i, e.target.value)}
              placeholder={`Leg ${i + 1} from`} aria-label={`Leg ${i + 1} origin`} className={inputCls}
            />
            {leg.fromSug.length > 0 && <AirportDropdown airports={leg.fromSug} onSelect={a => selectMcFrom(i, a)} />}
          </div>
          <div className="flex items-center justify-center text-walz-muted-strong text-sm" aria-hidden="true">↓</div>
          <div className="relative">
            <input
              value={leg.to} onChange={e => onMcToChange(i, e.target.value)}
              placeholder={`Leg ${i + 1} to`} aria-label={`Leg ${i + 1} destination`} className={inputCls}
            />
            {leg.toSug.length > 0 && <AirportDropdown airports={leg.toSug} onSelect={a => selectMcTo(i, a)} />}
          </div>
          <input type="date" value={leg.depart} onChange={e => updateMcLeg(i, { depart: e.target.value })} className={inputCls} aria-label={`Leg ${i + 1} departure date`} />
        </div>
      ))}
      {chronoError && <p role="alert" className="text-xs text-red-700">{chronoError}</p>}
      {mcLegs.length < MC_MAX_LEGS && (
        <button
          type="button"
          onClick={addMcLeg}
          className="w-full min-h-[44px] rounded-lg border border-dashed border-walz-border text-sm font-semibold text-walz-navy hover:bg-walz-navy/5 transition-colors"
        >
          + Add Flight
        </button>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="mc-cabin">Cabin</label>
          <select id="mc-cabin" value={flCabin} onChange={e => setFlCabin(e.target.value)} className={inputCls}>
            <option value="economy">Economy</option>
            <option value="premium_economy">Premium Economy</option>
            <option value="business">Business</option>
            <option value="first">First</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="mc-adults">Adults</label>
          <input id="mc-adults" type="number" min={1} max={9} value={flAdults} onChange={e => setFlAdults(Number(e.target.value))} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls} id="mc-stops-label">Stops</label>
        <div role="group" aria-labelledby="mc-stops-label" className="grid grid-cols-4 gap-1.5">
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
        onClick={() => { if (!chronoError) onSearch() }}
        disabled={liveSearching}
        className="w-full min-h-[48px] rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-60"
      >
        {liveSearching ? 'Searching…' : 'Search Flights'}
      </button>
    </div>
  )
}
