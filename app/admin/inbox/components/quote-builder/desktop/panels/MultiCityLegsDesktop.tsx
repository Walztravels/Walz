'use client'

// QUOTE BUILDER V1.2 (desktop) — multi-city legs, scannable rows.
// Cabin/adults live in FlightPanel.tsx (shared across one-way/return/
// multi-city) — this component only owns the per-leg origin/destination/
// date rows plus add/remove, wired straight to state's existing
// mcLegs/updateMcLeg/addMcLeg/removeMcLeg/onMcFromChange/onMcToChange/
// selectMcFrom/selectMcTo — no new leg state.

import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { AirportDropdown } from '@/app/admin/inbox/components/AirportDropdown'
import { MC_MAX_LEGS, type QuoteBuilderState, type FlLeg } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import { inputCls, labelCls } from '@/app/admin/inbox/components/quote-builder/styles'

export interface MultiCityLegsDesktopProps {
  state: QuoteBuilderState
}

// V1.4 (Agent A) — client-side pre-check mirroring the SAME chronology rule
// the server now enforces (app/api/admin/travel-search/flights/route.ts:
// "Segment N: departure date cannot be before Segment N-1's departure
// date."). This is a UI-level convenience only — it never replaces the
// server check, which still runs on every request regardless of what this
// returns. Only legs with BOTH dates filled are compared, so an
// in-progress incomplete leg never falsely triggers it.
export function mcLegsChronologyError(legs: FlLeg[]): string | null {
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1].depart
    const cur = legs[i].depart
    if (prev && cur && cur < prev) {
      return `Flight ${i + 1}: departure date cannot be before Flight ${i}'s departure date.`
    }
  }
  return null
}

export function MultiCityLegsDesktop({ state }: MultiCityLegsDesktopProps) {
  const { mcLegs, updateMcLeg, addMcLeg, removeMcLeg, onMcFromChange, onMcToChange, selectMcFrom, selectMcTo } = state
  const chronoError = useMemo(() => mcLegsChronologyError(mcLegs), [mcLegs])

  return (
    <div className="space-y-2">
      {mcLegs.map((leg, i) => (
        <div key={i} className="rounded-lg border border-dashed border-walz-border p-3">
          <div className="flex items-center justify-between mb-1">
            <p className={labelCls}>Flight {i + 1}</p>
            {/* Leg 1 and Leg 2 (index 0/1) are mandatory — no Remove. Legs
                3+ (index >= 2) may be removed; removeMcLeg's own min-2 guard
                stays the source of truth, this is just the affordance. */}
            {i >= 2 && (
              <button
                type="button"
                onClick={() => removeMcLeg(i)}
                aria-label={`Remove flight ${i + 1}`}
                className="flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center text-walz-muted-strong hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-walz-gold/60 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="relative">
              <input
                value={leg.from}
                onChange={e => onMcFromChange(i, e.target.value)}
                placeholder="From"
                aria-label={`Leg ${i + 1} origin`}
                className={inputCls}
              />
              {leg.fromSug.length > 0 && <AirportDropdown airports={leg.fromSug} onSelect={a => selectMcFrom(i, a)} />}
            </div>
            <div className="relative">
              <input
                value={leg.to}
                onChange={e => onMcToChange(i, e.target.value)}
                placeholder="To"
                aria-label={`Leg ${i + 1} destination`}
                className={inputCls}
              />
              {leg.toSug.length > 0 && <AirportDropdown airports={leg.toSug} onSelect={a => selectMcTo(i, a)} />}
            </div>
            <input
              type="date"
              value={leg.depart}
              onChange={e => updateMcLeg(i, { depart: e.target.value })}
              aria-label={`Leg ${i + 1} date`}
              className={inputCls}
            />
          </div>
          {leg.fromCode && leg.toCode && leg.depart && (
            <p className="text-[11px] text-walz-muted-strong mt-1">
              {leg.fromCode} → {leg.toCode} · {leg.depart}
            </p>
          )}
        </div>
      ))}
      {chronoError && <p role="alert" className="text-xs text-red-700">{chronoError}</p>}
      {mcLegs.length < MC_MAX_LEGS && (
        <button
          type="button"
          onClick={addMcLeg}
          className="text-xs font-semibold text-walz-navy hover:underline focus:outline-none focus:ring-2 focus:ring-walz-gold/60 rounded min-h-[36px] px-1"
        >
          + Add another flight
        </button>
      )}
    </div>
  )
}
