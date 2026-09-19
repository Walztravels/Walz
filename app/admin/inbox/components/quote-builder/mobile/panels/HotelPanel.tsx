'use client'

// QUOTE BUILDER V1.2 (Agent B — Mobile/Tablet) — Hotel search/results,
// mobile framing. See FlightPanel.tsx's header comment for the
// search/results screen split convention this shares.
//
// Result card fields are exactly what NormalizedHotelOffer/
// NormalizedHotelRate carry (lib/travel-search/types.ts) — image, name,
// location, star rating, room/board, cancellation policy, dates, price.
// Cheapest rate (o.rates[0]) drives pricing, same as the pre-V1.2 drawer —
// the full per-rate picker stays out of scope here too.
import { Star, RefreshCw, ArrowLeft } from 'lucide-react'
import { fmtMinor, type QuoteBuilderState } from '../../useQuoteBuilderState'
import { inputCls, labelCls } from '../../styles'

export interface HotelPanelProps {
  state: QuoteBuilderState
  screen: 'search' | 'results'
  onSearched: () => void
  onEditSearch: () => void
  /** QUOTE BUILDER V1.2 closing fix (QA finding #8) — see FlightPanel.tsx's
   *  identical prop comment. */
  showEditSearch?: boolean
}

export function HotelPanel({ state, screen, onSearched, onEditSearch, showEditSearch = true }: HotelPanelProps) {
  const {
    htDest, setHtDest, htIn, setHtIn, htOut, setHtOut, htAdults, setHtAdults, htRooms, setHtRooms,
    hotelResults, searchHotelsLive, liveSearching, liveError, openPending,
  } = state

  async function runSearch() {
    await searchHotelsLive()
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
        {!liveSearching && !liveError && hotelResults.length === 0 && (
          <p className="text-xs text-walz-muted-strong">No hotels found. Try adjusting your search.</p>
        )}
        <ul className="space-y-3">
          {hotelResults.map((o, i) => {
            const cheapest = o.rates[0]
            return (
              <li key={i} className="rounded-xl border border-walz-border overflow-hidden">
                {o.imageUrls[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.imageUrls[0]} alt="" className="w-full h-32 object-cover" />
                )}
                <div className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-walz-deep-navy text-sm truncate">{o.hotelName}</span>
                    <span className="font-mono text-xs text-walz-muted-strong flex-shrink-0">{cheapest ? fmtMinor(cheapest.supplierAmountMinor, cheapest.supplierCurrency) : '—'}</span>
                  </div>
                  {o.starRating != null && o.starRating > 0 && (
                    <div className="flex items-center gap-0.5" aria-label={`${o.starRating} star`}>
                      {Array.from({ length: o.starRating }).map((_, s) => (
                        <Star key={s} className="w-3 h-3 fill-walz-gold text-walz-gold" />
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-walz-muted-strong">{o.city ?? o.destinationCode} · {o.checkIn} → {o.checkOut} · {o.nights}n</p>
                  {cheapest?.roomName && (
                    <p className="text-xs text-walz-muted-strong">{cheapest.roomName}{cheapest.boardName ? ` · ${cheapest.boardName}` : ''}</p>
                  )}
                  {cheapest?.cancellationPolicy && (
                    <p className="text-[11px] text-walz-muted-strong">{cheapest.cancellationPolicy}</p>
                  )}
                  <button
                    type="button"
                    disabled={!cheapest}
                    onClick={() => cheapest && openPending('hotel', o, o.hotelName, cheapest.supplierAmountMinor, cheapest.supplierCurrency, { rateKey: cheapest.rateKey })}
                    className="mt-1 w-full min-h-[44px] rounded-lg bg-walz-navy text-white text-sm font-semibold hover:bg-walz-deep-navy transition-colors disabled:opacity-50"
                  >
                    Select &amp; price
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <div>
        <label className={labelCls} htmlFor="mobile-hotel-dest">Destination code</label>
        <input id="mobile-hotel-dest" value={htDest} onChange={e => setHtDest(e.target.value.toUpperCase())} placeholder="PMI" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="mobile-hotel-checkin">Check-in</label>
          <input id="mobile-hotel-checkin" type="date" value={htIn} onChange={e => setHtIn(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mobile-hotel-checkout">Check-out</label>
          <input id="mobile-hotel-checkout" type="date" value={htOut} onChange={e => setHtOut(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="mobile-hotel-rooms">Rooms</label>
          <input id="mobile-hotel-rooms" type="number" min={1} max={9} value={htRooms} onChange={e => setHtRooms(Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mobile-hotel-adults">Adults</label>
          <input id="mobile-hotel-adults" type="number" min={1} max={9} value={htAdults} onChange={e => setHtAdults(Number(e.target.value))} className={inputCls} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => void runSearch()}
        disabled={liveSearching}
        className="w-full min-h-[48px] rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-60"
      >
        {liveSearching ? 'Searching…' : 'Search hotels'}
      </button>
      {liveError && <p role="alert" className="text-xs text-red-700">{liveError}</p>}
    </div>
  )
}
