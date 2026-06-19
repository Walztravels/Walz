'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Sparkles, Loader2, Plus, Trash2, CheckCircle,
  MapPin, Clock, DollarSign, Plane, Building2, Star, Car,
  Utensils, FileText, Edit2, Save, Send, Eye, X, ChevronDown,
} from 'lucide-react'

type ItemType = 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'RESTAURANT' | 'TRANSPORT' | 'CUSTOM' | 'TOUR' | 'NOTE' | 'VISA' | 'ESIM'

interface TripItem {
  id: string
  type: ItemType
  title: string
  description: string | null
  location: string | null
  startTime: string | null
  endTime: string | null
  cost: number | null
  currency: string
  confirmed: boolean
  order: number
  bookingRef: string | null
}

interface TripDay {
  id: string
  dayNumber: number
  date: string | null
  title: string | null
  items: TripItem[]
}

interface Trip {
  id: string
  title: string
  destination: string
  description: string | null
  startDate: string | null
  endDate: string | null
  status: string
  budget: number | null
  currency: string
  notes: string | null
  days: TripDay[]
  user: { name: string | null; email: string } | null
}

const ITEM_CONFIG: Record<string, { icon: React.ElementType; bg: string; border: string; label: string }> = {
  FLIGHT:     { icon: Plane,     bg: 'bg-blue-50',    border: 'border-blue-200',   label: 'Flight'     },
  HOTEL:      { icon: Building2, bg: 'bg-purple-50',  border: 'border-purple-200', label: 'Hotel'      },
  ACTIVITY:   { icon: Star,      bg: 'bg-green-50',   border: 'border-green-200',  label: 'Activity'   },
  RESTAURANT: { icon: Utensils,  bg: 'bg-orange-50',  border: 'border-orange-200', label: 'Restaurant' },
  TRANSPORT:  { icon: Car,       bg: 'bg-gray-50',    border: 'border-gray-200',   label: 'Transfer'   },
  TOUR:       { icon: MapPin,    bg: 'bg-teal-50',    border: 'border-teal-200',   label: 'Tour'       },
  CUSTOM:     { icon: FileText,  bg: 'bg-[#F5F0E8]',  border: 'border-[#C9A84C]/20', label: 'Custom'  },
  NOTE:       { icon: FileText,  bg: 'bg-yellow-50',  border: 'border-yellow-200', label: 'Note'       },
}

const ALL_TYPES: ItemType[] = ['FLIGHT', 'HOTEL', 'ACTIVITY', 'RESTAURANT', 'TRANSPORT', 'TOUR', 'CUSTOM']

function fmt(n: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

interface AddItemForm {
  type: ItemType
  title: string
  description: string
  location: string
  startTime: string
  endTime: string
  cost: string
  bookingRef: string
}

export default function ItineraryBuilderPage() {
  const params  = useParams()
  const router  = useRouter()
  const tripId  = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''

  const [trip,    setTrip]    = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)

  // AI generation
  const [showAI,      setShowAI]      = useState(false)
  const [aiPrompt,    setAiPrompt]    = useState('')
  const [generating,  setGenerating]  = useState(false)

  // Add item
  const [addingToDayId, setAddingToDayId] = useState<string | null>(null)
  const [addForm, setAddForm] = useState<AddItemForm>({
    type: 'ACTIVITY', title: '', description: '', location: '',
    startTime: '', endTime: '', cost: '', bookingRef: '',
  })
  const [savingItem, setSavingItem] = useState(false)

  // Proposal preview
  const [showProposal, setShowProposal]   = useState(false)
  const [proposalHtml, setProposalHtml]   = useState('')
  const [loadingProposal, setLoadingProposal] = useState(false)

  // Send modal
  const [showSend, setShowSend]   = useState(false)
  const [sendEmail, setSendEmail] = useState('')
  const [sendMsg,   setSendMsg]   = useState('')
  const [sending,   setSending]   = useState(false)
  const [sent,      setSent]      = useState(false)

  // Edit title inline
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft,   setTitleDraft]   = useState('')

  async function loadTrip() {
    setLoading(true)
    const res  = await fetch(`/api/admin/trips/${tripId}`)
    const data = await res.json()
    if (data.trip) {
      setTrip(data.trip)
      setTitleDraft(data.trip.title)
      if (data.trip.user?.email) setSendEmail(data.trip.user.email)
    }
    setLoading(false)
  }

  useEffect(() => { if (tripId) void loadTrip() }, [tripId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveTitle() {
    if (!titleDraft.trim()) return
    await fetch(`/api/admin/trips/${tripId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titleDraft }),
    })
    setTrip(t => t ? { ...t, title: titleDraft } : t)
    setEditingTitle(false)
  }

  async function generateAI() {
    if (!aiPrompt.trim()) return
    setGenerating(true)
    await fetch(`/api/admin/trips/${tripId}/ai-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: aiPrompt }),
    })
    setGenerating(false)
    setShowAI(false)
    setAiPrompt('')
    void loadTrip()
  }

  async function addItem() {
    if (!addingToDayId || !addForm.title.trim()) return
    setSavingItem(true)
    await fetch(`/api/admin/trips/${tripId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...addForm,
        dayId: addingToDayId,
        cost: addForm.cost ? parseFloat(addForm.cost) : null,
        currency: trip?.currency || 'GBP',
      }),
    })
    setSavingItem(false)
    setAddingToDayId(null)
    setAddForm({ type: 'ACTIVITY', title: '', description: '', location: '', startTime: '', endTime: '', cost: '', bookingRef: '' })
    void loadTrip()
  }

  async function deleteItem(itemId: string) {
    await fetch(`/api/admin/trips/${tripId}/items/${itemId}`, { method: 'DELETE' })
    void loadTrip()
  }

  async function toggleConfirmed(item: TripItem) {
    await fetch(`/api/admin/trips/${tripId}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: !item.confirmed }),
    })
    void loadTrip()
  }

  async function loadProposal() {
    setLoadingProposal(true)
    setShowProposal(true)
    const res  = await fetch(`/api/admin/trips/${tripId}/proposal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trip?.title }),
    })
    const data = await res.json()
    setProposalHtml(data.content || '')
    setLoadingProposal(false)
  }

  async function sendItinerary() {
    if (!sendEmail) return
    setSending(true)
    const res  = await fetch(`/api/admin/trips/${tripId}/proposal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trip?.title, message: sendMsg }),
    })
    const data = await res.json()
    await fetch('/api/admin/tickets/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: sendEmail,
        subject: `Your Itinerary: ${trip?.title || trip?.destination} — Walz Travels`,
        html: data.content,
        type: 'ITINERARY',
      }),
    })
    setSending(false)
    setSent(true)
    setTimeout(() => { setSent(false); setShowSend(false) }, 3000)
  }

  // Budget summary
  const totalPlanned = trip?.days.reduce((sum, day) =>
    sum + day.items.reduce((s, i) => s + (i.cost ?? 0), 0), 0) ?? 0
  const budget = trip?.budget ?? 0
  const budgetPct = budget > 0 ? Math.min((totalPlanned / budget) * 100, 100) : 0
  const budgetColor = budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-400' : 'bg-green-500'

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
    </div>
  )
  if (!trip) return (
    <div className="text-center py-24">
      <p className="text-gray-400">Trip not found.</p>
    </div>
  )

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#C9A84C] bg-white'

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:border-gray-300 hover:bg-gray-50">
            <ArrowLeft className="w-4 h-4" />
          </button>
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                autoFocus
                className="h-9 px-3 border border-[#C9A84C] rounded-xl text-sm font-bold text-[#0B1F3A] focus:outline-none w-64"
              />
              <button onClick={saveTitle} className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#C9A84C] text-[#0B1F3A]">
                <Save className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => setEditingTitle(true)} className="flex items-center gap-1.5 group">
              <h1 className="text-xl font-bold text-[#0B1F3A]">{trip.title}</h1>
              <Edit2 className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#C9A84C] transition-colors" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowAI(true)}
            className="flex items-center gap-2 bg-[#0B1F3A] text-white font-semibold px-3 py-2 rounded-xl text-sm hover:bg-[#162d52] transition-colors">
            <Sparkles className="w-4 h-4 text-[#C9A84C]" /> Generate with Jade
          </button>
          <button onClick={loadProposal}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 font-semibold px-3 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors">
            <Eye className="w-4 h-4" /> Preview
          </button>
          <button onClick={() => setShowSend(true)}
            className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-3 py-2 rounded-xl text-sm hover:bg-[#b8943d] transition-colors">
            <Send className="w-4 h-4" /> Send to Client
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Sidebar */}
        <div className="xl:col-span-1 space-y-4">
          {/* Trip info */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Trip Details</h3>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
              <span>{trip.destination}</span>
            </div>
            {trip.startDate && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
                <span>
                  {new Date(trip.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  {trip.endDate && ` – ${new Date(trip.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                </span>
              </div>
            )}
            {trip.user && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-5 h-5 rounded-full bg-[#0B1F3A]/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-[#0B1F3A]">
                    {(trip.user.name || trip.user.email)[0].toUpperCase()}
                  </span>
                </div>
                <span className="truncate">{trip.user.name || trip.user.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                trip.status === 'ACTIVE' ? 'bg-blue-100 text-blue-700'
                : trip.status === 'COMPLETED' ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'}`}>
                {trip.status}
              </span>
              <span className="text-xs text-gray-400">{trip.days.length} days · {trip.days.reduce((s, d) => s + d.items.length, 0)} items</span>
            </div>
          </div>

          {/* Budget tracker */}
          {trip.budget && trip.budget > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Budget Tracker</h3>
              <div className="space-y-1.5 mb-3">
                {[
                  { label: 'Total Budget', val: fmt(budget, trip.currency), cls: 'text-[#0B1F3A] font-bold' },
                  { label: 'Planned', val: fmt(totalPlanned, trip.currency), cls: 'text-gray-600' },
                  { label: 'Remaining', val: fmt(Math.max(budget - totalPlanned, 0), trip.currency), cls: budget - totalPlanned < 0 ? 'text-red-500 font-bold' : 'text-green-600 font-semibold' },
                ].map(({ label, val, cls }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">{label}</span>
                    <span className={`text-sm ${cls}`}>{val}</span>
                  </div>
                ))}
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${budgetColor}`} style={{ width: `${budgetPct}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-right">{Math.round(budgetPct)}% used</p>
            </div>
          )}
        </div>

        {/* Main timeline */}
        <div className="xl:col-span-3 space-y-4">
          {trip.days.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
              <Sparkles className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="font-bold text-[#0B1F3A] mb-1">No days planned yet</p>
              <p className="text-gray-400 text-sm mb-4">Set start/end dates to create days, or generate with AI.</p>
              <button onClick={() => setShowAI(true)}
                className="inline-flex items-center gap-2 bg-[#0B1F3A] text-white font-semibold px-4 py-2 rounded-xl text-sm">
                <Sparkles className="w-4 h-4 text-[#C9A84C]" /> Generate with Jade
              </button>
            </div>
          ) : (
            trip.days.map(day => (
              <div key={day.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Day header */}
                <div className="bg-gradient-to-r from-[#0B1F3A] to-[#162d52] px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center justify-center flex-shrink-0">
                      <span className="text-[#0B1F3A] font-black text-xs">{day.dayNumber}</span>
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">{day.title || `Day ${day.dayNumber}`}</p>
                      {day.date && (
                        <p className="text-white/40 text-[11px]">
                          {new Date(day.date).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' })}
                        </p>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setAddingToDayId(day.id)}
                    className="flex items-center gap-1.5 text-white/70 hover:text-[#C9A84C] text-xs font-medium transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>

                {/* Items */}
                <div className="p-3 space-y-2">
                  {day.items.map(item => {
                    const cfg = ITEM_CONFIG[item.type] ?? ITEM_CONFIG.CUSTOM
                    const Icon = cfg.icon
                    return (
                      <div key={item.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border ${cfg.bg} ${cfg.border} group`}>
                        <div className="flex-shrink-0 mt-0.5">
                          <Icon className="w-4 h-4 text-[#0B1F3A]/60" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-[#0B1F3A] truncate">{item.title}</p>
                            {item.confirmed && <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                          </div>
                          {item.location && (
                            <p className="text-xs text-gray-400 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />{item.location}
                            </p>
                          )}
                          {item.description && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5">
                            {(item.startTime || item.endTime) && (
                              <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {item.startTime}{item.endTime ? ` – ${item.endTime}` : ''}
                              </span>
                            )}
                            {item.cost && item.cost > 0 && (
                              <span className="text-[11px] font-semibold text-[#C9A84C]">
                                {fmt(item.cost, item.currency || trip.currency)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={() => toggleConfirmed(item)}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${item.confirmed ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-500'}`}
                            title={item.confirmed ? 'Mark unconfirmed' : 'Mark confirmed'}>
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteItem(item.id)}
                            className="w-6 h-6 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {day.items.length === 0 && (
                    <div className="text-center py-6 text-gray-300">
                      <p className="text-sm">No items yet</p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* AI Generate modal */}
      {showAI && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-[#0B1F3A] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[#C9A84C]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#0B1F3A]">Generate with Jade</h2>
                <p className="text-sm text-gray-400">AI-powered itinerary planning</p>
              </div>
            </div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
              Client preferences & trip details
            </label>
            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder="e.g. Luxury honeymoon couple, love fine dining and culture, budget £8,000, first trip to Dubai…"
              rows={5}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] resize-none mb-6"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowAI(false)}
                className="flex-1 h-11 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={generateAI} disabled={generating || !aiPrompt.trim()}
                className="flex-1 h-11 bg-[#0B1F3A] text-white font-bold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Jade is planning…</> : <><Sparkles className="w-4 h-4" /> Generate Itinerary</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add item modal */}
      {addingToDayId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <h2 className="text-lg font-bold text-[#0B1F3A] mb-4">Add Item</h2>

            {/* Type selector */}
            <div className="flex flex-wrap gap-2 mb-4">
              {ALL_TYPES.map(t => {
                const cfg = ITEM_CONFIG[t]
                const Icon = cfg.icon
                return (
                  <button key={t} onClick={() => setAddForm(f => ({ ...f, type: t }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      addForm.type === t
                        ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                        : `${cfg.bg} ${cfg.border} text-gray-600 hover:border-gray-300`}`}>
                    <Icon className="w-3.5 h-3.5" /> {cfg.label}
                  </button>
                )
              })}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Title *</label>
                <input value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Check in at The Savoy"
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Location</label>
                <input value={addForm.location} onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Address or area"
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Description</label>
                <textarea value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional details…" rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] resize-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Start</label>
                  <input type="time" value={addForm.startTime} onChange={e => setAddForm(f => ({ ...f, startTime: e.target.value }))}
                    className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">End</label>
                  <input type="time" value={addForm.endTime} onChange={e => setAddForm(f => ({ ...f, endTime: e.target.value }))}
                    className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Cost</label>
                  <input type="number" value={addForm.cost} onChange={e => setAddForm(f => ({ ...f, cost: e.target.value }))}
                    placeholder="0"
                    className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C]"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setAddingToDayId(null)}
                className="flex-1 h-10 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
              <button onClick={addItem} disabled={savingItem || !addForm.title.trim()}
                className="flex-1 h-10 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl text-sm disabled:opacity-50">
                {savingItem ? 'Adding…' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proposal preview modal */}
      {showProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-[#0B1F3A]">Client Preview</h2>
              <button onClick={() => setShowProposal(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingProposal ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
                </div>
              ) : (
                <iframe srcDoc={proposalHtml} className="w-full h-[600px] rounded-xl border border-gray-100" title="Itinerary preview" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Send to client modal */}
      {showSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-lg font-bold text-[#0B1F3A] mb-6">Send Itinerary to Client</h2>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Client Email *</label>
                <input value={sendEmail} onChange={e => setSendEmail(e.target.value)}
                  placeholder="client@example.com" type="email"
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Personal Message (optional)</label>
                <textarea value={sendMsg} onChange={e => setSendMsg(e.target.value)}
                  placeholder="Hi! We've put together a beautiful itinerary for your upcoming trip…"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowSend(false)}
                className="flex-1 h-11 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
              <button onClick={sendItinerary} disabled={sending || !sendEmail || sent}
                className="flex-1 h-11 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {sent ? <><CheckCircle className="w-4 h-4" /> Sent!</>
                  : sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                  : <><Send className="w-4 h-4" /> Send Itinerary</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
