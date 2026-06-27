'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Itinerary {
  id: string
  referenceNumber: string
  title: string
  status: string
  type: string
  clientName: string
  clientEmail: string
  destination: string
  startDate: string | null
  endDate: string | null
  duration: number | null
  numberOfTravellers: number
  tripType: string | null
  totalPrice: number | null
  currency: string
  coverImage: string | null
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:    { label: 'Draft',          color: 'bg-gray-500/20 text-gray-400' },
  proposal: { label: 'Sent to Client', color: 'bg-blue-500/20 text-blue-400' },
  approved: { label: 'Approved',       color: 'bg-green-500/20 text-green-400' },
  live:     { label: 'Live Trip',      color: 'bg-amber-500/20 text-amber-400' },
  archived: { label: 'Archived',       color: 'bg-white/5 text-white/30' },
}

const CURRENCY_SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', NGN: '₦', GHS: '₵', AED: 'د.إ',
}

const QUICK_EXAMPLES = [
  'Dubai 7 nights honeymoon £8k Emirates business',
  'Canada family 10 days Toronto + Vancouver',
  'Paris long weekend romantic boutique hotel',
  'Maldives water villa 5 nights £12k',
]

export default function ItineraryPlannerPage() {
  const router = useRouter()
  const [itineraries, setItineraries] = useState<Itinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [quickPrompt, setQuickPrompt] = useState('')
  const [quickLoading, setQuickLoading] = useState(false)
  const [quickError, setQuickError] = useState('')

  const stats = {
    total:    itineraries.length,
    draft:    itineraries.filter(i => i.status === 'draft').length,
    sent:     itineraries.filter(i => i.status === 'proposal').length,
    approved: itineraries.filter(i => i.status === 'approved').length,
  }

  const fetchItineraries = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (search) params.set('search', search)
    const res = await fetch('/api/admin/itineraries?' + params)
    const data = await res.json()
    setItineraries(data.itineraries || [])
    setLoading(false)
  }, [search, statusFilter])

  useEffect(() => { void fetchItineraries() }, [fetchItineraries])

  const handleQuickCreate = async () => {
    if (!quickPrompt.trim() || quickLoading) return
    setQuickLoading(true)
    setQuickError('')
    try {
      const createRes = await fetch('/api/admin/itineraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: quickPrompt.substring(0, 60),
          clientName: 'New Client',
          clientEmail: 'pending@walztravels.com',
          destination: 'TBD',
          type: 'itinerary',
        }),
      })
      const createData = await createRes.json() as { itinerary?: { id: string } }
      if (!createData.itinerary?.id) throw new Error('Failed to create itinerary')

      const itineraryId = createData.itinerary.id
      await fetch('/api/admin/itineraries/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: quickPrompt, itineraryId, mode: 'generate' }),
      })

      router.push(`/admin/itinerary-planner/${itineraryId}`)
    } catch (err: unknown) {
      setQuickError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setQuickLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#060f1e] text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Itinerary Planner</h1>
            <p className="text-white/40 text-sm mt-1">Create and manage travel proposals &amp; itineraries</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 transition"
          >
            + New Itinerary
          </button>
        </div>

        {/* Jade Copilot Quick Start */}
        <div className="bg-gradient-to-r from-amber-500/10 to-amber-900/10 border border-amber-500/20 rounded-2xl p-5 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xl">✨</span>
            </div>
            <div>
              <p className="text-white font-bold text-sm">Create with Jade Copilot</p>
              <p className="text-white/40 text-xs">Describe any trip and Jade builds the full itinerary instantly</p>
            </div>
          </div>
          <div className="flex gap-2">
            <textarea
              value={quickPrompt}
              onChange={e => setQuickPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleQuickCreate()
                }
              }}
              placeholder="e.g. 7 nights Dubai honeymoon for 2, £8,000 budget, Emirates business class from London…"
              rows={2}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 resize-none"
            />
            <button
              onClick={() => void handleQuickCreate()}
              disabled={quickLoading || !quickPrompt.trim()}
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 rounded-xl transition disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
            >
              {quickLoading ? (
                <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Creating…</>
              ) : '✨ Create'}
            </button>
          </div>
          {quickError && <p className="text-red-400 text-xs mt-2">{quickError}</p>}
          <div className="flex flex-wrap gap-2 mt-3">
            {QUICK_EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => setQuickPrompt(ex)}
                className="text-xs text-amber-400/60 hover:text-amber-400 border border-amber-500/20 hover:border-amber-500/40 px-3 py-1 rounded-full transition"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total', value: stats.total, icon: '📋' },
            { label: 'Drafts', value: stats.draft, icon: '✏️' },
            { label: 'Sent', value: stats.sent, icon: '📨' },
            { label: 'Approved', value: stats.approved, icon: '✅' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
              <p className="text-2xl mb-1">{s.icon}</p>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-white/40 text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="search"
            placeholder="Search client, destination, ref…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-amber-500/50"
          />
          <div className="flex gap-2 flex-wrap">
            {(['all', 'draft', 'proposal', 'approved', 'live'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition ${statusFilter === s ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
              >
                {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-52 bg-white/5 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : itineraries.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">✈️</p>
            <p className="text-white/40 text-lg font-medium mb-2">No itineraries yet</p>
            <p className="text-white/20 text-sm mb-6">Create your first itinerary or proposal for a client</p>
            <button
              onClick={() => setShowCreate(true)}
              className="bg-amber-500 text-black font-bold px-6 py-3 rounded-xl hover:bg-amber-400 transition"
            >
              + Create First Itinerary
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {itineraries.map(itin => (
              <Link
                key={itin.id}
                href={`/admin/itinerary-planner/${itin.id}`}
                className="group bg-white/5 border border-white/[0.08] rounded-2xl overflow-hidden hover:bg-white/[0.08] hover:border-amber-500/30 transition block"
              >
                {itin.coverImage ? (
                  <div className="relative h-36 overflow-hidden">
                    <img
                      src={itin.coverImage}
                      alt={itin.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute bottom-3 left-4">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_CONFIG[itin.status]?.color ?? ''}`}>
                        {STATUS_CONFIG[itin.status]?.label}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="h-28 bg-gradient-to-br from-amber-500/20 to-amber-900/10 flex items-center justify-center relative">
                    <span className="text-4xl opacity-30">✈️</span>
                    <div className="absolute bottom-2 left-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_CONFIG[itin.status]?.color ?? ''}`}>
                        {STATUS_CONFIG[itin.status]?.label}
                      </span>
                    </div>
                  </div>
                )}
                <div className="p-5">
                  <h3 className="font-bold text-white text-sm mb-1 line-clamp-1 group-hover:text-amber-400 transition">
                    {itin.title}
                  </h3>
                  <p className="text-white/50 text-xs mb-3">{itin.clientName} · {itin.destination}</p>
                  <div className="flex items-center justify-between text-xs text-white/30">
                    <span>
                      {itin.startDate
                        ? new Date(itin.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'No date set'}
                    </span>
                    <span className="font-mono">{itin.referenceNumber}</span>
                  </div>
                  {itin.totalPrice && (
                    <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                      <span className="text-xs text-white/30">Total</span>
                      <span className="text-sm font-bold text-amber-400">
                        {CURRENCY_SYM[itin.currency] || ''}{Number(itin.totalPrice).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { window.location.href = `/admin/itinerary-planner/${id}` }}
        />
      )}
    </div>
  )
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({
    type: 'itinerary',
    title: '',
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    destination: '',
    startDate: '',
    endDate: '',
    numberOfTravellers: 1,
    tripType: 'leisure',
    currency: 'GBP',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const upd = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const handleCreate = async () => {
    if (!form.title || !form.clientName || !form.clientEmail || !form.destination) {
      setErr('Please fill in Title, Client Name, Email, and Destination.')
      return
    }
    setSaving(true)
    setErr('')
    const res = await fetch('/api/admin/itineraries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (data.itinerary?.id) onCreated(data.itinerary.id)
    else setErr(data.error || 'Failed to create')
  }

  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-500/50'
  const sel = 'w-full bg-[#0b1525] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50'

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0B1F3A] border border-white/10 rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-bold text-lg">New Itinerary</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white transition text-2xl leading-none">×</button>
        </div>

        {/* Type toggle */}
        <div className="flex bg-white/5 rounded-xl p-1 mb-5">
          {[{ v: 'itinerary', l: '📋 Itinerary' }, { v: 'smart_proposal', l: '✨ Smart Proposal' }].map(({ v, l }) => (
            <button
              key={v}
              onClick={() => upd('type', v)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${form.type === v ? 'bg-amber-500 text-black' : 'text-white/50 hover:text-white'}`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-white/50 text-xs font-bold uppercase tracking-wider block mb-1">Trip Title *</label>
            <input
              value={form.title}
              onChange={e => upd('title', e.target.value)}
              placeholder="e.g. Dubai Honeymoon 2026"
              className={inp}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/50 text-xs font-bold uppercase tracking-wider block mb-1">Client Name *</label>
              <input
                value={form.clientName}
                onChange={e => upd('clientName', e.target.value)}
                placeholder="Full name"
                className={inp}
              />
            </div>
            <div>
              <label className="text-white/50 text-xs font-bold uppercase tracking-wider block mb-1">Client Email *</label>
              <input
                type="email"
                value={form.clientEmail}
                onChange={e => upd('clientEmail', e.target.value)}
                placeholder="email@example.com"
                className={inp}
              />
            </div>
          </div>
          <div>
            <label className="text-white/50 text-xs font-bold uppercase tracking-wider block mb-1">Phone</label>
            <input
              value={form.clientPhone}
              onChange={e => upd('clientPhone', e.target.value)}
              placeholder="+44 7..."
              className={inp}
            />
          </div>
          <div>
            <label className="text-white/50 text-xs font-bold uppercase tracking-wider block mb-1">Destination *</label>
            <input
              value={form.destination}
              onChange={e => upd('destination', e.target.value)}
              placeholder="e.g. Dubai, UAE"
              className={inp}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-white/50 text-xs font-bold uppercase tracking-wider block mb-1">Start</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => upd('startDate', e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className="text-white/50 text-xs font-bold uppercase tracking-wider block mb-1">End</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => upd('endDate', e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className="text-white/50 text-xs font-bold uppercase tracking-wider block mb-1">Travellers</label>
              <input
                type="number"
                min="1"
                value={form.numberOfTravellers}
                onChange={e => upd('numberOfTravellers', Number(e.target.value))}
                className={inp}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/50 text-xs font-bold uppercase tracking-wider block mb-1">Trip Type</label>
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
              <label className="text-white/50 text-xs font-bold uppercase tracking-wider block mb-1">Currency</label>
              <select value={form.currency} onChange={e => upd('currency', e.target.value)} className={sel}>
                <option value="GBP">🇬🇧 GBP</option>
                <option value="NGN">🇳🇬 NGN</option>
                <option value="GHS">🇬🇭 GHS</option>
                <option value="USD">🇺🇸 USD</option>
                <option value="AED">🇦🇪 AED</option>
                <option value="EUR">🇪🇺 EUR</option>
              </select>
            </div>
          </div>
        </div>

        {err && <p className="text-red-400 text-sm mt-3">{err}</p>}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 text-sm font-bold hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Creating...
              </>
            ) : '✈️ Create Itinerary'}
          </button>
        </div>
      </div>
    </div>
  )
}
