'use client'

import { useState, useEffect } from 'react'
import { useParams }           from 'next/navigation'

// ─── Types for the new itinerary format ────────────────────────────────────────

interface Activity {
  time:        string
  title:       string
  description: string
  duration:    string
  type:        string
  tips:        string
}

interface ItineraryDay {
  day:           number
  title:         string
  activities:    Activity[]
  accommodation: string
  meals: {
    breakfast: string
    lunch:     string
    dinner:    string
  }
  estimatedCost: string
}

interface Itinerary {
  destination:        string
  duration:           string
  groupSize:          number
  theme:              string
  highlights:         string[]
  days:               ItineraryDay[]
  totalEstimatedCost: string
  flightTip:          string
  jadeTip:            string
  bookWithWalz:       string
}

export default function ItineraryPage() {
  const { sessionId } = useParams<{ sessionId: string }>()

  const [itinerary,          setItinerary]          = useState<Itinerary | null>(null)
  const [sessionName,        setSessionName]         = useState('')
  const [sessionStatus,      setSessionStatus]       = useState<string>('collecting')
  const [sessionDestination, setSessionDestination]  = useState<string | null>(null)
  const [generating,         setGenerating]          = useState(false)
  const [loading,            setLoading]             = useState(true)
  const [error,              setError]               = useState<string | null>(null)
  const [copied,             setCopied]              = useState(false)
  const [expandedDay,        setExpandedDay]         = useState<number | null>(1)

  useEffect(() => {
    fetch(`/api/public/group/${sessionId}/result`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setSessionName(d.sessionName ?? '')
        setSessionStatus(d.status ?? 'collecting')
        setSessionDestination(d.destination ?? null)
        if (d.itineraryJson) {
          setItinerary(d.itineraryJson as Itinerary)
        }
        setLoading(false)
      })
      .catch(() => { setError('Failed to load session'); setLoading(false) })
  }, [sessionId])

  async function generateItinerary() {
    setGenerating(true)
    setError(null)
    try {
      const res  = await fetch(`/api/public/group/${sessionId}/lock`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to generate itinerary — please try again')
        setGenerating(false)
        return
      }
      setItinerary(data.itinerary as Itinerary)
      setSessionStatus('locked')
      setSessionDestination(data.destination ?? null)
      setExpandedDay(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again')
    } finally {
      setGenerating(false)
    }
  }

  function copyShareLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const displayName = sessionName && sessionName.length > 2 ? sessionName : 'Group Trip'

  if (loading) return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-3 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#060f1e]">

      {/* Header */}
      <div className="bg-[#0B1F3A] px-4 py-8">
        <div className="max-w-2xl mx-auto flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-xl px-3 py-1 mb-3">
              <span className="text-[#C9A84C] text-xs font-bold">✈ GROUP ITINERARY</span>
            </div>
            <h1 className="text-white text-2xl font-bold">
              {itinerary?.destination ?? sessionDestination ?? displayName}
            </h1>
            {itinerary && (
              <>
                <p className="text-white/40 text-sm mt-1">
                  {itinerary.duration} · {itinerary.totalEstimatedCost} per person
                </p>
                {itinerary.theme && (
                  <p className="text-[#C9A84C]/70 text-xs mt-0.5 italic">{itinerary.theme}</p>
                )}
              </>
            )}
          </div>
          <button onClick={copyShareLink}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition">
            {copied ? '✓ Copied!' : '🔗 Share'}
          </button>
        </div>

        {/* Highlights */}
        {itinerary?.highlights && itinerary.highlights.length > 0 && (
          <div className="max-w-2xl mx-auto mt-4 flex flex-wrap gap-2">
            {itinerary.highlights.map((h, i) => (
              <span key={i}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#C9A84C]/15 border border-[#C9A84C]/30 text-[#C9A84C]">
                ✦ {h}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Generate state */}
        {!itinerary && !generating && (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">🗺️</p>
            {sessionStatus === 'locked' && sessionDestination ? (
              <>
                <h2 className="text-white font-bold text-xl mb-1">Winning destination</h2>
                <p className="text-[#C9A84C] font-bold text-2xl mb-3">{sessionDestination}</p>
                <p className="text-white/50 text-sm mb-6">
                  Jade AI will build a personalised day-by-day plan for your group.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-white font-bold text-xl mb-2">Generate your group itinerary</h2>
                <p className="text-white/50 text-sm mb-6">
                  Jade AI will pick the best destination for your group and build a day-by-day plan based on everyone&apos;s preferences.
                </p>
              </>
            )}
            <button onClick={generateItinerary}
              className="px-6 py-3 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold hover:bg-[#E8C87A] transition">
              {sessionStatus === 'locked' && sessionDestination ? 'Generate itinerary' : 'Pick destination & generate itinerary'}
            </button>
          </div>
        )}

        {/* Generating spinner */}
        {generating && (
          <div className="text-center py-12">
            <div className="w-10 h-10 rounded-full border-3 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin mx-auto mb-4" />
            <p className="text-white font-semibold mb-1">Jade is crafting your itinerary…</p>
            <p className="text-white/40 text-sm">
              {sessionDestination
                ? `Building your ${sessionDestination} experience`
                : 'Picking your destination and building the plan'}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 mb-6">
            <p className="text-red-400 text-sm font-medium">{error}</p>
            {!itinerary && (
              <button onClick={generateItinerary}
                className="mt-3 text-xs text-red-300 underline hover:text-red-200 transition">
                Try again
              </button>
            )}
          </div>
        )}

        {/* Itinerary */}
        {itinerary && (
          <div className="space-y-4">

            {/* Jade tip */}
            {itinerary.jadeTip && (
              <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-2xl p-4">
                <p className="text-[#C9A84C] text-xs font-bold mb-1.5">💡 Jade&apos;s tip</p>
                <p className="text-white/70 text-sm">{itinerary.jadeTip}</p>
              </div>
            )}

            {/* Flight tip */}
            {itinerary.flightTip && (
              <div className="bg-white/5 border border-white/8 rounded-2xl p-4">
                <p className="text-white/50 text-xs font-bold mb-1.5">✈ Flight tip</p>
                <p className="text-white/70 text-sm">{itinerary.flightTip}</p>
              </div>
            )}

            {/* Day cards */}
            {itinerary.days.map((day) => {
              const isOpen = expandedDay === day.day
              return (
                <div key={day.day} className="bg-[#0d1e35] rounded-2xl border border-white/8 overflow-hidden">
                  {/* Day header — clickable to expand/collapse */}
                  <button
                    onClick={() => setExpandedDay(isOpen ? null : day.day)}
                    className="w-full bg-[#0B1F3A] px-5 py-3.5 flex items-center justify-between hover:bg-[#0d2447] transition">
                    <div className="text-left">
                      <span className="text-[#C9A84C] font-bold text-sm">Day {day.day}</span>
                      <h3 className="text-white font-semibold text-sm mt-0.5">{day.title}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-white/40 text-xs">{day.estimatedCost}</p>
                        <p className="text-white/25 text-[10px] truncate max-w-[120px]">{day.accommodation}</p>
                      </div>
                      <span className="text-white/40 text-sm">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <>
                      {/* Activities */}
                      <div className="divide-y divide-white/5">
                        {day.activities.map((act, ai) => (
                          <div key={ai} className="px-5 py-4">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 text-center w-12 pt-0.5">
                                <p className="text-[#C9A84C] text-xs font-bold font-mono">{act.time}</p>
                                <p className="text-white/25 text-[9px] mt-0.5">{act.duration}</p>
                              </div>
                              <div className="flex-1">
                                <p className="text-white font-semibold text-sm">{act.title}</p>
                                <p className="text-white/60 text-xs mt-1 leading-relaxed">{act.description}</p>
                                {act.tips && (
                                  <p className="text-[#C9A84C]/70 text-xs mt-1.5 italic">
                                    💡 {act.tips}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Meals */}
                      {day.meals && (
                        <div className="px-5 py-4 border-t border-white/5 bg-white/3">
                          <p className="text-white/40 text-xs font-bold uppercase tracking-wider mb-3">Meals</p>
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              { label: '🌅 Breakfast', value: day.meals.breakfast },
                              { label: '☀️ Lunch',     value: day.meals.lunch     },
                              { label: '🌙 Dinner',    value: day.meals.dinner    },
                            ].map(m => (
                              <div key={m.label} className="bg-white/5 rounded-xl p-2.5">
                                <p className="text-white/40 text-[9px] font-bold mb-0.5">{m.label}</p>
                                <p className="text-white/70 text-xs leading-relaxed">{m.value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Accommodation */}
                      {day.accommodation && (
                        <div className="px-5 py-3 border-t border-white/5 flex items-center gap-2">
                          <span className="text-white/30 text-xs">🏨</span>
                          <p className="text-white/40 text-xs">{day.accommodation}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}

            {/* Book with Walz CTA */}
            {itinerary.bookWithWalz && (
              <div className="mt-4 bg-[#C9A84C] rounded-2xl p-5 text-center">
                <p className="text-[#0B1F3A] text-xs font-bold uppercase tracking-widest mb-2">Book with Walz Travels</p>
                <p className="text-[#0B1F3A]/80 text-sm mb-4">{itinerary.bookWithWalz}</p>
                <a href="https://walztravels.com" target="_blank" rel="noopener noreferrer"
                  className="inline-block px-6 py-2.5 rounded-xl bg-[#0B1F3A] text-white text-sm font-bold hover:bg-[#132038] transition">
                  Plan with Walz →
                </a>
              </div>
            )}

            {/* Regenerate */}
            <div className="text-center pt-2">
              <button onClick={generateItinerary} disabled={generating}
                className="text-white/30 text-xs hover:text-white/60 transition disabled:opacity-30">
                ↺ Regenerate itinerary
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
