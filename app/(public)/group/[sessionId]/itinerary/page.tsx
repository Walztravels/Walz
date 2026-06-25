'use client'

import { useState, useEffect } from 'react'
import { useParams }           from 'next/navigation'
import type { VisaRule }       from '@/lib/visa-lookup'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Activity {
  time:        string
  title:       string
  description: string
  duration?:   string
  type:        string
  cost?:       string
  bookingTip?: string
  jadeTip?:    string
  tips?:       string
  location?:   string
}

interface Accommodation {
  name:           string
  stars?:         number
  area?:          string
  pricePerNight?: string
  priceRange?:    string
  whyWeChoseIt?:  string
}

interface MealDetail {
  venue?: string
  dish?:  string
  cost?:  string
  tip?:   string
}

interface ItineraryDay {
  day:           number
  title:         string
  theme?:        string
  activities:    Activity[]
  accommodation: string | Accommodation
  meals?: {
    breakfast?: string | MealDetail
    lunch?:     string | MealDetail
    dinner?:    string | MealDetail
  }
  estimatedCost?: string
  dayBudget?:     string
}

// old array-item format
interface FlightAdvice {
  from:            string
  to:              string
  airlines?:       string
  estimatedPrice?: string
  tip?:            string
}

// new rich object format
interface FlightRoute {
  from:                  string
  to:                    string
  recommendedAirlines?:  string[]
  estimatedCost?:        string
  estimatedPrice?:       string
  flightDuration?:       string
  bestTimeToBook?:       string
  jadeTip?:              string
  tip?:                  string
  airlines?:             string
}

interface FlightAdviceFull {
  summary?:         string
  routes?:          FlightRoute[]
  groupBookingTip?: string
  baggageAdvice?:   string
}

interface PackingList {
  essential?: string[]
  clothing?:  string[]
  tech?:      string[]
  documents?: string[]
  jadePick?:  string
}

interface CostBreakdown {
  budget?:      string
  comfortable?: string
  luxury?:      string
  includes?:    string
  excludes?:    string
}

interface Itinerary {
  destination:         string
  duration:            string
  groupSize?:          number
  tagline?:            string
  theme?:              string
  bestTimeToVisit?:    string
  highlights:          string[]
  days:                ItineraryDay[]
  costBreakdown?:      CostBreakdown
  totalCost?:          CostBreakdown
  totalEstimatedCost?: string
  flightAdvice?:       FlightAdviceFull | FlightAdvice[]
  flightTip?:          string
  packingList?:        PackingList
  packingTips?:        string[]
  jadeFinalWord?:      string
  jadeTip?:            string
  bookWithWalz?:       string
  _modelUsed?:         string
}

interface VoteResult {
  destination: string
  points:      number
  percentage:  number
  isWinner:    boolean
}

interface VisaMemberResult {
  memberName:  string
  passport:    string
  flyingFrom:  string
  destination: string
  rule:        VisaRule
}

// ── Helper components ─────────────────────────────────────────────────────────

function VisaStatusBadge({ status }: { status: VisaRule['status'] }) {
  const config = {
    free:       { label: 'Visa Free',   bg: 'bg-emerald-500/20 text-emerald-300  border-emerald-500/30' },
    on_arrival: { label: 'On Arrival',  bg: 'bg-blue-500/20    text-blue-300     border-blue-500/30'    },
    evisa:      { label: 'eVisa',       bg: 'bg-purple-500/20  text-purple-300   border-purple-500/30'  },
    required:   { label: 'Visa Needed', bg: 'bg-amber-500/20   text-amber-300    border-amber-500/30'   },
  }
  const c = config[status]
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.bg}`}>{c.label}</span>
  )
}

function getAccommodationName(acc: string | Accommodation): string {
  if (typeof acc === 'string') return acc
  return acc?.name ?? ''
}

function getAccommodationDetail(acc: string | Accommodation): string {
  if (typeof acc === 'string') return ''
  const parts = [acc.area, acc.pricePerNight ?? acc.priceRange, acc.whyWeChoseIt].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : ''
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ItineraryPage() {
  const { sessionId } = useParams<{ sessionId: string }>()

  const [itinerary,    setItinerary]    = useState<Itinerary | null>(null)
  const [voteResults,  setVoteResults]  = useState<VoteResult[]>([])
  const [visaMatrix,   setVisaMatrix]   = useState<VisaMemberResult[]>([])
  const [sessionName,  setSessionName]  = useState('')
  const [destination,  setDestination]  = useState<string | null>(null)
  const [generating,     setGenerating]     = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Jade is thinking...')
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState<string | null>(null)
  const [copied,       setCopied]       = useState(false)
  const [expandedDay,  setExpandedDay]  = useState<number | null>(1)

  useEffect(() => {
    let autoGenerate = false
    fetch(`/api/public/group/${sessionId}/result`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setSessionName(d.sessionName ?? '')
        if (d.destination) setDestination(d.destination)
        if (d.status === 'locked' && d.itineraryJson) {
          autoGenerate = true
        }
        setLoading(false)
        if (autoGenerate) generateItinerary(true)
      })
      .catch(() => { setError('Failed to load session'); setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  async function generateItinerary(silent = false) {
    if (!silent) {
      setGenerating(true)
      setLoadingMessage('Jade is thinking...')
    }
    setError(null)

    const msgs = [
      'Jade is thinking...',
      `Researching ${destination ?? 'your destination'}...`,
      'Planning your days...',
      'Adding insider tips...',
      'Checking visa requirements...',
      'Almost ready...',
    ]
    let msgIdx = 0
    const msgTimer = !silent
      ? setInterval(() => { msgIdx = (msgIdx + 1) % msgs.length; setLoadingMessage(msgs[msgIdx]) }, 3000)
      : null

    let completed = false

    try {
      let res: Response
      try {
        res = await fetch(`/api/public/group/${sessionId}/lock`, { method: 'POST' })
      } catch {
        setError('Network error — check your connection and try again.')
        return
      }

      if (!res.ok) {
        let errMsg = `Server error ${res.status} — please try again.`
        try { const d = await res.json(); errMsg = (d.error as string) ?? errMsg } catch {}
        setError(errMsg)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) { setError('No response from server — please try again.'); return }

      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const data = JSON.parse(line) as Record<string, unknown>
            if (data.type === 'complete') {
              completed = true
              if (msgTimer) clearInterval(msgTimer)
              setItinerary(data.itinerary as Itinerary)
              if (data.destination) setDestination(data.destination as string)
              if (data.voteResults)  setVoteResults(data.voteResults as VoteResult[])
              if (data.visaMatrix)   setVisaMatrix(data.visaMatrix as VisaMemberResult[])
              setExpandedDay(1)
            } else if (data.type === 'error') {
              completed = true
              if (msgTimer) clearInterval(msgTimer)
              setError((data.error as string | undefined) ?? 'Failed to generate — please try again.')
            } else if (data.type === 'status' && typeof data.message === 'string') {
              setLoadingMessage(data.message)
            }
          } catch { /* incomplete chunk — ignore */ }
        }
      }

      if (!completed) {
        setError("Jade is still working on this — it's taking longer than expected. Please try again.")
      }
    } finally {
      if (msgTimer) clearInterval(msgTimer)
      setGenerating(false)
    }
  }

  function copyShareLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const displayName = sessionName && sessionName.length > 2 ? sessionName : 'Group Trip'

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-3 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
    </div>
  )

  const dest = itinerary?.destination ?? destination ?? displayName

  return (
    <div className="min-h-screen bg-[#060f1e]">

      {/* ── SECTION 1 : Hero ──────────────────────────────────────────────── */}
      <div className="bg-[#0B1F3A] px-4 pt-10 pb-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="inline-flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-xl px-3 py-1.5">
              <span className="text-[#C9A84C] text-xs font-bold tracking-widest">✈ JADE GROUP ITINERARY</span>
            </div>
            <button onClick={copyShareLink}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 text-white/60 text-xs hover:bg-white/20 transition">
              {copied ? '✓ Copied!' : '🔗 Share'}
            </button>
          </div>

          <h1 className="text-white text-4xl font-black tracking-tight">{dest}</h1>

          {itinerary?.tagline && (
            <p className="text-[#C9A84C] text-lg font-semibold mt-1">{itinerary.tagline}</p>
          )}
          {itinerary?.theme && (
            <p className="text-white/40 text-sm mt-1 italic">{itinerary.theme}</p>
          )}

          {itinerary && (
            <>
              <div className="mt-3 flex items-center gap-4 text-white/50 text-sm flex-wrap">
                <span>📅 {itinerary.duration}</span>
                {itinerary.groupSize && <span>👥 {itinerary.groupSize} travellers</span>}
                {(itinerary.totalEstimatedCost ?? itinerary.totalCost?.comfortable) && (
                  <span>💷 {itinerary.totalEstimatedCost ?? itinerary.totalCost?.comfortable}</span>
                )}
                {itinerary.bestTimeToVisit && (
                  <span>📆 Best: {itinerary.bestTimeToVisit}</span>
                )}
              </div>
              {itinerary._modelUsed && (
                <div className="mt-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    itinerary._modelUsed.includes('gpt')
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-[#C9A84C]/20 text-[#C9A84C]'
                  }`}>
                    {itinerary._modelUsed.includes('gpt') ? '✦ Generated by GPT-4o' : '🤖 Generated by Claude'}
                  </span>
                </div>
              )}
            </>
          )}

          {itinerary?.highlights && itinerary.highlights.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {itinerary.highlights.map((h, i) => (
                <span key={i} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#C9A84C]/15 border border-[#C9A84C]/30 text-[#C9A84C]">
                  ✦ {h}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* ── Generating / Generate button ──────────────────────────────── */}

        {generating && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-[#C9A84C]/20 border-2 border-[#C9A84C]/40 flex items-center justify-center mb-6 animate-pulse">
              <span className="text-2xl">✈</span>
            </div>
            <p className="text-white font-semibold text-lg mb-2">{loadingMessage}</p>
            <p className="text-white/40 text-sm">This takes about 15–20 seconds</p>
            <div className="flex gap-1.5 mt-6">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-[#C9A84C] animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4">
            <p className="text-red-400 text-sm font-medium">{error}</p>
            {!itinerary && (
              <button onClick={() => generateItinerary()}
                className="mt-3 text-xs text-red-300 underline hover:text-red-200 transition">
                Try again
              </button>
            )}
          </div>
        )}

        {!itinerary && !generating && (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">🗺️</p>
            <h2 className="text-white font-bold text-xl mb-2">
              {destination ? `Your destination: ${destination}` : 'Ready to plan?'}
            </h2>
            <p className="text-white/50 text-sm mb-6 max-w-xs mx-auto">
              Jade AI will build a premium day-by-day itinerary tailored to your whole group.
            </p>
            <button onClick={() => generateItinerary()}
              className="px-6 py-3 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold hover:bg-[#E8C87A] transition">
              Generate our itinerary ✦
            </button>
          </div>
        )}

        {itinerary && (
          <>
            {/* ── SECTION 2 : Vote bar chart ──────────────────────────────── */}
            {voteResults.length > 0 && (
              <div>
                <h2 className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4">Vote Results</h2>
                <div className="bg-[#0B1F3A] rounded-2xl p-5 space-y-3">
                  {voteResults.map((v) => (
                    <div key={v.destination}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {v.isWinner && <span className="text-base">🏆</span>}
                          <span className={`text-sm font-semibold ${v.isWinner ? 'text-[#C9A84C]' : 'text-white/60'}`}>
                            {v.destination}
                          </span>
                        </div>
                        <span className={`text-xs font-bold ${v.isWinner ? 'text-[#C9A84C]' : 'text-white/30'}`}>
                          {v.points}pts · {v.percentage}%
                        </span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${v.isWinner ? 'bg-[#C9A84C]' : 'bg-white/30'}`}
                          style={{ width: `${v.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION 3 : Visa intelligence ───────────────────────────── */}
            {visaMatrix.length > 0 && (
              <div>
                <h2 className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4">Visa Intelligence</h2>
                <div className="space-y-3">
                  {visaMatrix.map((v, i) => (
                    <div key={i} className={`rounded-2xl p-4 border ${
                      v.rule.status === 'required'   ? 'bg-amber-500/10  border-amber-500/20'  :
                      v.rule.status === 'on_arrival' ? 'bg-blue-500/10   border-blue-500/20'   :
                      v.rule.status === 'evisa'      ? 'bg-purple-500/10 border-purple-500/20' :
                                                       'bg-emerald-500/10 border-emerald-500/20'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-white font-semibold text-sm">{v.memberName}</p>
                            <VisaStatusBadge status={v.rule.status} />
                          </div>
                          <p className="text-white/40 text-xs">{v.passport} passport → {v.destination}</p>
                          {v.rule.visaType && (
                            <p className="text-white/60 text-xs mt-1">{v.rule.visaType}</p>
                          )}
                        </div>
                        {(v.rule.cost || v.rule.processingTime) && (
                          <div className="text-right flex-shrink-0">
                            {v.rule.cost && (
                              <p className="text-white/80 text-sm font-bold">{v.rule.cost}</p>
                            )}
                            {v.rule.processingTime && (
                              <p className="text-white/40 text-[10px]">{v.rule.processingTime}</p>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="text-white/50 text-xs mt-2">{v.rule.notes}</p>
                      {v.rule.canWalzHelp && (
                        <div className="mt-2">
                          <a href="https://wa.me/447459327417" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[#C9A84C] text-xs font-semibold hover:text-[#E8C87A] transition">
                            Apply with Walz →
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION 4 : Flights at a glance ─────────────────────────── */}
            {itinerary.flightAdvice && (() => {
              const fa      = itinerary.flightAdvice
              const isRich  = !Array.isArray(fa) && !!(fa as FlightAdviceFull).routes?.length
              const isLegacy = Array.isArray(fa) && (fa as FlightAdvice[]).length > 0
              return (
                <div>
                  <h2 className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4">✈ Flights at a Glance</h2>

                  {isRich && (
                    <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5">
                      {(fa as FlightAdviceFull).summary && (
                        <p className="text-white/60 text-sm mb-4">{(fa as FlightAdviceFull).summary}</p>
                      )}
                      <div className="space-y-3 mb-4">
                        {(fa as FlightAdviceFull).routes?.map((route, i) => (
                          <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-semibold text-sm">{route.from}</span>
                                <span className="text-[#C9A84C]">→</span>
                                <span className="text-white font-semibold text-sm">{route.to}</span>
                              </div>
                              <span className="text-[#C9A84C] font-bold text-sm">
                                {route.estimatedCost ?? route.estimatedPrice}
                              </span>
                            </div>
                            <div className="flex gap-4 mb-2">
                              {route.flightDuration  && <span className="text-white/40 text-xs">⏱ {route.flightDuration}</span>}
                              {route.bestTimeToBook  && <span className="text-white/40 text-xs">📅 Book {route.bestTimeToBook}</span>}
                            </div>
                            {route.recommendedAirlines && route.recommendedAirlines.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {route.recommendedAirlines.map((a, ai) => (
                                  <span key={ai} className="bg-white/10 text-white/60 text-[10px] px-2 py-0.5 rounded-full">{a}</span>
                                ))}
                              </div>
                            )}
                            {(route.jadeTip ?? route.tip) && (
                              <p className="text-[#C9A84C]/70 text-xs">💡 {route.jadeTip ?? route.tip}</p>
                            )}
                          </div>
                        ))}
                      </div>
                      {(fa as FlightAdviceFull).groupBookingTip && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4">
                          <p className="text-amber-400 text-[10px] font-bold uppercase tracking-wider mb-1">Group Booking Tip</p>
                          <p className="text-white/70 text-xs">{(fa as FlightAdviceFull).groupBookingTip}</p>
                        </div>
                      )}
                      {(fa as FlightAdviceFull).baggageAdvice && (
                        <p className="text-white/40 text-xs mb-4">🧳 {(fa as FlightAdviceFull).baggageAdvice}</p>
                      )}
                      <a href="/flights"
                        className="flex items-center justify-center gap-2 bg-[#C9A84C] hover:bg-[#E8C87A] text-[#0B1F3A] font-bold py-3 rounded-xl transition text-sm">
                        Search Flights with Walz Travels →
                      </a>
                    </div>
                  )}

                  {isLegacy && (
                    <div className="space-y-3">
                      {(fa as FlightAdvice[]).map((f, i) => (
                        <div key={i} className="bg-[#0B1F3A] rounded-2xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-semibold text-sm">{f.from}</span>
                              <span className="text-white/30 text-xs">→</span>
                              <span className="text-white font-semibold text-sm">{f.to}</span>
                            </div>
                            {f.estimatedPrice && <span className="text-[#C9A84C] font-bold text-sm">{f.estimatedPrice}</span>}
                          </div>
                          {f.airlines && <p className="text-white/40 text-xs mb-1">✈ {f.airlines}</p>}
                          {f.tip && <p className="text-white/60 text-xs">{f.tip}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Legacy flightTip (v1 format) */}
            {!itinerary.flightAdvice && itinerary.flightTip && (
              <div className="bg-[#0B1F3A] rounded-2xl p-4">
                <p className="text-white/50 text-xs font-bold mb-2">✈ FLIGHT TIP</p>
                <p className="text-white/70 text-sm">{itinerary.flightTip}</p>
              </div>
            )}

            {/* ── SECTION 5 : Day-by-day timeline ─────────────────────────── */}
            <div>
              <h2 className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4">Day-by-Day Plan</h2>
              <div className="space-y-3">
                {itinerary.days.map((day) => {
                  const isOpen   = expandedDay === day.day
                  const accName  = getAccommodationName(day.accommodation)
                  const accDetail = getAccommodationDetail(day.accommodation)
                  return (
                    <div key={day.day} className="bg-[#0d1e35] rounded-2xl border border-white/8 overflow-hidden">
                      <button
                        onClick={() => setExpandedDay(isOpen ? null : day.day)}
                        className="w-full bg-[#0B1F3A] px-5 py-4 flex items-center justify-between hover:bg-[#0d2447] transition">
                        <div className="text-left">
                          <span className="text-[#C9A84C] font-bold text-sm">Day {day.day}</span>
                          <h3 className="text-white font-semibold text-sm mt-0.5">{day.title}</h3>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-white/40 text-xs">{day.estimatedCost ?? day.dayBudget}</p>
                            {accName && (
                              <p className="text-white/25 text-[10px] truncate max-w-[120px]">{accName}</p>
                            )}
                          </div>
                          <span className="text-white/40 text-xs">{isOpen ? '▲' : '▼'}</span>
                        </div>
                      </button>

                      {isOpen && (
                        <>
                          <div className="divide-y divide-white/5">
                            {day.activities.map((act, ai) => (
                              <div key={ai} className="px-5 py-4">
                                <div className="flex items-start gap-3">
                                  <div className="flex-shrink-0 text-center w-12 pt-0.5">
                                    <p className="text-[#C9A84C] text-xs font-bold font-mono">{act.time}</p>
                                    <p className="text-white/25 text-[9px] mt-0.5">{act.duration}</p>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-white font-semibold text-sm">{act.title}</p>
                                      {act.cost && (
                                        <span className="text-white/40 text-[10px] flex-shrink-0">{act.cost}</span>
                                      )}
                                    </div>
                                    {act.location && (
                                      <p className="text-white/30 text-[10px] mt-0.5">📍 {act.location}</p>
                                    )}
                                    <p className="text-white/60 text-xs mt-1 leading-relaxed">{act.description}</p>
                                    {(act.jadeTip || act.tips) && (
                                      <p className="text-[#C9A84C]/70 text-xs mt-1.5 italic">
                                        💡 {act.jadeTip ?? act.tips}
                                      </p>
                                    )}
                                    {act.bookingTip && (
                                      <p className="text-blue-400/60 text-xs mt-1">🎟 {act.bookingTip}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {day.meals && (
                            <div className="px-5 py-4 border-t border-white/5 bg-white/[0.02]">
                              <p className="text-white/30 text-[10px] font-bold uppercase tracking-wider mb-3">🍽 Meals</p>
                              <div className="grid grid-cols-3 gap-2">
                                {([
                                  { icon: '🌅', key: 'breakfast', label: 'Breakfast' },
                                  { icon: '☀️', key: 'lunch',     label: 'Lunch'     },
                                  { icon: '🌙', key: 'dinner',    label: 'Dinner'    },
                                ] as { icon: string; key: 'breakfast' | 'lunch' | 'dinner'; label: string }[]).map(({ icon, key, label }) => {
                                  const meal = day.meals?.[key]
                                  if (!meal) return null
                                  const isRich = typeof meal === 'object'
                                  return (
                                    <div key={key} className="bg-white/5 rounded-xl p-2.5">
                                      <p className="text-white/30 text-[9px] font-bold mb-1">{icon} {label}</p>
                                      {isRich ? (
                                        <>
                                          <p className="text-white/80 text-[10px] font-medium leading-snug">{(meal as MealDetail).venue}</p>
                                          {(meal as MealDetail).dish && (
                                            <p className="text-[#C9A84C] text-[9px] mt-0.5">{(meal as MealDetail).dish}</p>
                                          )}
                                          {(meal as MealDetail).cost && (
                                            <p className="text-white/30 text-[9px] mt-0.5">{(meal as MealDetail).cost}</p>
                                          )}
                                          {(meal as MealDetail).tip && (
                                            <p className="text-white/40 text-[9px] mt-0.5 italic">{(meal as MealDetail).tip}</p>
                                          )}
                                        </>
                                      ) : (
                                        <p className="text-white/70 text-[10px] leading-relaxed">{meal as string}</p>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {accName && (
                            <div className="px-5 py-3 border-t border-white/5 flex items-start gap-2">
                              <span className="text-white/30 text-xs mt-0.5">🏨</span>
                              <div>
                                <p className="text-white/50 text-xs font-medium">{accName}</p>
                                {accDetail && (
                                  <p className="text-white/25 text-[10px] mt-0.5">{accDetail}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── SECTION 6 : Trip cost estimate ───────────────────────────── */}
            {(itinerary.costBreakdown ?? itinerary.totalCost) && (
              <div>
                <h2 className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4">Trip Cost Estimate</h2>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'budget',      label: 'Budget',      emoji: '💰', color: 'border-white/10 text-white/60' },
                    { key: 'comfortable', label: 'Comfortable',  emoji: '✈',  color: 'border-[#C9A84C]/30 text-[#C9A84C]' },
                    { key: 'luxury',      label: 'Luxury',       emoji: '👑', color: 'border-purple-500/30 text-purple-300' },
                  ].map(({ key, label, emoji, color }) => {
                    const costs = itinerary.costBreakdown ?? itinerary.totalCost
                    const val   = costs?.[key as keyof CostBreakdown]
                    if (!val) return null
                    return (
                      <div key={key} className={`bg-white/5 rounded-2xl p-4 border ${color}`}>
                        <p className="text-lg mb-1">{emoji}</p>
                        <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-1">{label}</p>
                        <p className="text-xs font-semibold leading-relaxed">{val}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── SECTION 7 : Jade's final word ────────────────────────────── */}
            {(itinerary.jadeFinalWord || itinerary.jadeTip) && (
              <div className="relative bg-[#0B1F3A] rounded-2xl p-6 border border-[#C9A84C]/20 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#C9A84C]/5 to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-[#C9A84C]/20 flex items-center justify-center text-[#C9A84C] font-black text-sm">
                      J
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">Jade</p>
                      <p className="text-white/30 text-[10px]">Walz AI Travel Planner</p>
                    </div>
                  </div>
                  <p className="text-white/80 text-sm leading-relaxed">
                    &ldquo;{itinerary.jadeFinalWord ?? itinerary.jadeTip}&rdquo;
                  </p>
                </div>
              </div>
            )}

            {/* ── SECTION 8 : Book with Walz CTA ───────────────────────────── */}
            <div className="bg-[#C9A84C] rounded-2xl overflow-hidden">
              <div className="p-6 text-center">
                <p className="text-[#0B1F3A] text-xs font-black uppercase tracking-widest mb-1">Book with Walz Travels</p>
                <p className="text-[#0B1F3A]/80 text-sm mb-5">
                  {itinerary.bookWithWalz ?? 'Book this entire trip through Walz Travels — we handle group flights, hotel blocks, visa processing, and transfers in one package. WhatsApp us to start planning.'}
                </p>

                <div className="grid grid-cols-3 gap-2 mb-5">
                  {[
                    { emoji: '✈', title: 'Group Flights',   desc: 'Multi-city departures' },
                    { emoji: '🛂', title: 'Visa Processing', desc: 'All passports handled' },
                    { emoji: '🏨', title: 'Hotel Blocks',    desc: 'Group rates available' },
                  ].map(c => (
                    <div key={c.title} className="bg-[#0B1F3A]/10 rounded-xl p-3 text-center">
                      <p className="text-xl mb-1">{c.emoji}</p>
                      <p className="text-[#0B1F3A] text-[10px] font-black uppercase">{c.title}</p>
                      <p className="text-[#0B1F3A]/60 text-[9px] mt-0.5">{c.desc}</p>
                    </div>
                  ))}
                </div>

                <a href="https://wa.me/447459327417?text=Hi%20Walz!%20I%20want%20to%20book%20a%20group%20trip%20to%20" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0B1F3A] text-white text-sm font-bold hover:bg-[#132038] transition">
                  💬 WhatsApp us to start planning
                </a>
              </div>
            </div>

            {/* Packing list — rich format */}
            {itinerary.packingList && (
              <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5">
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-2xl">🧳</span>
                  <h3 className="text-white font-bold text-lg">Packing List</h3>
                </div>

                {itinerary.packingList.jadePick && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-5 flex items-center gap-3">
                    <span className="text-xl flex-shrink-0">⭐</span>
                    <div>
                      <p className="text-amber-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Jade&apos;s Top Pick</p>
                      <p className="text-white text-sm">{itinerary.packingList.jadePick}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {([
                    { key: 'essential',  label: 'Essentials', icon: '✅' },
                    { key: 'clothing',   label: 'Clothing',   icon: '👔' },
                    { key: 'documents',  label: 'Documents',  icon: '📄' },
                    { key: 'tech',       label: 'Tech',       icon: '💻' },
                  ] as { key: keyof PackingList; label: string; icon: string }[]).map(({ key, label, icon }) => {
                    const items = itinerary.packingList?.[key] as string[] | undefined
                    if (!items?.length) return null
                    return (
                      <div key={key}>
                        <p className="text-white/40 text-[10px] uppercase tracking-wider font-bold mb-2">{icon} {label}</p>
                        <ul className="space-y-1.5">
                          {items.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-white/60 text-xs">
                              <span className="text-[#C9A84C] mt-0.5 flex-shrink-0 text-[9px]">●</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Flat packing tips — legacy fallback */}
            {!itinerary.packingList && itinerary.packingTips && itinerary.packingTips.length > 0 && (
              <div className="bg-white/5 rounded-2xl p-4">
                <p className="text-white/40 text-xs font-bold uppercase tracking-wider mb-3">🎒 Packing Tips</p>
                <ul className="space-y-1.5">
                  {itinerary.packingTips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-white/60 text-xs">
                      <span className="text-[#C9A84C] mt-0.5">✓</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Regenerate */}
            <div className="text-center pt-2 pb-8">
              <button onClick={() => generateItinerary()} disabled={generating}
                className="text-white/20 text-xs hover:text-white/50 transition disabled:opacity-30">
                ↺ Regenerate itinerary
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
