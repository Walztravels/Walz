'use client'

import { useState, useEffect, useCallback } from 'react'

type Severity = 'all' | 'low' | 'medium' | 'high' | 'critical'

interface FeedItem {
  id: string
  destination: string
  alertType: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  detail: string
  publishedAt: string
  affectedClients: number
}

const SEVERITY_TABS: Severity[] = ['all', 'low', 'medium', 'high', 'critical']

function severityBadge(severity: string) {
  const map: Record<string, string> = {
    low: 'bg-blue-100 text-blue-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${map[severity] ?? 'bg-gray-100 text-gray-500'}`}>
      {severity}
    </span>
  )
}

function destinationFlag(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('uk') || lower.includes('united kingdom') || lower.includes('britain')) return '🇬🇧'
  if (lower.includes('usa') || lower.includes('united states') || lower.includes('america')) return '🇺🇸'
  if (lower.includes('canada')) return '🇨🇦'
  if (lower.includes('schengen') || lower.includes('europe')) return '🇪🇺'
  if (lower.includes('uae') || lower.includes('dubai')) return '🇦🇪'
  if (lower.includes('australia')) return '🇦🇺'
  if (lower.includes('nigeria')) return '🇳🇬'
  if (lower.includes('india')) return '🇮🇳'
  if (lower.includes('germany')) return '🇩🇪'
  if (lower.includes('france')) return '🇫🇷'
  return '🌍'
}

const INPUT = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white'

export default function EmbassyFeedPage() {
  const [feeds, setFeeds] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [severityFilter, setSeverityFilter] = useState<Severity>('all')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    destination: '',
    alertType: '',
    severity: 'medium',
    title: '',
    detail: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/embassy-feed?limit=50')
      const data = await res.json()
      setFeeds(data.feeds ?? data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function addAlert(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await fetch('/api/admin/intelligence/embassy-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setShowForm(false)
      setForm({ destination: '', alertType: '', severity: 'medium', title: '', detail: '' })
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  const filtered = severityFilter === 'all' ? feeds : feeds.filter(f => f.severity === severityFilter)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Embassy Intelligence Feed</h1>
          <p className="text-sm text-gray-500 mt-1">Live visa policy and processing alerts</p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 px-4 py-2 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#0d2345] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Alert
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#0B1F3A] mb-4">New Embassy Alert</h2>
          <form onSubmit={addAlert} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Destination</label>
                <input className={INPUT} placeholder="e.g. United Kingdom" value={form.destination} onChange={e => set('destination', e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Alert Type</label>
                <input className={INPUT} placeholder="e.g. Processing Delay" value={form.alertType} onChange={e => set('alertType', e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Severity</label>
              <select className={INPUT} value={form.severity} onChange={e => set('severity', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Title</label>
              <input className={INPUT} placeholder="Alert title" value={form.title} onChange={e => set('title', e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Detail</label>
              <textarea
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] resize-none"
                placeholder="Full alert detail..."
                value={form.detail}
                onChange={e => set('detail', e.target.value)}
                required
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="px-5 py-2 bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm rounded-lg hover:bg-[#b8943d] disabled:opacity-50 transition-colors">
                {submitting ? 'Posting…' : 'Post Alert'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Severity filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {SEVERITY_TABS.map(s => (
          <button
            key={s}
            onClick={() => setSeverityFilter(s)}
            className={`px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
              severityFilter === s ? 'border-[#C9A84C] text-[#0B1F3A]' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-100 shadow-sm">
          <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center text-sm text-gray-400 border border-gray-100 shadow-sm">
          No alerts found.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0 mt-0.5">{destinationFlag(item.destination)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {severityBadge(item.severity)}
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{item.alertType}</span>
                    <span className="text-xs font-semibold text-[#0B1F3A]">{item.destination}</span>
                  </div>
                  <h3 className="font-semibold text-[#0B1F3A] text-sm">{item.title}</h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.detail}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span>{new Date(item.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    {item.affectedClients > 0 && (
                      <span className="text-amber-600 font-semibold">{item.affectedClients} client{item.affectedClients !== 1 ? 's' : ''} affected</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
