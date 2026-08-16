'use client'

import { useEffect, useState } from 'react'

interface ScheduleItem {
  id: string; type: string; platform: string | null; status: string
  scheduledAt: string; retries: number; refId: string | null; refType: string | null
  publishedAt: string | null; failedAt: string | null; error: string | null
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-gray-700 text-gray-300',
  scheduled: 'bg-blue-900/60 text-blue-300',
  published: 'bg-green-900/60 text-green-300',
  failed:    'bg-red-900/60 text-red-300',
  cancelled: 'bg-gray-800 text-gray-500',
}

const TYPE_LABELS: Record<string, string> = {
  article:   'Article',
  social:    'Social',
  ad:        'Ad',
  email:     'Email',
  promotion: 'Promotion',
  update:    'Update',
}

function fmt(d: string) {
  const date = new Date(d)
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function SchedulePage() {
  const [items, setItems]         = useState<ScheduleItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType]     = useState('')
  const [showAdd, setShowAdd]     = useState(false)
  const [adding, setAdding]       = useState(false)
  const [error, setError]         = useState('')
  const [form, setForm] = useState({ type: 'article', platform: '', scheduledAt: '', refId: '', refType: '' })

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterType)   params.set('type',   filterType)
    const res = await fetch(`/api/admin/orbit/schedule?${params}`)
    const data = await res.json()
    if (data.items) setItems(data.items)
    setLoading(false)
  }

  useEffect(() => { load() }, [filterStatus, filterType])

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!form.scheduledAt) { setError('Scheduled date is required'); return }
    setAdding(true); setError('')
    try {
      const res = await fetch('/api/admin/orbit/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, scheduledAt: new Date(form.scheduledAt).toISOString() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowAdd(false); setForm({ type: 'article', platform: '', scheduledAt: '', refId: '', refType: '' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setAdding(false) }
  }

  async function cancelItem(id: string) {
    await fetch(`/api/admin/orbit/schedule/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    await load()
  }

  async function deleteItem(id: string) {
    await fetch(`/api/admin/orbit/schedule/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Schedule</h1>
          <p className="text-sm text-gray-400 mt-1">Publishing calendar across articles, social, ads, and email</p>
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          {showAdd ? 'Cancel' : '+ Schedule Item'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {showAdd && (
        <form onSubmit={addItem} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">New Scheduled Item</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Type</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Platform <span className="text-gray-600">(optional)</span></label>
              <input value={form.platform} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))}
                placeholder="e.g. twitter, instagram, blog"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Scheduled At <span className="text-red-400">*</span></label>
              <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(p => ({ ...p, scheduledAt: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Reference ID <span className="text-gray-600">(draft/brief ID, optional)</span></label>
              <input value={form.refId} onChange={e => setForm(p => ({ ...p, refId: e.target.value }))}
                placeholder="e.g. clXXXX"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <button type="submit" disabled={adding}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            {adding ? 'Scheduling…' : 'Add to Schedule'}
          </button>
        </form>
      )}

      <div className="flex gap-3">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <p className="text-gray-400 text-sm">No scheduled items yet.</p>
          <p className="text-gray-600 text-xs">Schedule articles, social posts, and email campaigns here.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Scheduled</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Retries</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-white text-xs font-medium">{TYPE_LABELS[item.type] ?? item.type}</span>
                    {item.refId && <span className="text-gray-600 text-xs ml-2 font-mono">{item.refId.slice(0, 8)}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{item.platform ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-300">{fmt(item.scheduledAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] ?? 'bg-gray-700 text-gray-300'}`}>
                      {item.status}
                    </span>
                    {item.error && (
                      <p className="text-xs text-red-400 mt-0.5 max-w-[200px] truncate" title={item.error}>{item.error}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500">{item.retries}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      {item.status === 'scheduled' || item.status === 'pending' ? (
                        <button onClick={() => cancelItem(item.id)}
                          className="text-xs text-yellow-500 hover:text-yellow-300 transition-colors">Cancel</button>
                      ) : null}
                      {item.status === 'cancelled' || item.status === 'failed' ? (
                        <button onClick={() => deleteItem(item.id)}
                          className="text-xs text-red-500 hover:text-red-300 transition-colors">Delete</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
