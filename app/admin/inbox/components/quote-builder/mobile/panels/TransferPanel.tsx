'use client'

// QUOTE BUILDER V1.2 (Agent B — Mobile/Tablet) — Transfer search/results,
// mobile framing. See FlightPanel.tsx's header comment for the
// search/results screen split convention this shares.
//
// Item D parity: the known TRANSFER_UNAVAILABLE case gets the exact calm
// role="status" copy the pre-V1.2 drawer used, plus a direct "Add Manual
// Transfer" action (state.selectService('manual')) — never a dead end that
// blocks quote creation.
import { RefreshCw, ArrowLeft } from 'lucide-react'
import { fmtMinor, type QuoteBuilderState } from '../../useQuoteBuilderState'
import { inputCls, labelCls } from '../../styles'

export interface TransferPanelProps {
  state: QuoteBuilderState
  screen: 'search' | 'results'
  onSearched: () => void
  onEditSearch: () => void
  /** QUOTE BUILDER V1.2 closing fix (QA finding #8) — see
   *  mobile/panels/FlightPanel.tsx's identical prop comment. */
  showEditSearch?: boolean
}

const PICKUP_TYPES = ['IATA', 'ATLAS', 'RESORT', 'PORT', 'STATION', 'HOTEL'] as const
const DROPOFF_TYPES = ['HOTEL', 'IATA', 'ATLAS', 'RESORT', 'PORT', 'STATION'] as const

export function TransferPanel({ state, screen, onSearched, onEditSearch, showEditSearch = true }: TransferPanelProps) {
  const {
    trPickupType, setTrPickupType, trPickupCode, setTrPickupCode, trDropType, setTrDropType, trDropCode, setTrDropCode,
    trDate, setTrDate, trAdults, setTrAdults, transferResults, searchTransfersLive,
    liveSearching, liveError, transferUnavailable, openPending, selectService,
  } = state

  async function runSearch() {
    await searchTransfersLive()
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
        {transferUnavailable && (
          <div role="status" className="rounded-lg border border-walz-border bg-walz-off-white p-3 space-y-2 text-sm text-walz-muted-strong">
            <p>{transferUnavailable}</p>
            <button
              type="button"
              onClick={() => selectService('manual')}
              className="min-h-[44px] px-4 rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors"
            >
              Add Manual Transfer
            </button>
          </div>
        )}
        {!liveSearching && !liveError && !transferUnavailable && transferResults.length === 0 && (
          <p className="text-xs text-walz-muted-strong">No transfers found. Try adjusting your search.</p>
        )}
        <ul className="space-y-3">
          {transferResults.map((o, i) => (
            <li key={i} className="rounded-xl border border-walz-border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-walz-deep-navy truncate">{o.name}</span>
                <span className="font-mono text-xs text-walz-muted-strong flex-shrink-0">{fmtMinor(o.supplierAmountMinor, o.supplierCurrency)}</span>
              </div>
              <div className="text-xs text-walz-muted-strong mt-1">{o.pickupCode} → {o.dropoffCode} · {o.transferDate}</div>
              <button
                type="button"
                onClick={() => openPending('transfer', o, o.name, o.supplierAmountMinor, o.supplierCurrency)}
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="mobile-transfer-pickup-type">Pickup type</label>
          <select id="mobile-transfer-pickup-type" value={trPickupType} onChange={e => setTrPickupType(e.target.value)} className={inputCls}>
            {PICKUP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="mobile-transfer-pickup-code">Pickup code</label>
          <input id="mobile-transfer-pickup-code" value={trPickupCode} onChange={e => setTrPickupCode(e.target.value.toUpperCase())} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mobile-transfer-drop-type">Dropoff type</label>
          <select id="mobile-transfer-drop-type" value={trDropType} onChange={e => setTrDropType(e.target.value)} className={inputCls}>
            {DROPOFF_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="mobile-transfer-drop-code">Dropoff code</label>
          <input id="mobile-transfer-drop-code" value={trDropCode} onChange={e => setTrDropCode(e.target.value.toUpperCase())} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mobile-transfer-date">Date</label>
          <input id="mobile-transfer-date" type="date" value={trDate} onChange={e => setTrDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mobile-transfer-adults">Adults</label>
          <input id="mobile-transfer-adults" type="number" min={1} max={20} value={trAdults} onChange={e => setTrAdults(Number(e.target.value))} className={inputCls} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => void runSearch()}
        disabled={liveSearching}
        className="w-full min-h-[48px] rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-60"
      >
        {liveSearching ? 'Searching…' : 'Search transfers'}
      </button>
      {liveError && <p role="alert" className="text-xs text-red-700">{liveError}</p>}
    </div>
  )
}
