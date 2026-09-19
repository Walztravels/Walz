'use client'

// QUOTE BUILDER V1.2 (Agent B — Mobile/Tablet) — Activity search/results,
// mobile framing. See FlightPanel.tsx's header comment for the
// search/results screen split convention this shares.
//
// Result card fields are exactly what NormalizedActivityOffer carries
// (lib/travel-search/types.ts) — image, title, destination, duration,
// supplier, price. No rating/review-count field exists on this type — it
// is deliberately omitted rather than fabricated.
import { RefreshCw, ArrowLeft } from 'lucide-react'
import { fmtMinor, type QuoteBuilderState } from '../../useQuoteBuilderState'
import { inputCls, labelCls } from '../../styles'

export interface ActivityPanelProps {
  state: QuoteBuilderState
  screen: 'search' | 'results'
  onSearched: () => void
  onEditSearch: () => void
  /** QUOTE BUILDER V1.2 closing fix (QA finding #8) — see
   *  mobile/panels/FlightPanel.tsx's identical prop comment. */
  showEditSearch?: boolean
}

export function ActivityPanel({ state, screen, onSearched, onEditSearch, showEditSearch = true }: ActivityPanelProps) {
  const {
    acDest, setAcDest, acFrom, setAcFrom, acTo, setAcTo, acAdults, setAcAdults,
    activityResults, searchActivitiesLive, liveSearching, liveError, openPending,
  } = state

  async function runSearch() {
    await searchActivitiesLive()
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
        {!liveSearching && !liveError && activityResults.length === 0 && (
          <p className="text-xs text-walz-muted-strong">No activities found. Try adjusting your search.</p>
        )}
        <ul className="space-y-3">
          {activityResults.map((o, i) => (
            <li key={i} className="rounded-xl border border-walz-border overflow-hidden">
              {o.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.imageUrl} alt="" className="w-full h-32 object-cover" />
              )}
              <div className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-walz-deep-navy text-sm truncate">{o.name}</span>
                  <span className="font-mono text-xs text-walz-muted-strong flex-shrink-0">{fmtMinor(o.supplierAmountMinor, o.supplierCurrency)}</span>
                </div>
                <p className="text-xs text-walz-muted-strong">
                  {o.destinationCode}{o.duration ? ` · ${o.duration}` : ''} · {o.provider === 'viator' ? 'Viator' : 'Hotelbeds'}
                </p>
                <button
                  type="button"
                  onClick={() => openPending('activity', o, o.name, o.supplierAmountMinor, o.supplierCurrency)}
                  className="mt-1 w-full min-h-[44px] rounded-lg bg-walz-navy text-white text-sm font-semibold hover:bg-walz-deep-navy transition-colors"
                >
                  Select &amp; price
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <div>
        <label className={labelCls} htmlFor="mobile-activity-dest">Destination</label>
        <input id="mobile-activity-dest" value={acDest} onChange={e => setAcDest(e.target.value)} placeholder="City or region" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="mobile-activity-from">From date</label>
          <input id="mobile-activity-from" type="date" value={acFrom} onChange={e => setAcFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mobile-activity-to">To date</label>
          <input id="mobile-activity-to" type="date" value={acTo} onChange={e => setAcTo(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="mobile-activity-adults">Adults</label>
        <input id="mobile-activity-adults" type="number" min={1} max={20} value={acAdults} onChange={e => setAcAdults(Number(e.target.value))} className={inputCls} />
      </div>
      <button
        type="button"
        onClick={() => void runSearch()}
        disabled={liveSearching}
        className="w-full min-h-[48px] rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-60"
      >
        {liveSearching ? 'Searching…' : 'Search activities'}
      </button>
      {liveError && <p role="alert" className="text-xs text-red-700">{liveError}</p>}
    </div>
  )
}
