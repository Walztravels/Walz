'use client'

// QUOTE BUILDER V1.2 (desktop) — one hotel result card.
//
// Pricing shown here is `fmtMinor(cheapest.supplierAmountMinor, ...)` — the
// SUPPLIER/NET cost, staff-facing only. This is never the client price
// (that's computed by calculateBookingPrice in the Select & Price panel) —
// labeled "Net cost" so staff never mistake it for what the client pays.

import type { NormalizedHotelOffer, NormalizedHotelRate } from '@/lib/travel-search/types'
import { fmtMinor } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'

export interface HotelResultCardProps {
  offer: NormalizedHotelOffer
  onSelect: (rate: NormalizedHotelRate) => void
}

export function HotelResultCard({ offer, onSelect }: HotelResultCardProps) {
  const cheapest = offer.rates[0] as NormalizedHotelRate | undefined
  const image = offer.imageUrls[0]

  return (
    <li className="rounded-xl border border-walz-border bg-white overflow-hidden hover:border-walz-gold/60 transition-colors">
      <div className="flex gap-3 p-3">
        <div className="w-20 h-20 rounded-lg bg-walz-off-white flex-shrink-0 overflow-hidden flex items-center justify-center">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={offer.hotelName}
              className="w-full h-full object-cover"
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <span className="text-[10px] text-walz-muted-strong">No image</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-walz-deep-navy truncate">{offer.hotelName}</p>
              <p className="text-[11px] text-walz-muted-strong">
                {offer.city ?? offer.destinationCode}
                {offer.starRating ? ` · ${'★'.repeat(Math.round(offer.starRating))}` : ''}
              </p>
            </div>
            <p className="font-mono text-sm font-bold text-walz-deep-navy flex-shrink-0">
              {cheapest ? fmtMinor(cheapest.supplierAmountMinor, cheapest.supplierCurrency) : '—'}
            </p>
          </div>
          <p className="text-[11px] text-walz-muted-strong mt-1">
            {offer.checkIn} → {offer.checkOut} · {offer.nights} night{offer.nights !== 1 ? 's' : ''}
          </p>
          {cheapest && (
            <p className="text-[11px] text-walz-muted-strong mt-0.5 truncate">
              {cheapest.roomName ?? 'Room'}{cheapest.boardName ? ` · ${cheapest.boardName}` : ''}
              {' · '}{cheapest.isRefundable ? 'Refundable' : cheapest.cancellationPolicy ?? 'Non-refundable'}
            </p>
          )}
          <p className="text-[10px] text-walz-muted-strong mt-0.5">Net cost (staff only)</p>
        </div>
      </div>
      <button
        type="button"
        disabled={!cheapest}
        onClick={() => cheapest && onSelect(cheapest)}
        className="w-full min-h-[40px] rounded-none rounded-b-xl bg-walz-navy text-white text-xs font-semibold hover:bg-walz-deep-navy transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
      >
        Select &amp; price
      </button>
    </li>
  )
}
