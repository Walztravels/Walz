'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Upload, ImageIcon, Loader2 } from 'lucide-react'

interface Deal {
  id: string; origin: string; destination: string; price: number; currency: string
  airline: string | null; imageUrl: string | null; active: boolean; order: number
}

const EMPTY: Omit<Deal, 'id'> = { origin: '', destination: '', price: 0, currency: 'GBP', airline: '', imageUrl: '', active: true, order: 0 }

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

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/flights')
    setDeals((await res.json()) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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
    </div>
  )
}
