'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SeatMapViewer } from '@/components/flights/seatmap/SeatMapViewer'
import { useFlightStore, type SelectedSeat } from '@/store/flightStore'

const STEPS = ['Search', 'Seats', 'Travellers', 'Extras', 'Review', 'Pay']

function SeatSelectContent() {
  const router       = useRouter()
  const sp           = useSearchParams()
  const offerId      = sp.get('offer_id') ?? 'mock_offer'
  const { selected, setStep, passengerCount } = useFlightStore()
  const paxCount = passengerCount()

  function handleComplete(seats: SelectedSeat[]) {
    setStep('travellers')
    router.push('/flights/traveller')
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Step header */}
      <div className="bg-[#0B1F3A]">
        <div className="container-walz py-5">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => router.back()} className="text-white/40 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <p className="text-white/60 text-sm">Step 2 of 6 · Seat Selection</p>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-all ${i <= 1 ? 'bg-[#C9A84C]' : 'bg-white/10'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="container-walz py-8">
        {/* Flight context */}
        {selected && (
          <div className="bg-white rounded-2xl border border-black/5 p-4 mb-6 flex items-center gap-4">
            <div className="text-2xl">{selected.segments[0]?.airlineLogo ? '' : '✈'}</div>
            <div>
              <p className="font-semibold text-[#0B1F3A]">
                {selected.segments[0]?.departureIata} → {selected.segments[selected.segments.length - 1]?.arrivalIata}
              </p>
              <p className="text-sm text-[#0B1F3A]/50">{selected.segments[0]?.airlineName} · {selected.fareType}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-sm text-[#0B1F3A]/40">Price from</p>
              <p className="font-bold text-[#0B1F3A]">£{selected.price.total.toFixed(0)}</p>
            </div>
          </div>
        )}

        <h1 className="font-display text-2xl font-bold text-[#0B1F3A] mb-2">Choose your seats</h1>
        <p className="text-[#0B1F3A]/50 text-sm mb-6">Select a seat for each passenger. You can skip this step.</p>

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
    <Suspense fallback={<div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
    </div>}>
      <SeatSelectContent />
    </Suspense>
  )
}
