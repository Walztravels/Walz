'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  MapPin, Plus, Search, Calendar, DollarSign,
  ChevronRight, Globe, Filter, Loader2, FileText,
} from 'lucide-react'

interface TripItem { id: string }
interface TripDay { id: string; dayNumber: number; title: string | null; items: TripItem[] }
interface TripUser { name: string | null; email: string }
interface Trip {
  id: string
  title: string
  destination: string
  startDate: string | null
  endDate: string | null
  status: string
  budget: number | null
  currency: string
  days: TripDay[]
  proposals: Array<{ id: string; status: string }>
  user: TripUser | null
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     'bg-gray-100 text-gray-600',
  ACTIVE:    'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AED', 'NGN', 'GHS']

export default function ItineraryPage() {
  const [trips,   setTrips]   = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState('ALL')
  const [showNew, setShowNew] = useState(false)
  const [newTrip, setNewTrip] = useState({ title: '', destination: '', startDate: '', endDate: '', budget: '', currency: 'GBP', notes: '' })
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (filter !== 'ALL') params.set('status', filter)
    const res  = await fetch(`/api/admin/trips?${params}`)
    const data = await res.json()
    setTrips(data.trips ?? [])
    setLoading(false)
  }

  useEffect(() => { void load() }, [search, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  async function createTrip() {
    if (!newTrip.title || !newTrip.destination) return
    setCreating(true)
    const res = await fetch('/api/admin/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newTrip, budget: newTrip.budget ? parseFloat(newTrip.budget) : null }),
    })
    const data = await res.json()
    setCreating(false)
    setShowNew(false)
    setNewTrip({ title: '', destination: '', startDate: '', endDate: '', budget: '', currency: 'GBP', notes: '' })
    if (data.trip?.id) window.location.href = `/admin/itinerary/${data.trip.id}`
  }

  function dayCount(trip: Trip) {
    if (trip.startDate && trip.endDate) {
      const d = Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
      return `${d}d`
    }
    return `${trip.days?.length ?? 0}d`
  }

  function itemCount(trip: Trip) {
    return trip.days?.reduce((s, d) => s + (d.items?.length ?? 0), 0) ?? 0
  }

  const inputClass = 'w-full h-10 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] bg-white'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Itinerary Planner</h1>
          <p className="text-gray-400 text-sm mt-0.5">Plan, build, and send beautiful itineraries to clients</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-[#b8943d] transition-colors">
          <Plus className="w-4 h-4" /> New Itinerary
        </button>
      </div>

      {/* Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-6">Create New Itinerary</h2>
            <div className="space-y-4">
              {([
                { label: 'Trip Title', key: 'title', placeholder: 'e.g. UK Honeymoon — Amara & Kofi' },
                { label: 'Destination', key: 'destination', placeholder: 'e.g. London, United Kingdom' },
              ] as const).map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">{label}</label>
                  <input value={newTrip[key]}
                    onChange={e => setNewTrip(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className={inputClass}
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                {(['startDate', 'endDate'] as const).map(k => (
                  <div key={k}>
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      {k === 'startDate' ? 'Start Date' : 'End Date'}
                    </label>
                    <input type="date" value={newTrip[k]}
                      onChange={e => setNewTrip(p => ({ ...p, [k]: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Budget</label>
                  <input type="number" value={newTrip.budget} placeholder="5000"
                    onChange={e => setNewTrip(p => ({ ...p, budget: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Currency</label>
                  <select value={newTrip.currency}
                    onChange={e => setNewTrip(p => ({ ...p, currency: e.target.value }))}
                    className={inputClass}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNew(false)}
                className="flex-1 h-11 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
              <button onClick={createTrip} disabled={creating || !newTrip.title || !newTrip.destination}
                className="flex-1 h-11 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl text-sm disabled:opacity-50">
                {creating ? 'Creating…' : 'Create →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search trips, destinations…"
            className="w-full pl-9 pr-4 h-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] bg-white"
          />
        </div>
        {(['ALL', 'DRAFT', 'ACTIVE', 'COMPLETED'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === s ? 'bg-[#0B1F3A] text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
        </div>
      ) : trips.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center shadow-sm">
          <Globe className="w-14 h-14 text-gray-200 mx-auto mb-4" />
          <p className="text-lg font-bold text-[#0B1F3A] mb-2">No itineraries yet</p>
          <p className="text-gray-400 text-sm mb-6">Create your first client itinerary to get started.</p>
          <button onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-5 py-2.5 rounded-xl text-sm">
            <Plus className="w-4 h-4" /> Create First Itinerary
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trips.map(trip => (
            <Link key={trip.id} href={`/admin/itinerary/${trip.id}`}
              className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group border border-gray-100 hover:border-[#C9A84C]/30">
              <div className="bg-gradient-to-br from-[#0B1F3A] to-[#162d52] p-5">
                <div className="flex items-start justify-between mb-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[trip.status] ?? STATUS_COLORS.DRAFT}`}>
                    {trip.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-[#C9A84C] transition-colors" />
                </div>
                <h3 className="text-white font-bold text-base leading-snug mb-1 line-clamp-2">{trip.title}</h3>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" />
                  <span className="text-white/60 text-xs truncate">{trip.destination}</span>
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { icon: Calendar, val: dayCount(trip), label: 'Duration' },
                    { icon: FileText, val: String(itemCount(trip)), label: 'Items' },
                    {
                      icon: DollarSign,
                      val: trip.budget
                        ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: trip.currency, maximumFractionDigits: 0 }).format(trip.budget)
                        : '—',
                      label: 'Budget',
                    },
                  ].map(({ icon: Icon, val, label }) => (
                    <div key={label} className="text-center">
                      <Icon className="w-3.5 h-3.5 text-[#C9A84C] mx-auto mb-0.5" />
                      <p className="text-[11px] font-bold text-[#0B1F3A]">{val}</p>
                      <p className="text-[10px] text-gray-400">{label}</p>
                    </div>
                  ))}
                </div>
                {trip.startDate && (
                  <p className="text-xs text-gray-400 text-center">
                    {new Date(trip.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {trip.endDate && ` — ${new Date(trip.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                  </p>
                )}
                {trip.user && (
                  <p className="text-[11px] text-gray-400 text-center mt-1 truncate">
                    {trip.user.name || trip.user.email}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
