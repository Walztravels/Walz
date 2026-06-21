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

const TRUST_ITEMS = [
  { icon: '🔒', label: 'SSL Secured',     sub: '256-bit encryption'        },
  { icon: '✈️', label: 'IATA Accredited', sub: 'Official travel partner'  },
  { icon: '🛡️', label: 'ATOL Protected',  sub: 'Your money is safe'       },
  { icon: '📞', label: '24/7 Support',    sub: 'WhatsApp & phone'          },
]

export default function ReviewPage() {
  const router  = useRouter()
  const store   = useFlightStore()
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

      {/* Premium step header */}
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
          <div className="flex gap-1.5 mb-6">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-all ${i <= 4 ? 'bg-[#C9A84C]' : 'bg-white/10'}`} />
            ))}
          </div>

          {/* Airline flight banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-2">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-2xl flex-shrink-0">✈️</div>
              <div>
                <p className="text-[#C9A84C] text-[11px] font-bold tracking-[0.25em] uppercase mb-0.5">{seg0.airlineName}</p>
                <p className="text-white font-display text-2xl font-bold">{seg0.departureCity} → {segLast.arrivalCity}</p>
                <p className="text-white/40 text-xs mt-0.5">
                  {selected.stops === 0 ? 'Non-stop' : `${selected.stops} stop${selected.stops > 1 ? 's' : ''}`} · {formatDuration(selected.totalDuration)} · {seg0.cabinClass.replace('_', ' ')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white/30 text-xs">Total price</p>
              <p className="text-white text-3xl font-bold">£{grand.toFixed(0)}</p>
              <p className="text-white/30 text-[11px]">{passengers.length || 1} passenger{(passengers.length || 1) !== 1 ? 's' : ''} · taxes included</p>
            </div>
          </div>
        </div>
      </div>

      {/* Flight timeline strip */}
      <div className="bg-[#0B1F3A] border-t border-white/5">
        <div className="container-walz py-4">
          <div className="bg-white/6 rounded-2xl px-6 py-4 flex items-center gap-4">
            <div className="text-center">
              <p className="text-white text-2xl font-bold">{formatTime(seg0.departureTime)}</p>
              <p className="text-[#C9A84C] font-bold text-sm">{seg0.departureIata}</p>
              <p className="text-white/30 text-[11px]">{seg0.departureCity}</p>
            </div>
            <div className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-center w-full gap-2">
                <div className="w-2 h-2 rounded-full bg-[#C9A84C] flex-shrink-0" />
                <div className="flex-1 h-px bg-white/15 relative">
                  <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center">
                    <span className="text-white/20 text-xs">✈</span>
                  </div>
                </div>
                <div className="w-2 h-2 rounded-full bg-[#C9A84C] flex-shrink-0" />
              </div>
              <p className="text-white/30 text-[11px]">{formatDuration(selected.totalDuration)}</p>
            </div>
            <div className="text-center">
              <p className="text-white text-2xl font-bold">{formatTime(segLast.arrivalTime)}</p>
              <p className="text-[#C9A84C] font-bold text-sm">{segLast.arrivalIata}</p>
              <p className="text-white/30 text-[11px]">{segLast.arrivalCity}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container-walz py-8">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Left: details */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Fare details card */}
            <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
              <div className="bg-[#0B1F3A]/3 px-5 py-3 border-b border-black/5 flex items-center justify-between">
                <p className="text-xs font-bold text-[#0B1F3A]/50 uppercase tracking-wider">Fare Details</p>
                <span className="text-[11px] text-[#C9A84C] font-bold bg-[#C9A84C]/10 px-2 py-0.5 rounded-full">
                  {seg0.cabinClass.replace('_', ' ')}
                </span>
              </div>
              <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Baggage', value: selected.baggageInfo.checked },
                  { label: 'Hand Baggage', value: selected.baggageInfo.cabin },
                  { label: 'Changes', value: selected.baggageInfo.checked !== '0' ? 'Allowed' : 'Paid' },
                  { label: 'Meals', value: 'Included' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[11px] text-[#0B1F3A]/30 uppercase tracking-wider mb-1">{label}</p>
                    <p className="font-semibold text-[#0B1F3A] text-sm">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Passengers */}
            {passengers.length > 0 && (
              <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                <div className="bg-[#0B1F3A]/3 px-5 py-3 border-b border-black/5">
                  <p className="text-xs font-bold text-[#0B1F3A]/50 uppercase tracking-wider">Passengers</p>
                </div>
                <div className="divide-y divide-black/5">
                  {passengers.map((p, i) => {
                    const seat = seats.find(s => s.paxIndex === i)
                    return (
                      <div key={p.id} className="px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-[#0B1F3A]/5 flex items-center justify-center text-sm font-bold text-[#0B1F3A]/50 flex-shrink-0">{i + 1}</div>
                          <div>
                            <p className="font-semibold text-[#0B1F3A] text-sm">{p.title}. {p.firstName} {p.lastName}</p>
                            <p className="text-[11px] text-[#0B1F3A]/40">{p.nationality} · Passport: {p.passportNo || '—'}</p>
                          </div>
                        </div>
                        {seat ? (
                          <div className="text-right">
                            <span className="text-xs font-bold text-[#C9A84C] bg-[#C9A84C]/10 px-2.5 py-1 rounded-full">
                              Seat {seat.seatNumber}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[#0B1F3A]/20">No seat</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Extras */}
            {extras.length > 0 && (
              <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                <div className="bg-[#0B1F3A]/3 px-5 py-3 border-b border-black/5">
                  <p className="text-xs font-bold text-[#0B1F3A]/50 uppercase tracking-wider">Added Extras</p>
                </div>
                <div className="divide-y divide-black/5">
                  {extras.map(e => (
                    <div key={e.id} className="px-5 py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center text-base">{e.icon || '✓'}</div>
                        <div>
                          <p className="font-medium text-[#0B1F3A] text-sm">{e.name}</p>
                          <p className="text-[11px] text-[#0B1F3A]/40">{e.description}</p>
                        </div>
                      </div>
                      <span className="font-bold text-[#0B1F3A] text-sm">+£{e.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Miles redemption */}
            {loyalty && !loyalty.isGuest && loyalty.miles >= 5000 && (
              <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                <div className="bg-[#C9A84C]/5 px-5 py-3 border-b border-[#C9A84C]/10 flex items-center gap-2">
                  <span className="text-sm">⭐</span>
                  <p className="text-xs font-bold text-[#8B6914] uppercase tracking-wider">Redeem Jade Miles</p>
                  <span className="ml-auto text-xs text-[#0B1F3A]/40">{loyalty.miles.toLocaleString()} miles available</span>
                </div>
                <div className="p-4 space-y-2">
                  {MILES_OPTIONS.filter(o => o.miles <= loyalty.miles).map(opt => (
                    <label key={opt.miles} className={`flex items-center justify-between cursor-pointer p-3 rounded-xl border transition-all ${milesRedeemed === opt.miles ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-black/5 hover:border-black/10'}`}>
                      <div className="flex items-center gap-3">
                        <input type="radio" name="miles" checked={milesRedeemed === opt.miles}
                          onChange={() => handleMilesRedeem(opt.miles, opt.discountGBP)}
                          className="accent-[#C9A84C]" />
                        <div>
                          <p className="text-sm font-semibold text-[#0B1F3A]">{opt.miles.toLocaleString()} miles</p>
                          <p className="text-[11px] text-[#0B1F3A]/40">100 miles = £1 · saves £{opt.discountGBP}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-green-600">-£{opt.discountGBP}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* T&C */}
            <label className="flex items-start gap-3 cursor-pointer bg-white rounded-2xl border border-black/5 p-5">
              <div className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${agreedTc ? 'bg-[#C9A84C] border-[#C9A84C]' : 'border-black/20 bg-white'}`}
                onClick={() => setAgreedTc(v => !v)}>
                {agreedTc && (
                  <svg className="w-3 h-3 text-[#0B1F3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <p className="text-sm text-[#0B1F3A]/60 leading-relaxed select-none" onClick={() => setAgreedTc(v => !v)}>
                I have read and agree to the{' '}
                <a href="/terms" className="text-[#C9A84C] hover:underline" onClick={e => e.stopPropagation()}>Terms & Conditions</a>
                {' '}and{' '}
                <a href="/privacy" className="text-[#C9A84C] hover:underline" onClick={e => e.stopPropagation()}>Privacy Policy</a>.
                I confirm all passenger details are correct and match the passport presented at check-in.
              </p>
            </label>

            {/* Trust badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {TRUST_ITEMS.map(t => (
                <div key={t.label} className="bg-white rounded-xl border border-black/5 p-3 text-center">
                  <div className="text-xl mb-1">{t.icon}</div>
                  <p className="text-[11px] font-bold text-[#0B1F3A]">{t.label}</p>
                  <p className="text-[10px] text-[#0B1F3A]/30">{t.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: sticky price summary */}
          <aside className="hidden lg:block w-[300px] flex-shrink-0">
            <div className="bg-white rounded-2xl border border-black/5 overflow-hidden sticky top-6">
              <div className="bg-[#0B1F3A] px-5 py-4">
                <p className="text-white/40 text-[11px] uppercase tracking-wider mb-1">Price Summary</p>
                <p className="text-white text-3xl font-bold">£{grand.toFixed(0)}</p>
                <p className="text-white/30 text-xs mt-0.5">All taxes & fees included</p>
              </div>

              <div className="p-5 space-y-3 text-sm">
                <div className="flex justify-between text-[#0B1F3A]/70">
                  <span>Airfare</span>
                  <span className="font-semibold text-[#0B1F3A]">£{airfare.toFixed(0)}</span>
                </div>
                {seatCost > 0 && (
                  <div className="flex justify-between text-[#0B1F3A]/70">
                    <span>Seats ({seats.length})</span>
                    <span className="font-semibold text-[#0B1F3A]">£{seatCost.toFixed(0)}</span>
                  </div>
                )}
                {extraCost > 0 && (
                  <div className="flex justify-between text-[#0B1F3A]/70">
                    <span>Extras ({extras.length})</span>
                    <span className="font-semibold text-[#0B1F3A]">£{extraCost.toFixed(0)}</span>
                  </div>
                )}
                {discountGBP > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Miles discount</span>
                    <span className="font-semibold">-£{discountGBP.toFixed(0)}</span>
                  </div>
                )}
                <div className="border-t border-black/5 pt-3 flex justify-between items-center">
                  <span className="font-bold text-[#0B1F3A]">Total</span>
                  <span className="font-bold text-[#0B1F3A] text-lg">£{grand.toFixed(0)}</span>
                </div>
              </div>

              <div className="px-5 pb-5">
                <button type="button" onClick={handleProceed} disabled={!agreedTc}
                  className="w-full py-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-[#C9A84C]/20">
                  Confirm & Pay — £{grand.toFixed(0)}
                </button>
                {!agreedTc && (
                  <p className="text-[11px] text-[#0B1F3A]/30 text-center mt-2">Accept the T&amp;C above to continue</p>
                )}
                <div className="flex items-center justify-center gap-1.5 mt-4">
                  <svg className="w-3.5 h-3.5 text-[#0B1F3A]/25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="text-[11px] text-[#0B1F3A]/25">256-bit SSL · PCI DSS Compliant</p>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Mobile sticky CTA */}
        <div className="lg:hidden mt-6 bg-white rounded-2xl border border-black/5 p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-[#0B1F3A]/40 text-xs">Total · all taxes included</p>
              <span className="text-2xl font-bold text-[#0B1F3A]">£{grand.toFixed(0)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#0B1F3A]/20">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-xs">SSL Secured</span>
            </div>
          </div>
          <button type="button" onClick={handleProceed} disabled={!agreedTc}
            className="w-full py-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold hover:bg-[#E8C87A] transition-all disabled:opacity-30 shadow-lg shadow-[#C9A84C]/20">
            Confirm & Pay
          </button>
        </div>
      </div>
    </div>
  )
}
