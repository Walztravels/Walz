'use client'

import type { FlightItinerary } from '@/lib/flights/types'
import { formatDuration } from '@/lib/flights/utils'
import { useFlightPrice } from '@/lib/hooks/useFlightPrice'

interface Props {
  from:       string
  to:         string
  results:    FlightItinerary[]
  totalCount: number
  onViewAll:  () => void
}

const BADGE_CFG = {
  recommended: { icon: '⭐', label: 'Recommended',   bg: 'bg-blue-50',        border: 'border-blue-200',       text: 'text-blue-700',   sub: 'Top pick'    },
  cheapest:    { icon: '💰', label: 'Cheapest',      bg: 'bg-green-50',       border: 'border-green-200',      text: 'text-green-700',  sub: 'Save more'   },
  fastest:     { icon: '⚡', label: 'Fastest',       bg: 'bg-amber-50',       border: 'border-amber-200',      text: 'text-amber-700',  sub: 'Save time'   },
  luxury:      { icon: '👑', label: 'Luxury Choice', bg: 'bg-purple-50',      border: 'border-purple-200',     text: 'text-purple-700', sub: 'Lounge incl.'},
  'best-value':{ icon: '🎯', label: 'Best Value',    bg: 'bg-[#C9A84C]/10',   border: 'border-[#C9A84C]/30',   text: 'text-[#8B6914]',  sub: 'Value pick'  },
} as const

export function FlightSummaryBanner({ from, to, results, totalCount, onViewAll }: Props) {
  const fp = useFlightPrice()
  const highlights = results.filter(r => r.badge).slice(0, 4)

  return (
    <div className="w-full max-w-3xl">
      {/* Header */}
      <div className="text-center mb-8">
        <p className="text-[#C9A84C] text-xs font-semibold tracking-[0.2em] uppercase mb-3">
          🤖 Walz AI — Best Flights Found
        </p>
        <h1 className="font-display text-3xl lg:text-4xl font-bold text-white mb-2">
          {from} → {to}
        </h1>
        <p className="text-white/50 text-sm">
          We found <span className="text-white font-semibold">{totalCount} flight options.</span>{' '}
          Here are our top picks.
        </p>
      </div>

      {/* Picks grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {highlights.map(itinerary => {
          const cfg  = BADGE_CFG[itinerary.badge!]
          const seg  = itinerary.segments[0]

          return (
            <div key={itinerary.id}
              className="bg-white rounded-2xl p-5 cursor-pointer hover:shadow-xl transition-all"
              onClick={onViewAll}>
              {/* Badge */}
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-4 border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                {cfg.icon} {cfg.label}
              </div>
              {/* Airline */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#F5F2EE] flex items-center justify-center text-lg">✈️</div>
                <div>
                  <p className="font-semibold text-[#0B1F3A] text-sm">{seg.airlineName}</p>
                  <p className="text-[#0B1F3A]/40 text-xs">{seg.flightNumber} · {seg.aircraft}</p>
                </div>
              </div>
              {/* Route line */}
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-[#0B1F3A]">{seg.departureIata}</span>
                <div className="flex-1 relative h-px bg-[#0B1F3A]/10">
                  {itinerary.stops > 0 && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#0B1F3A]/20" />
                  )}
                </div>
                <span className="font-bold text-[#0B1F3A]">{itinerary.segments[itinerary.segments.length - 1].arrivalIata}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-[#0B1F3A]/50 mb-4">
                <span>{formatDuration(itinerary.totalDuration)}</span>
                <span>{itinerary.stops === 0 ? 'Direct' : `${itinerary.stops} stop${itinerary.stops > 1 ? 's' : ''}`}</span>
              </div>
              {/* Price */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-[#0B1F3A]/40">Per person</p>
                  <p className="text-2xl font-bold text-[#0B1F3A]">{fp(itinerary.price.perPerson, itinerary.price.currency)}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${cfg.bg} ${cfg.text}`}>{cfg.sub}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* CTA */}
      <div className="text-center">
        <button onClick={onViewAll}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-base hover:bg-[#E8C87A] transition-all shadow-xl shadow-[#C9A84C]/30">
          View all {totalCount} flights
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </button>
        <p className="text-white/30 text-xs mt-3">Including filters, price alerts and seat maps</p>
      </div>
    </div>
  )
}
