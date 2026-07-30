'use client'

import { useRouter }      from 'next/navigation'
import { useEffect, useState } from 'react'
import { useFlightStore } from '@/store/flightStore'
import type { Ancillary } from '@/lib/flights/types'
import type { FlightExtra } from '@/lib/flights/extras'
import type { CPExtraPrice, CPExtrasResult } from '@/app/api/flights/extras/comfortpass/route'

// CP_EXTRA_IDS kept for currency lookup on add; livePriced flag on each extra drives display logic.
const CP_EXTRA_IDS = new Set(['lounge', 'fasttrack', 'transfer', 'meetgreet'])

const STEPS = ['Search', 'Seats', 'Travellers', 'Extras', 'Review', 'Pay']

export default function ExtrasPage() {
  const router = useRouter()
  const { extras, addExtra, removeExtra, setStep, extrasTotal, selected, passengerCount } = useFlightStore()

  const [extrasData, setExtrasData] = useState<FlightExtra[]>([])
  const [loading,    setLoading]    = useState(true)

  // ComfortPass live prices indexed by extraId
  const [cpPrices,   setCpPrices]   = useState<Map<string, CPExtraPrice>>(new Map())
  const [cpLoading,  setCpLoading]  = useState(false)

  const departureAirport = selected?.segments[0]?.departureIata ?? ''
  console.log('[extras] selected:', selected?.id ?? 'null', '| departureAirport:', departureAirport || '(empty — CP fetch will be skipped)')

  useEffect(() => {
    // Admin config (enabled/disabled, names, photos for manual extras)
    fetch('/api/admin/extras')
      .then(r => r.json())
      .then(data => setExtrasData(data.extras ?? []))
      .catch(() => setExtrasData([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!departureAirport) {
      console.log('[extras] CP fetch skipped — no departure airport (is selected null?)')
      return
    }

    console.log('[extras] fetching ComfortPass prices for airport:', departureAirport)
    setCpLoading(true)
    fetch(`/api/flights/extras/comfortpass?airport=${departureAirport}`)
      .then(r => r.json())
      .then((data: CPExtrasResult) => {
        console.log('[extras] CP response:', JSON.stringify(data))
        const map = new Map<string, CPExtraPrice>()
        for (const svc of data.services ?? []) {
          map.set(svc.extraId, svc)
        }
        console.log('[extras] CP prices mapped:', [...map.keys()])
        setCpPrices(map)
      })
      .catch((err) => {
        console.error('[extras] CP fetch error:', err)
        setCpPrices(new Map())
      })
      .finally(() => setCpLoading(false))
  }, [departureAirport])

  // Extras ready to display (CP extras only shown when price is known)
  const paxCount = passengerCount()
  const enabled  = (extrasData as FlightExtra[]).filter(e => {
    if (!e.enabled) return false
    if (e.livePriced) {
      // Hide while loading, hide if not available for this airport
      if (cpLoading) return false
      return cpPrices.has(e.id)
    }
    return true
  })

  function extraPrice(extra: FlightExtra): number {
    if (extra.livePriced) {
      const cp = cpPrices.get(extra.id)!
      return cp.perPerson ? cp.price * paxCount : cp.price
    }
    return extra.price
  }

  const isAdded = (id: string) => extras.some(e => e.id === id)

  function toggle(extra: FlightExtra) {
    if (isAdded(extra.id)) {
      removeExtra(extra.id)
      return
    }
    const anc: Ancillary = {
      id:          extra.id,
      type:        extra.id as Ancillary['type'],
      icon:        '',
      name:        extra.name,
      description: extra.description,
      price:       extraPrice(extra),
      currency:    extra.livePriced
        ? (cpPrices.get(extra.id)?.currency ?? 'GBP')
        : (extra.currency ?? 'GBP'),
      popular:     extra.popular,
    }
    addExtra(anc)
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

        {(loading || cpLoading) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-black/5 overflow-hidden animate-pulse">
                <div className="h-40 bg-gray-100" />
                <div className="p-4 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-2 bg-gray-100 rounded w-full" />
                  <div className="h-2 bg-gray-100 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
            {enabled.map(extra => {
              const added = isAdded(extra.id)
              const price = extraPrice(extra)
              const cpEntry = cpPrices.get(extra.id)
              const isLive  = extra.livePriced
              return (
                <div key={extra.id}
                  className={`bg-white rounded-2xl border overflow-hidden transition-all ${
                    added ? 'border-[#C9A84C] shadow-md shadow-[#C9A84C]/10' : 'border-black/5 hover:border-black/10 hover:shadow-sm'
                  }`}>
                  {/* Photo */}
                  <div className="relative h-40 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={extra.photoUrl}
                      alt={extra.name}
                      className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                    {added && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-[#C9A84C] rounded-full flex items-center justify-center shadow-md">
                        <svg className="w-3.5 h-3.5 text-[#0B1F3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    {extra.popular && (
                      <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#C9A84C] text-[#0B1F3A]">
                        Popular
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <p className="font-semibold text-[#0B1F3A] mb-1 text-sm">{extra.name}</p>
                    <p className="text-xs text-[#0B1F3A]/50 mb-4 leading-relaxed">
                      {isLive ? (cpEntry?.name ?? extra.description) : extra.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-[#0B1F3A]">
                          +£{price.toFixed(0)}
                        </p>
                        {isLive && cpEntry?.perPerson && paxCount > 1 && (
                          <p className="text-[10px] text-[#0B1F3A]/40">£{cpEntry.price.toFixed(0)} × {paxCount} pax</p>
                        )}
                      </div>
                      <button type="button" onClick={() => toggle(extra)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          added
                            ? 'bg-[#C9A84C] text-[#0B1F3A]'
                            : 'bg-[#0B1F3A] text-white hover:bg-[#152D52]'
                        }`}>
                        {added ? '✓ Added' : '+ Add'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

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
