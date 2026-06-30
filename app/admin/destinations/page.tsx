'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Eye, EyeOff, Loader2, MapPin } from 'lucide-react'

interface Destination {
  id: string
  city: string
  country: string
  tag: string
  imageUrl: string
  flightFrom: string | null
  hotelFrom: string | null
  visaFrom: string | null
  description: string | null
  isActive: boolean
  sortOrder: number
}

const EMPTY_FORM = {
  city: '', country: '', tag: '', imageUrl: '',
  flightFrom: '', hotelFrom: '', visaFrom: '',
  description: '', isActive: true, sortOrder: 0,
}

const SEED_DESTINATIONS = [
  { city: 'London',   country: 'United Kingdom', tag: 'MOST VISITED', imageUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&auto=format&fit=crop', flightFrom: '£89',  hotelFrom: '£120/night', visaFrom: '£120', sortOrder: 1 },
  { city: 'Dubai',    country: 'UAE',             tag: 'HOT DEAL',     imageUrl: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&auto=format&fit=crop', flightFrom: '£280', hotelFrom: '£89/night',  visaFrom: '£80',  sortOrder: 2 },
  { city: 'Toronto',  country: 'Canada',           tag: 'POPULAR',      imageUrl: 'https://images.unsplash.com/photo-1517090504586-fde19ea6066f?w=800&auto=format&fit=crop', flightFrom: '£380', hotelFrom: '£95/night',  visaFrom: '£150', sortOrder: 3 },
  { city: 'New York', country: 'USA',             tag: 'POPULAR',      imageUrl: 'https://images.unsplash.com/photo-1522083165195-3424ed129620?w=800&auto=format&fit=crop', flightFrom: '£420', hotelFrom: '£180/night', visaFrom: '£160', sortOrder: 4 },
  { city: 'Lagos',    country: 'Nigeria',         tag: 'BEST VALUE',   imageUrl: 'https://images.unsplash.com/photo-1555990793-da11153b2473?w=800&auto=format&fit=crop', flightFrom: '£580', hotelFrom: '£65/night',  visaFrom: '£60',  sortOrder: 5 },
  { city: 'Accra',    country: 'Ghana',           tag: 'NEW ROUTE',    imageUrl: 'https://images.unsplash.com/photo-1597149374936-796cb7d85a06?w=800&auto=format&fit=crop', flightFrom: '£620', hotelFrom: '£55/night',  visaFrom: '£60',  sortOrder: 6 },
]

export default function DestinationsAdminPage() {
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [editing,      setEditing]      = useState<Destination | null>(null)
  const [form,         setForm]         = useState({ ...EMPTY_FORM })
  const [saving,       setSaving]       = useState(false)
  const [seeding,      setSeeding]      = useState(false)
  const [toast,        setToast]        = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/destinations')
    const data = await res.json() as { destinations?: Destination[] }
    setDestinations(data.destinations ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, sortOrder: destinations.length + 1 })
    setShowForm(true)
  }

  function openEdit(dest: Destination) {
    setEditing(dest)
    setForm({
      city:        dest.city,
      country:     dest.country,
      tag:         dest.tag,
      imageUrl:    dest.imageUrl,
      flightFrom:  dest.flightFrom  ?? '',
      hotelFrom:   dest.hotelFrom   ?? '',
      visaFrom:    dest.visaFrom    ?? '',
      description: dest.description ?? '',
      isActive:    dest.isActive,
      sortOrder:   dest.sortOrder,
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm({ ...EMPTY_FORM })
  }

  async function handleSave() {
    if (!form.city.trim() || !form.imageUrl.trim()) return
    setSaving(true)
    const url    = editing ? `/api/admin/destinations/${editing.id}` : '/api/admin/destinations'
    const method = editing ? 'PATCH' : 'POST'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...form, sortOrder: Number(form.sortOrder) }),
    })
    setSaving(false)
    closeForm()
    await load()
    showToast(editing ? 'Destination updated' : 'Destination added')
  }

  async function handleToggle(dest: Destination) {
    await fetch(`/api/admin/destinations/${dest.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isActive: !dest.isActive }),
    })
    await load()
  }

  async function handleDelete(dest: Destination) {
    if (!confirm(`Delete ${dest.city}? This cannot be undone.`)) return
    await fetch(`/api/admin/destinations/${dest.id}`, { method: 'DELETE' })
    await load()
    showToast('Deleted')
  }

  async function handleSeed() {
    setSeeding(true)
    for (const d of SEED_DESTINATIONS) {
      await fetch('/api/admin/destinations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(d),
      })
    }
    setSeeding(false)
    await load()
    showToast('Default destinations seeded')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Featured Destinations</h1>
              <p className="text-sm text-gray-500">{destinations.length} destination{destinations.length !== 1 ? 's' : ''} · shown on homepage</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {destinations.length === 0 && (
              <button onClick={handleSeed} disabled={seeding}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 transition-colors disabled:opacity-50">
                {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Seed defaults
              </button>
            )}
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#0d2548] transition-colors">
              <Plus className="w-4 h-4" /> Add Destination
            </button>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      <div className="px-8 py-6">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden animate-pulse">
                <div className="h-44 bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : destinations.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
            <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-500">No destinations yet</p>
            <p className="text-sm text-gray-400 mt-1 mb-5">Add your first destination or load the defaults</p>
            <div className="flex gap-3 justify-center">
              <button onClick={handleSeed} disabled={seeding}
                className="px-5 py-2.5 border border-amber-300 text-amber-700 text-sm font-medium rounded-xl hover:bg-amber-50">
                {seeding ? 'Seeding…' : 'Seed defaults'}
              </button>
              <button onClick={openAdd}
                className="px-5 py-2.5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#0d2548]">
                Add Destination
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4">
            {destinations.map(dest => (
              <div key={dest.id}
                className={`bg-white rounded-2xl overflow-hidden shadow-sm border-2 transition-all ${dest.isActive ? 'border-transparent' : 'border-red-200 opacity-75'}`}>
                <div className="relative h-44 bg-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={dest.imageUrl} alt={dest.city}
                    className="w-full h-full object-cover" />
                  {dest.tag && (
                    <span className="absolute top-3 left-3 bg-amber-500 text-black text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                      {dest.tag}
                    </span>
                  )}
                  <span className="absolute top-3 right-3 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                    #{dest.sortOrder}
                  </span>
                  {!dest.isActive && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">HIDDEN</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="font-semibold text-gray-900 leading-tight">{dest.city}</p>
                      <p className="text-xs text-gray-500">{dest.country}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => handleToggle(dest)}
                        title={dest.isActive ? 'Hide from homepage' : 'Show on homepage'}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                        {dest.isActive
                          ? <Eye className="w-4 h-4 text-green-500" />
                          : <EyeOff className="w-4 h-4 text-red-400" />}
                      </button>
                      <button onClick={() => openEdit(dest)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                        <Pencil className="w-4 h-4 text-gray-500" />
                      </button>
                      <button onClick={() => handleDelete(dest)}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-2 flex-wrap">
                    {dest.flightFrom && <span className="text-xs text-amber-600 font-medium">✈ {dest.flightFrom}</span>}
                    {dest.hotelFrom  && <span className="text-xs text-gray-400">🏨 {dest.hotelFrom}</span>}
                    {dest.visaFrom   && <span className="text-xs text-blue-500">🛂 {dest.visaFrom}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="font-bold text-gray-900 text-lg mb-5">
                {editing ? `Edit — ${editing.city}` : 'Add Destination'}
              </h2>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="City *" value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  <input placeholder="Country *" value={form.country}
                    onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>

                <input placeholder="Tag (e.g. HOT DEAL, MOST VISITED)" value={form.tag}
                  onChange={e => setForm(f => ({ ...f, tag: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />

                <input placeholder="Image URL (Unsplash or Supabase storage) *" value={form.imageUrl}
                  onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />

                {form.imageUrl && (
                  <div className="relative h-36 rounded-xl overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.imageUrl} alt="preview" className="w-full h-full object-cover" />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <input placeholder="Flights from (e.g. £89)" value={form.flightFrom}
                    onChange={e => setForm(f => ({ ...f, flightFrom: e.target.value }))}
                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  <input placeholder="Hotels from" value={form.hotelFrom}
                    onChange={e => setForm(f => ({ ...f, hotelFrom: e.target.value }))}
                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  <input placeholder="Visa from" value={form.visaFrom}
                    onChange={e => setForm(f => ({ ...f, visaFrom: e.target.value }))}
                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>

                <input placeholder="Description (optional)" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />

                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Sort order (1 = first)" value={form.sortOrder}
                    onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  <label className="flex items-center gap-2.5 px-3 py-2.5 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={form.isActive}
                      onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                      className="w-4 h-4 rounded accent-amber-500" />
                    <span className="text-sm text-gray-700">Show on homepage</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2.5 mt-6">
                <button onClick={closeForm}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || !form.city.trim() || !form.imageUrl.trim()}
                  className="flex-1 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : editing ? 'Save Changes' : 'Add Destination'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
