'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { FlightSummaryBanner }                    from '@/components/flights/FlightSummaryBanner'
import { FlightResults }                          from '@/components/flights/FlightResults'
import { FlightFilters, applyFilters }            from '@/components/flights/FlightFilters'
import type { FilterState }                       from '@/components/flights/FlightFilters'
import { FlightSearchWidget }                     from '@/components/flights/FlightSearchWidget'
import { AiRecommendationBanner }                 from '@/components/flights/AiRecommendationBanner'
import { OneTapModal }                            from '@/components/flights/OneTapModal'
import { useFlightStore }                         from '@/store/flightStore'
import type { FlightItinerary }                   from '@/lib/flights/types'
import type { AiRecommendation, SavedPaymentMethod } from '@/store/flightStore'

const LOADING_STEPS = [
  { ms: 0,    text: 'Checking Air Canada...'         },
  { ms: 500,  text: 'Checking British Airways...'    },
  { ms: 1000, text: 'Checking Emirates...'           },
  { ms: 1500, text: 'Checking Qatar Airways...'      },
  { ms: 2000, text: 'Checking Turkish Airlines...'   },
  { ms: 2400, text: 'Checking KLM...'                },
  { ms: 2800, text: 'Checking Ethiopian Airlines...' },
  { ms: 3200, text: 'Comparing 3,200 fares...'       },
  { ms: 3700, text: 'Finding lowest prices...'       },
  { ms: 4100, text: 'Analysing best routes...'       },
]

type Phase = 'loading' | 'summary' | 'results'

function SearchContent() {
  const sp = useSearchParams()
  const from     = sp.get('from')     ?? 'LHR'
  const to       = sp.get('to')       ?? 'LOS'
  const cabin    = sp.get('cabin')    ?? 'ECONOMY'
  const adults   = Number(sp.get('adults')   ?? 1)
  const children = Number(sp.get('children') ?? 0)
  const infants  = Number(sp.get('infants')  ?? 0)
  const depart   = sp.get('depart')   ?? ''
  const returnD  = sp.get('return')   ?? ''
  const trip     = sp.get('trip')     ?? 'one-way'

  const {
    results: storeResults, setResults, setSearching, setSearchError,
    resultsSource, loyalty, passengers: storedPassengers,
    aiRecommendation, setAiRecommendation,
    savedPaymentMethod, setSavedPaymentMethod,
  } = useFlightStore()

  const [phase,             setPhase]             = useState<Phase>('loading')
  const [doneSteps,         setDone]              = useState<number[]>([])
  const [displayResults,    setDisplayResults]     = useState<FlightItinerary[]>([])
  const [showWidget,        setShowWidget]         = useState(false)
  const [showMobileFilters, setShowMobileFilters]  = useState(false)
  const [filters,           setFilters]            = useState<FilterState>({ stops: [], maxPrice: 5000, refundable: false, airlines: [] })
  const [oneTapOffer,       setOneTapOffer]        = useState<FlightItinerary | null>(null)
  const [recDismissed,      setRecDismissed]       = useState(false)
  const hasFetched    = useRef(false)
  const aiReqFired    = useRef(false)
  const savedCardLoaded = useRef(false)

  // ── Load saved card once ───────────────────────────────────────────────────
  useEffect(() => {
    if (savedCardLoaded.current) return
    savedCardLoaded.current = true
    fetch('/api/payments/saved-method')
      .then(r => r.json())
      .then(data => {
        if (data.saved) setSavedPaymentMethod(data.saved as SavedPaymentMethod)
      })
      .catch(() => {})
  }, []) // eslint-disable-line

  // ── Search ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true

    const stepTimers = LOADING_STEPS.map(({ ms }, i) =>
      setTimeout(() => setDone(d => [...d, i]), ms)
    )

    const MIN_LOADING_MS = 3500
    const start = Date.now()

    setSearching(true)
    setSearchError(null)

    fetch('/api/flights/search', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ from, to, cabin, adults, children, infants, depart, return: returnD, trip }),
    })
      .then(r => r.json())
      .then(data => {
        const elapsed   = Date.now() - start
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed)
        setTimeout(() => {
          setResults(data.results ?? [], data.source ?? 'mock')
          setDisplayResults(data.results ?? [])
          setSearching(false)
          setPhase('summary')
        }, remaining)
      })
      .catch(err => {
        const elapsed   = Date.now() - start
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed)
        setTimeout(() => {
          setSearchError('Search failed — showing example results')
          setSearching(false)
          setPhase('summary')
        }, remaining)
        console.error('[search] fetch error:', err)
      })

    return () => { stepTimers.forEach(clearTimeout) }
  }, [from, to, cabin, adults, children, infants, depart, returnD, trip]) // eslint-disable-line

  // ── Sync stored results ────────────────────────────────────────────────────
  useEffect(() => {
    if (storeResults.length > 0 && displayResults.length === 0) {
      setDisplayResults(storeResults)
    }
  }, [storeResults]) // eslint-disable-line

  // ── Fire AI recommendation once results arrive ─────────────────────────────
  useEffect(() => {
    if (aiReqFired.current || storeResults.length === 0) return
    aiReqFired.current = true

    const preferences = {
      cabin,
      budget:      undefined,
      preferDirect: false,
      flexible:    false,
    }

    fetch('/api/flights/ai-recommend', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        offers:      storeResults,
        preferences,
        miles:       loyalty?.miles ?? 0,
      }),
    })
      .then(r => r.json())
      .then((data: { offerId: string | null; reason?: string; confidence?: number }) => {
        if (data.offerId) {
          setAiRecommendation({
            offerId:    data.offerId,
            reason:     data.reason ?? '',
            confidence: data.confidence ?? 0.7,
          })
        }
      })
      .catch(() => {})
  }, [storeResults]) // eslint-disable-line

  const allResults    = displayResults.length > 0 ? displayResults : storeResults
  const results       = applyFilters(allResults, filters)
  const recOffer      = aiRecommendation
    ? results.find(r => r.id === aiRecommendation.offerId) ?? null
    : null
  const showRecBanner = !!recOffer && !recDismissed
  const passengerCount = adults + children + infants

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#0B1F3A] flex flex-col items-center justify-center px-4 py-16">
        {/* Route animation */}
        <div className="flex items-center justify-center gap-6 mb-8 w-full max-w-lg">
          <span className="text-5xl font-display font-bold text-white">{from}</span>
          <div className="flex-1 relative h-12 overflow-hidden">
            <div className="absolute inset-y-0 left-0 right-0 flex items-center">
              <div className="w-full h-px bg-white/10" />
            </div>
            <div className="absolute inset-y-0 left-0 right-0 flex items-center overflow-hidden">
              <div className="h-px w-2/5 bg-gradient-to-r from-transparent via-[#C9A84C] to-transparent"
                style={{ animation: 'planeSlide 2.5s ease-in-out infinite' }} />
            </div>
            <div className="absolute top-1/2 -translate-y-1/2 text-xl"
              style={{ animation: 'planeMove 2.5s ease-in-out infinite', left: '5%' }}>
              ✈️
            </div>
          </div>
          <span className="text-5xl font-display font-bold text-white">{to}</span>
        </div>

        <p className="text-[#C9A84C] text-sm font-semibold mb-1">Walz Travels · Searching 900+ airlines...</p>
        <p className="text-white/30 text-xs mb-8">Comparing prices in real time</p>

        <div className="bg-white/5 rounded-2xl p-6 space-y-3 w-full max-w-lg mb-6">
          {LOADING_STEPS.map((step, i) => (
            <div key={i} className={`flex items-center gap-3 transition-all duration-500 ${doneSteps.includes(i) ? 'opacity-100' : 'opacity-0'}`}>
              <span className="text-[#C9A84C] font-bold text-sm w-4">✓</span>
              <p className="text-white/80 text-sm">{step.text}</p>
            </div>
          ))}
        </div>

        <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-xl p-4 w-full max-w-lg">
          <p className="text-[#C9A84C] text-xs font-semibold mb-1">🤖 Walz AI</p>
          <p className="text-white/60 text-sm leading-relaxed">
            Analysing the best routes for your trip. Considering: price, travel time, layovers, baggage included, airline rating, refundability.
          </p>
        </div>

        <style>{`
          @keyframes planeSlide { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }
          @keyframes planeMove  { 0%{left:5%} 100%{left:90%} }
        `}</style>
      </div>
    )
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  if (phase === 'summary') {
    return (
      <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center px-4 py-16">
        {resultsSource === 'mock' && (
          <div className="absolute top-4 left-0 right-0 flex justify-center">
            <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg px-4 py-1.5 text-amber-200 text-xs font-medium">
              Demo mode — showing example results (add DUFFEL_API_KEY for live prices)
            </div>
          </div>
        )}
        <FlightSummaryBanner
          from={from} to={to}
          results={results}
          totalCount={results.length}
          onViewAll={() => setPhase('results')}
        />
      </div>
    )
  }

  // ── RESULTS ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Sticky search bar */}
      <div className="sticky top-0 z-40 bg-[#0B1F3A] border-b border-white/10">
        <div className="container-walz py-3 flex items-center gap-4">
          <button onClick={() => setShowWidget(!showWidget)}
            className="flex items-center gap-3 flex-1 text-left">
            <span className="text-white font-semibold text-sm">{from}</span>
            <svg className="w-4 h-4 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
            <span className="text-white font-semibold text-sm">{to}</span>
            <span className="text-white/30 text-xs ml-2">· {cabin} · {adults + children} pax</span>
            <svg className="w-4 h-4 text-white/40 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m15.232 5.232 3.536 3.536m-2.036-5.036a2.5 2.5 0 1 1 3.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          {resultsSource === 'duffel' && (
            <span className="text-green-400 text-[10px] font-semibold flex-shrink-0">● LIVE</span>
          )}
          <span className="text-white/40 text-sm flex-shrink-0">{results.length} results</span>
        </div>
        {showWidget && (
          <div className="container-walz pb-4">
            <FlightSearchWidget />
          </div>
        )}
      </div>

      {/* Mobile filter sheet */}
      {showMobileFilters && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setShowMobileFilters(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-5 pt-4 pb-3 border-b border-black/5 flex items-center justify-between">
              <p className="font-semibold text-[#0B1F3A]">Filters</p>
              <button type="button" onClick={() => setShowMobileFilters(false)}
                className="text-[#0B1F3A]/40 hover:text-[#0B1F3A] transition-colors text-xl leading-none">✕</button>
            </div>
            <div className="p-5">
              <FlightFilters results={allResults} onChange={setFilters} />
            </div>
            <div className="sticky bottom-0 bg-white p-4 border-t border-black/5">
              <button type="button" onClick={() => setShowMobileFilters(false)}
                className="w-full py-3 rounded-xl bg-[#0B1F3A] text-white font-semibold text-sm">
                Show {results.length} results
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="container-walz py-8">
        <div className="flex gap-6">
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <FlightFilters results={allResults} onChange={setFilters} />
          </aside>

          <div className="flex-1 min-w-0">
            <div className="lg:hidden mb-4">
              <button type="button" onClick={() => setShowMobileFilters(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-[#0B1F3A]/10 text-sm font-medium text-[#0B1F3A] hover:border-[#0B1F3A]/20 transition-all">
                <svg className="w-4 h-4 text-[#0B1F3A]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-.293.707L13 13.414V19a1 1 0 0 1-.553.894l-4 2A1 1 0 0 1 7 21v-7.586L3.293 6.707A1 1 0 0 1 3 6V4z" />
                </svg>
                Filters &amp; Sort
              </button>
            </div>

            {/* ── AI Recommendation Banner ─────────────────────────────────── */}
            {showRecBanner && recOffer && aiRecommendation && (
              <AiRecommendationBanner
                recommendation={aiRecommendation}
                offer={recOffer}
                hasSavedCard={!!savedPaymentMethod}
                onBookNow={(offer) => setOneTapOffer(offer)}
                onDismiss={() => setRecDismissed(true)}
              />
            )}

            <FlightResults results={results} from={from} to={to} />
          </div>
        </div>
      </div>

      {/* ── One-tap confirm modal ──────────────────────────────────────────── */}
      {oneTapOffer && (
        <OneTapModal
          offer={oneTapOffer}
          aiRec={aiRecommendation}
          savedCard={savedPaymentMethod}
          passengerCount={passengerCount}
          onClose={() => setOneTapOffer(null)}
        />
      )}
    </div>
  )
}

export default function SearchPage() {
  return (
    <>
      {/* Visually hidden H1 for search result pages — satisfies SEO requirements
          (H1 missing = Semrush warning). The SearchContent component renders its
          own visual header once results load, but this is present in initial HTML. */}
      <h1 className="sr-only">
        Flight Search Results — Compare Live Prices | Walz Travels
      </h1>
      <Suspense fallback={
        <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
        </div>
      }>
        <SearchContent />
      </Suspense>
    </>
  )
}
