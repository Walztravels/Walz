'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Upload, ImageIcon, Loader2 } from 'lucide-react'

interface Deal {
  id: string; origin: string; destination: string; price: number; currency: string
  airline: string | null; imageUrl: string | null; active: boolean; order: number
}

const EMPTY: Omit<Deal, 'id'> = { origin: '', destination: '', price: 0, currency: 'GBP', airline: '', imageUrl: '', active: true, order: 0 }

interface PopularRoute {
  from: string; fromCity: string
  to: string;   toCity: string
  price: number; currency: string
  badge: string; badgeColor: string
  daysOut: number; duration: number
  image: string; desc: string
}

const EMPTY_ROUTE: PopularRoute = {
  from: '', fromCity: '', to: '', toCity: '',
  price: 0, currency: 'GBP',
  badge: 'Popular', badgeColor: '#3B82F6',
  daysOut: 30, duration: 7,
  image: '', desc: '',
}

const BADGE_COLORS = [
  { label: 'Gold',   value: '#C9A84C' },
  { label: 'Red',    value: '#EF4444' },
  { label: 'Blue',   value: '#3B82F6' },
  { label: 'Green',  value: '#10B981' },
  { label: 'Purple', value: '#8B5CF6' },
]

export default function FlightsPage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Partial<Deal> | null>(null)
  const [saving, setSaving] = useState(false)

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [popularRoutes,  setPopularRoutes]  = useState<PopularRoute[]>([])
  const [prLoading,      setPrLoading]      = useState(false)
  const [prSaving,       setPrSaving]       = useState(false)
  const [prModal,        setPrModal]        = useState<(PopularRoute & { _idx?: number }) | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/flights')
    setDeals((await res.json()) ?? [])
    setLoading(false)
  }

  async function loadPopularRoutes() {
    setPrLoading(true)
    try {
      const res  = await fetch('/api/admin/popular-routes')
      const data = await res.json() as { routes?: PopularRoute[] }
      if (data.routes) setPopularRoutes(data.routes)
    } finally {
      setPrLoading(false)
    }
  }

  async function savePopularRoutes(routes: PopularRoute[]) {
    setPrSaving(true)
    try {
      await fetch('/api/admin/popular-routes', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ routes }),
      })
      setPopularRoutes(routes)
    } finally {
      setPrSaving(false)
    }
  }

  function openPrModal(route?: PopularRoute, idx?: number) {
    setPrModal(route ? { ...route, _idx: idx } : { ...EMPTY_ROUTE, _idx: undefined })
  }

  function savePrModal() {
    if (!prModal) return
    const { _idx, ...route } = prModal
    const updated = [...popularRoutes]
    if (_idx !== undefined) {
      updated[_idx] = route
    } else {
      updated.push(route)
    }
    savePopularRoutes(updated)
    setPrModal(null)
  }

  function deletePr(idx: number) {
    if (!confirm('Remove this popular route?')) return
    const updated = popularRoutes.filter((_, i) => i !== idx)
    savePopularRoutes(updated)
  }

  useEffect(() => { load(); loadPopularRoutes() }, [])

  function openModal(deal?: Deal) {
    setModal(deal ? { ...deal } : { ...EMPTY })
    setImageFile(null)
    setImagePreview(deal?.imageUrl ?? null)
    setDragOver(false)
  }

  function handleFileSelect(file: File | null) {
    if (!file || !file.type.startsWith('image/')) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFileSelect(e.dataTransfer.files?.[0] ?? null)
  }

  async function uploadImage(file: File): Promise<string | null> {
    setUploading(true)
    try {
      const slug = (modal?.origin ?? 'flight').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const formData = new FormData()
      formData.append('file', file)
      formData.append('key', `flight_promo_${slug}_${Date.now()}`)
      formData.append('label', `Flight Promo — ${modal?.origin} → ${modal?.destination}`)
      const res = await fetch('/api/admin/images', { method: 'POST', body: formData })
      if (!res.ok) return null
      const data = await res.json()
      return data.url as string
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    setSaving(true)
    let finalImageUrl = modal?.imageUrl ?? null

    if (imageFile) {
      const uploaded = await uploadImage(imageFile)
      if (uploaded) finalImageUrl = uploaded
    }

    await fetch('/api/admin/flights', {
      method: modal?.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...modal, imageUrl: finalImageUrl, price: Number(modal?.price ?? 0) }),
    })
    await load()
    setModal(null)
    setSaving(false)
    setImageFile(null)
    setImagePreview(null)
  }

  async function deleteDeal(id: string) {
    if (!confirm('Delete this featured deal?')) return
    await fetch('/api/admin/flights', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
  }

  async function toggleActive(deal: Deal) {
    await fetch('/api/admin/flights', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deal.id, active: !deal.active }),
    })
    await load()
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Featured Flights</h1>
          <p className="text-gray-500 text-sm mt-1">Manage flight promo cards shown on the flights page</p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2 rounded-xl text-sm hover:bg-[#d4b45f] transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Deal
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : deals.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No featured deals yet. Click &ldquo;Add Deal&rdquo; to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {deals.map(deal => (
            <div key={deal.id} className={`bg-white rounded-2xl overflow-hidden shadow-sm border ${deal.active ? 'border-gray-100' : 'border-red-100 opacity-60'}`}>
              <div className="relative h-36 bg-gray-100">
                {deal.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={deal.imageUrl} alt={deal.destination} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-2 left-3 text-white">
                  <p className="font-bold text-sm">{deal.origin} → {deal.destination}</p>
                  <p className="text-xs text-white/70">{deal.airline}</p>
                </div>
                <div className="absolute top-2 right-2">
                  <span className="text-[#C9A84C] font-bold text-sm bg-black/40 px-2 py-0.5 rounded-lg">
                    {deal.currency} {deal.price}
                  </span>
                </div>
              </div>
              <div className="p-3 flex items-center justify-between">
                <button onClick={() => toggleActive(deal)} className="text-gray-400 hover:text-[#C9A84C] transition-colors">
                  {deal.active
                    ? <ToggleRight className="w-5 h-5 text-[#C9A84C]" />
                    : <ToggleLeft className="w-5 h-5" />}
                </button>
                <div className="flex gap-2">
                  <button onClick={() => openModal(deal)} className="p-1.5 text-gray-400 hover:text-[#0B1F3A] transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteDeal(deal.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#0B1F3A] px-5 py-4 rounded-t-2xl flex items-center justify-between">
              <h3 className="text-white font-bold">{modal.id ? 'Edit Deal' : 'Add Deal'}</h3>
              <button onClick={() => setModal(null)} className="text-white/60 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">

              {/* Photo upload — drag & drop */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Promo Photo</label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all overflow-hidden
                    ${dragOver ? 'border-[#C9A84C] bg-amber-50' : 'border-gray-200 hover:border-[#C9A84C] hover:bg-gray-50'}`}
                  style={{ minHeight: 160 }}
                >
                  {imagePreview ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-sm font-medium flex items-center gap-2">
                          <Upload className="w-4 h-4" /> Click or drag to replace
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setImagePreview(null)
                          setImageFile(null)
                          setModal(m => m ? { ...m, imageUrl: null } : m)
                        }}
                        className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <div className="h-40 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <Upload className={`w-8 h-8 ${dragOver ? 'text-[#C9A84C]' : ''}`} />
                      <p className="text-sm font-medium">Drag photo here or click to browse</p>
                      <p className="text-xs">JPG, PNG, WebP · Max 10MB</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                />
              </div>

              {/* Route */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                  <input
                    value={modal.origin ?? ''}
                    onChange={(e) => setModal({ ...modal, origin: e.target.value })}
                    placeholder="e.g. London"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                  <input
                    value={modal.destination ?? ''}
                    onChange={(e) => setModal({ ...modal, destination: e.target.value })}
                    placeholder="e.g. Dubai"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                  />
                </div>
              </div>

              {/* Price + currency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Price</label>
                  <input
                    type="number"
                    value={modal.price ?? 0}
                    onChange={(e) => setModal({ ...modal, price: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                  <select
                    value={modal.currency ?? 'GBP'}
                    onChange={(e) => setModal({ ...modal, currency: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                  >
                    {['GBP', 'USD', 'EUR', 'CAD', 'NGN', 'AED', 'GHS'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Airline */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Airline</label>
                <input
                  value={modal.airline ?? ''}
                  onChange={(e) => setModal({ ...modal, airline: e.target.value })}
                  placeholder="e.g. British Airways"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                />
              </div>

              {/* Active */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="active"
                  checked={modal.active ?? true}
                  onChange={(e) => setModal({ ...modal, active: e.target.checked })}
                  className="w-4 h-4 accent-[#C9A84C]"
                />
                <label htmlFor="active" className="text-sm text-gray-600">Active (show on flights page)</label>
              </div>

              <button
                onClick={save}
                disabled={saving || uploading}
                className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-3 rounded-xl hover:bg-[#d4b45f] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {(saving || uploading) && <Loader2 className="w-4 h-4 animate-spin" />}
                {uploading ? 'Uploading photo…' : saving ? 'Saving…' : 'Save Deal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Popular Routes section ─────────────────────────────────────────────── */}
      <div className="mt-12">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#0B1F3A]">Popular Routes</h2>
            <p className="text-gray-500 text-sm mt-1">Editable route cards shown on the public flights page</p>
          </div>
          <button
            onClick={() => openPrModal()}
            className="flex items-center gap-2 bg-[#0B1F3A] text-white font-bold px-4 py-2 rounded-xl text-sm hover:bg-[#0B1F3A]/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Route
          </button>
        </div>

        {prLoading ? (
          <div className="text-gray-400 text-sm">Loading…</div>
        ) : popularRoutes.length === 0 ? (
          <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
            <p className="text-sm">No custom routes saved — the hardcoded defaults are showing on the site.</p>
            <p className="text-xs mt-1 text-gray-300">Add a route above to override them.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {popularRoutes.map((r, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-[#0B1F3A]">{r.fromCity} ({r.from}) → {r.toCity} ({r.to})</span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${r.badgeColor}20`, color: r.badgeColor, border: `1px solid ${r.badgeColor}40` }}
                    >
                      {r.badge}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {r.currency === 'CAD' ? 'CA$' : '£'}{r.price} · {r.desc} · {r.daysOut}d out, {r.duration}d trip
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openPrModal(r, i)} className="p-1.5 text-gray-400 hover:text-[#0B1F3A] transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => deletePr(i)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {prSaving && (
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </p>
        )}
      </div>

      {/* Popular route modal */}
      {prModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPrModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#0B1F3A] px-5 py-4 rounded-t-2xl flex items-center justify-between">
              <h3 className="text-white font-bold">{prModal._idx !== undefined ? 'Edit Route' : 'Add Route'}</h3>
              <button onClick={() => setPrModal(null)} className="text-white/60 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">From IATA</label>
                  <input value={prModal.from} onChange={e => setPrModal({ ...prModal, from: e.target.value })}
                    placeholder="LHR" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">From City</label>
                  <input value={prModal.fromCity} onChange={e => setPrModal({ ...prModal, fromCity: e.target.value })}
                    placeholder="London" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">To IATA</label>
                  <input value={prModal.to} onChange={e => setPrModal({ ...prModal, to: e.target.value })}
                    placeholder="LOS" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">To City</label>
                  <input value={prModal.toCity} onChange={e => setPrModal({ ...prModal, toCity: e.target.value })}
                    placeholder="Lagos" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Price</label>
                  <input type="number" value={prModal.price} onChange={e => setPrModal({ ...prModal, price: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                  <select value={prModal.currency} onChange={e => setPrModal({ ...prModal, currency: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]">
                    {['GBP', 'USD', 'EUR', 'CAD', 'NGN', 'AED', 'GHS'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Badge Label</label>
                  <input value={prModal.badge} onChange={e => setPrModal({ ...prModal, badge: e.target.value })}
                    placeholder="Best Seller" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Badge Colour</label>
                  <select value={prModal.badgeColor} onChange={e => setPrModal({ ...prModal, badgeColor: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]">
                    {BADGE_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Days Out</label>
                  <input type="number" value={prModal.daysOut} onChange={e => setPrModal({ ...prModal, daysOut: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Trip Duration (days)</label>
                  <input type="number" value={prModal.duration} onChange={e => setPrModal({ ...prModal, duration: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <input value={prModal.desc} onChange={e => setPrModal({ ...prModal, desc: e.target.value })}
                  placeholder="Multiple airlines daily" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Image URL</label>
                <input value={prModal.image} onChange={e => setPrModal({ ...prModal, image: e.target.value })}
                  placeholder="https://images.unsplash.com/…" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                {prModal.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={prModal.image} alt="Preview" className="mt-2 w-full h-24 object-cover rounded-xl" />
                )}
              </div>

              <button
                onClick={savePrModal}
                disabled={prSaving}
                className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-3 rounded-xl hover:bg-[#d4b45f] disabled:opacity-50 transition-colors"
              >
                {prSaving ? 'Saving…' : prModal._idx !== undefined ? 'Update Route' : 'Add Route'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
