'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronUp,
  Globe, Calendar, Clock, DollarSign, Share2, Loader2,
  Sparkles, Send, Map, ArrowLeft, Settings, BookmarkCheck,
  Plane, Hotel, ActivitySquare, Utensils, Car, FileText, Tag,
  GripVertical, MoreHorizontal, ChevronRight, Lock, Unlock, Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────
type TripItem = {
  id: string; tripId: string; dayId: string | null; type: string; title: string
  description: string | null; location: string | null; startTime: string | null
  endTime: string | null; cost: number | null; currency: string; confirmed: boolean
  order: number; imageUrl: string | null; bookingRef: string | null
}
type TripDay = { id: string; dayNumber: number; title: string | null; date: string | null; items: TripItem[] }
type Trip = {
  id: string; title: string; destination: string; status: string
  startDate: string | null; endDate: string | null; coverImage: string | null
  budget: number | null; currency: string; notes: string | null; isPublic: boolean
  days: TripDay[]; items: TripItem[]
  collaborators: { id: string; email: string; role: string; status: string }[]
  proposals: { id: string; title: string; status: string; totalCost: number | null; currency: string }[]
}
type Message = { role: 'user' | 'assistant'; content: string }

// ── Item type icons ────────────────────────────────────────────────────────
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

// ── Panel tabs ────────────────────────────────────────────────────────────
type PanelTab = 'itinerary' | 'jade' | 'settings'

// ── Main ───────────────────────────────────────────────────────────────────
export default function TripPlannerPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params)
  const { data: session, status } = useSession()
  const router = useRouter()

  const [trip, setTrip]         = useState<Trip | null>(null)
  const [loading, setLoading]   = useState(true)
  const [panel, setPanel]       = useState<PanelTab>('itinerary')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Jade AI
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: `Hi! I'm Jade 👋 I can help you build out your itinerary. Tell me about your trip or ask me to generate a full day-by-day plan — I'll add it straight into your planner.` },
  ])
  const [prompt, setPrompt]     = useState('')
  const [jadeLoading, setJadeLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Share
  const [shareData, setShareData] = useState<{ isPublic: boolean; shareUrl: string | null }>({ isPublic: false, shareUrl: null })
  const [shareLoading, setShareLoading] = useState(false)

  // Add item
  const [addingToDay, setAddingToDay] = useState<string | null>(null)
  const [newItem, setNewItem] = useState({ title: '', type: 'ACTIVITY', startTime: '', location: '' })
  const [addingItem, setAddingItem] = useState(false)

  // Edit trip title inline
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/portal/login?redirect=/plan/library')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') fetchTrip()
  }, [status, tripId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchTrip() {
    setLoading(true)
    try {
      const res = await fetch(`/api/trips/${tripId}`)
      const data = await res.json()
      if (data.trip) {
        setTrip(data.trip)
        setTitleVal(data.trip.title)
        if (data.trip.days.length > 0) setSelectedDay(data.trip.days[0].id)
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Add day ──────────────────────────────────────────────────────────────
  async function addDay() {
    if (!trip) return
    const nextDayNumber = (trip.days[trip.days.length - 1]?.dayNumber ?? 0) + 1
    const res = await fetch(`/api/trips/${tripId}/days`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayNumber: nextDayNumber, title: `Day ${nextDayNumber}` }),
    })
    const data = await res.json()
    if (data.day) {
      setTrip(prev => prev ? { ...prev, days: [...prev.days, { ...data.day, items: [] }] } : prev)
      setSelectedDay(data.day.id)
    }
  }

  // ── Delete day ────────────────────────────────────────────────────────────
  async function deleteDay(dayId: string) {
    if (!confirm('Delete this day and all its activities?')) return
    await fetch(`/api/trips/${tripId}/days`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayId }),
    })
    setTrip(prev => {
      if (!prev) return prev
      const days = prev.days.filter(d => d.id !== dayId)
      return { ...prev, days }
    })
    if (selectedDay === dayId) setSelectedDay(trip?.days.find(d => d.id !== dayId)?.id ?? null)
  }

  // ── Add item ──────────────────────────────────────────────────────────────
  async function handleAddItem(dayId: string) {
    if (!newItem.title) return
    setAddingItem(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newItem, dayId }),
      })
      const data = await res.json()
      if (data.item) {
        setTrip(prev => {
          if (!prev) return prev
          return {
            ...prev,
            days: prev.days.map(d =>
              d.id === dayId ? { ...d, items: [...d.items, data.item] } : d
            ),
          }
        })
        setNewItem({ title: '', type: 'ACTIVITY', startTime: '', location: '' })
        setAddingToDay(null)
      }
    } finally {
      setAddingItem(false)
    }
  }

  // ── Toggle confirmed ──────────────────────────────────────────────────────
  async function toggleConfirmed(item: TripItem) {
    const res = await fetch(`/api/trips/${tripId}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, confirmed: !item.confirmed }),
    })
    const data = await res.json()
    if (data.item) {
      setTrip(prev => {
        if (!prev) return prev
        return {
          ...prev,
          days: prev.days.map(d => ({
            ...d,
            items: d.items.map(i => i.id === item.id ? { ...i, confirmed: !i.confirmed } : i),
          })),
        }
      })
    }
  }

  // ── Delete item ───────────────────────────────────────────────────────────
  async function deleteItem(item: TripItem) {
    await fetch(`/api/trips/${tripId}/items`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    })
    setTrip(prev => {
      if (!prev) return prev
      return {
        ...prev,
        days: prev.days.map(d => ({
          ...d,
          items: d.items.filter(i => i.id !== item.id),
        })),
      }
    })
  }

  // ── Save title ────────────────────────────────────────────────────────────
  async function saveTitle() {
    if (!titleVal.trim()) return
    await fetch(`/api/trips/${tripId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titleVal }),
    })
    setTrip(prev => prev ? { ...prev, title: titleVal } : prev)
    setEditingTitle(false)
  }

  // ── Jade AI ───────────────────────────────────────────────────────────────
  async function sendToJade() {
    if (!prompt.trim() || jadeLoading) return
    const userMsg = prompt.trim()
    setPrompt('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setJadeLoading(true)

    try {
      const isGenerateRequest = /generat|plan|itinerary|build|create.*day|day.*by.*day/i.test(userMsg)

      if (isGenerateRequest) {
        setMessages(prev => [...prev, { role: 'assistant', content: `On it! I'm generating your itinerary for ${trip?.destination ?? 'your destination'} — this will take a few seconds... ✨` }])

        const res = await fetch(`/api/trips/${tripId}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: userMsg, replaceAll: false }),
        })
        const data = await res.json()

        if (data.days) {
          await fetchTrip() // refresh full trip
          setPanel('itinerary')
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Done! I've added ${data.days.length} days to your itinerary. You'll see them in the Itinerary tab — feel free to tweak anything or ask me to adjust specific days.`,
          }])
        }
      } else {
        // Regular chat
        const res = await fetch('/api/chat/jade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              ...messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
              { role: 'user', content: `[Trip context: Planning a trip to ${trip?.destination}, titled "${trip?.title}"] ${userMsg}` },
            ],
          }),
        })
        const data = await res.json()
        setMessages(prev => [...prev, { role: 'assistant', content: data.content ?? 'Sorry, I couldn\'t respond right now.' }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Try again?' }])
    } finally {
      setJadeLoading(false)
    }
  }

  // ── Share toggle ──────────────────────────────────────────────────────────
  async function toggleShare() {
    setShareLoading(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !shareData.isPublic }),
      })
      const data = await res.json()
      setShareData({ isPublic: data.isPublic, shareUrl: data.shareUrl })
    } finally {
      setShareLoading(false)
    }
  }

  useEffect(() => {
    if (trip) {
      fetch(`/api/trips/${tripId}/share`).then(r => r.json()).then(data => {
        setShareData({ isPublic: data.isPublic ?? false, shareUrl: data.shareUrl ?? null })
      }).catch(() => {})
    }
  }, [trip?.id])

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen bg-[#060F1E] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
      </div>
    )
  }
  if (!trip) {
    return (
      <div className="min-h-screen bg-[#060F1E] flex flex-col items-center justify-center gap-4">
        <p className="text-white/50">Trip not found.</p>
        <Link href="/plan/library" className="text-[#C9A84C] hover:underline text-sm">Back to My Trips</Link>
      </div>
    )
  }

  const currentDay = trip.days.find(d => d.id === selectedDay)
  const totalBudgetSpent = trip.days.flatMap(d => d.items).reduce((sum, i) => sum + (i.cost ?? 0), 0)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#060F1E] flex flex-col">

      {/* ── Top bar ── */}
      <div className="bg-[#0B1F3A] border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/plan/library" className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>

          {editingTitle ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                autoFocus
                value={titleVal}
                onChange={e => setTitleVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm font-semibold focus:outline-none focus:border-[#C9A84C]/50 min-w-0 flex-1"
              />
              <button onClick={saveTitle} className="p-1.5 rounded-lg bg-[#C9A84C] text-[#0B1F3A]"><Check className="w-4 h-4" /></button>
              <button onClick={() => setEditingTitle(false)} className="p-1.5 rounded-lg bg-white/10 text-white/50"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left group"
            >
              <span className="font-bold text-white text-base truncate">{trip.title}</span>
              <Edit2 className="w-3.5 h-3.5 text-white/20 group-hover:text-white/60 flex-shrink-0" />
            </button>
          )}

          <div className="flex items-center gap-1.5 text-xs text-white/40 flex-shrink-0">
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{trip.destination}</span>
          </div>

          {/* Insure Trip button — pre-fills dates on /insurance */}
          {(trip.startDate || trip.endDate) && (() => {
            const params = new URLSearchParams()
            if (trip.startDate) params.set('from', trip.startDate.split('T')[0])
            if (trip.endDate)   params.set('to',   trip.endDate.split('T')[0])
            return (
              <Link
                href={`/insurance?${params.toString()}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0 bg-[#C9A84C]/15 border border-[#C9A84C]/30 text-[#C9A84C] hover:bg-[#C9A84C]/25"
                title="Get travel insurance for this trip"
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Insure Trip</span>
              </Link>
            )
          })()}

          {/* Share button */}
          <button
            onClick={toggleShare}
            disabled={shareLoading}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0',
              shareData.isPublic
                ? 'bg-[#C9A84C]/20 border border-[#C9A84C]/30 text-[#C9A84C]'
                : 'bg-white/8 border border-white/10 text-white/50 hover:text-white'
            )}
          >
            {shareLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : shareData.isPublic ? <Unlock className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{shareData.isPublic ? 'Shared' : 'Share'}</span>
          </button>
        </div>

        {/* Share URL banner */}
        {shareData.isPublic && shareData.shareUrl && (
          <div className="px-4 pb-3 flex items-center gap-2">
            <div className="flex-1 bg-black/20 rounded-lg px-3 py-1.5 text-xs text-white/50 truncate">{shareData.shareUrl}</div>
            <button
              onClick={() => navigator.clipboard.writeText(shareData.shareUrl!)}
              className="text-xs text-[#C9A84C] hover:underline flex-shrink-0"
            >Copy</button>
          </div>
        )}
      </div>

      {/* ── Three-panel layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT PANEL — Day list ───────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col w-52 xl:w-60 bg-[#0B1F3A] border-r border-white/8 flex-shrink-0 overflow-y-auto">
          <div className="p-3 border-b border-white/8">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider px-1 mb-2">Days</p>
            <div className="space-y-1">
              {trip.days.map(day => (
                <button
                  key={day.id}
                  onClick={() => setSelectedDay(day.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all group flex items-center justify-between',
                    selectedDay === day.id
                      ? 'bg-[#C9A84C] text-[#0B1F3A]'
                      : 'text-white/60 hover:bg-white/8 hover:text-white'
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-xs opacity-70">Day {day.dayNumber}</p>
                    <p className="font-medium text-sm truncate">{day.title ?? `Day ${day.dayNumber}`}</p>
                  </div>
                  <span className={cn('text-xs flex-shrink-0 ml-1', selectedDay === day.id ? 'text-[#0B1F3A]/60' : 'text-white/30')}>
                    {day.items.length}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={addDay}
              className="w-full flex items-center gap-2 px-3 py-2.5 mt-2 rounded-xl text-sm text-white/40 hover:bg-white/8 hover:text-white transition-all"
            >
              <Plus className="w-4 h-4" /> Add day
            </button>
          </div>

          {/* Trip stats */}
          <div className="p-3 mt-auto">
            <div className="bg-white/5 rounded-xl p-3 space-y-2">
              {trip.startDate && (
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(trip.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  {trip.endDate && <> — {new Date(trip.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-white/40">
                <Clock className="w-3.5 h-3.5" />
                {trip.days.length} days planned
              </div>
              {totalBudgetSpent > 0 && (
                <div className="flex items-center gap-2 text-xs text-[#C9A84C]">
                  <DollarSign className="w-3.5 h-3.5" />
                  {trip.currency} {totalBudgetSpent.toLocaleString()} estimated
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MIDDLE PANEL — Itinerary / Settings ──────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Panel tabs (mobile + desktop) */}
          <div className="flex gap-1 bg-[#0B1F3A] border-b border-white/8 px-3 py-2 flex-shrink-0">
            {([
              { id: 'itinerary', label: 'Itinerary', icon: Map },
              { id: 'jade',      label: 'Ask Jade',  icon: Sparkles },
              { id: 'settings',  label: 'Settings',  icon: Settings },
            ] as { id: PanelTab; label: string; icon: React.FC<{ className?: string }> }[]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setPanel(id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  panel === id ? 'bg-[#C9A84C] text-[#0B1F3A]' : 'text-white/40 hover:text-white'
                )}
              >
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}

            {/* Mobile day selector */}
            <div className="ml-auto lg:hidden">
              <select
                value={selectedDay ?? ''}
                onChange={e => setSelectedDay(e.target.value)}
                className="bg-white/8 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
              >
                {trip.days.map(d => (
                  <option key={d.id} value={d.id}>Day {d.dayNumber}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Itinerary panel ── */}
          {panel === 'itinerary' && (
            <div className="flex-1 overflow-y-auto p-4">
              {trip.days.length === 0 ? (
                <div className="text-center py-16">
                  <Map className="w-10 h-10 text-white/10 mx-auto mb-3" />
                  <p className="text-white/40 text-sm mb-4">No days planned yet</p>
                  <div className="flex items-center gap-3 justify-center flex-wrap">
                    <button onClick={addDay} className="flex items-center gap-2 px-4 py-2.5 bg-[#C9A84C] text-[#0B1F3A] rounded-xl font-bold text-sm hover:bg-[#dbb95a]">
                      <Plus className="w-4 h-4" /> Add first day
                    </button>
                    <button onClick={() => setPanel('jade')} className="flex items-center gap-2 px-4 py-2.5 bg-purple-600/20 border border-purple-500/20 text-purple-300 rounded-xl font-semibold text-sm hover:bg-purple-600/30">
                      <Sparkles className="w-4 h-4" /> Ask Jade to plan it
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Mobile — show all days; Desktop — show selected */}
                  {(selectedDay ? [trip.days.find(d => d.id === selectedDay)!].filter(Boolean) : trip.days).map(day => (
                    <DaySection
                      key={day.id}
                      day={day}
                      isSelected={selectedDay === day.id}
                      onSelect={() => setSelectedDay(day.id)}
                      onDelete={() => deleteDay(day.id)}
                      onAddItem={() => setAddingToDay(addingToDay === day.id ? null : day.id)}
                      addingToDay={addingToDay === day.id}
                      newItem={newItem}
                      setNewItem={setNewItem}
                      onSubmitItem={() => handleAddItem(day.id)}
                      addingItem={addingItem}
                      onToggleConfirmed={toggleConfirmed}
                      onDeleteItem={deleteItem}
                    />
                  ))}

                  {/* Show all days button on desktop */}
                  {selectedDay && trip.days.length > 1 && (
                    <button
                      onClick={() => setSelectedDay(null)}
                      className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1 transition-all"
                    >
                      <ChevronDown className="w-3.5 h-3.5" /> Show all days
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Jade AI chat panel ── */}
          {panel === 'jade' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : '')}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-[#C9A84C]/20 border border-[#C9A84C]/30 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-4 h-4 text-[#C9A84C]" />
                      </div>
                    )}
                    <div className={cn(
                      'max-w-[75%] rounded-2xl px-4 py-3 text-sm',
                      msg.role === 'user'
                        ? 'bg-[#C9A84C]/20 text-white rounded-tr-sm'
                        : 'bg-[#0B1F3A] text-white/80 rounded-tl-sm'
                    )}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {jadeLoading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#C9A84C]/20 border border-[#C9A84C]/30 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-[#C9A84C] animate-pulse" />
                    </div>
                    <div className="bg-[#0B1F3A] rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1">
                        {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Quick suggestions */}
              <div className="px-4 pb-2 flex gap-2 flex-wrap">
                {[
                  'Generate a full itinerary',
                  `Best things to do in ${trip.destination.split(',')[0]}`,
                  'What visa do I need?',
                ].map(s => (
                  <button key={s} onClick={() => setPrompt(s)} className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-white/50 hover:text-white hover:border-white/20 transition-all">
                    {s}
                  </button>
                ))}
              </div>

              <div className="flex-shrink-0 p-4 border-t border-white/8">
                <div className="flex gap-2">
                  <textarea
                    rows={1}
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToJade() } }}
                    placeholder="Ask Jade anything about your trip..."
                    className="flex-1 bg-[#0B1F3A] border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#C9A84C]/50 resize-none"
                  />
                  <button
                    onClick={sendToJade}
                    disabled={!prompt.trim() || jadeLoading}
                    className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#C9A84C] text-[#0B1F3A] flex items-center justify-center hover:bg-[#dbb95a] disabled:opacity-40 disabled:cursor-not-allowed transition-all self-end"
                  >
                    {jadeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Settings panel ── */}
          {panel === 'settings' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <TripSettings trip={trip} tripId={tripId} onSaved={(updated) => setTrip(prev => prev ? { ...prev, ...updated } : prev)} />

              {/* ── Insurance CTA ── */}
              {(() => {
                const params = new URLSearchParams()
                if (trip.startDate) params.set('from', trip.startDate.split('T')[0])
                if (trip.endDate)   params.set('to',   trip.endDate.split('T')[0])
                return (
                  <div className="rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-[#C9A84C]" />
                      <span className="text-sm font-bold text-white">Trip Insurance</span>
                    </div>
                    <p className="text-xs text-white/50 mb-3">
                      Protect your trip with Walz Travel Shield — cover for medical emergencies, cancellations and baggage. From $45.
                    </p>
                    <Link
                      href={`/insurance?${params.toString()}`}
                      className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-xs hover:bg-[#d4b05a] transition-colors"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      Get a Free Quote
                    </Link>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── DaySection ─────────────────────────────────────────────────────────────
function DaySection({
  day, isSelected, onSelect, onDelete, onAddItem, addingToDay,
  newItem, setNewItem, onSubmitItem, addingItem, onToggleConfirmed, onDeleteItem,
}: {
  day: TripDay; isSelected: boolean; onSelect: () => void; onDelete: () => void
  onAddItem: () => void; addingToDay: boolean
  newItem: { title: string; type: string; startTime: string; location: string }
  setNewItem: (v: any) => void; onSubmitItem: () => void; addingItem: boolean
  onToggleConfirmed: (item: TripItem) => void; onDeleteItem: (item: TripItem) => void
}) {
  const confirmedCount = day.items.filter(i => i.confirmed).length

  return (
    <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 overflow-hidden">
      {/* Day header */}
      <div
        onClick={onSelect}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/3 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
            isSelected ? 'bg-[#C9A84C] text-[#0B1F3A]' : 'bg-white/10 text-white/60'
          )}>
            {day.dayNumber}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{day.title ?? `Day ${day.dayNumber}`}</p>
            {day.date && (
              <p className="text-xs text-white/30">
                {new Date(day.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {day.items.length > 0 && (
            <span className="text-xs text-white/30">{confirmedCount}/{day.items.length}</span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="divide-y divide-white/5">
        {day.items.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            onToggleConfirmed={() => onToggleConfirmed(item)}
            onDelete={() => onDeleteItem(item)}
          />
        ))}
      </div>

      {/* Add item */}
      {addingToDay ? (
        <div className="p-3 border-t border-white/8 bg-white/3">
          <div className="flex gap-2 mb-2">
            <select
              value={newItem.type}
              onChange={e => setNewItem({ ...newItem, type: e.target.value })}
              className="bg-[#0B1F3A] border border-white/15 rounded-lg px-2 py-2 text-xs text-white focus:outline-none"
            >
              {['ACTIVITY', 'FLIGHT', 'HOTEL', 'TOUR', 'RESTAURANT', 'TRANSPORT', 'VISA', 'NOTE', 'CUSTOM'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              autoFocus
              type="text"
              value={newItem.title}
              onChange={e => setNewItem({ ...newItem, title: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') onSubmitItem(); if (e.key === 'Escape') onAddItem() }}
              placeholder="Activity name"
              className="flex-1 bg-[#0B1F3A] border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#C9A84C]/50"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="time"
              value={newItem.startTime}
              onChange={e => setNewItem({ ...newItem, startTime: e.target.value })}
              className="bg-[#0B1F3A] border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:outline-none w-28"
            />
            <input
              type="text"
              value={newItem.location}
              onChange={e => setNewItem({ ...newItem, location: e.target.value })}
              placeholder="Location (optional)"
              className="flex-1 bg-[#0B1F3A] border border-white/15 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none"
            />
            <button onClick={onSubmitItem} disabled={!newItem.title || addingItem} className="px-3 py-2 bg-[#C9A84C] text-[#0B1F3A] rounded-lg text-xs font-bold hover:bg-[#dbb95a] disabled:opacity-40">
              {addingItem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
            </button>
            <button onClick={onAddItem} className="px-3 py-2 bg-white/8 text-white/50 rounded-lg text-xs hover:bg-white/12">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); onAddItem() }}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/30 hover:text-white/70 hover:bg-white/3 transition-all"
        >
          <Plus className="w-4 h-4" /> Add activity
        </button>
      )}
    </div>
  )
}

// ── ItemRow ────────────────────────────────────────────────────────────────
function ItemRow({ item, onToggleConfirmed, onDelete }: {
  item: TripItem; onToggleConfirmed: () => void; onDelete: () => void
}) {
  const Icon = ITEM_ICONS[item.type] ?? Tag
  const color = ITEM_COLORS[item.type] ?? 'text-white/40'

  return (
    <div className="group flex items-start gap-3 px-4 py-3 hover:bg-white/3 transition-all">
      <div className={cn('mt-0.5 flex-shrink-0', color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium leading-tight', item.confirmed ? 'text-white' : 'text-white/70')}>
          {item.title}
        </p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {item.startTime && <span className="text-xs text-white/30">{item.startTime}{item.endTime && ` — ${item.endTime}`}</span>}
          {item.location && <span className="text-xs text-white/30 truncate max-w-[150px]">{item.location}</span>}
          {item.cost && <span className="text-xs text-[#C9A84C]/70">{item.currency} {item.cost.toLocaleString()}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all">
        <button
          onClick={onToggleConfirmed}
          className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center transition-all',
            item.confirmed
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-white/8 text-white/20 hover:text-emerald-400 hover:bg-emerald-500/10'
          )}
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="w-6 h-6 rounded-full flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── TripSettings ───────────────────────────────────────────────────────────
function TripSettings({ trip, tripId, onSaved }: { trip: Trip; tripId: string; onSaved: (updated: Partial<Trip>) => void }) {
  const [form, setForm] = useState({
    destination: trip.destination,
    startDate:   trip.startDate ? trip.startDate.split('T')[0] : '',
    endDate:     trip.endDate   ? trip.endDate.split('T')[0]   : '',
    budget:      trip.budget?.toString() ?? '',
    currency:    trip.currency ?? 'GBP',
    notes:       trip.notes ?? '',
    status:      trip.status,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: form.destination,
          startDate:   form.startDate || null,
          endDate:     form.endDate   || null,
          budget:      form.budget    ? parseFloat(form.budget) : null,
          currency:    form.currency,
          notes:       form.notes    || null,
          status:      form.status,
        }),
      })
      const data = await res.json()
      if (data.trip) {
        onSaved(data.trip)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Destination</label>
        <input type="text" value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))}
          className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#C9A84C]/50" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Start date</label>
          <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
            className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#C9A84C]/50" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">End date</label>
          <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
            className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#C9A84C]/50" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Budget</label>
          <input type="number" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} placeholder="0"
            className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#C9A84C]/50" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Currency</label>
          <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
            className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#C9A84C]/50">
            {['GBP', 'USD', 'EUR', 'CAD', 'AED', 'GHS'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Status</label>
        <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
          className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#C9A84C]/50">
          {['DRAFT', 'PLANNING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Notes</label>
        <textarea rows={4} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          placeholder="Private notes about this trip..."
          className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#C9A84C]/50 resize-none" />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className={cn(
          'flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all',
          saved ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#dbb95a]',
          saving && 'opacity-60 cursor-not-allowed'
        )}
      >
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : saved ? <><Check className="w-4 h-4" />Saved!</> : 'Save changes'}
      </button>
    </div>
  )
}
