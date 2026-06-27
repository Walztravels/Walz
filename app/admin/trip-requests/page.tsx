'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface TripReq {
  id: string; referenceNumber: string; status: string;
  firstName: string | null; lastName: string | null; email: string | null;
  phone: string | null; destination: string | null; departureDate: string | null;
  numberOfTravellers: number | null; budgetRange: string | null; createdAt: string;
  submittedAt: string | null; itineraryId: string | null;
}

const STATUS: Record<string, { label: string; color: string; icon: string }> = {
  pending:   { label: 'Sent',      color: 'bg-blue-500/20 text-blue-400',     icon: '📨' },
  submitted: { label: 'Submitted', color: 'bg-amber-500/20 text-amber-400',   icon: '✅' },
  viewed:    { label: 'Viewed',    color: 'bg-purple-500/20 text-purple-400', icon: '👁' },
  converted: { label: 'Converted', color: 'bg-green-500/20 text-green-400',   icon: '✈️' },
  archived:  { label: 'Archived',  color: 'bg-white/5 text-white/20',         icon: '📁' },
}

export default function TripRequestsPage() {
  const [requests, setRequests] = useState<TripReq[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showSend, setShowSend] = useState(false)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (statusFilter !== 'all') p.set('status', statusFilter)
    if (search) p.set('search', search)
    const res = await fetch('/api/admin/trip-requests?' + p)
    const data = await res.json()
    setRequests(data.requests || [])
    setLoading(false)
  }, [statusFilter, search])

  useEffect(() => { void fetchRequests() }, [fetchRequests])

  const stats = {
    total:     requests.length,
    pending:   requests.filter(r => r.status === 'pending').length,
    submitted: requests.filter(r => r.status === 'submitted' || r.status === 'viewed').length,
    converted: requests.filter(r => r.status === 'converted').length,
  }

  return (
    <div className="min-h-screen bg-[#060f1e] text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">📋 Trip Requests</h1>
            <p className="text-white/40 text-sm mt-1">Send personalised intake forms to clients</p>
          </div>
          <button onClick={() => setShowSend(true)}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 transition">
            📨 Send Request Form
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Sent', value: stats.total,     icon: '📨' },
            { label: 'Awaiting',   value: stats.pending,   icon: '⏳' },
            { label: 'Submitted',  value: stats.submitted, icon: '✅' },
            { label: 'Converted',  value: stats.converted, icon: '✈️' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 border border-white/8 rounded-2xl p-5">
              <p className="text-2xl mb-1">{s.icon}</p>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-white/40 text-xs">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="search"
            placeholder="Search client, destination…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-amber-500/50"
          />
          <div className="flex gap-2 flex-wrap">
            {(['all', 'pending', 'submitted', 'viewed', 'converted'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition ${statusFilter === s ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
                {s === 'all' ? 'All' : STATUS[s]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 bg-white/5 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">📋</p>
            <p className="text-white/40 text-lg font-medium mb-2">No trip requests yet</p>
            <p className="text-white/20 text-sm mb-6">Send a form to a client to get started</p>
            <button onClick={() => setShowSend(true)} className="bg-amber-500 text-black font-bold px-6 py-3 rounded-xl hover:bg-amber-400 transition">
              📨 Send First Request Form
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => (
              <Link key={req.id} href={`/admin/trip-requests/${req.id}`}
                className="flex items-center gap-4 bg-white/5 border border-white/8 rounded-2xl p-4 hover:bg-white/8 hover:border-amber-500/20 transition group">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 text-lg">
                  {STATUS[req.status]?.icon ?? '📋'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm group-hover:text-amber-400 transition">
                    {req.firstName || req.lastName
                      ? `${req.firstName || ''} ${req.lastName || ''}`.trim()
                      : <span className="text-white/30">Unknown Client</span>}
                  </p>
                  <p className="text-white/40 text-xs">{req.email || req.phone || '—'} · {req.destination || 'No destination yet'}</p>
                </div>
                {req.status !== 'pending' && (
                  <div className="hidden md:flex items-center gap-5 text-xs text-white/40">
                    {req.departureDate && <span>✈️ {req.departureDate}</span>}
                    {req.numberOfTravellers && <span>👥 {req.numberOfTravellers}</span>}
                    {req.budgetRange && <span>💰 {req.budgetRange}</span>}
                  </div>
                )}
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS[req.status]?.color ?? ''}`}>
                    {STATUS[req.status]?.label ?? req.status}
                  </span>
                  <span className="text-white/20 text-xs">
                    {new Date(req.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                {req.status === 'submitted' && (
                  <div className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0 animate-pulse" />
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {showSend && (
        <SendModal
          onClose={() => setShowSend(false)}
          onSent={() => { setShowSend(false); void fetchRequests() }}
        />
      )}
    </div>
  )
}

interface SentResult { referenceNumber: string; formLink: string }

function SendModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [form, setForm] = useState({ clientName: '', clientEmail: '', clientPhone: '', message: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<SentResult | null>(null)
  const [err, setErr] = useState('')

  const handleSend = async () => {
    if (!form.clientEmail && !form.clientPhone) { setErr('Please enter email or phone'); return }
    setSending(true); setErr('')
    const res = await fetch('/api/admin/trip-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSending(false)
    if (data.success) setSent(data)
    else setErr(data.error || 'Failed to send')
  }

  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-500/50'

  if (sent) return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0B1F3A] border border-white/10 rounded-2xl w-full max-w-md p-8 text-center">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✅</span>
        </div>
        <h2 className="text-white font-bold text-xl mb-2">Form Sent!</h2>
        <p className="text-white/50 text-sm mb-4">
          {form.clientName || 'Client'} will receive an email with their personalised trip request form.
        </p>
        <div className="bg-white/5 rounded-xl p-3 mb-3">
          <p className="text-white/30 text-xs mb-1">Reference</p>
          <p className="text-amber-400 font-mono font-bold text-sm">{sent.referenceNumber}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3 mb-6">
          <p className="text-white/30 text-xs mb-1">Share on WhatsApp</p>
          <p className="text-white/60 text-xs break-all">{sent.formLink}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigator.clipboard.writeText(sent.formLink)}
            className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold text-sm hover:bg-white/15 transition">
            📋 Copy Link
          </button>
          <button onClick={onSent} className="flex-1 py-3 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition">
            Done
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0B1F3A] border border-white/10 rounded-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-bold text-lg">Send Trip Request Form</h2>
            <p className="text-white/40 text-xs mt-0.5">Client fills it out → you build their itinerary</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white text-xl transition">×</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Client Name</label>
            <input
              value={form.clientName}
              onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
              placeholder="Amara Johnson"
              className={inp}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Email</label>
              <input
                type="email"
                value={form.clientEmail}
                onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))}
                placeholder="client@email.com"
                className={inp}
              />
            </div>
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">WhatsApp / Phone</label>
              <input
                value={form.clientPhone}
                onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))}
                placeholder="+44 7XXX XXXXXX"
                className={inp}
              />
            </div>
          </div>
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Personal Message (optional)</label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              rows={3}
              placeholder="Hi! I'd love to help you plan your dream trip…"
              className={`${inp} resize-none`}
            />
          </div>
        </div>
        {err && <p className="text-red-400 text-sm mt-3">{err}</p>}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 text-sm font-bold hover:text-white transition">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition flex items-center justify-center gap-2 disabled:opacity-50">
            {sending
              ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />Sending…</>
              : '📨 Send Form Link'}
          </button>
        </div>
      </div>
    </div>
  )
}
