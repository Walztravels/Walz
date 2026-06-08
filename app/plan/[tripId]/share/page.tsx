'use client'

import { useState, useEffect, use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  Globe, Calendar, Clock, Map, Plane, Hotel, ActivitySquare,
  Utensils, Car, FileText, Tag, Check, Loader2, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type TripItem = {
  id: string; type: string; title: string; description: string | null
  location: string | null; startTime: string | null; endTime: string | null
  cost: number | null; currency: string; confirmed: boolean
}
type TripDay = { id: string; dayNumber: number; title: string | null; date: string | null; items: TripItem[] }
type Trip = {
  id: string; title: string; destination: string; startDate: string | null
  endDate: string | null; coverImage: string | null; days: TripDay[]
}

const ITEM_ICONS: Record<string, React.FC<{ className?: string }>> = {
  FLIGHT: Plane, HOTEL: Hotel, TOUR: Map, VISA: FileText,
  ACTIVITY: ActivitySquare, RESTAURANT: Utensils, TRANSPORT: Car,
  NOTE: FileText, CUSTOM: Tag,
}
const ITEM_COLORS: Record<string, string> = {
  FLIGHT: 'text-blue-400', HOTEL: 'text-emerald-400', TOUR: 'text-[#C9A84C]',
  VISA: 'text-purple-400', ACTIVITY: 'text-orange-400', RESTAURANT: 'text-pink-400',
  TRANSPORT: 'text-cyan-400', NOTE: 'text-white/40', CUSTOM: 'text-white/40',
}

// ── Inner (uses useSearchParams) ──────────────────────────────────────────
function SharePageInner({ tripId }: { tripId: string }) {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [trip, setTrip]     = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!token) { setError(true); setLoading(false); return }
    fetch(`/api/trips/${tripId}/share?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.trip) {
          setTrip(data.trip)
          // Expand all days by default
          const exp: Record<string, boolean> = {}
          data.trip.days.forEach((d: TripDay) => { exp[d.id] = true })
          setExpanded(exp)
        } else {
          setError(true)
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [tripId, token])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060F1E] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
      </div>
    )
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen bg-[#060F1E] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-2">
          <Map className="w-8 h-8 text-white/20" />
        </div>
        <h1 className="text-xl font-bold text-white">Trip not found</h1>
        <p className="text-white/40 text-sm">This trip is either private or the link has expired.</p>
        <Link href="/" className="text-[#C9A84C] hover:underline text-sm">Go to Walz Travels</Link>
      </div>
    )
  }

  const totalDays = trip.days.length
  const totalItems = trip.days.flatMap(d => d.items).length

  return (
    <div className="min-h-screen bg-[#060F1E]">
      {/* Hero */}
      <div className="relative h-64 sm:h-80 bg-[#0B1F3A] overflow-hidden">
        {trip.coverImage ? (
          <Image src={trip.coverImage} alt={trip.title} fill className="object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0B1F3A] to-[#0f2d52]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#060F1E] via-[#060F1E]/40 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10">
          <p className="text-xs font-bold text-[#C9A84C] uppercase tracking-[0.2em] mb-2">Shared Itinerary</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">{trip.title}</h1>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm text-white/60">
              <Globe className="w-4 h-4" />{trip.destination}
            </span>
            {trip.startDate && (
              <span className="flex items-center gap-1.5 text-sm text-white/60">
                <Calendar className="w-4 h-4" />
                {new Date(trip.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-sm text-white/60">
              <Clock className="w-4 h-4" />{totalDays} days · {totalItems} activities
            </span>
          </div>
        </div>
      </div>

      {/* Itinerary */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        {trip.days.map(day => (
          <div key={day.id} className="bg-[#0B1F3A] rounded-2xl border border-white/8 overflow-hidden">
            <button
              onClick={() => setExpanded(p => ({ ...p, [day.id]: !p[day.id] }))}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#C9A84C]/20 border border-[#C9A84C]/30 flex items-center justify-center text-sm font-bold text-[#C9A84C]">
                  {day.dayNumber}
                </div>
                <div>
                  <p className="font-bold text-white">{day.title ?? `Day ${day.dayNumber}`}</p>
                  {day.date && (
                    <p className="text-xs text-white/30">
                      {new Date(day.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/30">{day.items.length} activities</span>
                <ChevronDown className={cn('w-4 h-4 text-white/30 transition-transform', expanded[day.id] && 'rotate-180')} />
              </div>
            </button>

            {expanded[day.id] && day.items.length > 0 && (
              <div className="divide-y divide-white/5 border-t border-white/8">
                {day.items.map(item => {
                  const Icon = ITEM_ICONS[item.type] ?? Tag
                  const color = ITEM_COLORS[item.type] ?? 'text-white/40'
                  return (
                    <div key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                      <div className={cn('mt-0.5 flex-shrink-0', color)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white">{item.title}</p>
                          {item.confirmed && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                              <Check className="w-2.5 h-2.5" />Confirmed
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {item.startTime && <span className="text-xs text-white/30">{item.startTime}{item.endTime && ` — ${item.endTime}`}</span>}
                          {item.location && <span className="text-xs text-white/30">{item.location}</span>}
                          {item.description && <p className="text-xs text-white/40 w-full mt-0.5">{item.description}</p>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 text-center">
        <p className="text-white/30 text-sm mb-3">Plan your own trip with Walz Travels</p>
        <Link
          href="/plan/new"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#C9A84C] text-[#0B1F3A] rounded-xl font-bold text-sm hover:bg-[#dbb95a] transition-colors"
        >
          <Map className="w-4 h-4" /> Start planning
        </Link>
      </div>
    </div>
  )
}

// ── Page export ────────────────────────────────────────────────────────────
export default function SharePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params)
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#060F1E] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
      </div>
    }>
      <SharePageInner tripId={tripId} />
    </Suspense>
  )
}
