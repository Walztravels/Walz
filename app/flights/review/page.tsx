'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFlightStore } from '@/store/flightStore'
import { formatDuration, formatTime } from '@/lib/flights/utils'

const STEPS = ['Search', 'Seats', 'Travellers', 'Extras', 'Review', 'Pay']

const MILES_OPTIONS = [
  { miles: 5000,  discountGBP: 50  },
  { miles: 10000, discountGBP: 100 },
  { miles: 20000, discountGBP: 200 },
]

export default function ReviewPage() {
  const router  = useRouter()
  const store   = useFlightStore()
  const { selected, passengers, extras, seats, loyalty,
    milesRedeemed, discountGBP, setMilesRedeemed, setStep, totalPrice, seatsTotal, extrasTotal } = store

  const [agreedTc, setAgreedTc] = useState(false)

  const airfare    = selected?.price.total ?? 0
  const seatCost   = seatsTotal()
  const extraCost  = extrasTotal()
  const grand      = Math.max(0, airfare + seatCost + extraCost - discountGBP)

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
        <div className="text-center">
          <p className="text-[#0B1F3A]/40 mb-4">No flight selected</p>
          <a href="/flights" className="text-[#C9A84C] font-semibold hover:underline">Start a new search →</a>
        </div>
      </div>
    )
  }

  const seg0    = selected.segments[0]
  const segLast = selected.segments[selected.segments.length - 1]

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
            <p className="text-white/60 text-sm">Step 5 of 6 · Review & Confirm</p>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-all ${i <= 4 ? 'bg-[#C9A84C]' : 'bg-white/10'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="container-walz py-8">
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A] mb-6">Review your booking</h1>

        <div className="flex gap-8">
          {/* Left: details */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Flight card */}
            <div className="bg-white rounded-2xl border border-black/5 p-5">
              <p className="text-xs font-bold text-[#0B1F3A]/40 uppercase tracking-wider mb-4">Flight</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-lg text-[#0B1F3A]">{seg0.departureIata} → {segLast.arrivalIata}</p>
                  <p className="text-sm text-[#0B1F3A]/50">{seg0.airlineName} · {selected.stops === 0 ? 'Direct' : `${selected.stops} stop${selected.stops > 1 ? 's' : ''}`} · {formatDuration(selected.totalDuration)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[#0B1F3A]/40 text-xs">Total fare</p>
                  <p className="font-bold text-[#0B1F3A]">£{airfare.toFixed(0)}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-black/5 flex gap-6 text-sm">
                <div>
                  <p className="text-[#0B1F3A]/40 text-[11px]">Departs</p>
                  <p className="font-semibold text-[#0B1F3A]">{formatTime(seg0.departureTime)}</p>
                </div>
                <div>
                  <p className="text-[#0B1F3A]/40 text-[11px]">Arrives</p>
                  <p className="font-semibold text-[#0B1F3A]">{formatTime(segLast.arrivalTime)}</p>
                </div>
                <div>
                  <p className="text-[#0B1F3A]/40 text-[11px]">Baggage</p>
                  <p className="font-semibold text-[#0B1F3A]">{selected.baggageInfo.checked}</p>
                </div>
              </div>
            </div>

            {/* Passengers */}
            {passengers.length > 0 && (
              <div className="bg-white rounded-2xl border border-black/5 p-5">
                <p className="text-xs font-bold text-[#0B1F3A]/40 uppercase tracking-wider mb-4">Passengers</p>
                <div className="space-y-3">
                  {passengers.map((p, i) => {
                    const seat = seats.find(s => s.paxIndex === i)
                    return (
                      <div key={p.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#0B1F3A]/5 flex items-center justify-center text-sm font-bold text-[#0B1F3A]/60">{i + 1}</div>
                          <div>
                            <p className="font-medium text-[#0B1F3A] text-sm">{p.title}. {p.firstName} {p.lastName}</p>
                            <p className="text-[11px] text-[#0B1F3A]/40">{p.nationality} · {p.passportNo || 'No passport'}</p>
                          </div>
                        </div>
                        {seat && (
                          <span className="text-[11px] font-semibold text-[#C9A84C] bg-[#C9A84C]/10 px-2 py-0.5 rounded-full">
                            Seat {seat.seatNumber}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Extras */}
            {extras.length > 0 && (
              <div className="bg-white rounded-2xl border border-black/5 p-5">
                <p className="text-xs font-bold text-[#0B1F3A]/40 uppercase tracking-wider mb-4">Extras</p>
                <div className="space-y-2">
                  {extras.map(e => (
                    <div key={e.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{e.icon}</span>
                        <span className="text-sm text-[#0B1F3A]">{e.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-[#0B1F3A]">+£{e.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Loyalty miles redemption */}
            {loyalty && !loyalty.isGuest && loyalty.miles >= 5000 && (
              <div className="bg-white rounded-2xl border border-black/5 p-5">
                <p className="text-xs font-bold text-[#0B1F3A]/40 uppercase tracking-wider mb-1">Redeem Miles</p>
                <p className="text-sm text-[#0B1F3A]/50 mb-4">You have {loyalty.miles.toLocaleString()} miles · 100 miles = £1</p>
                <div className="space-y-2">
                  {MILES_OPTIONS.filter(o => o.miles <= loyalty.miles).map(opt => (
                    <label key={opt.miles} className="flex items-center justify-between cursor-pointer p-3 rounded-xl border transition-all hover:bg-[#C9A84C]/5 border-black/5">
                      <div className="flex items-center gap-3">
                        <input type="radio" name="miles" checked={milesRedeemed === opt.miles}
                          onChange={() => handleMilesRedeem(opt.miles, opt.discountGBP)}
                          className="accent-[#C9A84C]" />
                        <div>
                          <p className="text-sm font-medium text-[#0B1F3A]">{opt.miles.toLocaleString()} miles</p>
                          <p className="text-[11px] text-[#0B1F3A]/40">= £{opt.discountGBP} discount</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-green-600">-£{opt.discountGBP}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* T&C */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={agreedTc} onChange={e => setAgreedTc(e.target.checked)}
                className="mt-0.5 accent-[#C9A84C]" />
              <p className="text-sm text-[#0B1F3A]/60 leading-relaxed">
                I agree to the{' '}
                <a href="/terms" className="text-[#C9A84C] hover:underline">Terms & Conditions</a>
                {' '}and{' '}
                <a href="/privacy" className="text-[#C9A84C] hover:underline">Privacy Policy</a>.
                I confirm all passenger details are correct and match passport information.
              </p>
            </label>
          </div>

          {/* Right: price breakdown */}
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-black/5 p-5 sticky top-6">
              <p className="text-xs font-bold text-[#0B1F3A]/40 uppercase tracking-wider mb-4">Price Breakdown</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#0B1F3A]/60">Airfare</span>
                  <span className="font-medium text-[#0B1F3A]">£{airfare.toFixed(0)}</span>
                </div>
                {seatCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[#0B1F3A]/60">Seat selection</span>
                    <span className="font-medium text-[#0B1F3A]">£{seatCost.toFixed(0)}</span>
                  </div>
                )}
                {extraCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[#0B1F3A]/60">Extras ({extras.length})</span>
                    <span className="font-medium text-[#0B1F3A]">£{extraCost.toFixed(0)}</span>
                  </div>
                )}
                {discountGBP > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Miles discount</span>
                    <span className="font-medium">-£{discountGBP.toFixed(0)}</span>
                  </div>
                )}
              </div>
              <div className="border-t border-black/5 mt-3 pt-3 flex justify-between items-center">
                <span className="font-bold text-[#0B1F3A]">Total</span>
                <span className="text-2xl font-bold text-[#0B1F3A]">£{grand.toFixed(0)}</span>
              </div>
              <button type="button" onClick={handleProceed} disabled={!agreedTc}
                className="mt-4 w-full py-3.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                Proceed to payment — £{grand.toFixed(0)}
              </button>
              {!agreedTc && <p className="text-[11px] text-[#0B1F3A]/30 text-center mt-2">Agree to T&amp;C to continue</p>}
            </div>
          </aside>
        </div>

        {/* Mobile CTA */}
        <div className="lg:hidden mt-6 bg-white rounded-2xl border border-black/5 p-5">
          <div className="flex justify-between items-center mb-4">
            <span className="font-bold text-[#0B1F3A]">Total</span>
            <span className="text-2xl font-bold text-[#0B1F3A]">£{grand.toFixed(0)}</span>
          </div>
          <button type="button" onClick={handleProceed} disabled={!agreedTc}
            className="w-full py-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold hover:bg-[#E8C87A] transition-all disabled:opacity-40">
            Proceed to payment
          </button>
        </div>
      </div>
    </div>
  )
}
