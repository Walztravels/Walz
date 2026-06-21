'use client'

import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { MOCK_ITINERARY }    from '@/lib/flights/mockData'
import { formatDuration, formatPrice, formatTime } from '@/lib/flights/utils'
import { useFlightStore }    from '@/store/flightStore'
import { FarePredictor }     from '@/components/flights/ai/FarePredictor'
import { LoyaltyDashboard }  from '@/components/flights/loyalty/LoyaltyDashboard'
import type { FareOption }   from '@/lib/flights/types'

// Base fares built dynamically from the actual itinerary price
function buildFareOptions(basePrice: number): FareOption[] {
  return [
    { name: 'Economy Light', price: Math.round(basePrice * 0.85), currency: 'GBP', baggage: '1 × 7kg cabin only',  refundable: false, changeable: false, seatSelection: 'paid', lounge: false, meals: false },
    { name: 'Economy Flex',  price: basePrice,                     currency: 'GBP', baggage: '1 × 23kg checked',    refundable: true,  changeable: true,  seatSelection: 'free', lounge: false, meals: true, highlight: true },
    { name: 'Business Class',price: Math.round(basePrice * 2.8),  currency: 'GBP', baggage: '2 × 32kg checked',    refundable: true,  changeable: true,  seatSelection: 'free', lounge: true,  meals: true },
  ]
}

const ANCILLARIES = [
  { id: 'transfer',   icon: '🚗', name: 'Airport Transfer',     desc: 'Private car to/from airport',       price: 45,  popular: true,  link: ''       },
  { id: 'hotel',      icon: '🏨', name: 'Hotel',                desc: '1,000+ hotels at destination',      price: 0,   popular: false, link: '/hotels' },
  { id: 'insurance',  icon: '🛡️', name: 'Travel Insurance',     desc: 'Comprehensive cover from £12/day',  price: 24,  popular: false, link: ''       },
  { id: 'esim',       icon: '📡', name: 'Jade Connect eSIM',    desc: 'Data in 150+ countries from $9.99', price: 9,   popular: false, link: '/esim'  },
  { id: 'visa',       icon: '📄', name: 'Visa Service',         desc: 'We handle your visa application',   price: 99,  popular: false, link: ''       },
  { id: 'lounge',     icon: '🛋️', name: 'Airport Lounge',       desc: 'Access 1,300+ lounges worldwide',   price: 35,  popular: true,  link: ''       },
  { id: 'fasttrack',  icon: '⚡', name: 'Fast Track Security',  desc: 'Skip the queues at security',       price: 18,  popular: false, link: ''       },
]

const TABLE_ROWS: { label: string; getValue: (f: FareOption) => string | boolean }[] = [
  { label: 'Price',          getValue: f => formatPrice(f.price, f.currency)                                                   },
  { label: 'Baggage',        getValue: f => f.baggage                                                                          },
  { label: 'Refundable',     getValue: f => f.refundable                                                                       },
  { label: 'Changeable',     getValue: f => f.changeable                                                                       },
  { label: 'Seat selection', getValue: f => f.seatSelection === 'none' ? false : f.seatSelection === 'free' ? 'Free' : 'Paid' },
  { label: 'Lounge access',  getValue: f => f.lounge                                                                           },
  { label: 'Meals',          getValue: f => f.meals                                                                            },
]

function DetailContent() {
  const router = useRouter()
  const { selected, setSelected, setStep } = useFlightStore()
  const it = selected ?? MOCK_ITINERARY

  const FARE_OPTIONS = buildFareOptions(it.price.total)
  const [selectedFare, setFare] = useState<FareOption>(FARE_OPTIONS[1])
  const [addedAnc,     setAdded] = useState<string[]>([])

  // Ensure store has this itinerary selected
  if (!selected) setSelected(it)

  const seg     = it.segments[0]
  const segLast = it.segments[it.segments.length - 1]

  const included = [
    { ok: true,                              label: selectedFare.baggage,                                                                              icon: '🧳' },
    { ok: selectedFare.meals,               label: 'In-flight dining',                                                                               icon: '🍽️' },
    { ok: selectedFare.lounge,              label: 'Airport lounge access',                                                                          icon: '🛋️' },
    { ok: selectedFare.seatSelection !== 'none', label: `Seat selection${selectedFare.seatSelection === 'paid' ? ' (paid)' : ' (free)'}`, icon: '💺' },
    { ok: selectedFare.changeable,          label: 'Date changes',                                                                                   icon: '📅' },
    { ok: selectedFare.refundable,          label: 'Refundable ticket',                                                                              icon: '💰' },
    { ok: true,                              label: 'Priority check-in',                                                                              icon: '✅' },
    { ok: selectedFare.lounge,              label: 'Priority boarding',                                                                              icon: '🏃' },
  ]

  function goToSeats() {
    setStep('seats')
    router.push(`/flights/seat-select?offer_id=${it.id}`)
  }

  function skipSeats() {
    setStep('travellers')
    router.push('/flights/traveller')
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Hero */}
      <div className="bg-[#0B1F3A] text-white">
        <div className="container-walz py-8 lg:py-12">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to results
          </button>

          <div className="flex flex-col lg:flex-row lg:items-start gap-8">
            <div className="flex-1">
              {/* Airline badge */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={seg.airlineLogo}
                    alt={seg.airlineName}
                    className="w-9 h-9 object-contain"
                    onError={e => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                      (e.currentTarget.parentElement as HTMLElement).innerHTML = `<span class="text-white font-bold text-lg">${seg.airline}</span>`
                    }}
                  />
                </div>
                <div>
                  <p className="text-[#C9A84C] text-xs font-bold tracking-[0.2em] uppercase">{seg.airlineName}</p>
                  <p className="text-white/40 text-xs">{seg.flightNumber} · {seg.aircraft}</p>
                </div>
              </div>
              <h1 className="font-display text-3xl lg:text-5xl font-bold mb-3 leading-tight">
                {seg.departureCity} <span className="text-[#C9A84C]">→</span> {segLast.arrivalCity}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-white/50 text-sm">
                <span>{formatDuration(it.totalDuration)}</span><span>·</span>
                <span>{seg.cabinClass.replace('_', ' ')}</span><span>·</span>
                <span>{it.stops === 0 ? 'Non-stop' : `${it.stops} stop${it.stops > 1 ? 's' : ''}`}</span>
              </div>
              {it.badge && (
                <span className="inline-block mt-3 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#C9A84C] text-[#0B1F3A]">
                  {it.badgeLabel ?? it.badge}
                </span>
              )}
            </div>
            {/* Fare summary */}
            <div className="bg-white/10 rounded-2xl p-5 min-w-[240px]">
              <p className="text-white/50 text-xs mb-1">Selected fare</p>
              <p className="text-3xl font-bold text-white mb-0.5">{formatPrice(selectedFare.price, selectedFare.currency)}</p>
              <p className="text-white/30 text-xs mb-4">per person · taxes included</p>
              <button onClick={goToSeats}
                className="w-full py-3 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] active:scale-[0.97] transition-all">
                Choose seats →
              </button>
              <button onClick={skipSeats}
                className="w-full py-2.5 mt-2 rounded-xl bg-white/10 text-white/70 font-medium text-sm hover:bg-white/20 transition-all">
                Skip seats
              </button>
            </div>
          </div>

          {/* Timeline(s) */}
          <div className="mt-6 space-y-3">
            {/* Outbound */}
            <div className="bg-white/5 rounded-2xl p-5">
              {it.returnSegments?.length ? (
                <p className="text-[10px] font-bold text-[#C9A84C]/70 uppercase tracking-widest mb-3">↗ Outbound</p>
              ) : null}
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-2xl font-bold tabular-nums">{formatTime(seg.departureTime)}</p>
                  <p className="text-[#C9A84C] font-semibold text-sm">{seg.departureIata}</p>
                  <p className="text-white/40 text-xs">{seg.departureCity}</p>
                </div>
                <div className="flex-1 relative">
                  <div className="h-px bg-white/20" />
                  <p className="text-white/40 text-xs text-center mt-1">{formatDuration(it.totalDuration)}</p>
                  {it.stops > 0 && (
                    <p className="text-white/25 text-[10px] text-center">{it.stops} stop{it.stops > 1 ? 's' : ''}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold tabular-nums">{formatTime(segLast.arrivalTime)}</p>
                  <p className="text-[#C9A84C] font-semibold text-sm">{segLast.arrivalIata}</p>
                  <p className="text-white/40 text-xs">{segLast.arrivalCity}</p>
                </div>
              </div>
            </div>

            {/* Return leg */}
            {it.returnSegments && it.returnSegments.length > 0 && (() => {
              const retFirst = it.returnSegments[0]
              const retLast  = it.returnSegments[it.returnSegments.length - 1]
              const retStops = it.returnSegments.length - 1
              return (
                <div className="bg-white/5 rounded-2xl p-5">
                  <p className="text-[10px] font-bold text-[#C9A84C]/70 uppercase tracking-widest mb-3">↙ Return</p>
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{formatTime(retFirst.departureTime)}</p>
                      <p className="text-[#C9A84C] font-semibold text-sm">{retFirst.departureIata}</p>
                      <p className="text-white/40 text-xs">{retFirst.departureCity}</p>
                    </div>
                    <div className="flex-1 relative">
                      <div className="h-px bg-white/20" />
                      <p className="text-white/40 text-xs text-center mt-1">{formatDuration(it.returnDuration ?? 0)}</p>
                      {retStops > 0 && (
                        <p className="text-white/25 text-[10px] text-center">{retStops} stop{retStops > 1 ? 's' : ''}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold tabular-nums">{formatTime(retLast.arrivalTime)}</p>
                      <p className="text-[#C9A84C] font-semibold text-sm">{retLast.arrivalIata}</p>
                      <p className="text-white/40 text-xs">{retLast.arrivalCity}</p>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="container-walz py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Flight itinerary — outbound + return */}
            <div className="bg-white rounded-2xl overflow-hidden border border-black/5">
              <div className="p-5 border-b border-black/5">
                <h2 className="font-display font-bold text-[#0B1F3A]">Flight Itinerary</h2>
                <p className="text-[#0B1F3A]/50 text-sm">
                  {it.returnSegments?.length ? 'Outbound & return' : 'Outbound'} · {it.segments[0]?.departureCity} → {it.segments[it.segments.length - 1]?.arrivalCity}
                </p>
              </div>
              <div className={`p-5 ${it.returnSegments?.length ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : ''}`}>
                {/* Outbound segments */}
                <div>
                  {it.returnSegments?.length ? (
                    <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-3">
                      ↗ Outbound · {it.segments[0].departureIata} → {it.segments[it.segments.length - 1].arrivalIata}
                    </p>
                  ) : null}
                  {it.segments.map((s, i) => (
                    <div key={s.id}>
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center pt-1.5 w-5 flex-shrink-0">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#C9A84C] flex-shrink-0 ring-4 ring-[#C9A84C]/15" />
                          {i < it.segments.length - 1 && <div className="flex-1 w-px bg-[#0B1F3A]/10 my-1 min-h-[24px]" />}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-base font-bold text-[#0B1F3A] tabular-nums">{formatTime(s.departureTime)}</span>
                            <span className="text-sm text-[#0B1F3A]">{s.departureIata} — {s.departureCity}</span>
                          </div>
                          <p className="text-xs text-[#0B1F3A]/40 my-1">
                            {s.airlineName} · {s.flightNumber} · {s.aircraft} · {formatDuration(s.durationMins)}
                          </p>
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-base font-bold text-[#0B1F3A] tabular-nums">{formatTime(s.arrivalTime)}</span>
                            <span className="text-sm text-[#0B1F3A]">{s.arrivalIata} — {s.arrivalCity}</span>
                          </div>
                          {i < it.segments.length - 1 && it.layovers[i] && (
                            <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                              <span>⏱</span>
                              <span>{formatDuration(it.layovers[i].durationMins)} layover · {it.layovers[i].city}{it.layovers[i].overnight ? ' · Overnight' : ''}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Return segments */}
                {(() => {
                  const retSegs = it.returnSegments
                  const retLays = it.returnLayovers ?? []
                  if (!retSegs?.length) return null
                  return (
                    <div className="border-t lg:border-t-0 lg:border-l border-[#0B1F3A]/5 pt-5 lg:pt-0 lg:pl-6">
                      <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-3">
                        ↙ Return · {retSegs[0].departureIata} → {retSegs[retSegs.length - 1].arrivalIata}
                      </p>
                      {retSegs.map((s, i) => (
                        <div key={s.id}>
                          <div className="flex gap-3">
                            <div className="flex flex-col items-center pt-1.5 w-5 flex-shrink-0">
                              <div className="w-2.5 h-2.5 rounded-full bg-[#C9A84C]/60 flex-shrink-0 ring-4 ring-[#C9A84C]/10" />
                              {i < retSegs.length - 1 && <div className="flex-1 w-px bg-[#0B1F3A]/10 my-1 min-h-[24px]" />}
                            </div>
                            <div className="flex-1 pb-4">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-base font-bold text-[#0B1F3A] tabular-nums">{formatTime(s.departureTime)}</span>
                                <span className="text-sm text-[#0B1F3A]">{s.departureIata} — {s.departureCity}</span>
                              </div>
                              <p className="text-xs text-[#0B1F3A]/40 my-1">
                                {s.airlineName} · {s.flightNumber} · {s.aircraft} · {formatDuration(s.durationMins)}
                              </p>
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-base font-bold text-[#0B1F3A] tabular-nums">{formatTime(s.arrivalTime)}</span>
                                <span className="text-sm text-[#0B1F3A]">{s.arrivalIata} — {s.arrivalCity}</span>
                              </div>
                              {i < retSegs.length - 1 && retLays[i] && (
                                <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                                  <span>⏱</span>
                                  <span>{formatDuration(retLays[i].durationMins)} layover · {retLays[i].city}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Cabin gallery */}
            {(() => {
              const isBC = selectedFare.name.toLowerCase().includes('business')
              const cabinPhotos = isBC ? [
                { src: 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=1200&h=700&fit=crop&q=85', label: 'Business Suite',  span2: true  },
                { src: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=600&h=380&fit=crop&q=85',  label: 'Business Lounge', span2: false },
                { src: 'https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=600&h=380&fit=crop&q=85',  label: 'Fine Dining',     span2: false },
                { src: 'https://images.unsplash.com/photo-1559117207-f5157de3c88e?w=600&h=380&fit=crop&q=85',     label: 'Entertainment',   span2: false },
                { src: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&h=380&fit=crop&q=85',  label: 'Amenity Kit',     span2: false },
              ] : [
                { src: 'https://images.unsplash.com/photo-1542296332-2e4473faf563?w=1200&h=700&fit=crop&q=85',   label: 'Economy Cabin',   span2: true  },
                { src: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=600&h=380&fit=crop&q=85',  label: 'Window View',     span2: false },
                { src: 'https://images.unsplash.com/photo-1474302770737-173ee21bab63?w=600&h=380&fit=crop&q=85',  label: 'In-Flight Meal',  span2: false },
                { src: 'https://images.unsplash.com/photo-1559117207-f5157de3c88e?w=600&h=380&fit=crop&q=85',     label: 'Entertainment',   span2: false },
                { src: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=600&h=380&fit=crop&q=85',  label: 'Terminal Lounge', span2: false },
              ]
              return (
                <div className="bg-white rounded-2xl overflow-hidden border border-black/5">
                  <div className="p-5 border-b border-black/5 flex items-center justify-between">
                    <div>
                      <h2 className="font-display font-bold text-[#0B1F3A]">Cabin Experience</h2>
                      <p className="text-[#0B1F3A]/50 text-sm">{seg.airlineName} · {selectedFare.name}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${isBC ? 'bg-[#C9A84C]/15 text-[#8B6914]' : 'bg-[#0B1F3A]/5 text-[#0B1F3A]/60'}`}>
                      {isBC ? '★ Premium' : 'Economy'}
                    </span>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-2">
                    {cabinPhotos.map(({ src, label, span2 }) => (
                      <div key={label} className={`relative rounded-xl overflow-hidden group ${span2 ? 'col-span-2 h-56' : 'h-36'}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={label}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                        <p className="absolute bottom-3 left-3 text-white text-xs font-semibold">{label}</p>
                      </div>
                    ))}
                  </div>
                  {isBC && (
                    <div className="px-5 pb-5 grid grid-cols-3 gap-3">
                      {[
                        { icon: '↔', label: 'Lie-flat bed',   sub: 'Up to 78"'       },
                        { icon: '⟳', label: 'Aisle access',   sub: 'All seats'        },
                        { icon: '⌁', label: 'Privacy suite',  sub: 'Door included'    },
                      ].map(f => (
                        <div key={f.label} className="bg-[#FAF7F2] rounded-xl p-3 text-center">
                          <p className="text-lg text-[#C9A84C] font-bold mb-0.5">{f.icon}</p>
                          <p className="text-xs font-semibold text-[#0B1F3A]">{f.label}</p>
                          <p className="text-[10px] text-[#0B1F3A]/40">{f.sub}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* What's included */}
            <div className="bg-white rounded-2xl p-5 border border-black/5">
              <h2 className="font-display font-bold text-[#0B1F3A] mb-4">What&apos;s Included</h2>
              <div className="grid grid-cols-2 gap-3">
                {included.map(({ ok, label, icon }) => (
                  <div key={label} className={`flex items-center gap-3 p-3 rounded-xl ${ok ? 'bg-green-50' : 'bg-[#F5F2EE]'}`}>
                    <span className="text-xl">{icon}</span>
                    <p className={`text-sm font-medium flex-1 min-w-0 truncate ${ok ? 'text-green-800' : 'text-[#0B1F3A]/30'}`}>{label}</p>
                    <span className={ok ? 'text-green-600' : 'text-[#0B1F3A]/20'}>{ok ? '✓' : '✗'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fare comparison */}
            <div className="bg-white rounded-2xl overflow-hidden border border-black/5">
              <div className="p-5 border-b border-black/5">
                <h2 className="font-display font-bold text-[#0B1F3A]">Compare Fare Types</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left px-5 py-3 text-[#0B1F3A]/40 text-xs font-semibold uppercase tracking-wider">Feature</th>
                      {FARE_OPTIONS.map(f => (
                        <th key={f.name} className={`px-4 py-3 text-center text-xs font-semibold text-[#0B1F3A] ${selectedFare.name === f.name ? 'bg-[#C9A84C]/5' : ''}`}>
                          {f.name}
                          {f.highlight && <span className="ml-1 text-[#C9A84C] text-[10px]">★ Popular</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TABLE_ROWS.map(({ label, getValue }) => (
                      <tr key={label} className="border-t border-black/5">
                        <td className="px-5 py-3 text-[#0B1F3A]/60 text-xs">{label}</td>
                        {FARE_OPTIONS.map(f => {
                          const v = getValue(f)
                          const isSel = selectedFare.name === f.name
                          return (
                            <td key={f.name} className={`px-4 py-3 text-center ${isSel ? 'bg-[#C9A84C]/5 font-semibold' : ''}`}>
                              {typeof v === 'boolean'
                                ? <span className={v ? 'text-green-600' : 'text-[#0B1F3A]/20'}>{v ? '✓' : '✗'}</span>
                                : <span className="text-[#0B1F3A] text-xs">{v}</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    <tr className="border-t border-black/5">
                      <td className="px-5 py-3" />
                      {FARE_OPTIONS.map(f => (
                        <td key={f.name} className={`px-4 py-3 text-center ${selectedFare.name === f.name ? 'bg-[#C9A84C]/5' : ''}`}>
                          <button onClick={() => setFare(f)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${selectedFare.name === f.name ? 'bg-[#C9A84C] text-[#0B1F3A]' : 'bg-[#F5F2EE] text-[#0B1F3A] hover:bg-[#C9A84C]/20'}`}>
                            {selectedFare.name === f.name ? 'Selected' : 'Select'}
                          </button>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ancillary marketplace */}
            <div className="bg-white rounded-2xl overflow-hidden border border-black/5">
              <div className="p-5 border-b border-black/5">
                <h2 className="font-display font-bold text-[#0B1F3A]">Complete Your Trip</h2>
                <p className="text-[#0B1F3A]/50 text-sm">Save up to 30% vs booking separately</p>
              </div>
              <div className="divide-y divide-black/5">
                {ANCILLARIES.map(item => (
                  <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-[#FAF7F2] transition-colors">
                    <span className="text-2xl flex-shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-[#0B1F3A]">{item.name}</p>
                        {item.popular && <span className="text-[10px] font-bold text-[#C9A84C] bg-[#C9A84C]/10 px-2 py-0.5 rounded-full">Popular</span>}
                      </div>
                      <p className="text-xs text-[#0B1F3A]/40">{item.desc}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {item.price > 0 && <p className="text-sm font-semibold text-[#0B1F3A]">+£{item.price}</p>}
                      {item.link ? (
                        <a href={item.link} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#0B1F3A]/10 text-[#0B1F3A]/60 hover:border-[#C9A84C] hover:text-[#C9A84C] transition-all">
                          View →
                        </a>
                      ) : (
                        <button onClick={() => setAdded(a => a.includes(item.id) ? a.filter(x => x !== item.id) : [...a, item.id])}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${addedAnc.includes(item.id) ? 'bg-green-600 text-white' : 'bg-[#0B1F3A] text-white hover:bg-[#C9A84C] hover:text-[#0B1F3A]'}`}>
                          {addedAnc.includes(item.id) ? '✓ Added' : 'Add'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sticky sidebar */}
          <aside className="space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-black/5 sticky top-24 space-y-4">
              <h3 className="font-display font-bold text-[#0B1F3A]">Price Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#0B1F3A]/60">Airfare</span>
                  <span className="font-medium text-[#0B1F3A]">{formatPrice(Math.round(selectedFare.price - selectedFare.price * 0.22))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#0B1F3A]/60">Taxes & fees</span>
                  <span className="font-medium text-[#0B1F3A]">{formatPrice(Math.round(selectedFare.price * 0.22))}</span>
                </div>
                <div className="border-t border-black/5 pt-2 flex justify-between">
                  <span className="font-bold text-[#0B1F3A]">Total</span>
                  <span className="font-bold text-xl text-[#0B1F3A]">{formatPrice(selectedFare.price)}</span>
                </div>
                <p className="text-[10px] text-[#0B1F3A]/30 text-center pt-1">Per person · {it.price.currency}</p>
              </div>
              <button onClick={goToSeats}
                className="w-full py-3.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] active:scale-[0.97] transition-all">
                Choose seats →
              </button>
              <button onClick={skipSeats}
                className="w-full py-2.5 rounded-xl bg-[#0B1F3A]/5 text-[#0B1F3A]/60 font-medium text-sm hover:bg-[#0B1F3A]/10 transition-all">
                Skip seat selection
              </button>
              <div className="grid grid-cols-2 gap-2">
                {['🔒 SSL Secured', '✈️ IATA Partner', '💬 24/7 Support', '💰 Price Match'].map(t => (
                  <div key={t} className="text-xs text-[#0B1F3A]/40">{t}</div>
                ))}
              </div>
            </div>

            {/* AI Fare Predictor */}
            <FarePredictor itinerary={it} departDate={it.segments[0]?.departureTime?.slice(0, 10) ?? ''} />

            {/* Loyalty earn preview */}
            <LoyaltyDashboard variant="earn-preview" bookingValueGBP={selectedFare.price} />
          </aside>
        </div>
      </div>
    </div>
  )
}

export default function DetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
    </div>}>
      <DetailContent />
    </Suspense>
  )
}
