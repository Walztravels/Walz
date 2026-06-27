'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Day {
  day: number
  title: string
  description: string
  activities: string[]
  meals: string
  accommodation: string
  notes: string
}

interface Flight {
  id: string
  from: string
  to: string
  airline: string
  flightNumber: string
  date: string
  time: string
  class: string
  pnr: string
  cost: number | null
  status: string
  notes: string
}

interface Hotel {
  id: string
  name: string
  location: string
  checkIn: string
  checkOut: string
  roomType: string
  nights: number
  cost: number | null
  status: string
  notes: string
}

interface PriceRow {
  id: string
  item: string
  description: string
  cost: number
}

interface ItineraryData {
  id: string
  referenceNumber: string
  title: string
  status: string
  type: string
  clientName: string
  clientEmail: string
  clientPhone: string | null
  destination: string
  startDate: string | null
  endDate: string | null
  duration: number | null
  numberOfTravellers: number
  tripType: string | null
  budget: number | null
  totalPrice: number | null
  deposit: number | null
  depositDue: string | null
  balanceDue: string | null
  currency: string
  notes: string | null
  overview: string | null
  days: string
  flights: string
  hotels: string
  inclusions: string
  exclusions: string
  terms: string | null
  priceBreakdown: string
  coverImage: string | null
  sentAt: string | null
  approvedAt: string | null
  viewCount: number
  createdAt: string
  updatedAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T } catch { return fallback }
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function fmtDate(d?: string | Date | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(d?: string | Date | null) {
  if (!d) return ''
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',  label: '📋 Overview' },
  { id: 'days',      label: '📅 Day by Day' },
  { id: 'bookings',  label: '✈️ Flights & Hotels' },
  { id: 'pricing',   label: '💰 Pricing' },
  { id: 'preview',   label: '👁 Preview & Send' },
]

const STATUS_LABELS: Record<string, string> = {
  draft:    '✏️ Draft',
  proposal: '📨 Sent to Client',
  approved: '✅ Approved',
  live:     '🗺️ Live Trip',
  archived: '📁 Archived',
}

const CURRENCY_SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', NGN: '₦', GHS: '₵', AED: 'AED ',
}

// ─── Shared input styles ──────────────────────────────────────────────────────

const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-500/50'
const ta  = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 resize-none'
const sel = 'w-full bg-[#0b1525] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50'

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ItineraryBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const [itin, setItin] = useState<ItineraryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/itineraries/${id}`)
    const data = await res.json()
    setItin(data.itinerary)
    setLoading(false)
  }, [id])

  useEffect(() => { void load() }, [load])

  const save = useCallback(async (updates: Record<string, unknown>) => {
    if (!id) return
    setSaving(true)
    const res = await fetch(`/api/admin/itineraries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    if (data.itinerary) {
      setItin(data.itinerary)
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2000)
    }
    setSaving(false)
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!itin) return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center text-white/40">
      Itinerary not found
    </div>
  )

  return (
    <div className="min-h-screen bg-[#060f1e] text-white">
      {/* Top bar */}
      <div className="border-b border-white/[0.08] px-6 py-4 sticky top-0 bg-[#060f1e] z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <a href="/admin/itinerary-planner" className="text-white/30 hover:text-white text-sm transition">
                ← Itineraries
              </a>
              <div>
                <h1 className="text-white font-bold text-base">{itin.title}</h1>
                <p className="text-white/30 text-xs">{itin.clientName} · {itin.destination} · {itin.referenceNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {saving && <span className="text-white/30 text-xs animate-pulse">Saving…</span>}
              {saveMsg && !saving && <span className="text-green-400 text-xs">✓ {saveMsg}</span>}
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                itin.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                itin.status === 'proposal' ? 'bg-blue-500/20 text-blue-400' :
                'bg-white/10 text-white/50'
              }`}>
                {STATUS_LABELS[itin.status] || itin.status}
              </span>
              {itin.status === 'draft' && (
                <button
                  onClick={() => setActiveTab('preview')}
                  className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-xl text-sm transition"
                >
                  Send to Client →
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  activeTab === t.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'overview'  && <OverviewTab  itin={itin} onSave={save} />}
        {activeTab === 'days'      && <DaysTab      itin={itin} onSave={save} />}
        {activeTab === 'bookings'  && <BookingsTab  itin={itin} onSave={save} />}
        {activeTab === 'pricing'   && <PricingTab   itin={itin} onSave={save} />}
        {activeTab === 'preview'   && (
          <PreviewTab
            itin={itin}
            onSave={save}
            onSent={() => setItin(prev => prev ? { ...prev, status: 'proposal', sentAt: new Date().toISOString() } : prev)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ itin, onSave }: { itin: ItineraryData; onSave: (u: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState({
    title: itin.title || '',
    destination: itin.destination || '',
    overview: itin.overview || '',
    coverImage: itin.coverImage || '',
    startDate: itin.startDate ? itin.startDate.split('T')[0] : '',
    endDate: itin.endDate ? itin.endDate.split('T')[0] : '',
    duration: itin.duration ?? '',
    numberOfTravellers: itin.numberOfTravellers || 1,
    tripType: itin.tripType || 'leisure',
    currency: itin.currency || 'GBP',
    budget: itin.budget ?? '',
    notes: itin.notes || '',
    terms: itin.terms || '',
    clientName: itin.clientName || '',
    clientEmail: itin.clientEmail || '',
    clientPhone: itin.clientPhone || '',
  })
  const [inclusions, setInclusions] = useState<string[]>(safeParse<string[]>(itin.inclusions, []))
  const [exclusions, setExclusions] = useState<string[]>(safeParse<string[]>(itin.exclusions, []))
  const [newInc, setNewInc] = useState('')
  const [newExc, setNewExc] = useState('')
  const [saving, setSaving] = useState(false)

  const upd = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    await onSave({
      ...form,
      duration: form.duration !== '' ? Number(form.duration) : null,
      budget: form.budget !== '' ? Number(form.budget) : null,
      numberOfTravellers: Number(form.numberOfTravellers),
      inclusions: JSON.stringify(inclusions),
      exclusions: JSON.stringify(exclusions),
      startDate: form.startDate || null,
      endDate: form.endDate || null,
    })
    setSaving(false)
  }

  const addInc = () => { if (newInc.trim()) { setInclusions(p => [...p, newInc.trim()]); setNewInc('') } }
  const addExc = () => { if (newExc.trim()) { setExclusions(p => [...p, newExc.trim()]); setNewExc('') } }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Client Info */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-4">Client Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Client Name</label>
            <input value={form.clientName} onChange={e => upd('clientName', e.target.value)} placeholder="Full name" className={inp} />
          </div>
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Email</label>
            <input type="email" value={form.clientEmail} onChange={e => upd('clientEmail', e.target.value)} placeholder="email@example.com" className={inp} />
          </div>
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Phone</label>
            <input value={form.clientPhone} onChange={e => upd('clientPhone', e.target.value)} placeholder="+44 7..." className={inp} />
          </div>
        </div>
      </div>

      {/* Trip Info */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-4">Trip Details</h2>
        <div className="space-y-4">
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Trip Title</label>
            <input value={form.title} onChange={e => upd('title', e.target.value)} placeholder="e.g. Dubai Luxury Escape 2026" className={inp} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Destination</label>
              <input value={form.destination} onChange={e => upd('destination', e.target.value)} placeholder="e.g. Dubai, UAE" className={inp} />
            </div>
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Cover Image URL</label>
              <input value={form.coverImage} onChange={e => upd('coverImage', e.target.value)} placeholder="https://..." className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Start Date</label>
              <input type="date" value={form.startDate} onChange={e => upd('startDate', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">End Date</label>
              <input type="date" value={form.endDate} onChange={e => upd('endDate', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Duration (days)</label>
              <input type="number" min="1" value={form.duration} onChange={e => upd('duration', e.target.value)} placeholder="7" className={inp} />
            </div>
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Travellers</label>
              <input type="number" min="1" value={form.numberOfTravellers} onChange={e => upd('numberOfTravellers', e.target.value)} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Trip Type</label>
              <select value={form.tripType} onChange={e => upd('tripType', e.target.value)} className={sel}>
                <option value="leisure">🏖️ Leisure</option>
                <option value="honeymoon">💍 Honeymoon</option>
                <option value="group">👥 Group</option>
                <option value="business">💼 Business</option>
                <option value="family">👨‍👩‍👧‍👦 Family</option>
                <option value="solo">🎒 Solo</option>
                <option value="visa_trip">🛂 Visa Trip</option>
              </select>
            </div>
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Currency</label>
              <select value={form.currency} onChange={e => upd('currency', e.target.value)} className={sel}>
                <option value="GBP">🇬🇧 GBP</option>
                <option value="NGN">🇳🇬 NGN</option>
                <option value="GHS">🇬🇭 GHS</option>
                <option value="USD">🇺🇸 USD</option>
                <option value="AED">🇦🇪 AED</option>
                <option value="EUR">🇪🇺 EUR</option>
              </select>
            </div>
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Budget</label>
              <input type="number" value={form.budget} onChange={e => upd('budget', e.target.value)} placeholder="Optional" className={inp} />
            </div>
          </div>
        </div>
      </div>

      {/* Overview */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-4">Trip Overview</h2>
        <textarea
          value={form.overview}
          onChange={e => upd('overview', e.target.value)}
          placeholder="Write an engaging overview of this trip for the client…"
          rows={4}
          className={ta}
        />
      </div>

      {/* Inclusions & Exclusions */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-4">Inclusions &amp; Exclusions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-green-400 text-xs font-bold uppercase tracking-wider block mb-3">✅ Included</label>
            <div className="space-y-2 mb-3">
              {inclusions.map((inc, i) => (
                <div key={i} className="flex items-center gap-2 bg-green-500/10 rounded-lg px-3 py-2">
                  <span className="text-green-400 text-xs flex-1">{inc}</span>
                  <button onClick={() => setInclusions(p => p.filter((_, j) => j !== i))} className="text-white/20 hover:text-red-400 text-xs transition">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newInc}
                onChange={e => setNewInc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addInc()}
                placeholder="Add inclusion…"
                className={inp + ' flex-1'}
              />
              <button onClick={addInc} className="bg-green-500/20 text-green-400 px-3 rounded-xl hover:bg-green-500/30 transition text-sm font-bold">+</button>
            </div>
          </div>
          <div>
            <label className="text-red-400 text-xs font-bold uppercase tracking-wider block mb-3">❌ Not Included</label>
            <div className="space-y-2 mb-3">
              {exclusions.map((exc, i) => (
                <div key={i} className="flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2">
                  <span className="text-red-300 text-xs flex-1">{exc}</span>
                  <button onClick={() => setExclusions(p => p.filter((_, j) => j !== i))} className="text-white/20 hover:text-red-400 text-xs transition">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newExc}
                onChange={e => setNewExc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addExc()}
                placeholder="Add exclusion…"
                className={inp + ' flex-1'}
              />
              <button onClick={addExc} className="bg-red-500/20 text-red-400 px-3 rounded-xl hover:bg-red-500/30 transition text-sm font-bold">+</button>
            </div>
          </div>
        </div>
      </div>

      {/* Terms & Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
          <h2 className="text-white font-bold text-base mb-4">Terms &amp; Conditions</h2>
          <textarea value={form.terms} onChange={e => upd('terms', e.target.value)} placeholder="Payment terms, cancellation policy, etc." rows={5} className={ta} />
        </div>
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
          <h2 className="text-white font-bold text-base mb-4">Internal Notes</h2>
          <textarea value={form.notes} onChange={e => upd('notes', e.target.value)} placeholder="Internal notes (not shown to client)…" rows={5} className={ta} />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3 rounded-xl transition disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving…</> : 'Save Overview'}
        </button>
      </div>
    </div>
  )
}

// ─── Days Tab ────────────────────────────────────────────────────────────────

function DaysTab({ itin, onSave }: { itin: ItineraryData; onSave: (u: Record<string, unknown>) => Promise<void> }) {
  const [days, setDays] = useState<Day[]>(safeParse<Day[]>(itin.days, []))
  const [expanded, setExpanded] = useState<number | null>(days.length > 0 ? 1 : null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState('')

  const updDay = (dayNum: number, field: keyof Day, value: unknown) => {
    setDays(prev => prev.map(d => d.day === dayNum ? { ...d, [field]: value } : d))
  }

  const addDay = () => {
    const next = days.length > 0 ? Math.max(...days.map(d => d.day)) + 1 : 1
    const newDay: Day = { day: next, title: `Day ${next}`, description: '', activities: [], meals: '', accommodation: '', notes: '' }
    setDays(prev => [...prev, newDay])
    setExpanded(next)
  }

  const removeDay = (dayNum: number) => {
    setDays(prev => prev.filter(d => d.day !== dayNum).map((d, i) => ({ ...d, day: i + 1 })))
  }

  const moveDay = (dayNum: number, dir: 'up' | 'down') => {
    setDays(prev => {
      const idx = prev.findIndex(d => d.day === dayNum)
      if (dir === 'up' && idx === 0) return prev
      if (dir === 'down' && idx === prev.length - 1) return prev
      const next = [...prev]
      const swap = dir === 'up' ? idx - 1 : idx + 1
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next.map((d, i) => ({ ...d, day: i + 1 }))
    })
  }

  const addActivity = (dayNum: number) => {
    setDays(prev => prev.map(d => d.day === dayNum ? { ...d, activities: [...d.activities, ''] } : d))
  }

  const updActivity = (dayNum: number, idx: number, val: string) => {
    setDays(prev => prev.map(d => {
      if (d.day !== dayNum) return d
      const acts = [...d.activities]
      acts[idx] = val
      return { ...d, activities: acts }
    }))
  }

  const removeActivity = (dayNum: number, idx: number) => {
    setDays(prev => prev.map(d => {
      if (d.day !== dayNum) return d
      return { ...d, activities: d.activities.filter((_, i) => i !== idx) }
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    await onSave({ days: JSON.stringify(days) })
    setSaving(false)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenMsg('Generating with Jade AI…')
    try {
      const res = await fetch('/api/admin/itineraries/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: itin.destination,
          duration: itin.duration || days.length || 7,
          tripType: itin.tripType,
          numberOfTravellers: itin.numberOfTravellers,
          budget: itin.budget,
          notes: itin.notes,
        }),
      })
      const data = await res.json()
      if (data.days && Array.isArray(data.days)) {
        setDays(data.days)
        setExpanded(1)
        setGenMsg('✓ Generated! Review and save.')
        // Also save overview/inclusions if returned
        const extras: Record<string, unknown> = { days: JSON.stringify(data.days) }
        if (data.overview) extras.overview = data.overview
        if (data.inclusions) extras.inclusions = JSON.stringify(data.inclusions)
        if (data.exclusions) extras.exclusions = JSON.stringify(data.exclusions)
        await onSave(extras)
      } else {
        setGenMsg('AI returned unexpected data. Try again.')
      }
    } catch {
      setGenMsg('Generation failed. Check your API key.')
    }
    setGenerating(false)
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-white font-bold text-lg">Day-by-Day Itinerary</h2>
        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 font-bold px-4 py-2 rounded-xl text-sm transition flex items-center gap-2 disabled:opacity-50"
          >
            {generating ? (
              <><div className="w-3.5 h-3.5 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" /> Generating…</>
            ) : '✨ Generate with Jade AI'}
          </button>
          <button
            onClick={addDay}
            className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold px-4 py-2 rounded-xl text-sm transition"
          >
            + Add Day
          </button>
        </div>
      </div>

      {genMsg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${genMsg.startsWith('✓') ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
          {genMsg}
        </div>
      )}

      {days.length === 0 ? (
        <div className="bg-white/5 rounded-2xl p-12 text-center">
          <p className="text-4xl mb-3">📅</p>
          <p className="text-white/40 mb-2">No days yet</p>
          <p className="text-white/20 text-sm mb-6">Add days manually or let Jade AI generate the full itinerary</p>
          <div className="flex gap-3 justify-center">
            <button onClick={addDay} className="bg-amber-500 text-black font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-amber-400 transition">+ Add Day</button>
            <button onClick={handleGenerate} disabled={generating} className="bg-purple-600/20 text-purple-300 border border-purple-500/30 font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-purple-600/30 transition">✨ Generate with AI</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map((day) => (
            <div key={day.day} className="bg-white/5 border border-white/[0.08] rounded-2xl overflow-hidden">
              {/* Day header */}
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/[0.03] transition"
                onClick={() => setExpanded(expanded === day.day ? null : day.day)}
              >
                <div className="bg-amber-500/20 rounded-xl px-3 py-2 text-center flex-shrink-0">
                  <p className="text-amber-400 text-[10px] font-bold uppercase">Day</p>
                  <p className="text-amber-400 text-lg font-bold">{day.day}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{day.title || `Day ${day.day}`}</p>
                  {day.accommodation && <p className="text-white/30 text-xs">🏨 {day.accommodation}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); moveDay(day.day, 'up') }} className="text-white/20 hover:text-white/60 text-xs px-1.5 py-1 rounded transition">↑</button>
                  <button onClick={(e) => { e.stopPropagation(); moveDay(day.day, 'down') }} className="text-white/20 hover:text-white/60 text-xs px-1.5 py-1 rounded transition">↓</button>
                  <button onClick={(e) => { e.stopPropagation(); removeDay(day.day) }} className="text-white/20 hover:text-red-400 text-xs px-1.5 py-1 rounded transition">✕</button>
                  <span className="text-white/20 text-xs">{expanded === day.day ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Day body */}
              {expanded === day.day && (
                <div className="border-t border-white/[0.08] p-5 space-y-4">
                  <div>
                    <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Day Title</label>
                    <input
                      value={day.title}
                      onChange={e => updDay(day.day, 'title', e.target.value)}
                      placeholder={`Day ${day.day} title`}
                      className={inp}
                    />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Description</label>
                    <textarea
                      value={day.description}
                      onChange={e => updDay(day.day, 'description', e.target.value)}
                      placeholder="What happens on this day…"
                      rows={3}
                      className={ta}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-white/40 text-xs font-bold uppercase tracking-wider">Activities</label>
                      <button onClick={() => addActivity(day.day)} className="text-amber-400 text-xs hover:text-amber-300 transition">+ Add</button>
                    </div>
                    <div className="space-y-2">
                      {day.activities.map((act, ai) => (
                        <div key={ai} className="flex gap-2">
                          <input
                            value={act}
                            onChange={e => updActivity(day.day, ai, e.target.value)}
                            placeholder={`Activity ${ai + 1}`}
                            className={inp + ' flex-1'}
                          />
                          <button onClick={() => removeActivity(day.day, ai)} className="text-white/20 hover:text-red-400 px-2 transition">✕</button>
                        </div>
                      ))}
                      {day.activities.length === 0 && (
                        <button onClick={() => addActivity(day.day)} className="w-full border border-dashed border-white/10 rounded-xl py-2.5 text-white/20 text-sm hover:border-amber-500/30 hover:text-amber-400/50 transition">
                          + Add activity
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Accommodation</label>
                      <input value={day.accommodation} onChange={e => updDay(day.day, 'accommodation', e.target.value)} placeholder="Hotel name" className={inp} />
                    </div>
                    <div>
                      <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Meals</label>
                      <input value={day.meals} onChange={e => updDay(day.day, 'meals', e.target.value)} placeholder="B/L/D" className={inp} />
                    </div>
                    <div>
                      <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Notes</label>
                      <input value={day.notes} onChange={e => updDay(day.day, 'notes', e.target.value)} placeholder="Tips, warnings…" className={inp} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button onClick={addDay} className="border border-white/10 text-white/50 px-5 py-2.5 rounded-xl text-sm hover:text-white hover:border-white/20 transition">
          + Add Day
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3 rounded-xl transition disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving…</> : 'Save Itinerary'}
        </button>
      </div>
    </div>
  )
}

// ─── Bookings Tab ─────────────────────────────────────────────────────────────

function BookingsTab({ itin, onSave }: { itin: ItineraryData; onSave: (u: Record<string, unknown>) => Promise<void> }) {
  const [flights, setFlights] = useState<Flight[]>(safeParse<Flight[]>(itin.flights, []))
  const [hotels, setHotels] = useState<Hotel[]>(safeParse<Hotel[]>(itin.hotels, []))
  const [saving, setSaving] = useState(false)

  const addFlight = () => {
    const f: Flight = {
      id: uid(), from: '', to: '', airline: '', flightNumber: '', date: '', time: '',
      class: 'Economy', pnr: '', cost: null, status: 'confirmed', notes: '',
    }
    setFlights(prev => [...prev, f])
  }

  const updFlight = (id: string, field: keyof Flight, value: unknown) => {
    setFlights(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f))
  }

  const removeFlight = (id: string) => setFlights(prev => prev.filter(f => f.id !== id))

  const addHotel = () => {
    const h: Hotel = {
      id: uid(), name: '', location: '', checkIn: '', checkOut: '',
      roomType: '', nights: 1, cost: null, status: 'confirmed', notes: '',
    }
    setHotels(prev => [...prev, h])
  }

  const updHotel = (id: string, field: keyof Hotel, value: unknown) => {
    setHotels(prev => prev.map(h => h.id === id ? { ...h, [field]: value } : h))
  }

  const removeHotel = (id: string) => setHotels(prev => prev.filter(h => h.id !== id))

  const handleSave = async () => {
    setSaving(true)
    await onSave({ flights: JSON.stringify(flights), hotels: JSON.stringify(hotels) })
    setSaving(false)
  }

  return (
    <div className="max-w-4xl space-y-8">
      {/* Flights */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-base">✈️ Flights</h2>
          <button onClick={addFlight} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold px-4 py-2 rounded-xl text-sm transition">
            + Add Flight
          </button>
        </div>

        {flights.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/20 text-sm mb-3">No flights added yet</p>
            <button onClick={addFlight} className="text-amber-400 text-sm hover:text-amber-300 transition">+ Add first flight</button>
          </div>
        ) : (
          <div className="space-y-4">
            {flights.map((f) => (
              <div key={f.id} className="bg-white/5 rounded-xl p-4 border border-white/[0.06]">
                <div className="flex justify-between items-start mb-3">
                  <p className="text-white/50 text-xs font-bold uppercase tracking-wider">Flight</p>
                  <button onClick={() => removeFlight(f.id)} className="text-white/20 hover:text-red-400 text-xs transition">✕ Remove</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">From</label>
                    <input value={f.from} onChange={e => updFlight(f.id, 'from', e.target.value)} placeholder="LHR" className={inp} />
                  </div>
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">To</label>
                    <input value={f.to} onChange={e => updFlight(f.id, 'to', e.target.value)} placeholder="DXB" className={inp} />
                  </div>
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Date</label>
                    <input type="date" value={f.date} onChange={e => updFlight(f.id, 'date', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Time</label>
                    <input type="time" value={f.time} onChange={e => updFlight(f.id, 'time', e.target.value)} className={inp} />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Airline</label>
                    <input value={f.airline} onChange={e => updFlight(f.id, 'airline', e.target.value)} placeholder="Emirates" className={inp} />
                  </div>
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Flight No.</label>
                    <input value={f.flightNumber} onChange={e => updFlight(f.id, 'flightNumber', e.target.value)} placeholder="EK001" className={inp} />
                  </div>
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Class</label>
                    <select value={f.class} onChange={e => updFlight(f.id, 'class', e.target.value)} className={sel}>
                      <option>Economy</option>
                      <option>Premium Economy</option>
                      <option>Business</option>
                      <option>First Class</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">PNR</label>
                    <input value={f.pnr} onChange={e => updFlight(f.id, 'pnr', e.target.value)} placeholder="ABC123" className={inp} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Cost ({CURRENCY_SYM[itin.currency]})</label>
                    <input type="number" value={f.cost ?? ''} onChange={e => updFlight(f.id, 'cost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} />
                  </div>
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Notes</label>
                    <input value={f.notes} onChange={e => updFlight(f.id, 'notes', e.target.value)} placeholder="Baggage, meals, etc." className={inp} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hotels */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-base">🏨 Accommodation</h2>
          <button onClick={addHotel} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold px-4 py-2 rounded-xl text-sm transition">
            + Add Hotel
          </button>
        </div>

        {hotels.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/20 text-sm mb-3">No hotels added yet</p>
            <button onClick={addHotel} className="text-amber-400 text-sm hover:text-amber-300 transition">+ Add first hotel</button>
          </div>
        ) : (
          <div className="space-y-4">
            {hotels.map((h) => (
              <div key={h.id} className="bg-white/5 rounded-xl p-4 border border-white/[0.06]">
                <div className="flex justify-between items-start mb-3">
                  <p className="text-white/50 text-xs font-bold uppercase tracking-wider">Hotel / Accommodation</p>
                  <button onClick={() => removeHotel(h.id)} className="text-white/20 hover:text-red-400 text-xs transition">✕ Remove</button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Hotel Name</label>
                    <input value={h.name} onChange={e => updHotel(h.id, 'name', e.target.value)} placeholder="Burj Al Arab" className={inp} />
                  </div>
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Location</label>
                    <input value={h.location} onChange={e => updHotel(h.id, 'location', e.target.value)} placeholder="Dubai, UAE" className={inp} />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Check-In</label>
                    <input type="date" value={h.checkIn} onChange={e => updHotel(h.id, 'checkIn', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Check-Out</label>
                    <input type="date" value={h.checkOut} onChange={e => updHotel(h.id, 'checkOut', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Nights</label>
                    <input type="number" min="1" value={h.nights} onChange={e => updHotel(h.id, 'nights', Number(e.target.value))} className={inp} />
                  </div>
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Room Type</label>
                    <input value={h.roomType} onChange={e => updHotel(h.id, 'roomType', e.target.value)} placeholder="Deluxe Suite" className={inp} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Cost ({CURRENCY_SYM[itin.currency]})</label>
                    <input type="number" value={h.cost ?? ''} onChange={e => updHotel(h.id, 'cost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} />
                  </div>
                  <div>
                    <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Notes</label>
                    <input value={h.notes} onChange={e => updHotel(h.id, 'notes', e.target.value)} placeholder="Breakfast included, pool view, etc." className={inp} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3 rounded-xl transition disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving…</> : 'Save Flights & Hotels'}
        </button>
      </div>
    </div>
  )
}

// ─── Pricing Tab ──────────────────────────────────────────────────────────────

function PricingTab({ itin, onSave }: { itin: ItineraryData; onSave: (u: Record<string, unknown>) => Promise<void> }) {
  const [rows, setRows] = useState<PriceRow[]>(safeParse<PriceRow[]>(itin.priceBreakdown, []))
  const [totalPrice, setTotalPrice] = useState<string>(itin.totalPrice != null ? String(itin.totalPrice) : '')
  const [deposit, setDeposit] = useState<string>(itin.deposit != null ? String(itin.deposit) : '')
  const [depositDue, setDepositDue] = useState(itin.depositDue ? itin.depositDue.split('T')[0] : '')
  const [balanceDue, setBalanceDue] = useState(itin.balanceDue ? itin.balanceDue.split('T')[0] : '')
  const [saving, setSaving] = useState(false)

  const sym = CURRENCY_SYM[itin.currency] || ''
  const autoTotal = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0)

  const addRow = () => {
    setRows(prev => [...prev, { id: uid(), item: '', description: '', cost: 0 }])
  }

  const updRow = (id: string, field: keyof PriceRow, value: unknown) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id))

  const useAutoTotal = () => setTotalPrice(String(autoTotal))

  const handleSave = async () => {
    setSaving(true)
    await onSave({
      priceBreakdown: JSON.stringify(rows),
      totalPrice: totalPrice !== '' ? Number(totalPrice) : null,
      deposit: deposit !== '' ? Number(deposit) : null,
      depositDue: depositDue || null,
      balanceDue: balanceDue || null,
    })
    setSaving(false)
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Price breakdown */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-base">Price Breakdown</h2>
          <button onClick={addRow} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold px-4 py-2 rounded-xl text-sm transition">
            + Add Item
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/20 text-sm mb-3">No pricing items yet</p>
            <button onClick={addRow} className="text-amber-400 text-sm hover:text-amber-300 transition">+ Add first item</button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-3 mb-2 px-1">
              <p className="col-span-4 text-white/30 text-xs font-bold uppercase tracking-wider">Item</p>
              <p className="col-span-5 text-white/30 text-xs font-bold uppercase tracking-wider">Description</p>
              <p className="col-span-2 text-white/30 text-xs font-bold uppercase tracking-wider text-right">Cost</p>
              <p className="col-span-1" />
            </div>
            {rows.map(r => (
              <div key={r.id} className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-4">
                  <input
                    value={r.item}
                    onChange={e => updRow(r.id, 'item', e.target.value)}
                    placeholder="e.g. Return Flights"
                    className={inp}
                  />
                </div>
                <div className="col-span-5">
                  <input
                    value={r.description}
                    onChange={e => updRow(r.id, 'description', e.target.value)}
                    placeholder="Per person, economy class…"
                    className={inp}
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    value={r.cost}
                    onChange={e => updRow(r.id, 'cost', Number(e.target.value))}
                    placeholder="0"
                    className={inp + ' text-right'}
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  <button onClick={() => removeRow(r.id)} className="text-white/20 hover:text-red-400 transition">✕</button>
                </div>
              </div>
            ))}
            <div className="border-t border-white/10 mt-3 pt-3 flex justify-between items-center">
              <button onClick={useAutoTotal} className="text-amber-400 text-xs hover:text-amber-300 transition">
                ← Use auto-total
              </button>
              <p className="text-white font-bold">
                Subtotal: {sym}{autoTotal.toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Total & Payments */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-5">Payment Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">
              Total Price ({sym})
            </label>
            <div className="relative">
              <input
                type="number"
                value={totalPrice}
                onChange={e => setTotalPrice(e.target.value)}
                placeholder={`Auto: ${autoTotal.toLocaleString()}`}
                className={inp}
              />
              {totalPrice === '' && autoTotal > 0 && (
                <button
                  onClick={useAutoTotal}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-400 text-xs hover:text-amber-300 transition px-1"
                >
                  Use {sym}{autoTotal.toLocaleString()}
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">
              Deposit Amount ({sym})
            </label>
            <input
              type="number"
              value={deposit}
              onChange={e => setDeposit(e.target.value)}
              placeholder="Optional"
              className={inp}
            />
          </div>
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Deposit Due Date</label>
            <input type="date" value={depositDue} onChange={e => setDepositDue(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Balance Due Date</label>
            <input type="date" value={balanceDue} onChange={e => setBalanceDue(e.target.value)} className={inp} />
          </div>
        </div>

        {(totalPrice || autoTotal > 0) && (
          <div className="mt-5 bg-[#0B1F3A] rounded-xl p-4 flex items-center justify-between">
            <span className="text-white font-bold">Total</span>
            <span className="text-amber-400 font-bold text-xl">
              {sym}{Number(totalPrice || autoTotal).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3 rounded-xl transition disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving…</> : 'Save Pricing'}
        </button>
      </div>
    </div>
  )
}

// ─── Preview Tab ──────────────────────────────────────────────────────────────

function PreviewTab({
  itin,
  onSave,
  onSent,
}: {
  itin: ItineraryData
  onSave: (u: Record<string, unknown>) => Promise<void>
  onSent: () => void
}) {
  const [sending, setSending] = useState(false)
  const [sentMsg, setSentMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)

  const sym = CURRENCY_SYM[itin.currency] || ''
  const days = safeParse<Day[]>(itin.days, [])
  const flights = safeParse<Flight[]>(itin.flights, [])
  const hotels = safeParse<Hotel[]>(itin.hotels, [])
  const inclusions = safeParse<string[]>(itin.inclusions, [])
  const exclusions = safeParse<string[]>(itin.exclusions, [])
  const priceBreakdown = safeParse<PriceRow[]>(itin.priceBreakdown, [])
  const publicUrl = `https://walztravels.com/itinerary/${itin.referenceNumber}`

  const handleSend = async () => {
    setSending(true)
    setSentMsg('')
    try {
      const res = await fetch(`/api/admin/itineraries/${itin.id}/send`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setSentMsg(data.emailSent ? `✅ Email sent to ${data.to}` : '✅ Status updated (email not sent)')
        onSent()
      } else {
        setSentMsg(`❌ Failed: ${data.error}`)
      }
    } catch {
      setSentMsg('❌ Network error')
    }
    setSending(false)
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleStatusChange = async (newStatus: string) => {
    setStatusSaving(true)
    await onSave({ status: newStatus })
    setStatusSaving(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left: Mini preview */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
        {/* Preview header */}
        <div className="bg-[#0B1F3A] px-5 py-3 flex items-center justify-between">
          <div className="bg-white/10 rounded-md px-3 py-1">
            <p className="text-white/50 text-[10px] font-mono truncate max-w-[180px]">walztravels.com/itinerary/{itin.referenceNumber}</p>
          </div>
          <span className="text-white/30 text-[10px]">Preview</span>
        </div>

        {/* Preview body */}
        <div className="overflow-y-auto max-h-[70vh]">
          {/* Hero */}
          {itin.coverImage ? (
            <div className="relative h-40">
              <img src={itin.coverImage} alt={itin.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-3 left-4">
                <h1 className="text-white text-lg font-bold">{itin.title}</h1>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-[#0B1F3A] to-[#1a3a6b] p-6">
              <h1 className="text-white text-lg font-bold mb-1">{itin.title}</h1>
              <p className="text-white/50 text-xs">📍 {itin.destination} · {itin.numberOfTravellers} traveller{itin.numberOfTravellers > 1 ? 's' : ''}</p>
              {itin.startDate && <p className="text-amber-400 text-xs mt-1">{fmtDate(itin.startDate)}{itin.endDate ? ` – ${fmtDate(itin.endDate)}` : ''}</p>}
            </div>
          )}

          <div className="p-5 space-y-4">
            {itin.overview && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-gray-600 text-xs leading-relaxed">{itin.overview}</p>
              </div>
            )}

            {days.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-800 text-sm mb-2">Day-by-Day ({days.length} days)</h3>
                <div className="space-y-2">
                  {days.slice(0, 3).map(d => (
                    <div key={d.day} className="bg-gray-50 rounded-lg p-3 border-l-2 border-amber-400">
                      <p className="text-amber-600 text-[10px] font-bold">DAY {d.day}</p>
                      <p className="text-gray-800 text-xs font-medium">{d.title}</p>
                    </div>
                  ))}
                  {days.length > 3 && (
                    <p className="text-gray-400 text-xs text-center">+ {days.length - 3} more days</p>
                  )}
                </div>
              </div>
            )}

            {flights.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-800 text-sm mb-2">✈️ Flights ({flights.length})</h3>
                {flights.slice(0, 2).map((f, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2 mb-1.5 flex justify-between">
                    <p className="text-gray-700 text-xs">{f.from || ''} → {f.to || ''} · {f.airline || ''}</p>
                    {f.date && <p className="text-gray-400 text-xs">{fmtDate(f.date)}</p>}
                  </div>
                ))}
              </div>
            )}

            {hotels.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-800 text-sm mb-2">🏨 Hotels ({hotels.length})</h3>
                {hotels.slice(0, 2).map((h, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2 mb-1.5">
                    <p className="text-gray-700 text-xs font-medium">{h.name || ''}</p>
                    <p className="text-gray-400 text-xs">{h.location || ''} · {h.nights} nights</p>
                  </div>
                ))}
              </div>
            )}

            {(inclusions.length > 0 || exclusions.length > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {inclusions.length > 0 && (
                  <div>
                    <p className="text-green-600 text-xs font-bold mb-1">✅ Included ({inclusions.length})</p>
                    {inclusions.slice(0, 3).map((inc, i) => <p key={i} className="text-gray-500 text-[10px] mb-0.5">✓ {inc}</p>)}
                  </div>
                )}
                {exclusions.length > 0 && (
                  <div>
                    <p className="text-red-500 text-xs font-bold mb-1">❌ Excluded ({exclusions.length})</p>
                    {exclusions.slice(0, 3).map((exc, i) => <p key={i} className="text-gray-500 text-[10px] mb-0.5">✗ {exc}</p>)}
                  </div>
                )}
              </div>
            )}

            {(priceBreakdown.length > 0 || itin.totalPrice) && (
              <div>
                <h3 className="font-bold text-gray-800 text-sm mb-2">💰 Pricing</h3>
                {priceBreakdown.map((r, i) => (
                  <div key={i} className="flex justify-between py-1 border-b border-gray-100">
                    <p className="text-gray-600 text-xs">{r.item}</p>
                    <p className="text-gray-800 text-xs font-medium">{sym}{Number(r.cost).toLocaleString()}</p>
                  </div>
                ))}
                {itin.totalPrice && (
                  <div className="bg-[#0B1F3A] rounded-lg p-3 flex justify-between mt-2">
                    <p className="text-white text-xs font-bold">Total</p>
                    <p className="text-amber-400 text-sm font-bold">{sym}{Number(itin.totalPrice).toLocaleString()}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="space-y-5">
        {/* Status management */}
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
          <h3 className="text-white font-bold text-sm mb-4">Status</h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <button
                key={val}
                onClick={() => handleStatusChange(val)}
                disabled={statusSaving || itin.status === val}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition ${
                  itin.status === val
                    ? 'bg-amber-500 text-black'
                    : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                } disabled:cursor-not-allowed`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Send to client */}
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
          <h3 className="text-white font-bold text-sm mb-1">Send to Client</h3>
          <p className="text-white/40 text-xs mb-4">
            Sends a beautifully formatted email to <span className="text-amber-400">{itin.clientEmail}</span> with the full itinerary.
          </p>

          {itin.sentAt && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-4">
              <p className="text-blue-400 text-xs">📨 Last sent {fmtDateTime(itin.sentAt)}</p>
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={sending}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {sending ? (
              <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Sending…</>
            ) : `📧 Send to ${itin.clientEmail}`}
          </button>

          {sentMsg && (
            <p className={`text-sm mt-3 text-center ${sentMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
              {sentMsg}
            </p>
          )}
        </div>

        {/* Client link */}
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
          <h3 className="text-white font-bold text-sm mb-3">Client Link</h3>
          <div className="bg-white/5 rounded-xl px-3 py-2.5 flex items-center gap-2 mb-3">
            <p className="text-white/50 text-xs font-mono flex-1 truncate">{publicUrl}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold py-2.5 rounded-xl text-sm transition"
            >
              {copied ? '✓ Copied!' : '📋 Copy Link'}
            </button>
            <a
              href={`/itinerary/${itin.referenceNumber}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold py-2.5 rounded-xl text-sm transition text-center"
            >
              👁 View Live
            </a>
          </div>
        </div>

        {/* Info */}
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5 space-y-3">
          <h3 className="text-white font-bold text-sm">Itinerary Info</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-white/30 text-xs">Reference</span>
              <span className="text-white text-xs font-mono">{itin.referenceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/30 text-xs">Client</span>
              <span className="text-white text-xs">{itin.clientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/30 text-xs">Destination</span>
              <span className="text-white text-xs">{itin.destination}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/30 text-xs">Views</span>
              <span className="text-white text-xs">{itin.viewCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/30 text-xs">Created</span>
              <span className="text-white text-xs">{fmtDate(itin.createdAt)}</span>
            </div>
            {itin.approvedAt && (
              <div className="flex justify-between">
                <span className="text-white/30 text-xs">Approved</span>
                <span className="text-green-400 text-xs">{fmtDateTime(itin.approvedAt)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
