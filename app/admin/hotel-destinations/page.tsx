'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, Loader2, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HotelDestination {
  id: string
  city: string
  country: string
  fromPrice: string
  tag: string
  imageUrl: string | null
  active: boolean
  sortOrder: number
  createdAt: string
}

const TAG_OPTIONS = ['MOST BOOKED', 'HOT DEAL', 'LUXURY', 'POPULAR', 'BEST VALUE', 'NEW']

const EMPTY_FORM = {
  city: '', country: '', fromPrice: '', tag: 'POPULAR',
  imageUrl: '', sortOrder: 0, active: true,
}

function DestinationForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: typeof EMPTY_FORM
  onSave: (data: typeof EMPTY_FORM) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState(initial)
  const set = (key: keyof typeof EMPTY_FORM, val: string | number | boolean) =>
    setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-lg bg-[#0d1e35] rounded-2xl border border-white/10 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold text-lg">
            {initial.city ? 'Edit Destination' : 'Add Destination'}
          </h2>
          <button onClick={onCancel} className="text-white/40 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">City *</label>
              <input value={form.city} onChange={e => set('city', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/25 focus:border-amber-500/40 focus:outline-none"
                placeholder="e.g. Dubai" />
            </div>
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">Country *</label>
              <input value={form.country} onChange={e => set('country', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/25 focus:border-amber-500/40 focus:outline-none"
                placeholder="e.g. UAE" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">From Price *</label>
              <input value={form.fromPrice} onChange={e => set('fromPrice', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/25 focus:border-amber-500/40 focus:outline-none"
                placeholder="e.g. £89/night" />
            </div>
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">Tag</label>
              <select value={form.tag} onChange={e => set('tag', e.target.value)}
                className="w-full bg-[#112240] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:border-amber-500/40 focus:outline-none">
                {TAG_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">Image URL</label>
            <input value={form.imageUrl} onChange={e => set('imageUrl', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/25 focus:border-amber-500/40 focus:outline-none"
              placeholder="https://images.unsplash.com/..." />
            {form.imageUrl && (
              <div className="mt-2 rounded-xl overflow-hidden aspect-video w-full max-h-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.imageUrl} alt="preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">Sort Order</label>
              <input type="number" value={form.sortOrder} onChange={e => set('sortOrder', parseInt(e.target.value) || 0)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:border-amber-500/40 focus:outline-none" />
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2.5">
                <button type="button" onClick={() => set('active', !form.active)}
                  className={cn('w-10 h-5 rounded-full transition-all relative flex-shrink-0',
                    form.active ? 'bg-green-500' : 'bg-white/20')}>
                  <div className={cn('w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all',
                    form.active ? 'left-5' : 'left-0.5')} />
                </button>
                <span className="text-white/60 text-sm">{form.active ? 'Active (visible)' : 'Hidden'}</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm text-white/60 border border-white/10 rounded-xl hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button onClick={() => onSave(form)} disabled={saving || !form.city || !form.country || !form.fromPrice}
            className="flex-1 px-4 py-2.5 text-sm font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {initial.city ? 'Save Changes' : 'Add Destination'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HotelDestinationsPage() {
  const [destinations, setDestinations] = useState<HotelDestination[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [showForm,     setShowForm]     = useState(false)
  const [editing,      setEditing]      = useState<HotelDestination | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState<string | null>(null)
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toast,        setToast]        = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3000)
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/hotel-destinations')
      const data = await res.json() as { destinations?: HotelDestination[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setDestinations(data.destinations ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load destinations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function handleSave(form: typeof EMPTY_FORM) {
    setSaving(true)
    try {
      const url    = editing ? `/api/admin/hotel-destinations/${editing.id}` : '/api/admin/hotel-destinations'
      const method = editing ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, imageUrl: form.imageUrl || null }),
      })
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error) }
      showToast(editing ? 'Destination updated' : 'Destination added')
      setShowForm(false); setEditing(null)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(id: string, active: boolean) {
    setDestinations(ds => ds.map(d => d.id === id ? { ...d, active } : d))
    try {
      await fetch(`/api/admin/hotel-destinations/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      showToast(active ? 'Destination set live' : 'Destination hidden')
    } catch {
      await load()
    }
  }

  async function handleDelete(id: string, city: string) {
    if (!confirm(`Delete "${city}"? This cannot be undone.`)) return
    setDeleting(id)
    try {
      await fetch(`/api/admin/hotel-destinations/${id}`, { method: 'DELETE' })
      showToast('Destination deleted')
      setDestinations(ds => ds.filter(d => d.id !== id))
    } catch {
      setError('Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  const formInitial = editing
    ? { city: editing.city, country: editing.country, fromPrice: editing.fromPrice,
        tag: editing.tag, imageUrl: editing.imageUrl ?? '', sortOrder: editing.sortOrder, active: editing.active }
    : EMPTY_FORM

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-semibold text-xl">Hotel Destinations</h1>
          <p className="text-white/40 text-sm mt-0.5">Manage top destinations shown on the hotels page</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16} /> Add Destination
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4 text-red-400 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#112240] rounded-2xl border border-white/5 overflow-hidden animate-pulse">
              <div className="aspect-video bg-white/5" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-white/10 rounded w-2/3" />
                <div className="h-3 bg-white/5 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      {!loading && destinations.length === 0 && (
        <div className="text-center py-20">
          <p className="text-white/30 text-lg">No destinations yet</p>
          <p className="text-white/20 text-sm mt-1">Add your first destination to get started</p>
        </div>
      )}

      {!loading && destinations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {destinations.map(dest => (
            <div key={dest.id}
              className={cn('bg-[#112240] rounded-2xl overflow-hidden border transition-all',
                dest.active ? 'border-white/5' : 'border-white/5 opacity-60')}>

              {/* Image */}
              <div className="aspect-video bg-[#0d1e35] overflow-hidden relative">
                {dest.imageUrl
                  ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={dest.imageUrl} alt={dest.city} className="w-full h-full object-cover" />
                  )
                  : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">🏨</div>
                  )}
                {/* Tag */}
                <div className="absolute top-2 left-2 bg-amber-500 text-black text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full">
                  {dest.tag}
                </div>
                {/* Sort order badge */}
                <div className="absolute top-2 right-2 bg-black/60 text-white/60 text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
                  <GripVertical size={10} /> #{dest.sortOrder}
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <p className="text-white font-semibold">{dest.city}</p>
                    <p className="text-white/40 text-xs">{dest.country}</p>
                  </div>
                </div>
                <p className="text-amber-400 text-sm font-medium mb-3">From {dest.fromPrice}</p>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  {/* Active toggle */}
                  <button onClick={() => void toggleActive(dest.id, !dest.active)}
                    className="flex items-center gap-2">
                    <div className={cn('w-10 h-5 rounded-full transition-all relative',
                      dest.active ? 'bg-green-500' : 'bg-white/20')}>
                      <div className={cn('w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all',
                        dest.active ? 'left-5' : 'left-0.5')} />
                    </div>
                    <span className={cn('text-xs', dest.active ? 'text-green-400' : 'text-white/30')}>
                      {dest.active ? <><Eye size={10} className="inline mr-1" />Live</> : <><EyeOff size={10} className="inline mr-1" />Hidden</>}
                    </span>
                  </button>

                  {/* Edit / Delete */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { setEditing(dest); setShowForm(true) }}
                      className="flex items-center gap-1 text-xs text-white/50 hover:text-white px-2.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
                      <Pencil size={11} /> Edit
                    </button>
                    <button
                      onClick={() => void handleDelete(dest.id, dest.city)}
                      disabled={deleting === dest.id}
                      className="flex items-center gap-1 text-xs text-red-400/60 hover:text-red-400 px-2.5 py-1.5 bg-white/5 hover:bg-red-500/10 rounded-lg transition-colors">
                      {deleting === dest.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live count */}
      {!loading && destinations.length > 0 && (
        <p className="text-white/20 text-xs mt-4 text-center">
          {destinations.filter(d => d.active).length} of {destinations.length} destinations live on hotels page
        </p>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#112240] border border-white/10 text-white text-sm px-5 py-3 rounded-xl shadow-2xl z-50">
          {toast}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <DestinationForm
          initial={formInitial}
          onSave={form => void handleSave(form)}
          onCancel={() => { setShowForm(false); setEditing(null) }}
          saving={saving}
        />
      )}
    </div>
  )
}
