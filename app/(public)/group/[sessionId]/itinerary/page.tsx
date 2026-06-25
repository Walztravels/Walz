'use client'

import { useState, useEffect } from 'react'
import { useParams }           from 'next/navigation'

interface DaySlot {
  title:       string
  description: string
  satisfies:   string[]
}

interface ItineraryDay {
  day:             number
  theme:           string
  morning:         DaySlot
  afternoon:       DaySlot
  evening:         DaySlot
  accommodation:   string
  estimatedCost:   string
}

interface Itinerary {
  destination:          string
  totalDays:            number
  days:                 ItineraryDay[]
  totalEstimatedBudget: string
  travelTips:           string[]
  packingHighlights:    string[]
}

export default function ItineraryPage() {
  const { sessionId } = useParams<{ sessionId: string }>()

  const [itinerary,    setItinerary]    = useState<Itinerary | null>(null)
  const [sessionName,  setSessionName]  = useState('')
  const [sessionStatus,      setSessionStatus]      = useState<string>('collecting')
  const [sessionDestination, setSessionDestination] = useState<string | null>(null)
  const [generating,  setGenerating]  = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [copied,      setCopied]      = useState(false)

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
      .catch(() => { setError('Failed to load'); setLoading(false) })
  }, [sessionId])

  async function generateItinerary() {
    setGenerating(true)
    setError(null)

    // Lock (and synthesise destination) if not yet locked or destination is missing
    if (sessionStatus !== 'locked' || !sessionDestination) {
      const lockRes  = await fetch(`/api/public/group/${sessionId}/lock`, { method: 'POST' })
      const lockData = await lockRes.json()
      if (!lockRes.ok) {
        setError(lockData.error ?? 'Could not determine winning destination — try again')
        setGenerating(false)
        return
      }
      setSessionStatus('locked')
      setSessionDestination(lockData.destination ?? null)
    }

    const res  = await fetch(`/api/public/group/${sessionId}/itinerary`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Generation failed'); setGenerating(false); return }
    setItinerary(data.itinerary as Itinerary)
    setGenerating(false)
  }

  function copyShareLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
              {itinerary?.destination ?? sessionDestination ?? sessionName}
            </h1>
            {itinerary && (
              <p className="text-white/40 text-sm mt-1">
                {itinerary.totalDays} days · {itinerary.totalEstimatedBudget}
              </p>
            )}
          </div>
          <button onClick={copyShareLink}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition">
            {copied ? '✓ Copied!' : '🔗 Share'}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
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
                  Jade AI will pick the best destination for your group and build a day-by-day plan based on everyone's preferences.
                </p>
              </>
            )}
            <button onClick={generateItinerary}
              className="px-6 py-3 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold hover:bg-[#E8C87A] transition">
              {sessionStatus === 'locked' && sessionDestination ? 'Generate itinerary' : 'Pick destination & generate itinerary'}
            </button>
          </div>
        )}

        {generating && (
          <div className="text-center py-12">
            <div className="w-10 h-10 rounded-full border-3 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin mx-auto mb-4" />
            <p className="text-white/60 text-sm">
              {sessionDestination
                ? `Jade AI is crafting your ${sessionDestination} itinerary…`
                : 'Jade AI is picking your destination and crafting your itinerary…'}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-3 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {itinerary && (
          <>
            {/* Travel tips */}
            {itinerary.travelTips?.length > 0 && (
              <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-2xl p-4 mb-6">
                <p className="text-[#C9A84C] text-xs font-bold mb-2">✈ Travel tips</p>
                {itinerary.travelTips.map((t, i) => (
                  <p key={i} className="text-white/70 text-sm mb-1">• {t}</p>
                ))}
              </div>
            )}

            {/* Days */}
            <div className="space-y-6">
              {itinerary.days.map((day) => (
                <div key={day.day} className="bg-[#0d1e35] rounded-2xl border border-white/8 overflow-hidden">
                  <div className="bg-[#0B1F3A] px-5 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-[#C9A84C] font-bold text-sm">Day {day.day}</span>
                      <h3 className="text-white font-semibold">{day.theme}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-white/40 text-xs">{day.estimatedCost}</p>
                      <p className="text-white/30 text-[10px]">{day.accommodation}</p>
                    </div>
                  </div>

                  <div className="divide-y divide-[#0B1F3A]/5">
                    {(['morning', 'afternoon', 'evening'] as const).map(slot => {
                      const s = day[slot]
                      const icons = { morning: '🌅', afternoon: '☀️', evening: '🌙' }
                      return (
                        <div key={slot} className="px-5 py-4">
                          <div className="flex items-start gap-3">
                            <span className="text-lg flex-shrink-0 mt-0.5">{icons[slot]}</span>
                            <div className="flex-1">
                              <p className="font-semibold text-[#0B1F3A] text-sm">{s.title}</p>
                              <p className="text-white/60 text-xs mt-0.5">{s.description}</p>
                              {s.satisfies?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {s.satisfies.map((name, i) => (
                                    <span key={i} className="text-[10px] bg-[#C9A84C]/10 text-[#C9A84C] rounded-md px-1.5 py-0.5">
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Packing */}
            {itinerary.packingHighlights?.length > 0 && (
              <div className="mt-6 bg-[#0d1e35] rounded-2xl p-5 border border-white/8">
                <p className="font-semibold text-white mb-3">🎒 Pack these</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {itinerary.packingHighlights.map((item, i) => (
                    <p key={i} className="text-white/60 text-sm">• {item}</p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
