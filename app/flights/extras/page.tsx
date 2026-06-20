'use client'

import { useRouter } from 'next/navigation'
import { useFlightStore } from '@/store/flightStore'
import type { Ancillary } from '@/lib/flights/types'

const STEPS = ['Search', 'Seats', 'Travellers', 'Extras', 'Review', 'Pay']

const ANCILLARY_LIST: Ancillary[] = [
  { id: 'transfer',   type: 'transfer',       icon: '🚗', name: 'Airport Transfer',    description: 'Private car to/from airport',        price: 45,  currency: 'GBP', popular: true  },
  { id: 'insurance',  type: 'insurance',      icon: '🛡️', name: 'Travel Insurance',    description: 'Comprehensive cover for your trip',   price: 24,  currency: 'GBP', popular: false },
  { id: 'esim',       type: 'esim',           icon: '📡', name: 'Jade Connect eSIM',   description: 'Data in 150+ countries from $9.99',   price: 9,   currency: 'GBP', popular: false },
  { id: 'lounge',     type: 'lounge',         icon: '🛋️', name: 'Airport Lounge',      description: 'Access 1,300+ lounges worldwide',     price: 35,  currency: 'GBP', popular: true  },
  { id: 'fasttrack',  type: 'fast-track',     icon: '⚡', name: 'Fast Track Security', description: 'Skip the queues, save time',          price: 18,  currency: 'GBP', popular: false },
  { id: 'baggage',    type: 'extra-baggage',  icon: '🧳', name: 'Extra Baggage',       description: '23kg checked bag — pre-paid',         price: 55,  currency: 'GBP', popular: false },
  { id: 'visa',       type: 'visa',           icon: '📄', name: 'Visa Service',        description: 'We handle your visa application',     price: 99,  currency: 'GBP', popular: false },
  { id: 'upgrade',    type: 'transfer',       icon: '💺', name: 'Cabin Upgrade',       description: 'Upgrade to next cabin class',         price: 189, currency: 'GBP', popular: false },
]

export default function ExtrasPage() {
  const router = useRouter()
  const { extras, addExtra, removeExtra, setStep, extrasTotal } = useFlightStore()

  const isAdded = (id: string) => extras.some(e => e.id === id)

  function toggle(anc: Ancillary) {
    if (isAdded(anc.id)) removeExtra(anc.id)
    else addExtra(anc)
  }

  function handleContinue() {
    setStep('review')
    router.push('/flights/review')
  }

  const total = extrasTotal()

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
            <p className="text-white/60 text-sm">Step 4 of 6 · Extras</p>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-all ${i <= 3 ? 'bg-[#C9A84C]' : 'bg-white/10'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="container-walz py-8">
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A] mb-1">Enhance your trip</h1>
        <p className="text-[#0B1F3A]/50 text-sm mb-6">Add services to make your journey smoother.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
          {ANCILLARY_LIST.map(anc => {
            const added = isAdded(anc.id)
            return (
              <div key={anc.id}
                className={`bg-white rounded-2xl border p-5 transition-all ${
                  added ? 'border-[#C9A84C] shadow-sm' : 'border-black/5 hover:border-black/10'
                }`}>
                {anc.popular && (
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-3 bg-[#C9A84C]/15 text-[#8B6914]">
                    Popular
                  </span>
                )}
                <div className="text-3xl mb-3">{anc.icon}</div>
                <p className="font-semibold text-[#0B1F3A] mb-1">{anc.name}</p>
                <p className="text-xs text-[#0B1F3A]/50 mb-4 leading-relaxed">{anc.description}</p>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-[#0B1F3A]">+£{anc.price}</p>
                  <button type="button" onClick={() => toggle(anc)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                      added
                        ? 'bg-[#C9A84C] text-[#0B1F3A]'
                        : 'bg-[#0B1F3A] text-white hover:bg-[#081629]'
                    }`}>
                    {added ? '✓ Added' : '+ Add'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer bar */}
        <div className="flex items-center justify-between bg-white rounded-2xl border border-black/5 p-5">
          <div>
            {extras.length > 0 ? (
              <>
                <p className="font-semibold text-[#0B1F3A]">{extras.length} extra{extras.length !== 1 ? 's' : ''} added</p>
                <p className="text-sm text-[#0B1F3A]/50">+£{total.toFixed(0)} to your booking</p>
              </>
            ) : (
              <p className="text-[#0B1F3A]/40 text-sm">No extras selected</p>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={handleContinue}
              className="px-4 py-2.5 rounded-xl bg-[#0B1F3A]/5 text-[#0B1F3A] font-medium text-sm hover:bg-[#0B1F3A]/10 transition-all">
              Skip extras
            </button>
            <button type="button" onClick={handleContinue}
              className="px-6 py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] transition-all">
              Continue →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
