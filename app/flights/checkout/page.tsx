'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MOCK_ITINERARY } from '@/lib/flights/mockData'
import { formatDuration, formatPrice, formatTime } from '@/lib/flights/utils'

const STEPS = ['Passengers', 'Extras', 'Payment', 'Review']

const PAYMENT_METHODS = [
  { id: 'card',       icon: '💳', label: 'Credit / Debit Card'   },
  { id: 'apple',      icon: '🍎', label: 'Apple Pay'             },
  { id: 'google',     icon: '🔵', label: 'Google Pay'            },
  { id: 'klarna',     icon: '🟣', label: 'Klarna — Pay later'    },
]

type StepIdx = 0 | 1 | 2 | 3

export default function CheckoutPage() {
  const router = useRouter()
  const [step,    setStep]    = useState<StepIdx>(0)
  const [payMeth, setPayMeth] = useState('card')
  const [passenger, setPassenger] = useState({
    title: 'Mr', firstName: '', lastName: '', nationality: 'British',
  })

  const it  = MOCK_ITINERARY
  const seg = it.segments[0]
  const last = it.segments[it.segments.length - 1]
  const PRICE = it.price.total

  function next() { if (step < 3) setStep((step + 1) as StepIdx) }
  function prev() { if (step > 0) setStep((step - 1) as StepIdx) }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Header */}
      <div className="bg-[#0B1F3A] text-white py-4 px-4">
        <div className="container-walz flex items-center justify-between">
          <button onClick={() => router.back()} className="text-white/50 hover:text-white text-sm transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back
          </button>
          <p className="font-display font-bold text-lg">Secure Checkout</p>
          <div className="flex items-center gap-1.5 text-[#C9A84C] text-xs font-semibold">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
            </svg>
            SSL Secured
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="bg-white border-b border-black/5">
        <div className="container-walz py-4">
          <div className="flex items-center gap-0">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-[#C9A84C] text-[#0B1F3A]' : 'bg-[#F5F2EE] text-[#0B1F3A]/30'}`}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span className={`text-sm font-medium hidden sm:block ${i === step ? 'text-[#0B1F3A]' : 'text-[#0B1F3A]/40'}`}>{s}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-3 ${i < step ? 'bg-green-200' : 'bg-[#0B1F3A]/10'}`} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container-walz py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 0: Passengers */}
            {step === 0 && (
              <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                <div className="p-5 border-b border-black/5">
                  <h2 className="font-display font-bold text-[#0B1F3A]">Passenger Details</h2>
                  <p className="text-sm text-[#0B1F3A]/50">As shown on passport</p>
                </div>
                <div className="p-5 space-y-6">
                  {[{ label: 'Passenger 1 (Lead)', prefix: 'p1' }].map(({ label, prefix }) => (
                    <div key={prefix}>
                      <p className="text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-4">{label}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2 grid grid-cols-3 gap-3">
                          <div>
                            <label className="label-walz">Title</label>
                            <select className="input-walz w-full"
                              value={passenger.title}
                              onChange={e => setPassenger(p => ({ ...p, title: e.target.value }))}>
                              {['Mr', 'Mrs', 'Ms', 'Dr', 'Prof'].map(t => <option key={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="label-walz">First Name</label>
                            <input type="text" className="input-walz w-full" placeholder="As on passport"
                              value={passenger.firstName}
                              onChange={e => setPassenger(p => ({ ...p, firstName: e.target.value }))} />
                          </div>
                          <div>
                            <label className="label-walz">Last Name</label>
                            <input type="text" className="input-walz w-full" placeholder="As on passport"
                              value={passenger.lastName}
                              onChange={e => setPassenger(p => ({ ...p, lastName: e.target.value }))} />
                          </div>
                        </div>
                        <div>
                          <label className="label-walz">Date of Birth</label>
                          <input type="date" className="input-walz w-full" />
                        </div>
                        <div>
                          <label className="label-walz">Nationality</label>
                          <select className="input-walz w-full"
                            value={passenger.nationality}
                            onChange={e => setPassenger(p => ({ ...p, nationality: e.target.value }))}>
                            {['British', 'Nigerian', 'Ghanaian', 'Canadian', 'American', 'Other'].map(n => <option key={n}>{n}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label-walz">Passport Number</label>
                          <input type="text" className="input-walz w-full" placeholder="e.g. 123456789" />
                        </div>
                        <div>
                          <label className="label-walz">Passport Expiry</label>
                          <input type="date" className="input-walz w-full" />
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="label-walz">Email</label>
                          <input type="email" className="input-walz w-full" placeholder="you@example.com" />
                        </div>
                        <div>
                          <label className="label-walz">Phone (with country code)</label>
                          <input type="tel" className="input-walz w-full" placeholder="+44 7700 900000" />
                        </div>
                      </div>
                      <div className="mt-4">
                        <label className="label-walz">Known Traveller / Frequent Flyer (optional)</label>
                        <input type="text" className="input-walz w-full" placeholder="e.g. BA Executive Club number" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 1: Extras */}
            {step === 1 && (
              <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                <div className="p-5 border-b border-black/5">
                  <h2 className="font-display font-bold text-[#0B1F3A]">Add Extras</h2>
                  <p className="text-sm text-[#0B1F3A]/50">Enhance your journey</p>
                </div>
                <div className="divide-y divide-black/5">
                  {[
                    { icon: '💺', name: 'Seat Selection',         desc: 'Choose your preferred seat',              price: '£18', popular: true  },
                    { icon: '🧳', name: 'Extra Baggage',          desc: 'Add 23kg hold bag',                       price: '£45', popular: false },
                    { icon: '🛡️', name: 'Travel Insurance',       desc: 'Comprehensive cover',                     price: '£24', popular: true  },
                    { icon: '🍽️', name: 'Special Meal',          desc: 'Halal, Vegan, Kosher, etc.',              price: 'Free', popular: false },
                    { icon: '♿', name: 'Wheelchair Assistance', desc: 'Seamless airport assistance',              price: 'Free', popular: false },
                    { icon: '📡', name: 'Jade Connect eSIM',      desc: 'Stay connected at destination from $9.99', price: '£9',  popular: false },
                  ].map(item => (
                    <div key={item.name} className="flex items-center gap-4 p-4">
                      <span className="text-2xl">{item.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-[#0B1F3A]">{item.name}</p>
                          {item.popular && <span className="text-[10px] font-bold text-[#C9A84C] bg-[#C9A84C]/10 px-2 py-0.5 rounded-full">Popular</span>}
                        </div>
                        <p className="text-xs text-[#0B1F3A]/40">{item.desc}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-[#0B1F3A]">{item.price}</span>
                        <input type="checkbox" className="w-5 h-5 rounded accent-[#C9A84C] cursor-pointer" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Payment */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                  <div className="p-5 border-b border-black/5">
                    <h2 className="font-display font-bold text-[#0B1F3A]">Payment Method</h2>
                  </div>
                  <div className="p-5 grid grid-cols-2 gap-3">
                    {PAYMENT_METHODS.map(m => (
                      <button key={m.id} type="button" onClick={() => setPayMeth(m.id)}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${payMeth === m.id ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-[#0B1F3A]/10 hover:border-[#0B1F3A]/20'}`}>
                        <span className="text-2xl">{m.icon}</span>
                        <span className={`text-sm font-medium ${payMeth === m.id ? 'text-[#0B1F3A] font-semibold' : 'text-[#0B1F3A]/60'}`}>{m.label}</span>
                      </button>
                    ))}
                  </div>

                  {payMeth === 'card' && (
                    <div className="px-5 pb-5 space-y-4">
                      <div>
                        <label className="label-walz">Card Number</label>
                        <input type="text" className="input-walz w-full" placeholder="1234 5678 9012 3456" maxLength={19} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="label-walz">Expiry</label>
                          <input type="text" className="input-walz w-full" placeholder="MM / YY" maxLength={7} />
                        </div>
                        <div>
                          <label className="label-walz">CVV</label>
                          <input type="text" className="input-walz w-full" placeholder="123" maxLength={4} />
                        </div>
                      </div>
                      <div>
                        <label className="label-walz">Name on Card</label>
                        <input type="text" className="input-walz w-full" placeholder="As shown on card" />
                      </div>
                    </div>
                  )}

                  {payMeth === 'klarna' && (
                    <div className="px-5 pb-5">
                      <div className="bg-purple-50 rounded-xl p-4">
                        <p className="text-sm font-semibold text-purple-900 mb-1">Pay in 3 with Klarna</p>
                        <p className="text-xs text-purple-600">Split into 3 interest-free payments of {formatPrice(Math.round(PRICE / 3))}.</p>
                        <p className="text-xs text-purple-400 mt-2">You&apos;ll complete Klarna authorisation on the next step.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Billing address */}
                <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                  <div className="p-5 border-b border-black/5">
                    <h2 className="font-display font-bold text-[#0B1F3A]">Billing Address</h2>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="label-walz">Address Line 1</label>
                      <input type="text" className="input-walz w-full" placeholder="123 Example Street" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label-walz">City</label>
                        <input type="text" className="input-walz w-full" />
                      </div>
                      <div>
                        <label className="label-walz">Postcode / ZIP</label>
                        <input type="text" className="input-walz w-full" />
                      </div>
                    </div>
                    <div>
                      <label className="label-walz">Country</label>
                      <select className="input-walz w-full">
                        {['United Kingdom', 'Canada', 'United States', 'Nigeria', 'Ghana', 'Other'].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                <div className="p-5 border-b border-black/5">
                  <h2 className="font-display font-bold text-[#0B1F3A]">Review & Confirm</h2>
                  <p className="text-sm text-[#0B1F3A]/50">Please check all details before paying</p>
                </div>
                <div className="p-5 space-y-4">
                  {/* Flight summary */}
                  <div className="bg-[#F5F2EE] rounded-xl p-4">
                    <p className="text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-3">Your flight</p>
                    <div className="flex items-center gap-6">
                      <div>
                        <p className="text-xl font-bold text-[#0B1F3A]">{formatTime(seg.departureTime)}</p>
                        <p className="text-sm font-semibold text-[#C9A84C]">{seg.departureIata}</p>
                      </div>
                      <div className="flex-1 text-center">
                        <p className="text-xs text-[#0B1F3A]/40">{formatDuration(it.totalDuration)}</p>
                        <div className="h-px bg-[#0B1F3A]/10 my-1" />
                        <p className="text-xs text-[#0B1F3A]/40">{it.stops === 0 ? 'Direct' : `${it.stops} stop`}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-[#0B1F3A]">{formatTime(last.arrivalTime)}</p>
                        <p className="text-sm font-semibold text-[#C9A84C]">{last.arrivalIata}</p>
                      </div>
                    </div>
                    <p className="text-xs text-[#0B1F3A]/40 mt-2">{seg.airlineName} · {seg.aircraft} · Economy Flex</p>
                  </div>

                  {/* Passenger summary */}
                  <div className="bg-[#F5F2EE] rounded-xl p-4">
                    <p className="text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-2">Passenger</p>
                    <p className="font-semibold text-[#0B1F3A]">
                      {passenger.title}. {passenger.firstName || '—'} {passenger.lastName || '—'}
                    </p>
                    <p className="text-sm text-[#0B1F3A]/50">{passenger.nationality} passport · 1× 23kg hold bag</p>
                  </div>

                  {/* T&Cs */}
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 rounded accent-[#C9A84C]" defaultChecked />
                      <span className="text-sm text-[#0B1F3A]/60">
                        I have read and agree to the <a href="/terms" className="text-[#C9A84C] underline">Terms & Conditions</a> and <a href="/privacy" className="text-[#C9A84C] underline">Privacy Policy</a>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 rounded accent-[#C9A84C]" />
                      <span className="text-sm text-[#0B1F3A]/60">
                        Keep me updated with flight deals and travel tips (optional)
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center gap-4">
              {step > 0 && (
                <button onClick={prev}
                  className="px-6 py-3 rounded-xl border border-[#0B1F3A]/10 text-[#0B1F3A] font-semibold text-sm hover:bg-white transition-all">
                  ← Back
                </button>
              )}
              {step < 3 ? (
                <button onClick={next}
                  className="flex-1 py-3.5 rounded-xl bg-[#0B1F3A] text-white font-bold text-sm hover:bg-[#081629] active:scale-[0.97] transition-all">
                  Continue →
                </button>
              ) : (
                <button onClick={() => router.push('/flights/confirmation')}
                  className="flex-1 py-3.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] active:scale-[0.97] transition-all flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                  </svg>
                  Pay {formatPrice(PRICE)} Securely
                </button>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <aside>
            <div className="bg-white rounded-2xl border border-black/5 p-5 sticky top-8 space-y-4">
              <h3 className="font-display font-bold text-[#0B1F3A]">Order Summary</h3>
              <div className="bg-[#F5F2EE] rounded-xl p-3">
                <p className="text-xs font-semibold text-[#0B1F3A]/50 mb-1">{seg.departureCity} → {last.arrivalCity}</p>
                <p className="text-sm font-bold text-[#0B1F3A]">{seg.airlineName} · Economy Flex</p>
                <p className="text-xs text-[#0B1F3A]/40">{it.stops === 0 ? 'Direct' : `${it.stops} stop`} · {formatDuration(it.totalDuration)}</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#0B1F3A]/60">1 × Economy Flex</span>
                  <span className="text-[#0B1F3A] font-medium">{formatPrice(Math.round(PRICE * 0.85))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#0B1F3A]/60">Taxes & fees</span>
                  <span className="text-[#0B1F3A] font-medium">{formatPrice(Math.round(PRICE * 0.15))}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>23kg baggage</span>
                  <span>Included</span>
                </div>
                <div className="border-t border-black/5 pt-2 flex justify-between">
                  <span className="font-bold text-[#0B1F3A]">Total</span>
                  <span className="font-bold text-xl text-[#0B1F3A]">{formatPrice(PRICE)}</span>
                </div>
              </div>
              {/* Trust badges */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-black/5">
                {['🔒 SSL', '✈️ IATA', '💬 24/7', '💰 Price Match'].map(b => (
                  <div key={b} className="text-[10px] text-[#0B1F3A]/40 flex items-center gap-1">{b}</div>
                ))}
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-green-800 mb-0.5">✅ ATOL Protected</p>
                <p className="text-xs text-green-600">Your money is 100% protected</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
