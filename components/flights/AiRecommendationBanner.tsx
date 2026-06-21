'use client'

import type { FlightItinerary } from '@/lib/flights/types'
import type { AiRecommendation } from '@/store/flightStore'
import { formatDuration, formatTime } from '@/lib/flights/utils'

interface Props {
  recommendation: AiRecommendation
  offer:          FlightItinerary
  hasSavedCard:   boolean
  onBookNow:      (offer: FlightItinerary) => void
  onDismiss:      () => void
}

function brandIcon(brand: string) {
  const icons: Record<string, string> = {
    visa:       '💳',
    mastercard: '💳',
    amex:       '💳',
  }
  return icons[brand.toLowerCase()] ?? '💳'
}

export function AiRecommendationBanner({ recommendation, offer, hasSavedCard, onBookNow, onDismiss }: Props) {
  const seg     = offer.segments[0]
  const segLast = offer.segments[offer.segments.length - 1]
  const confidence = Math.round(recommendation.confidence * 100)

  return (
    <div className="relative rounded-2xl overflow-hidden border border-[#C9A84C]/30 bg-gradient-to-br from-[#0B1F3A] to-[#132038] shadow-lg mb-5">
      {/* Gold accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#C9A84C]" />

      <div className="pl-5 pr-4 pt-4 pb-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#C9A84C] flex items-center justify-center flex-shrink-0">
              <span className="text-[#0B1F3A] font-black text-[10px]">AI</span>
            </div>
            <div>
              <p className="text-[#C9A84C] text-[11px] font-bold uppercase tracking-widest">
                Jade AI Recommendation
              </p>
              <p className="text-white/30 text-[10px]">{confidence}% confidence</p>
            </div>
          </div>
          <button onClick={onDismiss} className="text-white/30 hover:text-white/70 transition-colors text-lg leading-none flex-shrink-0" aria-label="Dismiss">
            ×
          </button>
        </div>

        {/* Flight summary row */}
        <div className="flex items-center gap-4 mb-3">
          {seg?.airlineLogo && (
            <img src={seg.airlineLogo} alt={seg.airlineName} className="w-8 h-8 rounded-lg object-contain bg-white/10 p-0.5 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <span>{seg?.departureIata}</span>
              <span className="text-white/30 text-sm">→</span>
              <span>{segLast?.arrivalIata}</span>
              <span className="text-white/30 text-xs font-normal">·</span>
              <span className="text-white/60 text-xs font-medium">
                {formatTime(seg?.departureTime ?? '')} – {formatTime(segLast?.arrivalTime ?? '')}
              </span>
            </div>
            <p className="text-white/40 text-xs mt-0.5">
              {offer.stops === 0 ? 'Direct' : `${offer.stops} stop${offer.stops > 1 ? 's' : ''}`}
              {' · '}{formatDuration(offer.totalDuration)}
              {' · '}{offer.baggageInfo.checked}
              {offer.refundable && ' · Refundable'}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[#C9A84C] font-bold text-xl leading-none">
              {new Intl.NumberFormat('en-GB', {
                style:    'currency',
                currency: offer.price.currency ?? 'GBP',
                minimumFractionDigits: 0,
              }).format(offer.price.total)}
            </p>
            <p className="text-white/30 text-[10px] mt-0.5">total</p>
          </div>
        </div>

        {/* AI reason */}
        <div className="bg-white/5 rounded-xl px-3 py-2.5 mb-3">
          <p className="text-white/70 text-xs leading-relaxed">
            <span className="text-[#C9A84C] font-semibold">Why: </span>
            {recommendation.reason}
          </p>
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onBookNow(offer)}
            className="flex-1 py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] transition-colors flex items-center justify-center gap-2">
            {hasSavedCard ? (
              <>
                <span>⚡</span>
                Book with saved card
              </>
            ) : (
              <>
                <span>✈️</span>
                Book this flight
              </>
            )}
          </button>
          <p className="text-white/25 text-[10px] leading-tight text-right">
            {hasSavedCard ? 'One tap · No re-entry' : 'Opens booking modal'}
          </p>
        </div>
      </div>
    </div>
  )
}
