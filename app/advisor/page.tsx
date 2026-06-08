'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Map, Users, FileText, Clock, Globe, ChevronRight,
  Loader2, Sparkles, CheckCircle, AlertCircle, Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type TripSummary = {
  id: string; title: string; destination: string; status: string; updatedAt: string
  user: { name: string | null; email: string | null }
  days: { id: string }[]
  items: { id: string; confirmed: boolean }[]
  proposals: { id: string; title: string; status: string }[]
}

type ProposalSummary = {
  id: string; title: string; status: string; totalCost: number | null; currency: string; createdAt: string
  trip: { id: string; title: string; destination: string; user: { name: string | null; email: string | null } }
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     'bg-white/10 text-white/50',
  PLANNING:  'bg-blue-500/20 text-blue-300',
  CONFIRMED: 'bg-emerald-500/20 text-emerald-400',
  COMPLETED: 'bg-[#C9A84C]/20 text-[#C9A84C]',
  CANCELLED: 'bg-red-500/20 text-red-400',
}
const PROPOSAL_COLORS: Record<string, string> = {
  draft:    'bg-white/8 text-white/40',
  sent:     'bg-blue-500/20 text-blue-300',
  accepted: 'bg-emerald-500/20 text-emerald-400',
  declined: 'bg-red-500/20 text-red-400',
}

export default function AdvisorPage() {
  const [trips, setTrips]         = useState<TripSummary[]>([])
  const [proposals, setProposals] = useState<ProposalSummary[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<'trips' | 'proposals'>('trips')

  useEffect(() => {
    Promise.all([
      fetch('/api/advisor/trips').then(r => r.json()),
      fetch('/api/advisor/proposals').then(r => r.json()),
    ]).then(([t, p]) => {
      setTrips(t.trips ?? [])
      setProposals(p.proposals ?? [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060F1E] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#C9A84C]" />
      </div>
    )
  }

  const activePlanning = trips.filter(t => ['DRAFT', 'PLANNING'].includes(t.status))
  const pendingProposals = proposals.filter(p => p.status === 'sent')
  const confirmedTrips = trips.filter(t => t.status === 'CONFIRMED')

  return (
    <div className="min-h-screen bg-[#060F1E]">
      {/* Header */}
      <div className="bg-[#0B1F3A] border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Advisor Portal</h1>
              <p className="text-sm text-white/40 mt-0.5">Client trip management & proposals</p>
            </div>
            <Link
              href="/admin/trip-planner"
              className="flex items-center gap-2 px-4 py-2.5 bg-[#C9A84C] text-[#0B1F3A] rounded-xl font-bold text-sm hover:bg-[#dbb95a] transition-colors"
            >
              Admin view
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { label: 'Active trips', value: activePlanning.length, icon: Map, color: 'text-blue-400' },
              { label: 'Pending proposals', value: pendingProposals.length, icon: FileText, color: 'text-[#C9A84C]' },
              { label: 'Confirmed', value: confirmedTrips.length, icon: CheckCircle, color: 'text-emerald-400' },
            ].map(stat => (
              <div key={stat.label} className="bg-white/5 rounded-xl p-4">
                <div className={cn('mb-2', stat.color)}><stat.icon className="w-5 h-5" /></div>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-white/40 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-5 bg-white/5 rounded-xl p-1 w-fit">
            {(['trips', 'proposals'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('px-4 py-2 rounded-lg text-sm font-semibold transition-all capitalize',
                  tab === t ? 'bg-[#C9A84C] text-[#0B1F3A]' : 'text-white/40 hover:text-white')}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* ── TRIPS tab ── */}
        {tab === 'trips' && (
          <div className="space-y-3">
            {trips.length === 0 ? (
              <div className="text-center py-16 text-white/30">
                <Map className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No client trips yet</p>
              </div>
            ) : (
              trips.map(trip => (
                <div key={trip.id} className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-4 hover:border-white/15 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', STATUS_COLORS[trip.status])}>
                          {trip.status}
                        </span>
                        <span className="text-xs text-white/30">
                          {trip.user.name ?? trip.user.email ?? 'Unknown client'}
                        </span>
                      </div>
                      <h3 className="font-bold text-white">{trip.title}</h3>
                      <p className="text-sm text-white/50 flex items-center gap-1.5 mt-0.5">
                        <Globe className="w-3.5 h-3.5" />{trip.destination}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right text-xs text-white/30">
                        <p>{trip.days.length} days</p>
                        <p>{trip.items.filter(i => i.confirmed).length}/{trip.items.length} confirmed</p>
                      </div>
                      <Link
                        href={`/api/trips/${trip.id}`}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white/8 hover:bg-[#C9A84C]/10 hover:text-[#C9A84C] rounded-xl text-xs text-white/50 font-medium transition-all"
                      >
                        View <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Latest proposal */}
                  {trip.proposals.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
                      <FileText className="w-3.5 h-3.5 text-white/20" />
                      <span className="text-xs text-white/40">Latest proposal:</span>
                      <span className="text-xs text-white/70">{trip.proposals[0].title}</span>
                      <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ml-auto', PROPOSAL_COLORS[trip.proposals[0].status])}>
                        {trip.proposals[0].status}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── PROPOSALS tab ── */}
        {tab === 'proposals' && (
          <div className="space-y-3">
            {proposals.length === 0 ? (
              <div className="text-center py-16 text-white/30">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No proposals yet</p>
              </div>
            ) : (
              proposals.map(proposal => (
                <div key={proposal.id} className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-4 hover:border-white/15 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', PROPOSAL_COLORS[proposal.status])}>
                          {proposal.status}
                        </span>
                        <span className="text-xs text-white/30">
                          {new Date(proposal.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <h3 className="font-bold text-white">{proposal.title}</h3>
                      <p className="text-sm text-white/50 mt-0.5">{proposal.trip.destination} · {proposal.trip.user.name ?? proposal.trip.user.email}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {proposal.totalCost && (
                        <p className="text-lg font-bold text-[#C9A84C]">
                          {proposal.currency} {proposal.totalCost.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
