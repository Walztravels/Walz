'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFlightStore } from '@/store/flightStore'
import { formatDuration, formatPrice, formatTime } from '@/lib/flights/utils'
import type { FlightSegment } from '@/lib/flights/types'

const STEPS = ['Search', 'Seats', 'Travellers', 'Extras', 'Review', 'Pay']
const MILES_OPTIONS = [
  { miles: 5000,  discount: 50  },
  { miles: 10000, discount: 100 },
  { miles: 20000, discount: 200 },
]

// ── Shared helpers ────────────────────────────────────────────────────────────
function SectionHead({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-[#0B1F3A]/5">
      <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center flex-shrink-0">
        <span className="text-sm">{icon}</span>
      </div>
      <div>
        <p className="text-sm font-bold text-[#0B1F3A] leading-tight">{title}</p>
        {sub && <p className="text-[10px] text-[#0B1F3A]/40 leading-tight mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Boarding-pass style flight leg card ───────────────────────────────────────
function LegCard({ label, segments, layovers, duration, returnLeg = false }: {
  label?:    string
  segments:  FlightSegment[]
  layovers:  { airport: string; city: string; durationMins: number; overnight: boolean }[]
  duration:  number
  returnLeg?: boolean
}) {
  const first = segments[0]
  const last  = segments[segments.length - 1]
  const stops = segments.length - 1

  return (
    <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
      {/* Card header — airline stripe */}
      <div className="bg-[#0B1F3A] px-5 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={first.airlineLogo} alt={first.airline}
            className="w-6 h-6 object-contain"
            onError={e => {
              const img = e.currentTarget as HTMLImageElement
              img.style.display = 'none'
              ;(img.parentElement as HTMLElement).innerHTML = `<span class="text-white font-bold text-[10px]">${first.airline}</span>`
            }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-bold leading-tight">{first.airlineName}</p>
          <p className="text-white/35 text-[10px]">{first.flightNumber} · {first.aircraft}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {label && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 bg-white/8 px-2.5 py-1 rounded-full border border-white/10">
              {label}
            </span>
          )}
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${returnLeg ? 'bg-[#C9A84C]/20 text-[#C9A84C]' : 'bg-[#C9A84C] text-[#0B1F3A]'}`}>
            {first.cabinClass.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Main route row — boarding-pass style */}
      <div className="px-5 py-5 flex items-center gap-4">
        {/* Departure */}
        <div className="flex-shrink-0">
          <p className="text-3xl font-bold text-[#0B1F3A] tabular-nums leading-none">{formatTime(first.departureTime)}</p>
          <p className="text-[#C9A84C] font-bold text-lg leading-tight mt-0.5">{first.departureIata}</p>
          <p className="text-[#0B1F3A]/50 text-xs leading-tight">{first.departureCity}</p>
          <p className="text-[#0B1F3A]/25 text-[10px] mt-0.5 font-mono">
            {new Date(first.departureTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>

        {/* Timeline bar */}
        <div className="flex-1 flex flex-col items-center px-2 min-w-0">
          <p className="text-[10px] text-[#0B1F3A]/35 mb-2 tabular-nums">{formatDuration(duration)}</p>
          <div className="relative w-full flex items-center">
            <div className="w-2.5 h-2.5 rounded-full bg-[#C9A84C] flex-shrink-0 ring-4 ring-[#C9A84C]/15" />
            <div className="flex-1 h-px bg-[#0B1F3A]/15 relative mx-1">
              {stops > 0 && (
                <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex gap-1.5">
                  {Array.from({ length: stops }).map((_, i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-white border-2 border-[#0B1F3A]/30" />
                  ))}
                </div>
              )}
            </div>
            <div className="w-2.5 h-2.5 rounded-full bg-[#C9A84C] flex-shrink-0 ring-4 ring-[#C9A84C]/15" />
          </div>
          <p className="text-[10px] text-[#0B1F3A]/30 mt-2">
            {stops === 0
              ? '✈ Non-stop'
              : stops === 1
                ? `1 stop · via ${layovers[0]?.city ?? ''}`
                : `${stops} stops`}
          </p>
        </div>

        {/* Arrival */}
        <div className="flex-shrink-0 text-right">
          <p className="text-3xl font-bold text-[#0B1F3A] tabular-nums leading-none">{formatTime(last.arrivalTime)}</p>
          <p className="text-[#C9A84C] font-bold text-lg leading-tight mt-0.5">{last.arrivalIata}</p>
          <p className="text-[#0B1F3A]/50 text-xs leading-tight">{last.arrivalCity}</p>
          <p className="text-[#0B1F3A]/25 text-[10px] mt-0.5 font-mono">
            {new Date(last.arrivalTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Segment timeline (detailed) */}
      <div className="border-t border-[#0B1F3A]/5 bg-[#FAF7F2] px-5 py-4">
        <p className="text-[9px] font-bold text-[#0B1F3A]/30 uppercase tracking-widest mb-3">Segment detail</p>
        <div className="space-y-0">
          {segments.map((s, i) => (
            <div key={s.id}>
              <div className="flex gap-3">
                <div className="flex flex-col items-center pt-1 w-4 flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-[#C9A84C] flex-shrink-0 ring-2 ring-[#C9A84C]/20" />
                  {i < segments.length - 1 && <div className="flex-1 w-px bg-[#0B1F3A]/10 my-1 min-h-[32px]" />}
                </div>
                <div className="flex-1 pb-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-bold text-[#0B1F3A] tabular-nums">{formatTime(s.departureTime)}</span>
                    <span className="text-xs font-bold text-[#0B1F3A]">{s.departureIata}</span>
                    <span className="text-xs text-[#0B1F3A]/50">—</span>
                    <span className="text-xs text-[#0B1F3A]/60 truncate">{s.departureCity}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 my-1">
                    <span className="text-[10px] text-[#0B1F3A]/30">{s.airlineName} {s.flightNumber}</span>
                    <span className="text-[#0B1F3A]/15">·</span>
                    <span className="text-[10px] text-[#0B1F3A]/30">{s.aircraft}</span>
                    <span className="text-[#0B1F3A]/15">·</span>
                    <span className="text-[10px] text-[#0B1F3A]/30">{formatDuration(s.durationMins)}</span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-bold text-[#0B1F3A] tabular-nums">{formatTime(s.arrivalTime)}</span>
                    <span className="text-xs font-bold text-[#0B1F3A]">{s.arrivalIata}</span>
                    <span className="text-xs text-[#0B1F3A]/50">—</span>
                    <span className="text-xs text-[#0B1F3A]/60 truncate">{s.arrivalCity}</span>
                  </div>
                </div>
              </div>
              {i < segments.length - 1 && layovers[i] && (
                <div className="ml-7 mb-3 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                  <span>⏱</span>
                  <span>{formatDuration(layovers[i].durationMins)} layover · {layovers[i].city}{layovers[i].overnight ? ' · Overnight' : ''}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Amenities strip */}
      <div className="border-t border-[#0B1F3A]/5 px-5 py-3 flex flex-wrap gap-x-4 gap-y-1 bg-white">
        <span className="text-[10px] text-[#0B1F3A]/40 flex items-center gap-1">🧳 {first.amenities.find(a => a.type === 'meals' && a.available) ? 'Meals included' : 'Meals not included'}</span>
        {first.amenities.find(a => a.type === 'wifi'   && a.available) && <span className="text-[10px] text-[#0B1F3A]/40">📶 Wi-Fi</span>}
        {first.amenities.find(a => a.type === 'lounge' && a.available) && <span className="text-[10px] text-[#0B1F3A]/40">🛋 Lounge</span>}
        {first.amenities.find(a => a.type === 'flatbed'&& a.available) && <span className="text-[10px] text-[#0B1F3A]/40">🛏 Flat bed</span>}
        {first.amenities.find(a => a.type === 'power'  && a.available) && <span className="text-[10px] text-[#0B1F3A]/40">⚡ Power</span>}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReviewPage() {
  const router = useRouter()
  const store  = useFlightStore()
  const { selected, passengers, extras, seats, loyalty,
    milesRedeemed, discountGBP, setMilesRedeemed, setStep, seatsTotal, extrasTotal } = store

  const [agreedTc, setAgreedTc] = useState(false)

  const airfare   = selected?.price.total ?? 0
  const seatCost  = seatsTotal()
  const extraCost = extrasTotal()
  const grand     = Math.max(0, airfare + seatCost + extraCost - discountGBP)

  function handleMilesRedeem(miles: number, discount: number) {
    if (milesRedeemed === miles) setMilesRedeemed(0, 0)
    else setMilesRedeemed(miles, discount)
  }

  function handleProceed() {
    if (!agreedTc) return
    setStep('payment')
    router.push('/flights/checkout')
  }

  if (!selected) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-4xl">✈</p>
          <p className="text-[#0B1F3A]/50 font-medium">No flight selected</p>
          <a href="/flights" className="inline-block text-sm font-bold text-[#C9A84C] hover:underline">Start a new search →</a>
        </div>
      </div>
    )
  }

  const seg0    = selected.segments[0]
  const segLast = selected.segments[selected.segments.length - 1]
  const isRT    = !!(selected.returnSegments?.length)

  return (
    <div className="min-h-screen bg-[#FAF7F2]">

      {/* ── Emirates-standard dark header ── */}
      <div className="bg-[#0B1F3A]">
        <div className="container-walz py-5">

          {/* Back + step */}
          <div className="flex items-center gap-3 mb-5">
            <button onClick={() => router.back()}
              className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/12 transition-all flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <div className="flex-1">
              <p className="text-white/35 text-xs">Step 5 of 6</p>
              <p className="text-white font-semibold text-sm">Review &amp; Confirm</p>
            </div>
          </div>

          {/* Progress */}
          <div className="flex gap-1 mb-7">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1 flex flex-col gap-1">
                <div className={`h-0.5 rounded-full transition-all ${i <= 4 ? 'bg-[#C9A84C]' : 'bg-white/10'}`}/>
                <p className={`text-[9px] font-medium hidden sm:block ${i <= 4 ? 'text-[#C9A84C]/70' : 'text-white/15'}`}>{s}</p>
              </div>
            ))}
          </div>

          {/* Hero: airline + route + price */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-2">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={seg0.airlineLogo} alt={seg0.airlineName}
                  className="w-10 h-10 object-contain"
                  onError={e => {
                    const img = e.currentTarget as HTMLImageElement
                    img.style.display = 'none'
                    ;(img.parentElement as HTMLElement).innerHTML = `<span class="text-white font-bold text-xl">${seg0.airline}</span>`
                  }} />
              </div>
              <div className="min-w-0">
                <p className="text-[#C9A84C] text-[10px] font-bold tracking-[0.2em] uppercase mb-0.5">{seg0.airlineName}</p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight">
                  {seg0.departureCity} <span className="text-[#C9A84C]">→</span> {segLast.arrivalCity}
                  {isRT && <span className="text-[#C9A84C]"> → {seg0.departureCity}</span>}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-white/40 text-xs">
                  <span>{seg0.flightNumber}</span>
                  <span>·</span>
                  <span>{seg0.cabinClass.replace('_',' ')}</span>
                  <span>·</span>
                  <span>{isRT ? 'Round trip' : 'One way'}</span>
                  <span>·</span>
                  <span>{(passengers.length || 1)} pax</span>
                </div>
              </div>
            </div>
            {/* Grand total chip */}
            <div className="flex-shrink-0 bg-[#C9A84C] rounded-2xl px-5 py-3 text-center">
              <p className="text-[#0B1F3A]/50 text-[10px] font-bold uppercase tracking-wider">Total</p>
              <p className="text-[#0B1F3A] text-2xl font-bold tabular-nums">{formatPrice(grand)}</p>
              <p className="text-[#0B1F3A]/50 text-[10px]">incl. taxes</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="container-walz py-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start">

          {/* ── Left column ── */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Section: Flight itinerary */}
            <div>
              <p className="text-[10px] font-bold text-[#0B1F3A]/30 uppercase tracking-widest mb-3">Flight Itinerary</p>
              <div className="space-y-4">
                <LegCard
                  label={isRT ? 'Outbound' : undefined}
                  segments={selected.segments}
                  layovers={selected.layovers}
                  duration={selected.totalDuration}
                />
                {isRT && selected.returnSegments && (
                  <LegCard
                    label="Return"
                    segments={selected.returnSegments}
                    layovers={selected.returnLayovers ?? []}
                    duration={selected.returnDuration ?? 0}
                    returnLeg
                  />
                )}
              </div>
            </div>

            {/* Section: Fare & baggage */}
            <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
              <SectionHead icon="🧳" title="Fare &amp; Baggage" sub={`${seg0.cabinClass.replace('_',' ')} · ${selected.fareType} fare`} />
              <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Checked bag',    value: selected.baggageInfo.checked,   ok: selected.baggageInfo.included },
                  { label: 'Cabin bag',      value: selected.baggageInfo.cabin,     ok: true   },
                  { label: 'Date changes',   value: selected.changeable ? 'Allowed' : 'Not allowed', ok: selected.changeable },
                  { label: 'Refundable',     value: selected.refundable ? 'Yes' : 'Non-refundable',  ok: selected.refundable },
                ].map(({ label, value, ok }) => (
                  <div key={label} className="space-y-1">
                    <p className="text-[10px] text-[#0B1F3A]/30 uppercase tracking-wider">{label}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={ok ? 'text-emerald-500 text-sm' : 'text-[#0B1F3A]/20 text-sm'}>{ok ? '✓' : '✗'}</span>
                      <p className={`text-sm font-semibold ${ok ? 'text-[#0B1F3A]' : 'text-[#0B1F3A]/40'}`}>{value}</p>
                    </div>
                  </div>
                ))}
              </div>
              {selected.co2Kg && (
                <div className="px-5 pb-4">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
                    <span className="text-emerald-500 text-sm">🌱</span>
                    <p className="text-xs text-emerald-700">Estimated {selected.co2Kg}kg CO₂ per passenger · Offset available at checkout</p>
                  </div>
                </div>
              )}
            </div>

            {/* Section: Passengers */}
            {passengers.length > 0 && (
              <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                <SectionHead icon="👤" title="Passengers" sub={`${passengers.length} traveller${passengers.length > 1 ? 's' : ''}`} />
                <div className="divide-y divide-[#0B1F3A]/5">
                  {passengers.map((p, i) => {
                    const outSeat = seats.find(s => s.segmentId === 'out' && s.paxIndex === i)
                      ?? seats.find(s => s.paxIndex === i)
                    const retSeat = seats.find(s => s.segmentId === 'ret' && s.paxIndex === i)
                    return (
                      <div key={p.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4">
                          {/* Passenger info */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-xl bg-[#0B1F3A]/5 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold text-[#0B1F3A]/40">{i + 1}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-[#0B1F3A] text-sm">{p.title}. {p.firstName} {p.lastName}</p>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                <p className="text-[10px] text-[#0B1F3A]/40">{p.nationality}</p>
                                {p.dob && <p className="text-[10px] text-[#0B1F3A]/35">DOB: {p.dob}</p>}
                                {p.passportNo && (
                                  <p className="text-[10px] text-[#0B1F3A]/35 font-mono">
                                    PP: {p.passportNo.slice(0, 2)}{'•'.repeat(Math.max(0, p.passportNo.length - 4))}{p.passportNo.slice(-2)}
                                  </p>
                                )}
                              </div>
                              {i === 0 && p.email && (
                                <p className="text-[10px] text-[#0B1F3A]/30 mt-0.5">{p.email}</p>
                              )}
                            </div>
                          </div>
                          {/* Seat badges */}
                          <div className="flex-shrink-0 flex flex-col gap-1.5 items-end">
                            {outSeat && (
                              <div className="flex items-center gap-1.5">
                                {isRT && <span className="text-[9px] text-[#0B1F3A]/25 uppercase tracking-wider">Out</span>}
                                <span className="text-xs font-bold text-[#0B1F3A] bg-[#C9A84C]/15 border border-[#C9A84C]/30 px-2.5 py-1 rounded-full">
                                  {outSeat.seatNumber}
                                </span>
                              </div>
                            )}
                            {retSeat && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] text-[#0B1F3A]/25 uppercase tracking-wider">Ret</span>
                                <span className="text-xs font-bold text-[#0B1F3A] bg-[#C9A84C]/10 border border-[#C9A84C]/20 px-2.5 py-1 rounded-full">
                                  {retSeat.seatNumber}
                                </span>
                              </div>
                            )}
                            {!outSeat && !retSeat && (
                              <span className="text-[10px] text-[#0B1F3A]/20 italic">Airline assigns seat</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Section: Extras */}
            {extras.length > 0 && (
              <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                <SectionHead icon="✨" title="Added Extras" sub={`${extras.length} service${extras.length > 1 ? 's' : ''} · +${formatPrice(extraCost)}`} />
                <div className="divide-y divide-[#0B1F3A]/5">
                  {extras.map(e => (
                    <div key={e.id} className="px-5 py-3.5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#C9A84C]/10 flex items-center justify-center text-base flex-shrink-0">
                        {e.icon || '✓'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#0B1F3A] text-sm">{e.name}</p>
                        <p className="text-[10px] text-[#0B1F3A]/40 truncate">{e.description}</p>
                      </div>
                      <span className="font-bold text-[#0B1F3A] text-sm flex-shrink-0">+{formatPrice(e.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section: Jade Miles redemption */}
            {loyalty && !loyalty.isGuest && loyalty.miles >= 5000 && (
              <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                <div className="bg-gradient-to-r from-[#C9A84C]/10 to-transparent border-b border-[#C9A84C]/10 px-5 py-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#C9A84C]/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">⭐</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#8B6914]">Redeem Jade Miles</p>
                    <p className="text-[10px] text-[#0B1F3A]/40">{loyalty.miles.toLocaleString()} miles available · 100 miles = £1</p>
                  </div>
                </div>
                <div className="p-4 grid sm:grid-cols-3 gap-2">
                  {MILES_OPTIONS.filter(o => o.miles <= loyalty.miles).map(opt => (
                    <label key={opt.miles}
                      className={`flex flex-col gap-1 cursor-pointer p-4 rounded-xl border transition-all ${milesRedeemed === opt.miles ? 'border-[#C9A84C] bg-[#C9A84C]/5 shadow-sm shadow-[#C9A84C]/10' : 'border-black/5 hover:border-[#C9A84C]/30'}`}>
                      <div className="flex items-center gap-2">
                        <input type="radio" name="miles" checked={milesRedeemed === opt.miles}
                          onChange={() => handleMilesRedeem(opt.miles, opt.discount)}
                          className="accent-[#C9A84C]" />
                        <span className="text-sm font-bold text-[#0B1F3A]">{opt.miles.toLocaleString()} miles</span>
                      </div>
                      <span className="text-lg font-bold text-emerald-600 ml-5">-{formatPrice(opt.discount)}</span>
                      <span className="text-[10px] text-[#0B1F3A]/30 ml-5">off your total</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Section: T&C */}
            <div className="bg-white rounded-2xl border border-black/5 p-5">
              <label className="flex items-start gap-4 cursor-pointer">
                <button type="button"
                  onClick={() => setAgreedTc(v => !v)}
                  className={`mt-0.5 w-5 h-5 rounded-md flex-shrink-0 border-2 flex items-center justify-center transition-all ${agreedTc ? 'bg-[#C9A84C] border-[#C9A84C]' : 'border-[#0B1F3A]/20 bg-white hover:border-[#C9A84C]/50'}`}>
                  {agreedTc && (
                    <svg className="w-3 h-3 text-[#0B1F3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                </button>
                <p className="text-sm text-[#0B1F3A]/60 leading-relaxed" onClick={() => setAgreedTc(v => !v)}>
                  I have read and agree to the{' '}
                  <a href="/terms" className="text-[#C9A84C] font-semibold hover:underline" onClick={e => e.stopPropagation()}>Terms &amp; Conditions</a>
                  {' '}and{' '}
                  <a href="/privacy" className="text-[#C9A84C] font-semibold hover:underline" onClick={e => e.stopPropagation()}>Privacy Policy</a>.
                  I confirm all passenger details are accurate and match valid travel documents.
                </p>
              </label>
            </div>

            {/* Trust badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: '🔒', label: 'SSL Encrypted',     sub: '256-bit TLS'           },
                { icon: '✈',  label: 'IATA Accredited',   sub: 'Official partner'       },
                { icon: '🛡',  label: 'ATOL Protected',    sub: 'Your money is safe'     },
                { icon: '💬', label: '24/7 Support',      sub: 'WhatsApp & phone'       },
              ].map(t => (
                <div key={t.label} className="bg-white rounded-xl border border-black/5 p-3 text-center">
                  <p className="text-xl mb-1.5">{t.icon}</p>
                  <p className="text-[11px] font-bold text-[#0B1F3A]">{t.label}</p>
                  <p className="text-[10px] text-[#0B1F3A]/30 mt-0.5">{t.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: sticky price sidebar ── */}
          <aside className="w-full lg:w-[300px] flex-shrink-0 space-y-4 lg:sticky lg:top-6">

            {/* Price breakdown card */}
            <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
              <div className="bg-[#0B1F3A] px-5 py-5">
                <p className="text-white/35 text-[10px] uppercase tracking-wider mb-1">Price breakdown</p>
                <p className="text-white text-3xl font-bold tabular-nums">{formatPrice(grand)}</p>
                <p className="text-white/25 text-xs mt-0.5">All taxes &amp; fees included</p>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[#0B1F3A]/50">
                    Airfare{isRT ? ' (return)' : ''}
                  </span>
                  <span className="font-semibold text-[#0B1F3A] tabular-nums">{formatPrice(airfare)}</span>
                </div>
                {(() => {
                  const base  = Math.round(airfare * 0.78)
                  const taxes = airfare - base
                  return (
                    <>
                      <div className="flex justify-between text-sm pl-3 border-l-2 border-[#0B1F3A]/6">
                        <span className="text-[#0B1F3A]/35">Base fare</span>
                        <span className="text-[#0B1F3A]/50 tabular-nums">{formatPrice(base)}</span>
                      </div>
                      <div className="flex justify-between text-sm pl-3 border-l-2 border-[#0B1F3A]/6">
                        <span className="text-[#0B1F3A]/35">Taxes &amp; fees</span>
                        <span className="text-[#0B1F3A]/50 tabular-nums">{formatPrice(taxes)}</span>
                      </div>
                    </>
                  )
                })()}
                {seatCost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#0B1F3A]/50">Seat selection ({seats.length})</span>
                    <span className="font-semibold text-[#0B1F3A] tabular-nums">+{formatPrice(seatCost)}</span>
                  </div>
                )}
                {extraCost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#0B1F3A]/50">Extras ({extras.length})</span>
                    <span className="font-semibold text-[#0B1F3A] tabular-nums">+{formatPrice(extraCost)}</span>
                  </div>
                )}
                {discountGBP > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-600">Miles discount</span>
                    <span className="font-semibold text-emerald-600 tabular-nums">-{formatPrice(discountGBP)}</span>
                  </div>
                )}
                <div className="border-t border-[#0B1F3A]/5 pt-3 flex justify-between items-baseline">
                  <span className="font-bold text-[#0B1F3A]">Grand total</span>
                  <span className="text-xl font-bold text-[#0B1F3A] tabular-nums">{formatPrice(grand)}</span>
                </div>
                {passengers.length > 1 && (
                  <p className="text-[10px] text-[#0B1F3A]/25 text-right">
                    {formatPrice(Math.round(grand / passengers.length))} per person
                  </p>
                )}
              </div>

              {/* CTA */}
              <div className="px-5 pb-5 space-y-2">
                <button type="button" onClick={handleProceed} disabled={!agreedTc}
                  className="w-full py-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-[#C9A84C]/20">
                  Confirm &amp; Pay — {formatPrice(grand)}
                </button>
                {!agreedTc && (
                  <p className="text-[10px] text-center text-[#0B1F3A]/30">Please accept the T&amp;C above to continue</p>
                )}
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  <svg className="w-3.5 h-3.5 text-[#0B1F3A]/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                  <p className="text-[10px] text-[#0B1F3A]/20">256-bit SSL · PCI DSS Level 1</p>
                </div>
              </div>
            </div>

            {/* What's next */}
            <div className="bg-white rounded-2xl border border-black/5 p-5 space-y-3">
              <p className="text-[10px] font-bold text-[#0B1F3A]/35 uppercase tracking-widest">What happens next</p>
              {[
                { icon: '✉', step: '1', text: 'Booking confirmation sent to your email' },
                { icon: '📄', step: '2', text: 'E-ticket issued within 5 minutes'       },
                { icon: '✈',  step: '3', text: 'Check in opens 24h before departure'    },
              ].map(({ icon, step, text }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#0B1F3A]/5 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs">{icon}</span>
                  </div>
                  <p className="text-xs text-[#0B1F3A]/50 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>

        {/* Mobile sticky CTA */}
        <div className="lg:hidden mt-6 bg-white rounded-2xl border border-black/5 p-5 space-y-3">
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-[#0B1F3A]/50">Total incl. taxes</span>
            <span className="text-2xl font-bold text-[#0B1F3A] tabular-nums">{formatPrice(grand)}</span>
          </div>
          <button type="button" onClick={handleProceed} disabled={!agreedTc}
            className="w-full py-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-base hover:bg-[#E8C87A] active:scale-[0.98] transition-all disabled:opacity-30 shadow-lg shadow-[#C9A84C]/20">
            Confirm &amp; Pay — {formatPrice(grand)}
          </button>
          <div className="flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-[#0B1F3A]/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <span className="text-[10px] text-[#0B1F3A]/20">256-bit SSL · PCI DSS Level 1</span>
          </div>
        </div>
      </div>
    </div>
  )
}
