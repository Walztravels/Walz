'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Upload, Star, GripVertical } from 'lucide-react'

interface HotelDeal {
  id: string
  name: string
  location: string
  searchQuery: string
  propertyType: string
  rating: number | null
  reviewCount: number | null
  reviewLabel: string | null
  priceFrom: number | null
  priceOriginal: number | null
  currency: string
  caption: string | null
  badge: string | null
  photos: string
  bookingUrl: string | null
  active: boolean
  order: number
}

const EMPTY: Omit<HotelDeal, 'id'> = {
  name: '', location: '', searchQuery: '', propertyType: 'Hotel',
  rating: null, reviewCount: null, reviewLabel: null,
  priceFrom: null, priceOriginal: null, currency: 'USD',
  caption: null, badge: null, photos: '[]', bookingUrl: null,
  active: true, order: 0,
}

// ── Photo grid with drag-to-reorder ──────────────────────────────────────────

function PhotoGrid({
  photos,
  onReorder,
  onDelete,
}: {
  photos: string[]
  onReorder: (photos: string[]) => void
  onDelete: (index: number) => void
}) {
  const dragIndex = useRef<number | null>(null)

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    const from = dragIndex.current
    if (from === null || from === i) return
    const next = [...photos]
    const [moved] = next.splice(from, 1)
    next.splice(i, 0, moved)
    dragIndex.current = i
    onReorder(next)
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {photos.map((url, i) => (
        <div
          key={url + i}
          draggable
          onDragStart={() => { dragIndex.current = i }}
          onDragOver={e => handleDragOver(e, i)}
          onDragEnd={() => { dragIndex.current = null }}
          className="relative group rounded-xl overflow-hidden bg-gray-100 cursor-grab active:cursor-grabbing border-2 border-transparent hover:border-[#C9A84C] transition-colors"
          style={{ aspectRatio: '4/3' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />

          {i === 0 && (
            <div className="absolute top-1 left-1 bg-[#C9A84C] text-[#0B1F3A] text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5" /> Cover
            </div>
          )}

          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-black/50 rounded p-0.5"><GripVertical className="w-3 h-3 text-white" /></div>
          </div>

          <button
            type="button"
            onClick={() => onDelete(i)}
            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/90 text-white rounded-md p-0.5"
          >
            <X className="w-3 h-3" />
          </button>

          <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] rounded px-1 leading-4">{i + 1}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminHotelsPage() {
  const [hotels, setHotels]       = useState<HotelDeal[]>([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState<Partial<HotelDeal> | null>(null)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [saving, setSaving]       = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/hotels')
    setHotels((await res.json()) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openModal(h?: HotelDeal) {
    const target = h ?? EMPTY
    setModal(target)
    try {
      setPhotoUrls(JSON.parse(target.photos || '[]') as string[])
    } catch { setPhotoUrls([]) }
  }

  // ── Photo upload ────────────────────────────────────────────────────────────

  async function uploadFile(file: File, index: number): Promise<string | null> {
    const slug = (modal?.name ?? 'hotel').toLowerCase().replace(/\s+/g, '-')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('key', `hotel_${slug}_photo_${index}_${Date.now()}`)
    formData.append('label', `Hotel Photo — ${modal?.name ?? 'hotel'} #${index + 1}`)
    const res = await fetch('/api/admin/images', { method: 'POST', body: formData })
    if (!res.ok) return null
    const data = await res.json() as { url: string }
    return data.url
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ''

    const toUpload = files.slice(0, 10 - photoUrls.length)
    if (!toUpload.length) return

    setUploading(true)
    const uploaded: string[] = []

    for (let i = 0; i < toUpload.length; i++) {
      setUploadProgress(`Uploading ${i + 1} of ${toUpload.length}…`)
      const url = await uploadFile(toUpload[i], photoUrls.length + i)
      if (url) uploaded.push(url)
    }

    setPhotoUrls(prev => [...prev, ...uploaded])
    setUploading(false)
    setUploadProgress('')
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true)
    const payload = {
      ...modal,
      photos: JSON.stringify(photoUrls),
      rating:       modal?.rating       ? Number(modal.rating)       : null,
      reviewCount:  modal?.reviewCount  ? Number(modal.reviewCount)  : null,
      priceFrom:    modal?.priceFrom    ? Number(modal.priceFrom)    : null,
      priceOriginal: modal?.priceOriginal ? Number(modal.priceOriginal) : null,
    }
    await fetch('/api/admin/hotels', {
      method: modal?.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    await load()
    setModal(null)
    setSaving(false)
  }

  async function deleteHotel(id: string) {
    if (!confirm('Delete this hotel promo?')) return
    await fetch('/api/admin/hotels', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await load()
  }

  async function toggle(h: HotelDeal) {
    await fetch('/api/admin/hotels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...h, active: !h.active }),
    })
    await load()
  }

  const photoCount = photoUrls.length

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Hotel Promotions</h1>
          <p className="text-gray-500 text-sm mt-1">Featured hotels shown on the /hotels page before searching.</p>
        </div>
        <button onClick={() => openModal()}
          className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus className="w-4 h-4" /> Add Hotel
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Hotel', 'Location', 'Type', 'Rating', 'Price from', 'Badge', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-400">Loading…</td></tr>
            ) : hotels.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-400">No hotel promos yet.</td></tr>
            ) : hotels.map(h => (
              <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-3 font-semibold text-[#0B1F3A] max-w-[200px] truncate">{h.name}</td>
                <td className="px-5 py-3 text-gray-600 max-w-[150px] truncate">{h.location}</td>
                <td className="px-5 py-3 text-gray-500">{h.propertyType}</td>
                <td className="px-5 py-3 text-gray-600">{h.rating ? `${h.rating} · ${h.reviewLabel ?? ''}` : '—'}</td>
                <td className="px-5 py-3 font-bold text-[#C9A84C]">{h.priceFrom ? `${h.currency} ${h.priceFrom}` : '—'}</td>
                <td className="px-5 py-3">{h.badge ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">{h.badge}</span>
                ) : '—'}</td>
                <td className="px-5 py-3">
                  <button onClick={() => toggle(h)}>
                    {h.active
                      ? <ToggleRight className="w-6 h-6 text-green-500" />
                      : <ToggleLeft className="w-6 h-6 text-gray-300" />}
                  </button>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openModal(h)} className="p-1.5 text-gray-400 hover:text-[#0B1F3A] hover:bg-gray-100 rounded-lg transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteHotel(h.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal ── */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl my-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-[#0B1F3A]">{modal.id ? 'Edit Hotel Promo' : 'New Hotel Promo'}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Hotel Name *</label>
                  <input value={modal.name ?? ''} onChange={e => setModal({ ...modal, name: e.target.value })}
                    placeholder="e.g. Fairmont Jasper Park Lodge"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Location *</label>
                  <input value={modal.location ?? ''} onChange={e => setModal({ ...modal, location: e.target.value })}
                    placeholder="e.g. Jasper, Canada"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Search Query *</label>
                  <input value={modal.searchQuery ?? ''} onChange={e => setModal({ ...modal, searchQuery: e.target.value })}
                    placeholder="e.g. Jasper"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Property Type</label>
                  <select value={modal.propertyType ?? 'Hotel'} onChange={e => setModal({ ...modal, propertyType: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]">
                    {['Hotel', 'Resort', 'Villa', 'Apartment', 'Lodge', 'Boutique', 'Hostel', 'B&B'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Rating (e.g. 8.4)</label>
                  <input type="number" step="0.1" min="0" max="10" value={modal.rating ?? ''}
                    onChange={e => setModal({ ...modal, rating: e.target.value ? Number(e.target.value) : null })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Review Count</label>
                  <input type="number" value={modal.reviewCount ?? ''}
                    onChange={e => setModal({ ...modal, reviewCount: e.target.value ? Number(e.target.value) : null })}
                    placeholder="e.g. 621"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Price From</label>
                  <input type="number" value={modal.priceFrom ?? ''}
                    onChange={e => setModal({ ...modal, priceFrom: e.target.value ? Number(e.target.value) : null })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Original Price (strikethrough)</label>
                  <input type="number" value={modal.priceOriginal ?? ''}
                    onChange={e => setModal({ ...modal, priceOriginal: e.target.value ? Number(e.target.value) : null })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                  <select value={modal.currency ?? 'USD'} onChange={e => setModal({ ...modal, currency: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]">
                    {['USD', 'GBP', 'EUR', 'CAD', 'AED', 'NGN'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Badge</label>
                  <select value={modal.badge ?? ''} onChange={e => setModal({ ...modal, badge: e.target.value || null })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]">
                    <option value="">None</option>
                    {['Featured', 'Hot deal', 'Last rooms', 'Exclusive'].map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Display Order</label>
                  <input type="number" value={modal.order ?? 0}
                    onChange={e => setModal({ ...modal, order: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Caption (optional promo text)</label>
                  <input value={modal.caption ?? ''} onChange={e => setModal({ ...modal, caption: e.target.value || null })}
                    placeholder="e.g. Award-winning lakeside resort in the Rockies"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Direct Booking URL (optional)</label>
                  <input value={modal.bookingUrl ?? ''} onChange={e => setModal({ ...modal, bookingUrl: e.target.value || null })}
                    placeholder="https://booking.com/hotel/..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>

                {/* ── Photos ── */}
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-500">
                      Photos
                      <span className="ml-1 text-gray-400 font-normal">
                        ({photoCount}/10) · first = cover
                      </span>
                    </label>
                    {photoCount < 10 && (
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 text-xs text-[#C9A84C] hover:text-[#0B1F3A] font-medium disabled:opacity-50 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {uploading ? uploadProgress : 'Add photos'}
                      </button>
                    )}
                  </div>

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFilesSelected}
                  />

                  {photoCount > 0 ? (
                    <div className="space-y-3">
                      <PhotoGrid
                        photos={photoUrls}
                        onReorder={setPhotoUrls}
                        onDelete={i => setPhotoUrls(prev => prev.filter((_, idx) => idx !== i))}
                      />
                      {photoCount < 10 && (
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={uploading}
                          className="w-full h-14 flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 hover:border-[#C9A84C] text-gray-400 hover:text-[#C9A84C] rounded-xl text-xs transition-all disabled:opacity-50"
                        >
                          <Upload className="w-4 h-4" />
                          {uploading ? uploadProgress : `Add more (${10 - photoCount} remaining)`}
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="w-full h-28 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 hover:border-[#C9A84C] text-gray-400 hover:text-[#C9A84C] rounded-xl text-sm transition-all disabled:opacity-50"
                    >
                      <Upload className="w-6 h-6" />
                      <span className="font-medium">{uploading ? uploadProgress : 'Upload hotel photos'}</span>
                      <span className="text-xs text-gray-300">JPG, PNG, WebP · up to 10 · first = cover</span>
                    </button>
                  )}
                </div>

                <label className="col-span-2 flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={modal.active ?? true}
                    onChange={e => setModal({ ...modal, active: e.target.checked })}
                    className="w-4 h-4 accent-[#C9A84C]" />
                  <span className="text-sm text-gray-700">Show on website</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={save} disabled={saving}
                className="flex-1 bg-[#0B1F3A] hover:bg-[#1a3358] text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Hotel'}
              </button>
              <button onClick={() => setModal(null)}
                className="px-6 border border-gray-200 hover:bg-gray-50 text-gray-600 py-2.5 rounded-xl text-sm font-medium transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
