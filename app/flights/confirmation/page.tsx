'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MOCK_ITINERARY } from '@/lib/flights/mockData'
import { formatDuration, formatPrice, formatTime } from '@/lib/flights/utils'

const PNR = 'WLZ' + Math.random().toString(36).slice(2, 7).toUpperCase()

const NEXT_STEPS = [
  { icon: '📧', title: 'Confirmation email',   desc: 'Check your inbox — your e-ticket will arrive within 5 minutes.'   },
  { icon: '📱', title: 'Download your ticket', desc: 'Save your boarding pass to Apple Wallet or Google Pay.'           },
  { icon: '🌐', title: 'Check visa requirements', desc: 'Visit your destination government site for entry requirements.' },
  { icon: '📡', title: 'Get a data SIM',        desc: 'Walz eSIM — stay connected from £9.99. Activate before you fly.' },
]

export default function ConfirmationPage() {
  const router  = useRouter()
  const [tick,   setTick]   = useState(false)
  const [pnr]              = useState(PNR)

  const it   = MOCK_ITINERARY
  const seg  = it.segments[0]
  const last = it.segments[it.segments.length - 1]

  useEffect(() => {
    const t = setTimeout(() => setTick(true), 400)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Success header */}
      <div className="bg-[#0B1F3A] text-white py-16 text-center">
        {/* Animated checkmark */}
        <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-6 transition-all duration-700 ${tick ? 'bg-green-500 scale-100' : 'bg-white/10 scale-75'}`}>
          <svg className={`w-10 h-10 transition-all duration-500 delay-300 ${tick ? 'opacity-100 text-white' : 'opacity-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="m5 13 4 4L19 7" />
          </svg>
        </div>
        <p className="text-[#C9A84C] text-sm font-semibold tracking-[0.2em] uppercase mb-2">Booking Confirmed</p>
        <h1 className="font-display text-3xl lg:text-4xl font-bold mb-2">You&apos;re all booked!</h1>
        <p className="text-white/50 text-sm">Your e-ticket is on its way to your inbox</p>
        <div className="mt-6 inline-flex items-center gap-3 bg-white/10 rounded-2xl px-8 py-4">
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider">Booking Reference</p>
            <p className="text-2xl font-mono font-bold text-[#C9A84C]">{pnr}</p>
          </div>
        </div>
      </div>

      {/* Flight card */}
      <div className="container-walz -mt-8 mb-8">
        <div className="bg-white rounded-2xl border border-black/5 shadow-lg overflow-hidden max-w-2xl mx-auto">
          <div className="p-5 border-b border-black/5 flex items-center justify-between">
            <div>
              <p className="text-xs text-[#0B1F3A]/40 mb-0.5">{seg.airlineName}</p>
              <p className="font-display font-bold text-[#0B1F3A]">{seg.departureCity} → {last.arrivalCity}</p>
            </div>
            <span className="text-3xl">✈️</span>
          </div>
          <div className="p-5 flex items-center gap-6">
            <div>
              <p className="text-3xl font-bold text-[#0B1F3A]">{formatTime(seg.departureTime)}</p>
              <p className="text-sm font-semibold text-[#C9A84C]">{seg.departureIata}</p>
              <p className="text-xs text-[#0B1F3A]/40">{seg.departureCity}</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-xs text-[#0B1F3A]/40 mb-1">{formatDuration(it.totalDuration)}</p>
              <div className="h-px bg-[#0B1F3A]/10" />
              <p className="text-xs text-[#0B1F3A]/40 mt-1">{it.stops === 0 ? 'Direct' : `${it.stops} stop`}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-[#0B1F3A]">{formatTime(last.arrivalTime)}</p>
              <p className="text-sm font-semibold text-[#C9A84C]">{last.arrivalIata}</p>
              <p className="text-xs text-[#0B1F3A]/40">{last.arrivalCity}</p>
            </div>
          </div>
          <div className="p-5 border-t border-black/5 bg-[#FAF7F2] flex flex-wrap gap-3">
            <div className="flex-1 text-center">
              <p className="text-xs text-[#0B1F3A]/40">Passenger</p>
              <p className="text-sm font-semibold text-[#0B1F3A]">Mr. Walz Traveller</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-xs text-[#0B1F3A]/40">Class</p>
              <p className="text-sm font-semibold text-[#0B1F3A]">Economy Flex</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-xs text-[#0B1F3A]/40">Baggage</p>
              <p className="text-sm font-semibold text-[#0B1F3A]">1 × 23kg</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-xs text-[#0B1F3A]/40">Total Paid</p>
              <p className="text-sm font-bold text-[#C9A84C]">{formatPrice(it.price.total)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="container-walz mb-10">
        <div className="flex flex-wrap justify-center gap-3">
          <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0B1F3A] text-white font-semibold text-sm hover:bg-[#081629] active:scale-[0.97] transition-all">
            📥 Download e-Ticket
          </button>
          <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0B1F3A]/5 text-[#0B1F3A] font-semibold text-sm hover:bg-[#0B1F3A]/10 active:scale-[0.97] transition-all">
            📧 Resend Confirmation
          </button>
          <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0B1F3A]/5 text-[#0B1F3A] font-semibold text-sm hover:bg-[#0B1F3A]/10 active:scale-[0.97] transition-all">
            🗓 Add to Calendar
          </button>
          <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0B1F3A]/5 text-[#0B1F3A] font-semibold text-sm hover:bg-[#0B1F3A]/10 active:scale-[0.97] transition-all">
            💬 Contact Support
          </button>
        </div>
      </div>

      {/* Next steps */}
      <div className="container-walz mb-12">
        <h2 className="font-display font-bold text-[#0B1F3A] text-xl text-center mb-6">What happens next?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {NEXT_STEPS.map((step, i) => (
            <div key={step.title} className="bg-white rounded-2xl border border-black/5 p-5 text-center">
              <div className="w-12 h-12 rounded-full bg-[#F5F2EE] flex items-center justify-center text-2xl mx-auto mb-3">{step.icon}</div>
              <div className="text-[#C9A84C] text-xs font-bold mb-1">Step {i + 1}</div>
              <p className="font-semibold text-[#0B1F3A] text-sm mb-1">{step.title}</p>
              <p className="text-xs text-[#0B1F3A]/40 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Upsell strip */}
      <div className="bg-[#0B1F3A] py-12">
        <div className="container-walz text-center mb-8">
          <p className="text-[#C9A84C] text-sm font-semibold tracking-[0.2em] uppercase mb-2">Complete your trip</p>
          <h2 className="font-display font-bold text-white text-2xl">Need anything else?</h2>
        </div>
        <div className="container-walz grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { href: '/hotels',   emoji: '🏨', label: 'Hotels'       },
            { href: '/visa',     emoji: '📄', label: 'Visa Service' },
            { href: '/esim',     emoji: '📡', label: 'eSIM Data'    },
            { href: '/transfers',emoji: '🚗', label: 'Transfers'    },
          ].map(({ href, emoji, label }) => (
            <a key={href} href={href}
              className="bg-white/10 hover:bg-white/15 rounded-2xl p-5 text-center transition-all active:scale-[0.97]">
              <div className="text-3xl mb-2">{emoji}</div>
              <p className="text-white font-semibold text-sm">{label}</p>
            </a>
          ))}
        </div>
        <div className="container-walz mt-8 text-center">
          <button onClick={() => router.push('/flights')}
            className="px-8 py-3 rounded-xl border border-white/20 text-white/60 text-sm hover:text-white hover:border-white/40 transition-all">
            ← Search more flights
          </button>
        </div>
      </div>
    </div>
  )
}
