'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Map, Globe, Calendar, FileText, ChevronRight,
  Loader2, CheckCircle, Search, ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Trip = {
  id: string; title: string; destination: string; status: string
  createdAt: string; updatedAt: string
  user: { name: string | null; email: string | null }
  days: { id: string }[]
  items: { id: string; confirmed: boolean }[]
  proposals: { id: string; status: string }[]
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     'bg-white/10 text-white/50',
  PLANNING:  'bg-blue-500/20 text-blue-300',
  CONFIRMED: 'bg-emerald-500/20 text-emerald-400',
  COMPLETED: 'bg-[#C9A84C]/20 text-[#C9A84C]',
  CANCELLED: 'bg-red-500/20 text-red-400',
}

export default function TripHistoryPage() {
  const [trips, setTrips]     = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    fetch('/api/advisor/trips')
      .then(r => r.json())
      .then(d => setTrips((d.trips ?? []).filter((t: Trip) => ['COMPLETED', 'CANCELLED'].includes(t.status))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = trips.filter(t =>
    !search || [t.title, t.destination, t.user.name, t.user.email]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="min-h-screen bg-[#060F1E] p-6">
      <div className="max-w-6xl mx-auto">

        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin/trip-planner" className="p-2 rounded-xl text-white/40 hover:bg-white/8 hover:text-white transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Trip History</h1>
            <p className="text-sm text-white/40 mt-0.5">Completed and cancelled trips</p>
          </div>
        </div>

        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Search trips..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#C9A84C]/50"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-[#C9A84C]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-white/30">
            <Map className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>No completed or cancelled trips</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(trip => (
              <div key={trip.id} className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', STATUS_COLORS[trip.status])}>
                        {trip.status}
                      </span>
                      <span className="text-xs text-white/30">{trip.user.name ?? trip.user.email}</span>
                    </div>
                    <h3 className="font-bold text-white">{trip.title}</h3>
                    <div className="flex items-center gap-4 mt-1 text-xs text-white/30">
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{trip.destination}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(trip.createdAt).toLocaleDateString('en-GB')}</span>
                      <span>{trip.days.length} days · {trip.items.length} items</span>
                    </div>
                  </div>
                  {trip.proposals.length > 0 && (
                    <div className="text-xs text-white/30 flex-shrink-0">
                      {trip.proposals.filter(p => p.status === 'accepted').length > 0 && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle className="w-3.5 h-3.5" /> Proposal accepted
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
