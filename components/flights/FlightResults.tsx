'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FlightItinerary, FlightSegment, SortOption } from '@/lib/flights/types'
import { formatDuration, formatPrice, formatTime } from '@/lib/flights/utils'
import { useFlightStore } from '@/store/flightStore'

interface Props {
  results: FlightItinerary[]
  from:    string
  to:      string
}

const BADGE_STYLES: Record<string, string> = {
  recommended: 'bg-[#0B3D91] text-white',
  cheapest:    'bg-emerald-600 text-white',
  fastest:     'bg-amber-500 text-[#0B1F3A]',
  luxury:      'bg-[#C9A84C] text-[#0B1F3A]',
  'best-value':'bg-[#0B1F3A] text-white',
}

const BADGE_ORDER = ['recommended', 'luxury', 'cheapest', 'fastest', 'best-value']

export function FlightResults({ results, from, to }: Props) {
  const router = useRouter()
  const { setSelected } = useFlightStore()
  const [sortBy,   setSort]    = useState<SortOption>('recommended')
  const [expanded, setExpanded] = useState<string | null>(null)

  const sorted = [...results].sort((a, b) => {
    if (sortBy === 'cheapest') return a.price.total - b.price.total
    if (sortBy === 'fastest')  return a.totalDuration - b.totalDuration
    if (sortBy === 'premium')  return b.price.total - a.price.total
    const ai = a.badge ? BADGE_ORDER.indexOf(a.badge) : 99
    const bi = b.badge ? BADGE_ORDER.indexOf(b.badge) : 99
    if (ai !== bi) return ai - bi
    return a.price.total - b.price.total
  })

  return (
    <div>
      {/* Sort bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <p className="text-xs font-semibold text-[#0B1F3A]/40 uppercase tracking-wider mr-1">Sort</p>
        {([['recommended','Recommended'],['cheapest','Cheapest'],['fastest','Fastest'],['premium','Premium']] as [SortOption, string][]).map(([val, label]) => (
          <button key={val} onClick={() => setSort(val)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${sortBy === val ? 'bg-[#0B1F3A] text-white' : 'bg-white border border-[#0B1F3A]/10 text-[#0B1F3A]/60 hover:border-[#0B1F3A]/30'}`}>
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-[#0B1F3A]/30">{results.length} flight{results.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-3">
        {sorted.map(it => (
          <FlightCard key={it.id} itinerary={it}
            expanded={expanded === it.id}
            onToggle={() => setExpanded(expanded === it.id ? null : it.id)}
            onSelect={() => { setSelected(it); router.push(`/flights/detail?id=${it.id}`) }} />
        ))}
      </div>
    </div>
  )
}

// ── Airline logo pill ─────────────────────────────────────────────────────────
function AirlineLogo({ seg, size = 'sm' }: { seg: FlightSegment; size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'w-12 h-12' : 'w-10 h-10'
  const img = size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'
  return (
    <div className={`${dim} rounded-xl bg-white border border-[#0B1F3A]/8 flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={seg.airlineLogo}
        alt={seg.airline}
        className={`${img} object-contain`}
        onError={e => {
          const img = e.currentTarget as HTMLImageElement
          img.style.display = 'none'
          const parent = img.parentElement as HTMLElement
          parent.innerHTML = `<span class="text-[#0B1F3A] font-bold text-xs">${seg.airline}</span>`
        }}
      />
    </div>
  )
}

// ── One leg row ───────────────────────────────────────────────────────────────
function LegRow({ segments, layovers, duration, label }: {
  segments: FlightSegment[]
  layovers: { airport: string; city: string; durationMins: number; overnight: boolean }[]
  duration: number
  label?:   string
}) {
  const first = segments[0]
  const last  = segments[segments.length - 1]
  const stops = segments.length - 1

  return (
    <div className="flex items-center gap-3 py-3.5">
      <AirlineLogo seg={first} />

      {label && (
        <span className="text-[9px] font-bold uppercase tracking-widest text-[#0B1F3A]/25 w-6 flex-shrink-0">{label}</span>
      )}

      {/* Departure */}
      <div className="text-left flex-shrink-0 w-[70px]">
        <p className="text-xl font-bold text-[#0B1F3A] leading-none tabular-nums">{formatTime(first.departureTime)}</p>
        <p className="text-[11px] font-bold text-[#0B1F3A]/50 mt-0.5">{first.departureIata}</p>
        <p className="text-[10px] text-[#0B1F3A]/30 truncate">{first.departureCity}</p>
      </div>

      {/* Timeline */}
      <div className="flex-1 flex flex-col items-center min-w-0 px-1">
        <p className="text-[10px] text-[#0B1F3A]/35 mb-1 tabular-nums">{formatDuration(duration)}</p>
        <div className="relative w-full flex items-center">
          <div className="flex-1 h-px bg-[#0B1F3A]/10" />
          {stops > 0 ? (
            <div className="absolute left-1/2 -translate-x-1/2 flex gap-1.5">
              {Array.from({ length: stops }).map((_, i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-white border-2 border-[#C9A84C]" />
              ))}
            </div>
          ) : (
            <span className="absolute right-0 text-[#C9A84C] text-base leading-none">›</span>
          )}
        </div>
        <p className="text-[10px] text-[#0B1F3A]/30 mt-1">
          {stops === 0
            ? 'Non-stop'
            : stops === 1
              ? `via ${layovers[0]?.city ?? ''}`
              : `${stops} stops`}
        </p>
      </div>

      {/* Arrival */}
      <div className="text-right flex-shrink-0 w-[70px]">
        <p className="text-xl font-bold text-[#0B1F3A] leading-none tabular-nums">{formatTime(last.arrivalTime)}</p>
        <p className="text-[11px] font-bold text-[#0B1F3A]/50 mt-0.5">{last.arrivalIata}</p>
        <p className="text-[10px] text-[#0B1F3A]/30 truncate text-right">{last.arrivalCity}</p>
      </div>
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
function FlightCard({ itinerary: it, expanded, onToggle, onSelect }: {
  itinerary: FlightItinerary
  expanded:  boolean
  onToggle:  () => void
  onSelect:  () => void
}) {
  const seg  = it.segments[0]
  const isRT = !!(it.returnSegments?.length)

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-all duration-200 ${expanded ? 'border-[#C9A84C]/50 shadow-xl shadow-[#C9A84C]/8' : 'border-black/5 hover:border-[#0B1F3A]/12 hover:shadow-md'}`}>

      {/* ── Header strip ── */}
      <div className="bg-[#0B1F3A] px-5 py-2.5 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={seg.airlineLogo}
            alt={seg.airline}
            className="w-5 h-5 object-contain"
            onError={e => {
              const img = e.currentTarget as HTMLImageElement
              img.style.display = 'none'
              const p = img.parentElement as HTMLElement
              p.innerHTML = `<span class="text-white font-bold text-[9px]">${seg.airline}</span>`
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-semibold leading-tight">{seg.airlineName}</p>
          <p className="text-white/35 text-[10px]">{seg.flightNumber} · {seg.aircraft}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {it.badge && (
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${BADGE_STYLES[it.badge]}`}>
              {it.badgeLabel ?? it.badge}
            </span>
          )}
          {(it.seatsLeft ?? 99) <= 5 && (
            <span className="text-[10px] font-semibold text-red-400 bg-red-400/10 px-2.5 py-0.5 rounded-full">
              {it.seatsLeft} left
            </span>
          )}
          {it.refundable && (
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 px-2.5 py-0.5 rounded-full">Refundable</span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-5">
        <div className="flex items-stretch">

          {/* Legs column */}
          <div className="flex-1 min-w-0">
            <LegRow
              segments={it.segments}
              layovers={it.layovers}
              duration={it.totalDuration}
              label={isRT ? 'OUT' : undefined}
            />
            {isRT && it.returnSegments && (
              <>
                <div className="border-t border-dashed border-[#0B1F3A]/8" />
                <LegRow
                  segments={it.returnSegments}
                  layovers={it.returnLayovers ?? []}
                  duration={it.returnDuration ?? 0}
                  label="RET"
                />
              </>
            )}
          </div>

          {/* Price column */}
          <div className="flex-shrink-0 border-l border-[#0B1F3A]/6 pl-5 ml-4 flex flex-col justify-center py-4 min-w-[128px]">
            <p className="text-[9px] text-[#0B1F3A]/30 uppercase tracking-widest mb-1">From</p>
            <p className="text-2xl font-bold text-[#0B1F3A] leading-none tabular-nums">
              {formatPrice(it.price.perPerson, it.price.currency)}
            </p>
            <p className="text-[9px] text-[#0B1F3A]/30 mt-1 mb-4">
              {isRT ? 'per person · return' : 'per person'}
            </p>
            <button
              onClick={onSelect}
              className="w-full px-4 py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] active:scale-[0.97] transition-all shadow-sm shadow-[#C9A84C]/25">
              Select →
            </button>
          </div>
        </div>

        {/* ── Amenities bar ── */}
        <div className="py-2.5 border-t border-[#0B1F3A]/5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {it.baggageInfo.included && (
            <span className="text-[11px] text-emerald-700">🧳 {it.baggageInfo.checked}</span>
          )}
          {seg.amenities.find(a => a.type === 'wifi'   && a.available) && <span className="text-[11px] text-[#0B1F3A]/45">📶 Wi-Fi</span>}
          {seg.amenities.find(a => a.type === 'meals'  && a.available) && <span className="text-[11px] text-[#0B1F3A]/45">🍽 Meals</span>}
          {seg.amenities.find(a => a.type === 'lounge' && a.available) && <span className="text-[11px] text-[#0B1F3A]/45">🛋 Lounge</span>}
          {it.co2Kg && <span className="text-[11px] text-[#0B1F3A]/25">🌱 {it.co2Kg}kg CO₂</span>}
          <button onClick={onToggle}
            className="ml-auto text-[11px] font-semibold text-[#C9A84C] hover:underline flex-shrink-0">
            {expanded ? 'Hide ▲' : 'Details ▼'}
          </button>
        </div>
      </div>

      {/* ── Expanded ── */}
      {expanded && (
        <div className="border-t border-[#0B1F3A]/5 bg-[#FAF7F2] p-5">
          <div className={`grid gap-5 ${isRT ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-3'}`}>

            {/* Outbound */}
            <div className={isRT ? '' : 'lg:col-span-2'}>
              <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-3">
                {isRT ? '↗ Outbound' : 'Flight segments'}{isRT ? ` · ${it.segments[0].departureIata} → ${it.segments[it.segments.length-1].arrivalIata}` : ''}
              </p>
              <SegmentTimeline segments={it.segments} layovers={it.layovers} />
            </div>

            {/* Return (round-trip) */}
            {isRT && it.returnSegments ? (
              <div>
                <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-3">
                  ↙ Return · {it.returnSegments[0].departureIata} → {it.returnSegments[it.returnSegments.length-1].arrivalIata}
                </p>
                <SegmentTimeline segments={it.returnSegments} layovers={it.returnLayovers ?? []} />
              </div>
            ) : (
              <div>
                <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-3">What&apos;s included</p>
                <IncludedList it={it} seg={seg} />
              </div>
            )}
          </div>

          {/* Included strip for round-trip */}
          {isRT && (
            <div className="mt-5 pt-5 border-t border-[#0B1F3A]/5">
              <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-3">What&apos;s included</p>
              <div className="flex flex-wrap gap-2">
                <IncludedList it={it} seg={seg} inline />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Segment timeline ───────────────────────────────────────────────────────────
function SegmentTimeline({ segments, layovers }: {
  segments: FlightSegment[]
  layovers: { airport: string; city: string; durationMins: number; overnight: boolean }[]
}) {
  return (
    <div>
      {segments.map((s, i) => (
        <div key={s.id}>
          <div className="flex gap-3">
            <div className="flex flex-col items-center pt-1.5 w-4 flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-[#C9A84C] flex-shrink-0" />
              {i < segments.length - 1 && <div className="flex-1 w-px bg-[#0B1F3A]/10 my-1" />}
            </div>
            <div className="flex-1 pb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-[#0B1F3A] tabular-nums">{formatTime(s.departureTime)}</span>
                <span className="text-xs text-[#0B1F3A]/60">{s.departureIata} — {s.departureCity}</span>
              </div>
              <p className="text-[10px] text-[#0B1F3A]/30 my-0.5">
                {s.airlineName} {s.flightNumber} · {s.aircraft} · {formatDuration(s.durationMins)}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-[#0B1F3A] tabular-nums">{formatTime(s.arrivalTime)}</span>
                <span className="text-xs text-[#0B1F3A]/60">{s.arrivalIata} — {s.arrivalCity}</span>
              </div>
            </div>
          </div>
          {i < segments.length - 1 && layovers[i] && (
            <div className="ml-7 mb-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
              <span>⏱</span>
              <span>{formatDuration(layovers[i].durationMins)} layover · {layovers[i].city}{layovers[i].overnight ? ' · Overnight' : ''}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── What's included ────────────────────────────────────────────────────────────
function IncludedList({ it, seg, inline }: { it: FlightItinerary; seg: FlightSegment; inline?: boolean }) {
  const items = [
    { ok: it.baggageInfo.included, label: `${it.baggageInfo.checked} checked` },
    { ok: it.baggageInfo.included, label: `${it.baggageInfo.cabin} cabin bag`  },
    { ok: !!seg.amenities.find(a => a.type === 'meals'  && a.available), label: 'In-flight meals'    },
    { ok: !!seg.amenities.find(a => a.type === 'wifi'   && a.available), label: 'Wi-Fi on board'     },
    { ok: !!seg.amenities.find(a => a.type === 'lounge' && a.available), label: 'Lounge access'      },
    { ok: it.refundable, label: 'Refundable ticket'     },
    { ok: it.changeable, label: 'Date changes allowed'  },
  ]

  if (inline) {
    return (
      <>
        {items.map(({ ok, label }) => (
          <div key={label} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${ok ? 'text-[#0B1F3A] bg-white border-[#0B1F3A]/8' : 'text-[#0B1F3A]/25 bg-transparent border-transparent'}`}>
            <span className={ok ? 'text-emerald-500' : 'text-[#0B1F3A]/15'}>{ok ? '✓' : '✗'}</span>
            {label}
          </div>
        ))}
      </>
    )
  }

  return (
    <div className="space-y-2">
      {items.map(({ ok, label }) => (
        <div key={label} className={`flex items-center gap-2 text-sm ${ok ? 'text-[#0B1F3A]' : 'text-[#0B1F3A]/30'}`}>
          <span className={ok ? 'text-emerald-500 font-bold' : 'text-[#0B1F3A]/20'}>{ok ? '✓' : '✗'}</span>
          {label}
        </div>
      ))}
    </div>
  )
}
