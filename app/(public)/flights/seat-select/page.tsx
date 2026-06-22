'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SeatMapViewer } from '@/components/flights/seatmap/SeatMapViewer'
import { useFlightStore, type SelectedSeat } from '@/store/flightStore'
import { formatTime, formatDuration } from '@/lib/flights/utils'
import type { CabinClass } from '@/lib/flights/types'

const STEPS = ['Search', 'Seats', 'Travellers', 'Extras', 'Review', 'Pay']

interface Leg {
  id:         string
  label:      string
  fromIata:   string
  fromCity:   string
  toIata:     string
  toCity:     string
  depTime:    string
  arrTime:    string
  duration:   number
  airline:    string
  airlineLogo:string
  flightNum:  string
  cabinClass: CabinClass
}

function SeatSelectContent() {
  const router  = useRouter()
  const sp      = useSearchParams()
  const offerId = sp.get('offer_id') ?? 'mock_offer'
  const { selected, setStep, passengerCount, clearSeats } = useFlightStore()
  const paxCount = passengerCount()

  // Build legs from the selected itinerary
  const legs: Leg[] = []
  if (selected) {
    const outSegs = selected.segments
    legs.push({
      id:          'out',
      label:       selected.returnSegments?.length ? 'Outbound' : 'Flight',
      fromIata:    outSegs[0].departureIata,
      fromCity:    outSegs[0].departureCity,
      toIata:      outSegs[outSegs.length - 1].arrivalIata,
      toCity:      outSegs[outSegs.length - 1].arrivalCity,
      depTime:     outSegs[0].departureTime,
      arrTime:     outSegs[outSegs.length - 1].arrivalTime,
      duration:    selected.totalDuration,
      airline:     outSegs[0].airlineName,
      airlineLogo: outSegs[0].airlineLogo,
      flightNum:   outSegs[0].flightNumber,
      cabinClass:  outSegs[0].cabinClass,
    })
    if (selected.returnSegments?.length) {
      const retSegs = selected.returnSegments
      legs.push({
        id:          'ret',
        label:       'Return',
        fromIata:    retSegs[0].departureIata,
        fromCity:    retSegs[0].departureCity,
        toIata:      retSegs[retSegs.length - 1].arrivalIata,
        toCity:      retSegs[retSegs.length - 1].arrivalCity,
        depTime:     retSegs[0].departureTime,
        arrTime:     retSegs[retSegs.length - 1].arrivalTime,
        duration:    selected.returnDuration ?? 0,
        airline:     retSegs[0].airlineName,
        airlineLogo: retSegs[0].airlineLogo,
        flightNum:   retSegs[0].flightNumber,
        cabinClass:  retSegs[0].cabinClass,
      })
    }
  }

  const [activeLegIdx, setActiveLegIdx] = useState(0)
  const activeLeg = legs[activeLegIdx]

  function handleLegComplete(_seats: SelectedSeat[]) {
    if (activeLegIdx < legs.length - 1) {
      // Move to next leg
      setActiveLegIdx(i => i + 1)
    } else {
      // All legs done → proceed
      setStep('travellers')
      router.push('/flights/traveller')
    }
  }

  function handleSkip() {
    clearSeats()
    setStep('travellers')
    router.push('/flights/traveller')
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">

      {/* ── Dark navy header ── */}
      <div className="bg-[#0B1F3A]">
        <div className="container-walz py-5">

          {/* Back + step */}
          <div className="flex items-center gap-3 mb-5">
            <button onClick={() => router.back()}
              className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/12 transition-all flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1">
              <p className="text-white/35 text-xs">Step 2 of 6</p>
              <p className="text-white font-semibold text-sm leading-tight">Seat Selection</p>
            </div>
            <button onClick={handleSkip}
              className="text-white/35 text-xs hover:text-white/60 transition-colors font-medium">
              Skip all →
            </button>
          </div>

          {/* Progress */}
          <div className="flex gap-1 mb-6">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1 flex flex-col gap-1">
                <div className={`h-0.5 rounded-full transition-all ${i <= 1 ? 'bg-[#C9A84C]' : 'bg-white/10'}`} />
                <p className={`text-[9px] font-medium hidden sm:block ${i <= 1 ? 'text-[#C9A84C]/70' : 'text-white/15'}`}>{s}</p>
              </div>
            ))}
          </div>

          {/* Leg tabs — only shown when 2+ legs */}
          {legs.length > 1 && (
            <div className="flex gap-2 mb-5">
              {legs.map((leg, i) => (
                <button key={leg.id} type="button"
                  onClick={() => setActiveLegIdx(i)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all border ${
                    i === activeLegIdx
                      ? 'bg-[#C9A84C] text-[#0B1F3A] border-transparent'
                      : 'bg-white/6 text-white/50 border-white/10 hover:bg-white/10'
                  }`}>
                  <span>{i === 0 ? '↗' : '↙'}</span>
                  <span>{leg.label}</span>
                  <span>{leg.fromIata} → {leg.toIata}</span>
                </button>
              ))}
            </div>
          )}

          {/* Active flight context banner */}
          {activeLeg && (
            <div className="bg-white/6 border border-white/8 rounded-2xl p-4 flex flex-wrap items-center gap-4">
              {/* Logo */}
              <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={activeLeg.airlineLogo} alt={activeLeg.airline}
                  className="w-7 h-7 object-contain"
                  onError={e => {
                    const img = e.currentTarget as HTMLImageElement
                    img.style.display = 'none'
                    ;(img.parentElement as HTMLElement).innerHTML = `<span class="text-white font-bold text-xs">${activeLeg.flightNum.slice(0,2)}</span>`
                  }} />
              </div>
              {/* Route */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">
                  {activeLeg.fromCity} <span className="text-[#C9A84C]">→</span> {activeLeg.toCity}
                </p>
                <p className="text-white/40 text-xs mt-0.5">
                  {activeLeg.airline} · {activeLeg.flightNum} · {activeLeg.cabinClass.replace('_', ' ')}
                </p>
              </div>
              {/* Times */}
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-center">
                  <p className="text-white font-bold text-sm tabular-nums">{formatTime(activeLeg.depTime)}</p>
                  <p className="text-white/35 text-[10px]">{activeLeg.fromIata}</p>
                </div>
                <div className="text-center relative px-4">
                  <div className="h-px w-14 bg-white/20" />
                  <p className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-white/25 whitespace-nowrap">
                    {formatDuration(activeLeg.duration)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-white font-bold text-sm tabular-nums">{formatTime(activeLeg.arrTime)}</p>
                  <p className="text-white/35 text-[10px]">{activeLeg.toIata}</p>
                </div>
              </div>
              {/* Pax */}
              <div className="flex-shrink-0 bg-white/8 rounded-xl px-3 py-2 text-center">
                <p className="text-white font-bold text-sm">{paxCount}</p>
                <p className="text-white/30 text-[9px]">Pax</p>
              </div>
            </div>
          )}

          {/* Leg step indicator for multi-leg */}
          {legs.length > 1 && (
            <div className="mt-4 flex items-center gap-2">
              {legs.map((leg, i) => (
                <div key={leg.id} className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all ${
                    i < activeLegIdx
                      ? 'bg-emerald-500 text-white'
                      : i === activeLegIdx
                        ? 'bg-[#C9A84C] text-[#0B1F3A]'
                        : 'bg-white/10 text-white/30'
                  }`}>{i < activeLegIdx ? '✓' : i + 1}</div>
                  <span className={`text-xs font-medium ${i === activeLegIdx ? 'text-white' : 'text-white/25'}`}>
                    {leg.label}
                  </span>
                  {i < legs.length - 1 && <div className="h-px w-6 bg-white/10" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="container-walz py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">Choose your seats</h1>
          <p className="text-[#0B1F3A]/50 text-sm mt-1">
            {activeLeg
              ? `${activeLeg.label} · ${activeLeg.fromIata} → ${activeLeg.toIata}`
              : 'Select a seat for each passenger.'}
            {legs.length > 1 && activeLegIdx < legs.length - 1
              ? ` — you'll select return seats next.`
              : ''}
          </p>
        </div>

        {activeLeg ? (
          <SeatMapViewer
            key={activeLeg.id}
            offerId={offerId}
            segmentId={activeLeg.id}
            passengerCount={paxCount}
            cabinClass={activeLeg.cabinClass}
            onComplete={handleLegComplete}
            onSkip={handleSkip}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-black/5 p-8 text-center">
            <p className="text-[#0B1F3A]/40 text-sm">No flight selected. Please go back and choose a flight.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SeatSelectPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0B1F3A] flex flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="w-14 h-14 rounded-full border-4 border-[#C9A84C]/20 border-t-[#C9A84C] animate-spin" />
          <span className="absolute inset-0 flex items-center justify-center text-2xl">✈</span>
        </div>
        <p className="text-white/40 text-sm">Loading cabin map…</p>
      </div>
    }>
      <SeatSelectContent />
    </Suspense>
  )
}
