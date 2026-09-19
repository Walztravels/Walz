'use client'

// QUOTE BUILDER V1.2 (desktop) — Activity search workspace (center column).
// Viator-first ordering is already applied server-side (lib/activities/
// index.ts) — results render in the order the API returns them.

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { QuoteBuilderState } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import { inputCls, labelCls } from '@/app/admin/inbox/components/quote-builder/styles'
import { ActivityResultCard } from '../cards/ActivityResultCard'

export interface ActivityPanelProps {
  state: QuoteBuilderState
}

export function ActivityPanel({ state }: ActivityPanelProps) {
  const {
    acDest, setAcDest, acFrom, setAcFrom, acTo, setAcTo, acAdults, setAcAdults,
    activityResults, searchActivitiesLive, liveSearching, liveError, openPending,
  } = state
  // Closing QA fix — see FlightPanel.tsx's identical comment: "no results"
  // must only appear after a real search, never on first paint.
  const [hasSearched, setHasSearched] = useState(false)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-walz-deep-navy uppercase tracking-wide">Activity</h2>
        <p className="text-xs text-walz-muted-strong">Search live inventory and add an activity to this quote.</p>
      </div>

      {liveError && <p role="alert" className="text-xs text-red-700">{liveError}</p>}

      <div className="rounded-xl border border-walz-border bg-white p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="dw-ac-dest">Destination</label>
            <input id="dw-ac-dest" value={acDest} onChange={e => setAcDest(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-ac-adults">Adults</label>
            <input id="dw-ac-adults" type="number" min={1} max={20} value={acAdults}
              onChange={e => setAcAdults(Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-ac-from">From date</label>
            <input id="dw-ac-from" type="date" value={acFrom} onChange={e => setAcFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-ac-to">To date</label>
            <input id="dw-ac-to" type="date" value={acTo} onChange={e => setAcTo(e.target.value)} className={inputCls} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => { setHasSearched(true); void searchActivitiesLive() }}
          disabled={liveSearching}
          className="w-full min-h-[44px] rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60 flex items-center justify-center gap-2"
        >
          {liveSearching ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Searching…</>) : 'Search activities'}
        </button>
      </div>

      {hasSearched && !liveSearching && !liveError && activityResults.length === 0 && (
        <p className="text-xs text-walz-muted-strong">No activities found. Try adjusting your search.</p>
      )}

      {activityResults.length > 0 && (
        <ul className="space-y-2">
          {activityResults.map((o, i) => (
            <ActivityResultCard
              key={i}
              offer={o}
              onSelect={() => openPending('activity', o, o.name, o.supplierAmountMinor, o.supplierCurrency)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
