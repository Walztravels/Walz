'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FlightItinerary, SortOption } from '@/lib/flights/types'
import { formatDuration, formatPrice, formatTime } from '@/lib/flights/utils'

interface Props {
  results: FlightItinerary[]
  from:    string
  to:      string
}

const BADGE_STYLES: Record<string, string> = {
  recommended: 'bg-blue-600 text-white',
  cheapest:    'bg-green-600 text-white',
  fastest:     'bg-amber-500 text-white',
  luxury:      'bg-purple-700 text-white',
  'best-value':'bg-[#C9A84C] text-[#0B1F3A]',
}

const BADGE_ORDER = ['recommended', 'luxury', 'cheapest', 'fastest', 'best-value']

export function FlightResults({ results, from, to }: Props) {
  const router = useRouter()
  const [sortBy,   setSort]    = useState<SortOption>('recommended')
  const [expanded, setExpanded] = useState<string | null>(null)

  const sorted = [...results].sort((a, b) => {
    if (sortBy === 'cheapest') return a.price.total - b.price.total
    if (sortBy === 'fastest')  return a.totalDuration - b.totalDuration
    if (sortBy === 'premium')  return b.price.total - a.price.total
    // recommended: badged first in badge order, then price
    const ai = a.badge ? BADGE_ORDER.indexOf(a.badge) : 99
    const bi = b.badge ? BADGE_ORDER.indexOf(b.badge) : 99
    if (ai !== bi) return ai - bi
    return a.price.total - b.price.total
  })

  return (
    <div>
      {/* Sort bar */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <p className="text-sm text-[#0B1F3A]/50 mr-1">Sort by:</p>
        {([['recommended','⭐ Recommended'],['cheapest','💰 Cheapest'],['fastest','⚡ Fastest'],['premium','👑 Premium']] as [SortOption, string][]).map(([val, label]) => (
          <button key={val} onClick={() => setSort(val)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${sortBy === val ? 'bg-[#0B1F3A] text-white' : 'bg-white border border-[#0B1F3A]/10 text-[#0B1F3A]/60 hover:border-[#0B1F3A]/30'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {sorted.map(it => (
          <FlightCard key={it.id} itinerary={it}
            expanded={expanded === it.id}
            onToggle={() => setExpanded(expanded === it.id ? null : it.id)}
            onSelect={() => router.push(`/flights/detail?id=${it.id}`)} />
        ))}
      </div>
    </div>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────
function FlightCard({ itinerary, expanded, onToggle, onSelect }: {
  itinerary: FlightItinerary; expanded: boolean; onToggle: () => void; onSelect: () => void
}) {
  const seg   = itinerary.segments[0]
  const last  = itinerary.segments[itinerary.segments.length - 1]
  const price = itinerary.price

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-all duration-200 ${expanded ? 'border-[#C9A84C]/40 shadow-lg shadow-[#C9A84C]/5' : 'border-black/5 hover:border-[#0B1F3A]/15 hover:shadow-md'}`}>
      <div className="p-5">
        {/* Top badges */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {itinerary.badge && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${BADGE_STYLES[itinerary.badge]}`}>
              {itinerary.badgeLabel ?? itinerary.badge}
            </span>
          )}
          {(itinerary.seatsLeft ?? 99) <= 5 && (
            <span className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
              🔴 Only {itinerary.seatsLeft} seats left
            </span>
          )}
          {itinerary.refundable && (
            <span className="text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">✔ Refundable</span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Airline */}
          <div className="w-12 h-12 rounded-xl bg-[#F5F2EE] flex items-center justify-center text-xl flex-shrink-0">✈️</div>

          {/* Route */}
          <div className="flex-1 grid grid-cols-3 gap-4 items-center min-w-0">
            <div>
              <p className="text-2xl font-bold text-[#0B1F3A] leading-none">{formatTime(seg.departureTime)}</p>
              <p className="text-sm font-semibold text-[#0B1F3A] mt-0.5">{seg.departureIata}</p>
              <p className="text-xs text-[#0B1F3A]/40 truncate">{seg.departureCity}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[#0B1F3A]/40 mb-1">{formatDuration(itinerary.totalDuration)}</p>
              <div className="relative flex items-center">
                <div className="flex-1 h-px bg-[#0B1F3A]/15" />
                {itinerary.stops > 0
                  ? <div className="absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#0B1F3A]/20 bg-white" />
                  : <span className="absolute right-0 text-[#0B1F3A]/30 text-xs leading-none">›</span>}
              </div>
              <p className="text-xs text-[#0B1F3A]/40 mt-1">
                {itinerary.stops === 0 ? 'Direct' : `${itinerary.stops} stop · ${itinerary.layovers[0]?.city ?? ''}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-[#0B1F3A] leading-none">{formatTime(last.arrivalTime)}</p>
              <p className="text-sm font-semibold text-[#0B1F3A] mt-0.5">{last.arrivalIata}</p>
              <p className="text-xs text-[#0B1F3A]/40 truncate">{last.arrivalCity}</p>
            </div>
          </div>

          {/* Price */}
          <div className="flex-shrink-0 text-right border-l border-black/5 pl-5 min-w-[130px]">
            <p className="text-xs text-[#0B1F3A]/40 mb-1">Per person</p>
            <p className="text-2xl font-bold text-[#0B1F3A]">{formatPrice(price.perPerson, price.currency)}</p>
            <p className="text-xs text-[#0B1F3A]/40 mb-3">Total {formatPrice(price.total, price.currency)}</p>
            <button onClick={onSelect}
              className="w-full px-5 py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] active:scale-[0.97] transition-all">
              Select
            </button>
          </div>
        </div>

        {/* Amenities strip */}
        <div className="mt-4 pt-4 border-t border-black/5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-xs text-[#0B1F3A]/50">{seg.airlineName} · {seg.flightNumber}</span>
          <span className="text-[#0B1F3A]/20">·</span>
          <span className="text-xs text-[#0B1F3A]/50">{seg.aircraft}</span>
          <span className="text-[#0B1F3A]/20">·</span>
          <span className="text-xs text-[#0B1F3A]/50">{seg.cabinClass.replace('_',' ')}</span>
          <span className="ml-auto flex items-center gap-3">
            {itinerary.baggageInfo.included && <span className="text-xs text-green-700">🧳 {itinerary.baggageInfo.checked}</span>}
            {seg.amenities.find(a => a.type === 'wifi'  && a.available) && <span className="text-xs text-[#0B1F3A]/50">📶 Wi-Fi</span>}
            {seg.amenities.find(a => a.type === 'meals' && a.available) && <span className="text-xs text-[#0B1F3A]/50">🍽️ Meals</span>}
            {seg.amenities.find(a => a.type === 'lounge'&& a.available) && <span className="text-xs text-[#0B1F3A]/50">🛋️ Lounge</span>}
          </span>
          <button onClick={onToggle} className="text-xs text-[#C9A84C] hover:underline ml-4 flex-shrink-0">
            {expanded ? 'Hide details ▲' : 'Flight details ▼'}
          </button>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-black/5 bg-[#FAF7F2] p-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Segments timeline */}
            <div className="lg:col-span-2">
              <p className="text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-3">Flight segments</p>
              {itinerary.segments.map((s, i) => (
                <div key={s.id} className="flex gap-4 mb-2 last:mb-0">
                  <div className="flex flex-col items-center pt-1">
                    <div className="w-2 h-2 rounded-full bg-[#C9A84C] flex-shrink-0" />
                    {i < itinerary.segments.length - 1 && <div className="flex-1 w-px bg-[#0B1F3A]/10 my-1" />}
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-bold text-[#0B1F3A]">{formatTime(s.departureTime)}</span>
                      <span className="text-sm text-[#0B1F3A]">{s.departureIata} — {s.departureCity}</span>
                    </div>
                    <p className="text-xs text-[#0B1F3A]/40 my-0.5">{s.airlineName} {s.flightNumber} · {s.aircraft} · {formatDuration(s.durationMins)}</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-bold text-[#0B1F3A]">{formatTime(s.arrivalTime)}</span>
                      <span className="text-sm text-[#0B1F3A]">{s.arrivalIata} — {s.arrivalCity}</span>
                    </div>
                    {i < itinerary.segments.length - 1 && itinerary.layovers[i] && (
                      <div className="mt-2 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg inline-block">
                        ⏱ {formatDuration(itinerary.layovers[i].durationMins)} layover in {itinerary.layovers[i].city}
                        {itinerary.layovers[i].overnight && ' · Overnight'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* What's included */}
            <div>
              <p className="text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-3">What&apos;s included</p>
              <div className="space-y-2">
                {[
                  { ok: itinerary.baggageInfo.included,                                      label: `${itinerary.baggageInfo.checked} checked baggage` },
                  { ok: itinerary.baggageInfo.included,                                      label: `${itinerary.baggageInfo.cabin} cabin bag`          },
                  { ok: !!seg.amenities.find(a => a.type === 'meals'  && a.available),       label: 'In-flight meals'                                    },
                  { ok: !!seg.amenities.find(a => a.type === 'wifi'   && a.available),       label: 'Wi-Fi on board'                                     },
                  { ok: !!seg.amenities.find(a => a.type === 'lounge' && a.available),       label: 'Lounge access'                                      },
                  { ok: itinerary.refundable,                                                label: 'Refundable ticket'                                  },
                  { ok: itinerary.changeable,                                                label: 'Date changes allowed'                               },
                ].map(({ ok, label }) => (
                  <div key={label} className={`flex items-center gap-2 text-sm ${ok ? 'text-[#0B1F3A]' : 'text-[#0B1F3A]/30'}`}>
                    <span className={ok ? 'text-green-600' : 'text-[#0B1F3A]/20'}>{ok ? '✓' : '✗'}</span>
                    {label}
                  </div>
                ))}
              </div>
              {itinerary.co2Kg && (
                <div className="mt-4 p-3 rounded-xl bg-green-50 text-xs text-green-700">
                  🌱 Est. {itinerary.co2Kg}kg CO₂ per passenger
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
