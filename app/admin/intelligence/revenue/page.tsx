'use client'

import { useState, useEffect, useCallback } from 'react'

type Status = 'all' | 'open' | 'converted' | 'dismissed'
type Priority = 'high' | 'medium' | 'low'

interface Opportunity {
  id: string
  userId?: string | null
  type: string
  priority: Priority
  title: string
  description: string
  estimatedValue: number
  actionRequired: string
  deadline?: string | null
  status: 'open' | 'converted' | 'dismissed'
  createdAt: string
}

const STATUS_TABS: Status[] = ['all', 'open', 'converted', 'dismissed']

const PRIORITY_BADGE: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
}

const INPUT = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white'

export default function RevenueOpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<Status>('all')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [patching, setPatching] = useState<string | null>(null)
  const [form, setForm] = useState({
    type: '',
    priority: 'medium',
    title: '',
    description: '',
    estimatedValue: '',
    actionRequired: '',
    deadline: '',
    userId: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/revenue?status=open')
      const data = await res.json()
      setOpportunities(data.opportunities ?? data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function addOpportunity(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await fetch('/api/admin/intelligence/revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, estimatedValue: parseFloat(form.estimatedValue) || 0 }),
      })
      setShowForm(false)
      setForm({ type: '', priority: 'medium', title: '', description: '', estimatedValue: '', actionRequired: '', deadline: '', userId: '' })
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    setPatching(id)
    try {
      await fetch('/api/admin/intelligence/revenue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      setOpportunities(prev => prev.map(o => o.id === id ? { ...o, status: status as 'open' | 'converted' | 'dismissed' } : o))
    } finally {
      setPatching(null)
    }
  }

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  const filtered = statusFilter === 'all' ? opportunities : opportunities.filter(o => o.status === statusFilter)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Revenue Opportunities</h1>
          <p className="text-sm text-gray-500 mt-1">AI-detected upsell and re-engagement opportunities</p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 px-4 py-2 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#0d2345] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Opportunity
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#0B1F3A] mb-4">New Revenue Opportunity</h2>
          <form onSubmit={addOpportunity} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Type</label>
                <input className={INPUT} placeholder="e.g. upsell, re-engagement" value={form.type} onChange={e => set('type', e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Priority</label>
                <select className={INPUT} value={form.priority} onChange={e => set('priority', e.target.value)}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Title</label>
              <input className={INPUT} placeholder="Opportunity title" value={form.title} onChange={e => set('title', e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Description</label>
              <textarea rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] resize-none"
                placeholder="Describe the opportunity..." value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Estimated Value (£)</label>
                <input type="number" className={INPUT} placeholder="0.00" value={form.estimatedValue} onChange={e => set('estimatedValue', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Deadline</label>
                <input type="date" className={INPUT} value={form.deadline} onChange={e => set('deadline', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">User ID (optional)</label>
                <input className={INPUT} placeholder="clxyz..." value={form.userId} onChange={e => set('userId', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Action Required</label>
              <input className={INPUT} placeholder="e.g. Call client to discuss upgrade" value={form.actionRequired} onChange={e => set('actionRequired', e.target.value)} required />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="px-5 py-2 bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm rounded-lg hover:bg-[#b8943d] disabled:opacity-50 transition-colors">
                {submitting ? 'Saving…' : 'Save Opportunity'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {STATUS_TABS.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
              statusFilter === s ? 'border-[#C9A84C] text-[#0B1F3A]' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-100 shadow-sm">
          <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center text-sm text-gray-400 border border-gray-100 shadow-sm">No opportunities found.</div>
      ) : (
        <div className="space-y-4">
          {filtered.map((o) => (
            <div key={o.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{o.type}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${PRIORITY_BADGE[o.priority]}`}>
                    {o.priority}
                  </span>
                  {o.status !== 'open' && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                      o.status === 'converted' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {o.status}
                    </span>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold text-[#0B1F3A]">£{o.estimatedValue?.toLocaleString()}</div>
                  {o.deadline && (
                    <div className="text-xs text-gray-400">Due {new Date(o.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                  )}
                </div>
              </div>
              <h3 className="font-bold text-[#0B1F3A] mb-1">{o.title}</h3>
              {o.description && <p className="text-sm text-gray-500 mb-2">{o.description}</p>}
              {o.actionRequired && (
                <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg mb-3">
                  <span className="font-semibold">Action: </span>{o.actionRequired}
                </p>
              )}
              {o.status === 'open' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => updateStatus(o.id, 'converted')}
                    disabled={patching === o.id}
                    className="px-4 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    Convert
                  </button>
                  <button
                    onClick={() => updateStatus(o.id, 'dismissed')}
                    disabled={patching === o.id}
                    className="px-4 py-1.5 border border-gray-200 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
