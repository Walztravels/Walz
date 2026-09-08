'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, ToggleLeft, ToggleRight, Loader2, Check, Briefcase, ArrowUp, ArrowDown, MapPin } from 'lucide-react'

interface JobOpening {
  id: string
  title: string
  type: string
  location: string
  description: string
  isActive: boolean
  sortOrder: number
}

const JOB_TYPES = ['Full-time', 'Contract', 'Part-time']
const EMPTY: Partial<JobOpening> = { title: '', type: 'Full-time', location: '', description: '', isActive: true, sortOrder: 0 }

export default function CareersAdminPage() {
  const [items,   setItems]   = useState<JobOpening[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [form,    setForm]    = useState<Partial<JobOpening>>(EMPTY)
  const [showAdd, setShowAdd] = useState(false)
  const [saving,  setSaving]  = useState<string | null>(null)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/careers')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setItems(data.items ?? [])
    } catch { setError('Network error — refresh to retry') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  function flash(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(''), 2500) }

  async function mutate(url: string, method: string, body?: unknown): Promise<boolean> {
    setError('')
    const res  = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? 'Request failed'); return false }
    return true
  }

  async function save(id: string) {
    setSaving(id)
    if (await mutate(`/api/admin/careers/${id}`, 'PATCH', form)) {
      setEditing(null); flash('Opening updated'); await load()
    }
    setSaving(null)
  }

  async function create() {
    setSaving('new')
    if (await mutate('/api/admin/careers', 'POST', form)) {
      setShowAdd(false); setForm(EMPTY); flash('Opening added'); await load()
    }
    setSaving(null)
  }

  async function toggle(item: JobOpening) {
    // Deactivation hides the role from /careers but preserves its history —
    // openings are never hard-deleted.
    if (item.isActive && !confirm(`Deactivate "${item.title}"? It will disappear from the public careers page (history is kept).`)) return
    if (await mutate(`/api/admin/careers/${item.id}`, 'PATCH', { isActive: !item.isActive })) {
      flash(item.isActive ? 'Opening deactivated' : 'Opening reactivated'); await load()
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...items]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    const order = next.map((it, i) => ({ id: it.id, sortOrder: i + 1 }))
    setItems(next.map((it, i) => ({ ...it, sortOrder: i + 1 })))   // optimistic
    if (await mutate('/api/admin/careers/reorder', 'POST', { order })) flash('Order updated')
    await load()
  }

  function EditForm({ onSave, isNew }: { onSave: () => void; isNew?: boolean }) {
    return (
      <div className="space-y-3 bg-[#F5F0E8] rounded-2xl p-4 mt-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="job-title" className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Job Title</label>
            <input id="job-title" value={form.title ?? ''}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label htmlFor="job-location" className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Location</label>
            <input id="job-location" value={form.location ?? ''}
              onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
              placeholder="e.g. Remote (UK/Nigeria)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="job-type" className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Employment Type</label>
            <select id="job-type" value={form.type ?? 'Full-time'}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] bg-white">
              {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.isActive ?? true}
                onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                className="rounded border-gray-300 text-[#C9A84C] focus:ring-[#C9A84C]" />
              Visible on public careers page
            </label>
          </div>
        </div>
        <div>
          <label htmlFor="job-description" className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Description</label>
          <textarea id="job-description" value={form.description ?? ''}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] resize-none" />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => { setEditing(null); setShowAdd(false); setForm(EMPTY) }}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!!saving}
            className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isNew ? 'Add Opening' : 'Save Changes'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Careers</h1>
          <p className="text-gray-400 text-sm mt-0.5">Manage job openings shown on the public careers page</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditing(null); setForm(EMPTY) }}
          className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm">
          <Plus className="w-4 h-4" /> Add Opening
        </button>
      </div>

      {error   && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 rounded-xl px-4 py-2.5">{success}</p>}

      {showAdd && <EditForm onSave={create} isNew />}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <Briefcase className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No job openings yet. Add your first opening above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.id} className={`bg-white rounded-2xl shadow-sm overflow-hidden ${!item.isActive ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-3 p-4">
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button onClick={() => void move(index, -1)} disabled={index === 0}
                    aria-label={`Move ${item.title} up`}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-[#0B1F3A] disabled:opacity-30">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => void move(index, 1)} disabled={index === items.length - 1}
                    aria-label={`Move ${item.title} down`}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-[#0B1F3A] disabled:opacity-30">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-[#0B1F3A] text-sm">{item.title}</p>
                    <span className="text-[10px] font-semibold text-[#C9A84C] bg-[#C9A84C]/10 px-2 py-0.5 rounded-full">{item.type}</span>
                    {!item.isActive && (
                      <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{item.location} · order {item.sortOrder}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{item.description}</p>
                </div>
                <button onClick={() => void toggle(item)} className="flex-shrink-0"
                  aria-label={item.isActive ? `Deactivate ${item.title}` : `Activate ${item.title}`}
                  title={item.isActive ? 'Active — click to deactivate' : 'Inactive — click to activate'}>
                  {item.isActive
                    ? <ToggleRight className="w-6 h-6 text-green-500" />
                    : <ToggleLeft  className="w-6 h-6 text-gray-300" />}
                </button>
                <button
                  onClick={() => { setEditing(item.id); setForm({ ...item }); setShowAdd(false) }}
                  aria-label={`Edit ${item.title}`}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#0B1F3A]">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
              {editing === item.id && (
                <div className="px-4 pb-4">
                  <EditForm onSave={() => save(item.id)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
