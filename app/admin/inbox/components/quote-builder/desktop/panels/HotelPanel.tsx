'use client'

// QUOTE BUILDER V1.2 (desktop) — Hotel search workspace (center column).
// Cheapest rate (rates[0]) is used for pricing, same as the current drawer —
// staff can fine-tune via "Open in quote editor" for anything beyond that.

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { QuoteBuilderState } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import { inputCls, labelCls } from '@/app/admin/inbox/components/quote-builder/styles'
import { HotelResultCard } from '../cards/HotelResultCard'

export interface HotelPanelProps {
  state: QuoteBuilderState
}

export function HotelPanel({ state }: HotelPanelProps) {
  const {
    htDest, setHtDest, htIn, setHtIn, htOut, setHtOut, htAdults, setHtAdults, htRooms, setHtRooms,
    hotelResults, searchHotelsLive, liveSearching, liveError, openPending,
  } = state
  // Closing QA fix — see FlightPanel.tsx's identical comment: "no results"
  // must only appear after a real search, never on first paint.
  const [hasSearched, setHasSearched] = useState(false)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-walz-deep-navy uppercase tracking-wide">Hotel</h2>
        <p className="text-xs text-walz-muted-strong">Search live inventory and add a room rate to this quote.</p>
      </div>

      {liveError && <p role="alert" className="text-xs text-red-700">{liveError}</p>}

      <div className="rounded-xl border border-walz-border bg-white p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="dw-ht-dest">Destination code</label>
            <input id="dw-ht-dest" value={htDest} onChange={e => setHtDest(e.target.value.toUpperCase())}
              placeholder="e.g. PMI" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-ht-rooms">Rooms</label>
            <input id="dw-ht-rooms" type="number" min={1} max={9} value={htRooms}
              onChange={e => setHtRooms(Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-ht-in">Check-in</label>
            <input id="dw-ht-in" type="date" value={htIn} onChange={e => setHtIn(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-ht-out">Check-out</label>
            <input id="dw-ht-out" type="date" value={htOut} onChange={e => setHtOut(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-ht-adults">Adults</label>
            <input id="dw-ht-adults" type="number" min={1} max={9} value={htAdults}
              onChange={e => setHtAdults(Number(e.target.value))} className={inputCls} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => { setHasSearched(true); void searchHotelsLive() }}
          disabled={liveSearching}
          className="w-full min-h-[44px] rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60 flex items-center justify-center gap-2"
        >
          {liveSearching ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Searching…</>) : 'Search hotels'}
        </button>
      </div>

      {hasSearched && !liveSearching && !liveError && hotelResults.length === 0 && (
        <p className="text-xs text-walz-muted-strong">No hotels found. Try adjusting your search.</p>
      )}

      {hotelResults.length > 0 && (
        <ul className="space-y-2">
          {hotelResults.map((o, i) => (
            <HotelResultCard
              key={i}
              offer={o}
              onSelect={rate => openPending('hotel', o, o.hotelName, rate.supplierAmountMinor, rate.supplierCurrency, { rateKey: rate.rateKey })}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
