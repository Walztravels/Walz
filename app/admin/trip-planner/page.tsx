'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Map, Users, Globe, Calendar, FileText, ChevronRight,
  Loader2, CheckCircle, Clock, Filter, Search, ArrowRight,
  Plus, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

type Trip = {
  id: string; title: string; destination: string; status: string; updatedAt: string; createdAt: string
  user: { id: string; name: string | null; email: string | null }
  days: { id: string }[]
  items: { id: string; confirmed: boolean }[]
  proposals: { id: string; title: string; status: string; createdAt: string }[]
  collaborators: { id: string; email: string; role: string; status: string }[]
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     'bg-white/10 text-white/50',
  PLANNING:  'bg-blue-500/20 text-blue-300',
  CONFIRMED: 'bg-emerald-500/20 text-emerald-400',
  COMPLETED: 'bg-[#C9A84C]/20 text-[#C9A84C]',
  CANCELLED: 'bg-red-500/20 text-red-400',
}

export default function AdminTripPlannerPage() {
  const router = useRouter()
  const { can, loading: permLoading } = useStaffPermissions()

  const [trips, setTrips]     = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Access guard
  useEffect(() => {
    if (!permLoading && !can('trips_view')) router.replace('/admin/unauthorized')
  }, [permLoading, can, router])

  useEffect(() => {
    fetch('/api/advisor/trips')
      .then(r => r.json())
      .then(d => setTrips(d.trips ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = trips.filter(t => {
    const matchSearch = !search || [t.title, t.destination, t.user.name, t.user.email].some(v =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
    const matchStatus = statusFilter === 'ALL' || t.status === statusFilter
    return matchSearch && matchStatus
  })

  const stats = {
    total:     trips.length,
    planning:  trips.filter(t => ['DRAFT', 'PLANNING'].includes(t.status)).length,
    confirmed: trips.filter(t => t.status === 'CONFIRMED').length,
    proposals: trips.flatMap(t => t.proposals).length,
  }

  return (
    <div className="min-h-screen bg-[#060F1E] p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Trip Planner</h1>
            <p className="text-sm text-white/40 mt-0.5">All client trip plans across the platform</p>
          </div>
          <Link
            href="/advisor"
            className="flex items-center gap-2 px-4 py-2.5 bg-[#C9A84C] text-[#0B1F3A] rounded-xl font-bold text-sm hover:bg-[#dbb95a] transition-colors"
          >
            Advisor view <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total trips',   value: stats.total,     icon: Map,          color: 'text-white' },
            { label: 'In planning',   value: stats.planning,  icon: Clock,        color: 'text-blue-400' },
            { label: 'Confirmed',     value: stats.confirmed, icon: CheckCircle,  color: 'text-emerald-400' },
            { label: 'Proposals',     value: stats.proposals, icon: FileText,     color: 'text-[#C9A84C]' },
          ].map(s => (
            <div key={s.label} className="bg-[#0B1F3A] rounded-xl border border-white/8 p-4">
              <div className={cn('mb-2', s.color)}><s.icon className="w-5 h-5" /></div>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Search trips, clients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#C9A84C]/50"
            />
          </div>
          <div className="flex items-center gap-1 bg-[#0B1F3A] border border-white/10 rounded-xl p-1">
            {['ALL', 'DRAFT', 'PLANNING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  statusFilter === s ? 'bg-[#C9A84C] text-[#0B1F3A]' : 'text-white/40 hover:text-white'
                )}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-[#C9A84C]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-white/30">
            <Map className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>No trips found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(trip => {
              const confirmedItems = trip.items.filter(i => i.confirmed).length
              const latestProposal = trip.proposals[0]
              return (
                <div key={trip.id} className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-4 hover:border-white/15 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', STATUS_COLORS[trip.status])}>
                          {trip.status}
                        </span>
                        <span className="text-xs text-white/30">{trip.user.name ?? trip.user.email ?? 'Unknown'}</span>
                        <span className="text-xs text-white/20">{trip.user.email}</span>
                      </div>
                      <h3 className="font-bold text-white">{trip.title}</h3>
                      <p className="text-sm text-white/50 flex items-center gap-1.5 mt-0.5">
                        <Globe className="w-3.5 h-3.5" />{trip.destination}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right text-xs text-white/30 hidden sm:block">
                        <p>{trip.days.length} days</p>
                        <p>{confirmedItems}/{trip.items.length} confirmed</p>
                        {trip.collaborators.length > 0 && <p>{trip.collaborators.length} collaborator{trip.collaborators.length > 1 ? 's' : ''}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/api/trips/${trip.id}`}
                          className="flex items-center gap-1.5 px-3 py-2 bg-white/8 hover:bg-[#C9A84C]/10 hover:text-[#C9A84C] rounded-xl text-xs text-white/50 font-medium transition-all"
                        >
                          View <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>

                  {latestProposal && (
                    <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-xs text-white/30">
                      <FileText className="w-3.5 h-3.5" />
                      <span>Proposal:</span>
                      <span className="text-white/50">{latestProposal.title}</span>
                      <span className={cn(
                        'ml-auto text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full',
                        latestProposal.status === 'accepted' ? 'bg-emerald-500/20 text-emerald-400'
                          : latestProposal.status === 'sent' ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-white/8 text-white/40'
                      )}>
                        {latestProposal.status}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
