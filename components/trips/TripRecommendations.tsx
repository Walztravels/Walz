'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import {
  Hotel, Car, MapPin, Wifi, Plane,
} from 'lucide-react'
import {
  getCrossSellRecommendations,
  type CrossSellRecommendation,
  type RecommendationType,
} from '@/lib/commercial/cross-sell'

interface TripForRecommendations {
  id:          string
  destination: string
  origin:      string | null
  adults:      number
  children:    number
  infants:     number
  items: Array<{
    type:     string
    metadata: Record<string, unknown>
  }>
}

const TYPE_CONFIG: Record<RecommendationType, {
  icon:   React.ReactNode
  accent: string
  bg:     string
}> = {
  HOTEL:    { icon: <Hotel  className="w-5 h-5" />, accent: 'text-indigo-600', bg: 'bg-indigo-50' },
  TRANSFER: { icon: <Car    className="w-5 h-5" />, accent: 'text-amber-600',  bg: 'bg-amber-50'  },
  ACTIVITY: { icon: <MapPin className="w-5 h-5" />, accent: 'text-emerald-600',bg: 'bg-emerald-50'},
  ESIM:     { icon: <Wifi   className="w-5 h-5" />, accent: 'text-teal-600',   bg: 'bg-teal-50'   },
  FLIGHT:   { icon: <Plane  className="w-5 h-5" />, accent: 'text-blue-600',   bg: 'bg-blue-50'   },
}

function fireEvent(event: string, metadata: Record<string, unknown>) {
  fetch('/api/commercial/event', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ event, ...metadata }),
  }).catch(() => {})
}

function RecommendationCard({
  rec,
  tripId,
}: {
  rec:    CrossSellRecommendation
  tripId: string
}) {
  const cfg = TYPE_CONFIG[rec.type]

  function handleClick() {
    fireEvent('cross_sell_clicked', {
      tripId,
      recommendationType: rec.type,
      destination:        undefined,
    })
  }

  const inner = (
    <div
      className="bg-white rounded-2xl shadow-sm p-5 flex items-start gap-4
        hover:shadow-md transition-shadow border border-gray-100 cursor-pointer"
    >
      <div className={`${cfg.bg} ${cfg.accent} p-2.5 rounded-xl flex-shrink-0`}>
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${cfg.accent}`}>
          {rec.type.replace('_', ' ')}
        </p>
        <p className="text-[#0B1F3A] font-semibold text-sm leading-snug mb-2">
          {rec.reason}
        </p>
        <span className="inline-flex items-center gap-1 text-[#C9A84C] text-xs font-bold hover:underline">
          {rec.ctaLabel} →
        </span>
      </div>
    </div>
  )

  if (rec.ctaHref) {
    return (
      <Link href={rec.ctaHref} onClick={handleClick}>
        {inner}
      </Link>
    )
  }
  return <div onClick={handleClick}>{inner}</div>
}

export function TripRecommendations({ trip }: { trip: TripForRecommendations }) {
  const firedRef = useRef(false)
  const recs     = getCrossSellRecommendations(trip)

  useEffect(() => {
    if (recs.length === 0 || firedRef.current) return
    firedRef.current = true
    fireEvent('cross_sell_shown', {
      tripId:           trip.id,
      recommendationTypes: recs.map(r => r.type),
    })
  }, [trip.id, recs.length])  // eslint-disable-line react-hooks/exhaustive-deps

  if (recs.length === 0) return null

  return (
    <div className="mt-4">
      <p className="text-[#0B1F3A] text-xs font-bold uppercase tracking-wider mb-3 px-1">
        Complete Your Trip
      </p>
      <div className="space-y-3">
        {recs.map(rec => (
          <RecommendationCard key={rec.type} rec={rec} tripId={trip.id} />
        ))}
      </div>
    </div>
  )
}
