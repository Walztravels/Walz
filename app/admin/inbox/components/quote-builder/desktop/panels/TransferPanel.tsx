'use client'

// QUOTE BUILDER V1.2 (desktop) — Transfer search workspace (center column).
// Item D (from the original drawer): TRANSFER_UNAVAILABLE (503, Hotelbeds
// entitlement/quota) gets a calm role="status" banner instead of the
// generic red liveError, and now points at the Custom Item rail entry via
// an explicit "Add Manual Transfer" action (selectService('manual')) rather
// than a plain "above" text reference, since the manual form no longer sits
// directly below this one in a desktop 3-column layout.

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { QuoteBuilderState } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import { inputCls, labelCls } from '@/app/admin/inbox/components/quote-builder/styles'
import { TransferResultCard } from '../cards/TransferResultCard'

export interface TransferPanelProps {
  state: QuoteBuilderState
}

export function TransferPanel({ state }: TransferPanelProps) {
  const {
    trPickupType, setTrPickupType, trPickupCode, setTrPickupCode, trDropType, setTrDropType, trDropCode, setTrDropCode,
    trDate, setTrDate, trAdults, setTrAdults, transferResults, searchTransfersLive, liveSearching, liveError,
    transferUnavailable, openPending, selectService,
  } = state
  // Closing QA fix — see FlightPanel.tsx's identical comment: "no results"
  // must only appear after a real search, never on first paint.
  const [hasSearched, setHasSearched] = useState(false)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-walz-deep-navy uppercase tracking-wide">Transfer</h2>
        <p className="text-xs text-walz-muted-strong">Search live inventory and add a transfer to this quote.</p>
      </div>

      {liveError && <p role="alert" className="text-xs text-red-700">{liveError}</p>}

      <div className="rounded-xl border border-walz-border bg-white p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="dw-tr-pickup-type">Pickup type</label>
            <select id="dw-tr-pickup-type" value={trPickupType} onChange={e => setTrPickupType(e.target.value)} className={inputCls}>
              <option>IATA</option><option>ATLAS</option><option>RESORT</option><option>PORT</option><option>STATION</option><option>HOTEL</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-tr-pickup-code">Pickup code</label>
            <input id="dw-tr-pickup-code" value={trPickupCode} onChange={e => setTrPickupCode(e.target.value.toUpperCase())} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-tr-drop-type">Dropoff type</label>
            <select id="dw-tr-drop-type" value={trDropType} onChange={e => setTrDropType(e.target.value)} className={inputCls}>
              <option>HOTEL</option><option>IATA</option><option>ATLAS</option><option>RESORT</option><option>PORT</option><option>STATION</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-tr-drop-code">Dropoff code</label>
            <input id="dw-tr-drop-code" value={trDropCode} onChange={e => setTrDropCode(e.target.value.toUpperCase())} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-tr-date">Date</label>
            <input id="dw-tr-date" type="date" value={trDate} onChange={e => setTrDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-tr-adults">Adults</label>
            <input id="dw-tr-adults" type="number" min={1} max={20} value={trAdults}
              onChange={e => setTrAdults(Number(e.target.value))} className={inputCls} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => { setHasSearched(true); void searchTransfersLive() }}
          disabled={liveSearching}
          className="w-full min-h-[44px] rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60 flex items-center justify-center gap-2"
        >
          {liveSearching ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Searching…</>) : 'Search transfers'}
        </button>
      </div>

      {transferUnavailable && (
        <div role="status" className="rounded-xl border border-walz-border bg-walz-off-white p-4 space-y-2">
          <p className="text-xs text-walz-muted-strong">{transferUnavailable}</p>
          <button
            type="button"
            onClick={() => selectService('manual')}
            className="min-h-[40px] px-4 rounded-lg bg-walz-navy text-white text-xs font-semibold hover:bg-walz-deep-navy transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
          >
            Add Manual Transfer
          </button>
        </div>
      )}

      {hasSearched && !liveSearching && !liveError && !transferUnavailable && transferResults.length === 0 && (
        <p className="text-xs text-walz-muted-strong">No transfers found. Try adjusting your search.</p>
      )}

      {transferResults.length > 0 && (
        <ul className="space-y-2">
          {transferResults.map((o, i) => (
            <TransferResultCard
              key={i}
              offer={o}
              onSelect={() => openPending('transfer', o, o.name, o.supplierAmountMinor, o.supplierCurrency)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
