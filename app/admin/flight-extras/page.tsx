'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

const DEFAULT_EXTRAS = [
  { id: 'transfer',  name: 'Airport Transfer',     category: 'Transport',   price: 45,  bookings: 312, revenue: 14040, enabled: true,  photo: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400&h=300&fit=crop&q=80' },
  { id: 'lounge',    name: 'Airport Lounge',       category: 'Comfort',     price: 35,  bookings: 248, revenue: 8680,  enabled: true,  photo: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&h=300&fit=crop&q=80' },
  { id: 'insurance', name: 'Travel Insurance',     category: 'Protection',  price: 24,  bookings: 193, revenue: 4632,  enabled: true,  photo: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&h=300&fit=crop&q=80' },
  { id: 'upgrade',   name: 'Cabin Upgrade',        category: 'Comfort',     price: 189, bookings: 87,  revenue: 16443, enabled: true,  photo: 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=400&h=300&fit=crop&q=80' },
  { id: 'fasttrack', name: 'Fast Track Security',  category: 'Convenience', price: 18,  bookings: 156, revenue: 2808,  enabled: true,  photo: 'https://images.unsplash.com/photo-1474302770737-173ee21bab63?w=400&h=300&fit=crop&q=80' },
  { id: 'baggage',   name: 'Extra Baggage (23kg)', category: 'Baggage',     price: 55,  bookings: 289, revenue: 15895, enabled: true,  photo: 'https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=400&h=300&fit=crop&q=80' },
  { id: 'esim',      name: 'Jade Connect eSIM',    category: 'Technology',  price: 9,   bookings: 412, revenue: 3708,  enabled: true,  photo: 'https://images.unsplash.com/photo-1601972599720-36938d4ecd31?w=400&h=300&fit=crop&q=80' },
  { id: 'visa',      name: 'Visa Service',         category: 'Documents',   price: 99,  bookings: 64,  revenue: 6336,  enabled: false, photo: 'https://images.unsplash.com/photo-1590099033615-be195f8d575c?w=400&h=300&fit=crop&q=80' },
]

const CATEGORIES = ['All', 'Transport', 'Comfort', 'Protection', 'Convenience', 'Baggage', 'Technology', 'Documents']

type Extra = typeof DEFAULT_EXTRAS[number]

interface EditModal {
  extra: Extra
  name:  string
  price: string
  photo: string
}

export default function FlightExtrasAdminPage() {
  const [extras, setExtras]     = useState(DEFAULT_EXTRAS)
  const [filter, setFilter]     = useState('All')
  const [saving, setSaving]     = useState(false)
  const [saved,  setSaved]      = useState(false)

  // Load from API on mount
  useEffect(() => {
    fetch('/api/admin/extras')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.extras)) {
          // Merge API data with local bookings/revenue (API doesn't store those)
          setExtras(prev => prev.map(p => {
            const api = data.extras.find((e: Extra) => e.id === p.id)
            return api ? { ...p, ...api } : p
          }))
        }
      })
      .catch(() => {})
  }, [])

  const persistToApi = useCallback(async (updated: Extra[]) => {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/admin/extras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch { /* silent */ } finally {
      setSaving(false)
    }
  }, [])
  const [modal, setModal]       = useState<EditModal | null>(null)
  const [photoMode, setPhotoMode] = useState<'url' | 'upload'>('url')
  const [photoError, setPhotoError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const filtered = filter === 'All' ? extras : extras.filter(e => e.category === filter)

  const totalRevenue = extras.reduce((s, e) => s + e.revenue, 0)
  const totalBookings = extras.reduce((s, e) => s + e.bookings, 0)
  const activeCount = extras.filter(e => e.enabled).length

  function openEdit(extra: Extra) {
    setModal({ extra, name: extra.name, price: String(extra.price), photo: extra.photo })
    setPhotoMode('url')
    setPhotoError(false)
  }

  function saveEdit() {
    if (!modal) return
    const price = Number(modal.price)
    if (isNaN(price) || price <= 0) return
    const updated = extras.map(e => e.id === modal.extra.id
      ? { ...e, name: modal.name.trim() || e.name, price, photo: modal.photo || e.photo }
      : e
    )
    setExtras(updated)
    persistToApi(updated)
    setModal(null)
  }

  function toggleEnabled(id: string) {
    const updated = extras.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e)
    setExtras(updated)
    persistToApi(updated)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !modal) return
    const reader = new FileReader()
    reader.onload = ev => {
      if (ev.target?.result) {
        setModal(m => m ? { ...m, photo: ev.target!.result as string } : m)
        setPhotoError(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0B1F3A]">Flight Extras</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage ancillary services shown on the checkout extras page.</p>
        </div>
        {(saving || saved) && (
          <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg ${saved ? 'bg-green-50 text-green-600' : 'bg-[#C9A84C]/10 text-[#8B6914]'}`}>
            {saving ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Live — visible to customers
              </>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Revenue', value: `£${(totalRevenue / 1000).toFixed(1)}k`, sub: 'from all extras' },
          { label: 'Total Add-ons', value: totalBookings.toLocaleString(), sub: 'across all services' },
          { label: 'Active Services', value: `${activeCount} / ${extras.length}`, sub: 'currently showing' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-[#0B1F3A]">{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === cat ? 'bg-[#0B1F3A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Extras table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Service</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Add-ons</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(extra => (
              <tr key={extra.id} className={`transition-colors hover:bg-gray-50 ${!extra.enabled ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {/* Clickable photo thumbnail */}
                    <button
                      type="button"
                      onClick={() => openEdit(extra)}
                      className="relative group flex-shrink-0 rounded-lg overflow-hidden w-12 h-9 focus:outline-none"
                      title="Click to change photo"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={extra.photo} alt={extra.name} className="w-12 h-9 object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    </button>
                    <span className="font-medium text-[#0B1F3A]">{extra.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#0B1F3A]/5 text-[#0B1F3A]/60 font-medium">{extra.category}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-bold text-[#0B1F3A]">£{extra.price}</span>
                </td>
                <td className="px-4 py-3 text-right text-gray-600">{extra.bookings.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-semibold text-[#0B1F3A]">£{extra.revenue.toLocaleString()}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleEnabled(extra.id)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${extra.enabled ? 'bg-[#C9A84C]' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${extra.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(extra)} className="text-xs text-gray-400 hover:text-[#0B1F3A] transition-colors font-medium">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Click any photo or the Edit button to update the image, name, or price of an extra.
      </p>

      {/* Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">

            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#0B1F3A] text-lg">Edit Extra</h2>
              <button onClick={() => setModal(null)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Photo section */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Photo</label>

              {/* Preview */}
              <div className="relative w-full h-40 rounded-xl overflow-hidden bg-gray-100 mb-3">
                {modal.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={modal.photo}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={() => setPhotoError(true)}
                    onLoad={() => setPhotoError(false)}
                  />
                ) : null}
                {(photoError || !modal.photo) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 gap-1">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs">No preview</span>
                  </div>
                )}
              </div>

              {/* Mode toggle */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-3 text-xs font-semibold">
                {(['url', 'upload'] as const).map(mode => (
                  <button key={mode} onClick={() => setPhotoMode(mode)}
                    className={`flex-1 py-2 transition-colors capitalize ${photoMode === mode ? 'bg-[#0B1F3A] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    {mode === 'url' ? 'Image URL' : 'Upload File'}
                  </button>
                ))}
              </div>

              {photoMode === 'url' ? (
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={modal.photo.startsWith('data:') ? '' : modal.photo}
                  onChange={e => { setModal(m => m ? { ...m, photo: e.target.value } : m); setPhotoError(false) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] placeholder:text-gray-300"
                />
              ) : (
                <div>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-200 rounded-lg py-4 text-sm text-gray-400 hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Click to choose image
                  </button>
                  {modal.photo.startsWith('data:') && (
                    <p className="text-xs text-green-600 mt-1.5 text-center">Image loaded — save to apply</p>
                  )}
                </div>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Service Name</label>
              <input
                type="text"
                value={modal.name}
                onChange={e => setModal(m => m ? { ...m, name: e.target.value } : m)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]"
              />
            </div>

            {/* Price */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Price (£)</label>
              <input
                type="number"
                value={modal.price}
                min={1}
                onChange={e => setModal(m => m ? { ...m, price: e.target.value } : m)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={saveEdit}
                className="flex-1 py-2.5 rounded-xl bg-[#0B1F3A] text-white text-sm font-bold hover:bg-[#152D52] active:scale-[0.98] transition-all">
                Save Changes
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
