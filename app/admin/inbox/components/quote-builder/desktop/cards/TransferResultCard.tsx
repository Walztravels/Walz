'use client'

// QUOTE BUILDER V1.2 (desktop) — one transfer result card.

import type { NormalizedTransferOffer } from '@/lib/travel-search/types'
import { fmtMinor } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'

export interface TransferResultCardProps {
  offer: NormalizedTransferOffer
  onSelect: () => void
}

export function TransferResultCard({ offer, onSelect }: TransferResultCardProps) {
  return (
    <li className="rounded-xl border border-walz-border bg-white p-3 hover:border-walz-gold/60 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-walz-deep-navy truncate">{offer.name}</p>
        <p className="font-mono text-sm font-bold text-walz-deep-navy flex-shrink-0">
          {fmtMinor(offer.supplierAmountMinor, offer.supplierCurrency)}
        </p>
      </div>
      <p className="text-[11px] text-walz-muted-strong mt-0.5">
        {offer.pickupCode} → {offer.dropoffCode} · {offer.transferDate}
        {offer.vehicle ? ` · ${offer.vehicle}` : ''}
      </p>
      <button
        type="button"
        onClick={onSelect}
        className="mt-2 w-full min-h-[40px] rounded-lg bg-walz-navy text-white text-xs font-semibold hover:bg-walz-deep-navy transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
      >
        Select &amp; price
      </button>
    </li>
  )
}
