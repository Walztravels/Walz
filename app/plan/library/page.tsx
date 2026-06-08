'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  Plus, Map, Clock, Calendar, Trash2, Globe,
  Loader2, BookOpen, Compass, ChevronRight, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────
type Trip = {
  id: string
  title: string
  destination: string
  status: string
  startDate: string | null
  endDate: string | null
  coverImage: string | null
  budget: number | null
  currency: string
  days: { id: string; dayNumber: number; title: string | null }[]
  items: { id: string; type: string; confirmed: boolean }[]
  updatedAt: string
}

type Template = {
  id: string
  name: string
  destination: string
  description: string | null
  coverImage: string | null
  duration: number
  highlights: string[]
  category: string
  tags: string[]
}

// ── Status pill ────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  DRAFT:     'bg-white/10 text-white/50',
  PLANNING:  'bg-blue-500/20 text-blue-300',
  CONFIRMED: 'bg-emerald-500/20 text-emerald-400',
  COMPLETED: 'bg-[#C9A84C]/20 text-[#C9A84C]',
  CANCELLED: 'bg-red-500/20 text-red-400',
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function PlanLibraryPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [tab, setTab]           = useState<'trips' | 'templates'>('trips')
  const [trips, setTrips]       = useState<Trip[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [tripsLoading, setTripsLoading]     = useState(true)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/portal/login?redirect=/plan/library')
    }
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') fetchTrips()
  }, [status])

  useEffect(() => {
    if (tab === 'templates' && templates.length === 0) fetchTemplates()
  }, [tab])

  async function fetchTrips() {
    setTripsLoading(true)
    try {
      const res = await fetch('/api/trips')
      const data = await res.json()
      setTrips(data.trips ?? [])
    } finally {
      setTripsLoading(false)
    }
  }

  async function fetchTemplates() {
    setTemplatesLoading(true)
    try {
      const res = await fetch('/api/trips/templates')
      const data = await res.json()
      setTemplates(data.templates ?? [])
    } finally {
      setTemplatesLoading(false)
    }
  }

  async function deleteTrip(id: string) {
    if (!confirm('Delete this trip? This cannot be undone.')) return
    setDeleting(id)
    try {
      await fetch(`/api/trips/${id}`, { method: 'DELETE' })
      setTrips(prev => prev.filter(t => t.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  async function useTemplate(templateId: string) {
    router.push(`/plan/new?template=${templateId}`)
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#060F1E]">
      {/* Header */}
      <div className="bg-[#0B1F3A] border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">My Trips</h1>
              <p className="text-sm text-white/50 mt-0.5">Plan, organise, and save your travel dreams</p>
            </div>
            <Link
              href="/plan/new"
              className="flex items-center gap-2 px-4 py-2.5 bg-[#C9A84C] text-[#0B1F3A] rounded-xl font-semibold text-sm hover:bg-[#dbb95a] transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Trip
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-5 bg-white/5 rounded-xl p-1 w-fit">
            {(['trips', 'templates'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-semibold transition-all capitalize',
                  tab === t
                    ? 'bg-[#C9A84C] text-[#0B1F3A]'
                    : 'text-white/50 hover:text-white'
                )}
              >
                {t === 'trips' ? <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" />My Trips</span> : <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Templates</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* ── MY TRIPS ── */}
        {tab === 'trips' && (
          <>
            {tripsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-7 h-7 animate-spin text-[#C9A84C]" />
              </div>
            ) : trips.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Map className="w-8 h-8 text-white/20" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No trips yet</h3>
                <p className="text-white/40 text-sm mb-6 max-w-sm mx-auto">
                  Start planning your next adventure. Create a trip from scratch or use one of our curated templates.
                </p>
                <div className="flex items-center gap-3 justify-center flex-wrap">
                  <Link href="/plan/new" className="flex items-center gap-2 px-4 py-2.5 bg-[#C9A84C] text-[#0B1F3A] rounded-xl font-semibold text-sm hover:bg-[#dbb95a] transition-colors">
                    <Plus className="w-4 h-4" /> Start from scratch
                  </Link>
                  <button onClick={() => setTab('templates')} className="flex items-center gap-2 px-4 py-2.5 bg-white/8 text-white rounded-xl font-semibold text-sm hover:bg-white/12 transition-colors">
                    <Sparkles className="w-4 h-4" /> Browse templates
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {trips.map(trip => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    onDelete={deleteTrip}
                    deleting={deleting === trip.id}
                  />
                ))}
                {/* New trip card */}
                <Link
                  href="/plan/new"
                  className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/10 p-8 text-white/30 hover:border-[#C9A84C]/40 hover:text-[#C9A84C]/60 transition-all min-h-[200px]"
                >
                  <Plus className="w-8 h-8" />
                  <span className="text-sm font-semibold">New trip</span>
                </Link>
              </div>
            )}
          </>
        )}

        {/* ── TEMPLATES ── */}
        {tab === 'templates' && (
          <>
            {templatesLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-7 h-7 animate-spin text-[#C9A84C]" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map(t => (
                  <TemplateCard key={t.id} template={t} onUse={useTemplate} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── TripCard ──────────────────────────────────────────────────────────────
function TripCard({
  trip, onDelete, deleting,
}: { trip: Trip; onDelete: (id: string) => void; deleting: boolean }) {
  const confirmedCount = trip.items.filter(i => i.confirmed).length
  const totalCount     = trip.items.length

  return (
    <div className="group relative bg-[#0B1F3A] rounded-2xl border border-white/8 overflow-hidden hover:border-white/20 transition-all">
      {/* Cover image */}
      <div className="relative h-36 bg-[#0f2d52] overflow-hidden">
        {trip.coverImage ? (
          <Image src={trip.coverImage} alt={trip.title} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Compass className="w-10 h-10 text-white/10" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A] via-transparent to-transparent" />
        {/* Status */}
        <div className={cn('absolute top-3 left-3 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider', STATUS_COLORS[trip.status] ?? 'bg-white/10 text-white/50')}>
          {trip.status}
        </div>
        {/* Delete */}
        <button
          onClick={e => { e.preventDefault(); onDelete(trip.id) }}
          className="absolute top-3 right-3 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-red-500/20 transition-all opacity-0 group-hover:opacity-100"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      <Link href={`/plan/${trip.id}`} className="block p-4">
        <h3 className="font-bold text-white text-base leading-tight mb-1">{trip.title}</h3>
        <p className="text-sm text-white/50 flex items-center gap-1.5 mb-3">
          <Globe className="w-3.5 h-3.5 flex-shrink-0" />
          {trip.destination}
        </p>

        <div className="flex items-center gap-4 text-xs text-white/40">
          {trip.startDate && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(trip.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
          {trip.days.length > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {trip.days.length}d
            </span>
          )}
          {totalCount > 0 && (
            <span className="flex items-center gap-1 ml-auto">
              <span className="text-[#C9A84C]">{confirmedCount}</span>/{totalCount} confirmed
            </span>
          )}
        </div>
      </Link>

      <div className="px-4 pb-4">
        <Link
          href={`/plan/${trip.id}`}
          className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-[#C9A84C]/10 hover:text-[#C9A84C] rounded-xl text-sm text-white/60 font-medium transition-all"
        >
          Open planner <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}

// ── TemplateCard ──────────────────────────────────────────────────────────
function TemplateCard({ template, onUse }: { template: Template; onUse: (id: string) => void }) {
  const CATEGORY_LABELS: Record<string, string> = {
    leisure: '✈️ Leisure', cultural: '🏛 Cultural', adventure: '🧗 Adventure',
    luxury: '💎 Luxury', family: '👨‍👩‍👧 Family', city: '🌆 City',
  }

  return (
    <div className="group bg-[#0B1F3A] rounded-2xl border border-white/8 overflow-hidden hover:border-white/20 transition-all">
      <div className="relative h-40 bg-[#0f2d52] overflow-hidden">
        {template.coverImage ? (
          <Image src={template.coverImage} alt={template.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Map className="w-10 h-10 text-white/10" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/90 via-[#0B1F3A]/30 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-[10px] font-bold text-[#C9A84C] uppercase tracking-wider mb-1">
            {CATEGORY_LABELS[template.category] ?? template.category}
          </p>
          <h3 className="font-bold text-white leading-tight">{template.name}</h3>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-3 text-xs text-white/40 mb-3">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{template.duration} days</span>
          <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{template.destination}</span>
        </div>

        {template.highlights.length > 0 && (
          <ul className="space-y-1 mb-4">
            {template.highlights.slice(0, 3).map((h, i) => (
              <li key={i} className="text-xs text-white/50 flex items-start gap-1.5">
                <span className="text-[#C9A84C] mt-0.5 flex-shrink-0">✓</span>
                {h}
              </li>
            ))}
            {template.highlights.length > 3 && (
              <li className="text-xs text-white/30">+{template.highlights.length - 3} more highlights</li>
            )}
          </ul>
        )}

        <button
          onClick={() => onUse(template.id)}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#C9A84C] text-[#0B1F3A] rounded-xl text-sm font-bold hover:bg-[#dbb95a] transition-colors"
        >
          Use this template <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
