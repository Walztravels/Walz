'use client'

// QUOTE BUILDER V1.2 (desktop) — one activity result card.
// No rating/review-count field exists on NormalizedActivityOffer — omitted
// entirely rather than fabricated. Viator-first ordering is already applied
// server-side (lib/activities/index.ts) — this renders results in the
// order the API returned them, no re-sort here.

import type { NormalizedActivityOffer } from '@/lib/travel-search/types'
import { fmtMinor } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'

export interface ActivityResultCardProps {
  offer: NormalizedActivityOffer
  onSelect: () => void
}

export function ActivityResultCard({ offer, onSelect }: ActivityResultCardProps) {
  return (
    <li className="rounded-xl border border-walz-border bg-white overflow-hidden hover:border-walz-gold/60 transition-colors">
      <div className="flex gap-3 p-3">
        <div className="w-20 h-20 rounded-lg bg-walz-off-white flex-shrink-0 overflow-hidden flex items-center justify-center">
          {offer.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={offer.imageUrl}
              alt={offer.name}
              className="w-full h-full object-cover"
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <span className="text-[10px] text-walz-muted-strong">No image</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-walz-deep-navy truncate">{offer.name}</p>
            <p className="font-mono text-sm font-bold text-walz-deep-navy flex-shrink-0">
              {fmtMinor(offer.supplierAmountMinor, offer.supplierCurrency)}
            </p>
          </div>
          <p className="text-[11px] text-walz-muted-strong mt-1">
            {offer.provider === 'viator' ? 'Viator' : 'Hotelbeds'}
            {' · '}{offer.destinationCode}
            {offer.duration ? ` · ${offer.duration}` : ''}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="w-full min-h-[40px] rounded-none rounded-b-xl bg-walz-navy text-white text-xs font-semibold hover:bg-walz-deep-navy transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
      >
        Select &amp; price
      </button>
    </li>
  )
}
