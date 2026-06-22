'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MOCK_ITINERARY } from '@/lib/flights/mockData'
import { formatDuration, formatTime } from '@/lib/flights/utils'
import { useFlightStore } from '@/store/flightStore'
import { LoyaltyDashboard } from '@/components/flights/loyalty/LoyaltyDashboard'

const NEXT_STEPS = [
  { icon: '📧', title: 'Confirmation email',    desc: 'Your e-ticket will arrive within 5 minutes. Check spam if not received.' },
  { icon: '📱', title: 'Save boarding pass',    desc: 'Download your pass to Apple Wallet or Google Pay before your flight.'   },
  { icon: '🌐', title: 'Check visa requirements', desc: 'Visit your destination government site for entry requirements.'         },
  { icon: '📡', title: 'Get a data eSIM',       desc: 'Walz Jade Connect eSIM — stay connected from £9. Activate before you fly.' },
]

const UPSELLS = [
  { icon: '📡', title: 'Jade Connect eSIM',   desc: 'Data in 150+ countries',     link: '/esim',      cta: 'Get eSIM' },
  { icon: '🏨', title: 'Book a Hotel',         desc: '1,000+ hotels at destination', link: '/hotels',   cta: 'Browse Hotels' },
  { icon: '📄', title: 'Visa Service',         desc: 'Stress-free visa assistance', link: '/visa',     cta: 'Apply Now' },
  { icon: '🛡️', title: 'Travel Insurance',    desc: 'From £24 comprehensive cover', link: '/insurance', cta: 'Get Cover' },
]

function ConfirmationContent() {
  const router   = useRouter()
  const sp       = useSearchParams()
  const store    = useFlightStore()
  const { bookingRef: storedRef, selected, passengers, resetBooking } = store

  const urlRef     = sp.get('ref')
  const bookingRef = storedRef ?? urlRef ?? ('WLZ' + Math.random().toString(36).slice(2, 7).toUpperCase())

  const it   = selected ?? MOCK_ITINERARY
  const seg  = it.segments[0]
  const last = it.segments[it.segments.length - 1]

  const [tick, setTick] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setTick(true), 400)
    return () => clearTimeout(t)
  }, [])

  const milesEarned  = Math.round(it.price.total * 10)
  const leadPax      = passengers[0]

  function handleCalendar() {
    const depart = new Date(seg.departureTime)
    const arrive = new Date(last.arrivalTime)
    const fmt    = (d: Date) => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
    const url    = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${seg.departureIata}→${last.arrivalIata} | ${seg.airlineName}`)}&dates=${fmt(depart)}/${fmt(arrive)}&details=Booking+ref:+${bookingRef}`
    window.open(url, '_blank')
  }

  function handleBookAnother() {
    resetBooking()
    router.push('/flights')
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Hero confirmation */}
      <div className="bg-[#0B1F3A] text-white py-16 text-center px-4">
        {/* Animated checkmark */}
        <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center transition-all duration-500 ${tick ? 'bg-green-500 scale-100' : 'bg-white/10 scale-75'}`}>
          <svg className={`w-10 h-10 text-white transition-opacity duration-300 ${tick ? 'opacity-100' : 'opacity-0'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="font-display text-3xl lg:text-4xl font-bold mb-2">Booking Confirmed!</h1>
        {leadPax && <p className="text-white/60 mb-6">Thank you, {leadPax.firstName}. Have an amazing journey!</p>}

        {/* Booking ref */}
        <div className="inline-block bg-white/5 border border-white/10 rounded-2xl px-8 py-5 mb-6">
          <p className="text-white/40 text-xs letter-spacing-widest uppercase tracking-[0.3em] mb-2">Booking Reference</p>
          <p className="font-mono text-3xl font-bold text-[#C9A84C] tracking-[0.2em]">{bookingRef}</p>
          <p className="text-white/30 text-xs mt-2">Keep this reference — you'll need it at the airport</p>
        </div>

        {/* Miles earned */}
        <div className="inline-flex items-center gap-2 bg-[#C9A84C]/20 border border-[#C9A84C]/30 rounded-xl px-5 py-2.5">
          <span className="text-[#C9A84C] font-bold">+{milesEarned.toLocaleString()} Walz Miles</span>
          <span className="text-white/40 text-sm">earned on this booking</span>
        </div>
      </div>

      {/* Flight summary */}
      <div className="container-walz py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Flight card */}
            <div className="bg-white rounded-2xl border border-black/5 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-[#0B1F3A]/5 flex items-center justify-center text-xl">✈️</div>
                <div>
                  <p className="font-semibold text-[#0B1F3A]">{seg.airlineName}</p>
                  <p className="text-xs text-[#0B1F3A]/40">{seg.flightNumber} · {seg.aircraft}</p>
                </div>
              </div>

              <div className="flex items-center gap-6 mb-5">
                <div>
                  <p className="text-3xl font-bold text-[#0B1F3A]">{formatTime(seg.departureTime)}</p>
                  <p className="text-[#C9A84C] font-bold">{seg.departureIata}</p>
                  <p className="text-xs text-[#0B1F3A]/40">{seg.departureCity}</p>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-xs text-[#0B1F3A]/40 mb-1">{formatDuration(it.totalDuration)}</p>
                  <div className="h-px bg-[#0B1F3A]/10 relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/0 via-[#C9A84C]/40 to-[#0B1F3A]/0 h-px" />
                  </div>
                  <p className="text-xs text-[#0B1F3A]/40 mt-1">{it.stops === 0 ? 'Direct' : `${it.stops} stop`}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-[#0B1F3A]">{formatTime(last.arrivalTime)}</p>
                  <p className="text-[#C9A84C] font-bold">{last.arrivalIata}</p>
                  <p className="text-xs text-[#0B1F3A]/40">{last.arrivalCity}</p>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-4 gap-3 pt-4 border-t border-black/5">
                {[
                  { label: 'Passengers', value: `${store.passengerCount()} pax` },
                  { label: 'Cabin', value: seg.cabinClass.replace('_', ' ') },
                  { label: 'Baggage', value: it.baggageInfo.checked },
                  { label: 'Total', value: `£${it.price.total.toFixed(0)}` },
                ].map(({ label, value }) => (
                  <div key={label} className="text-center">
                    <p className="text-[10px] text-[#0B1F3A]/40 uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-semibold text-[#0B1F3A] mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: '🖨️', label: 'Download e-Ticket', action: () => window.print()                      },
                { icon: '📧', label: 'Resend Email',       action: () => {}                                   },
                { icon: '📅', label: 'Add to Calendar',   action: handleCalendar                              },
                { icon: '💬', label: 'Contact Support',   action: () => window.open('https://wa.me/447398753797', '_blank') },
              ].map(({ icon, label, action }) => (
                <button key={label} onClick={action}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white border border-black/5 hover:border-[#C9A84C]/30 hover:shadow-sm transition-all">
                  <span className="text-2xl">{icon}</span>
                  <span className="text-xs font-medium text-[#0B1F3A]/60 text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>

            {/* What happens next */}
            <div className="bg-white rounded-2xl border border-black/5 p-6">
              <h2 className="font-display font-bold text-[#0B1F3A] mb-4">What happens next?</h2>
              <div className="space-y-4">
                {NEXT_STEPS.map((s, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#0B1F3A]/5 flex items-center justify-center text-xl flex-shrink-0">{s.icon}</div>
                    <div>
                      <p className="font-semibold text-sm text-[#0B1F3A]">{s.title}</p>
                      <p className="text-xs text-[#0B1F3A]/50 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upsell grid */}
            <div>
              <p className="font-display font-bold text-[#0B1F3A] mb-4">Complete your trip</p>
              <div className="grid grid-cols-2 gap-4">
                {UPSELLS.map(u => (
                  <a key={u.title} href={u.link}
                    className="bg-white rounded-2xl border border-black/5 p-4 hover:border-[#C9A84C]/30 hover:shadow-sm transition-all group">
                    <div className="text-2xl mb-2">{u.icon}</div>
                    <p className="font-semibold text-sm text-[#0B1F3A]">{u.title}</p>
                    <p className="text-xs text-[#0B1F3A]/40 mb-3">{u.desc}</p>
                    <span className="text-xs font-semibold text-[#C9A84C] group-hover:underline">{u.cta} →</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Right: loyalty + book again */}
          <aside className="space-y-5">
            <LoyaltyDashboard variant="compact" />

            <button onClick={handleBookAnother}
              className="w-full py-3.5 rounded-xl bg-[#0B1F3A] text-white font-bold text-sm hover:bg-[#081629] transition-all">
              Book another flight
            </button>

            <a href="/" className="block w-full text-center py-3 rounded-xl border border-[#0B1F3A]/10 text-[#0B1F3A] font-medium text-sm hover:bg-white transition-all">
              Return to home
            </a>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
    </div>}>
      <ConfirmationContent />
    </Suspense>
  )
}
