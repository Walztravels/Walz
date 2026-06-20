'use client'

import { useState, useEffect } from 'react'
import { useFlightStore, type FarePrediction } from '@/store/flightStore'
import type { FlightItinerary } from '@/lib/flights/types'

interface Props {
  itinerary:  FlightItinerary
  departDate: string
}

const REC_STYLE: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  book_now:  { bg: 'bg-green-50 border-green-200',  text: 'text-green-700',  label: 'Book Now',  icon: '🟢' },
  wait:      { bg: 'bg-amber-50 border-amber-200',   text: 'text-amber-700',  label: 'Wait',      icon: '🟡' },
  flexible:  { bg: 'bg-blue-50 border-blue-200',     text: 'text-blue-700',   label: 'Flexible',  icon: '🔵' },
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="w-full h-2 bg-[#0B1F3A]/10 rounded-full overflow-hidden">
      <div
        className="h-full bg-[#C9A84C] rounded-full transition-all duration-700"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

function MiniBarChart({ data }: { data: { label: string; price: number }[] }) {
  const max = Math.max(...data.map(d => d.price))
  return (
    <div className="flex items-end gap-1.5 h-12">
      {data.map((d, i) => {
        const height = max > 0 ? (d.price / max) * 100 : 0
        const isLast = i === data.length - 1
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[9px] text-[#0B1F3A]/50 leading-none">£{d.price}</span>
            <div
              className={`w-full rounded-t-sm ${isLast ? 'bg-[#C9A84C]' : 'bg-[#0B1F3A]/20'}`}
              style={{ height: `${Math.max(4, height * 0.36)}rem` }}
            />
            <span className="text-[9px] text-[#0B1F3A]/40 leading-none text-center">{d.label.replace(' ago', '')}</span>
          </div>
        )
      })}
    </div>
  )
}

export function FarePredictor({ itinerary, departDate }: Props) {
  const [expanded,   setExpanded]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [localPred,  setLocalPred]  = useState<FarePrediction | null>(null)
  const { farePredict, setFarePredict } = useFlightStore()

  const prediction = localPred ?? farePredict

  async function fetchPrediction() {
    if (farePredict && Date.now() - farePredict.fetchedAt < 30 * 60 * 1000) return

    setLoading(true)
    try {
      const from = itinerary.segments[0]?.departureIata ?? 'LHR'
      const to   = itinerary.segments[itinerary.segments.length - 1]?.arrivalIata ?? 'LOS'
      const daysToFlight = Math.max(1, Math.ceil((new Date(departDate).getTime() - Date.now()) / 86400000))

      const res  = await fetch('/api/flights/fare-predict', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to, departDate,
          cabin:       itinerary.fareType,
          price:       itinerary.price.total,
          currency:    itinerary.price.currency,
          daysToFlight,
        }),
      })
      const data = await res.json() as FarePrediction & { fetchedAt?: number }
      const pred = { ...data, fetchedAt: Date.now() }
      setFarePredict(pred)
      setLocalPred(pred)
    } catch {
      // fail silently
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPrediction() }, []) // eslint-disable-line

  const style = prediction ? (REC_STYLE[prediction.recommendation] ?? REC_STYLE.flexible) : null

  if (loading && !prediction) {
    return (
      <div className="bg-white rounded-2xl border border-black/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded-full bg-[#C9A84C]/20 animate-pulse" />
          <div className="h-4 w-32 bg-[#0B1F3A]/10 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[0.8, 0.6, 0.5].map((w, i) => (
            <div key={i} className="h-3 bg-[#0B1F3A]/5 rounded animate-pulse" style={{ width: `${w * 100}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (!prediction) return null

  return (
    <div className={`rounded-2xl border p-5 ${style?.bg ?? 'bg-white border-black/5'}`}>
      {/* Header */}
      <button type="button" onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-[#0B1F3A]/40 uppercase tracking-wider">Jade AI · Fare Insight</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${style?.bg} ${style?.text}`}>
                {style?.icon} {style?.label}
              </span>
            </div>
            <p className="text-sm font-semibold text-[#0B1F3A] leading-snug">{prediction.headline}</p>
          </div>
          <svg className={`w-4 h-4 text-[#0B1F3A]/40 flex-shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Confidence */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] text-[#0B1F3A]/50 font-medium">Confidence</span>
              <span className="text-[11px] font-bold text-[#0B1F3A]">{prediction.confidence}%</span>
            </div>
            <ConfidenceBar value={prediction.confidence} />
          </div>

          {/* Detail */}
          <p className="text-[13px] text-[#0B1F3A]/70 leading-relaxed">{prediction.detail}</p>

          {/* Price history chart */}
          {prediction.priceHistory?.length > 0 && (
            <div>
              <p className="text-[11px] text-[#0B1F3A]/40 font-medium uppercase tracking-wider mb-2">Price History</p>
              <MiniBarChart data={prediction.priceHistory} />
            </div>
          )}

          {/* Alternative dates */}
          {prediction.alternativeDates?.length > 0 && (
            <div>
              <p className="text-[11px] text-[#0B1F3A]/40 font-medium uppercase tracking-wider mb-2">Cheaper Dates</p>
              <div className="space-y-1.5">
                {prediction.alternativeDates.map((d, i) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <span className="text-[#0B1F3A]/60">{d.label} · {d.date}</span>
                    <span className="text-green-600 font-semibold">Save £{d.saving}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Jade message */}
          <div className="bg-[#0B1F3A]/5 rounded-xl p-3 flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#C9A84C] flex items-center justify-center flex-shrink-0 text-xs font-bold text-[#0B1F3A]">J</div>
            <p className="text-[12px] text-[#0B1F3A]/70 leading-relaxed italic">&ldquo;{prediction.aiMessage}&rdquo;</p>
          </div>

          <button type="button" onClick={() => fetchPrediction()}
            className="text-[11px] text-[#C9A84C] font-semibold hover:underline">
            Refresh prediction
          </button>
        </div>
      )}
    </div>
  )
}
