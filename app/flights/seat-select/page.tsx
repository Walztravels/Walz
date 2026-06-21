'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SeatMapViewer } from '@/components/flights/seatmap/SeatMapViewer'
import { useFlightStore, type SelectedSeat } from '@/store/flightStore'
import { formatTime, formatDuration } from '@/lib/flights/utils'

const STEPS = ['Search', 'Seats', 'Travellers', 'Extras', 'Review', 'Pay']

function SeatSelectContent() {
  const router  = useRouter()
  const sp      = useSearchParams()
  const offerId = sp.get('offer_id') ?? 'mock_offer'
  const { selected, setStep, passengerCount } = useFlightStore()
  const paxCount = passengerCount()

  const seg     = selected?.segments[0]
  const segLast = selected ? selected.segments[selected.segments.length - 1] : null

  function handleComplete(_seats: SelectedSeat[]) {
    setStep('travellers')
    router.push('/flights/traveller')
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">

      {/* ── Emirates-standard dark header ── */}
      <div className="bg-[#0B1F3A]">
        <div className="container-walz py-5">

          {/* Back + step label */}
          <div className="flex items-center gap-3 mb-5">
            <button onClick={() => router.back()}
              className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/12 transition-all flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1">
              <p className="text-white/40 text-xs">Step 2 of 6</p>
              <p className="text-white font-semibold text-sm">Seat Selection</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex gap-1 mb-6">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1 flex flex-col gap-1">
                <div className={`h-0.5 rounded-full transition-all ${i <= 1 ? 'bg-[#C9A84C]' : 'bg-white/10'}`} />
                <p className={`text-[9px] font-medium hidden sm:block ${i <= 1 ? 'text-[#C9A84C]' : 'text-white/20'}`}>{s}</p>
              </div>
            ))}
          </div>

          {/* Flight context banner */}
          {selected && seg && segLast && (
            <div className="bg-white/6 border border-white/8 rounded-2xl p-4 flex flex-wrap items-center gap-4">
              {/* Airline logo */}
              <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={seg.airlineLogo}
                  alt={seg.airlineName}
                  className="w-7 h-7 object-contain"
                  onError={e => {
                    const img = e.currentTarget as HTMLImageElement
                    img.style.display = 'none'
                    const p = img.parentElement as HTMLElement
                    p.innerHTML = `<span class="text-white font-bold text-xs">${seg.airline}</span>`
                  }}
                />
              </div>

              {/* Route */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">
                  {seg.departureCity} <span className="text-[#C9A84C]">→</span> {segLast.arrivalCity}
                </p>
                <p className="text-white/40 text-xs mt-0.5">
                  {seg.airlineName} · {seg.flightNumber} · {seg.cabinClass.replace('_', ' ')}
                </p>
              </div>

              {/* Times */}
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-center">
                  <p className="text-white font-bold text-sm tabular-nums">{formatTime(seg.departureTime)}</p>
                  <p className="text-white/35 text-[10px]">{seg.departureIata}</p>
                </div>
                <div className="text-center">
                  <div className="h-px w-12 bg-white/20 relative">
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-white/30 whitespace-nowrap">{formatDuration(selected.totalDuration)}</span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-white font-bold text-sm tabular-nums">{formatTime(segLast.arrivalTime)}</p>
                  <p className="text-white/35 text-[10px]">{segLast.arrivalIata}</p>
                </div>
              </div>

              {/* Pax count */}
              <div className="flex-shrink-0 bg-white/8 rounded-xl px-3 py-2 text-center">
                <p className="text-white font-bold text-sm">{paxCount}</p>
                <p className="text-white/35 text-[9px]">Pax</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="container-walz py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">Choose your seats</h1>
          <p className="text-[#0B1F3A]/50 text-sm mt-1">
            Select a seat for each passenger — or skip to continue without choosing.
          </p>
        </div>

        <SeatMapViewer
          offerId={offerId}
          passengerCount={paxCount}
          onComplete={handleComplete}
        />
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
