'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react'

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

export default function AdminHotelsPage() {
  const [hotels, setHotels] = useState<HotelDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Partial<HotelDeal> | null>(null)
  const [saving, setSaving] = useState(false)
  const [photoInput, setPhotoInput] = useState('')

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
      setPhotoInput((JSON.parse(target.photos || '[]') as string[]).join('\n'))
    } catch { setPhotoInput('') }
  }

  async function save() {
    setSaving(true)
    const photos = photoInput.split('\n').map(u => u.trim()).filter(Boolean)
    const payload = {
      ...modal,
      photos: JSON.stringify(photos),
      rating: modal?.rating ? Number(modal.rating) : null,
      reviewCount: modal?.reviewCount ? Number(modal.reviewCount) : null,
      priceFrom: modal?.priceFrom ? Number(modal.priceFrom) : null,
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

      {/* Modal */}
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
                    placeholder="e.g. Jasper (pre-fills hotel search)"
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
                  <input type="number" step="0.1" min="0" max="10" value={modal.rating ?? ''} onChange={e => setModal({ ...modal, rating: e.target.value ? Number(e.target.value) : null })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Review Count</label>
                  <input type="number" value={modal.reviewCount ?? ''} onChange={e => setModal({ ...modal, reviewCount: e.target.value ? Number(e.target.value) : null })}
                    placeholder="e.g. 621"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Price From</label>
                  <input type="number" value={modal.priceFrom ?? ''} onChange={e => setModal({ ...modal, priceFrom: e.target.value ? Number(e.target.value) : null })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Original Price (for strikethrough)</label>
                  <input type="number" value={modal.priceOriginal ?? ''} onChange={e => setModal({ ...modal, priceOriginal: e.target.value ? Number(e.target.value) : null })}
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
                  <input type="number" value={modal.order ?? 0} onChange={e => setModal({ ...modal, order: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Caption (optional promo text)</label>
                  <input value={modal.caption ?? ''} onChange={e => setModal({ ...modal, caption: e.target.value || null })}
                    placeholder="e.g. Award-winning lakeside resort in the Rockies"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Direct Booking URL (optional — leave blank to use hotel search)</label>
                  <input value={modal.bookingUrl ?? ''} onChange={e => setModal({ ...modal, bookingUrl: e.target.value || null })}
                    placeholder="https://booking.com/hotel/..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Photo URLs — one per line (first photo is the cover)
                  </label>
                  <textarea
                    value={photoInput}
                    onChange={e => setPhotoInput(e.target.value)}
                    rows={4}
                    placeholder={"https://images.unsplash.com/photo-xxx\nhttps://images.unsplash.com/photo-yyy"}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C] resize-none font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-1">Add multiple URLs for a photo slideshow. Use Unsplash or Supabase storage URLs.</p>
                </div>
                <label className="col-span-2 flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={modal.active ?? true} onChange={e => setModal({ ...modal, active: e.target.checked })} className="w-4 h-4 accent-[#C9A84C]" />
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
