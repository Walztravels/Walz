'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react'

interface Deal {
  id: string
  origin: string
  destination: string
  fromLabel: string
  toLabel: string
  tripType: string
  departDate: string
  returnDate: string
  price: number
  currency: string
  airline: string | null
  caption: string | null
  badge: string | null
  photos: string
  imageUrl: string | null
  active: boolean
  order: number
}

const EMPTY: Omit<Deal, 'id'> = {
  origin: '', destination: '', fromLabel: '', toLabel: '',
  tripType: 'ROUNDTRIP', departDate: '', returnDate: '',
  price: 0, currency: 'GBP', airline: '', caption: '', badge: '',
  photos: '[]', imageUrl: '', active: true, order: 0,
}

export default function FlightsPage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Partial<Deal> | null>(null)
  const [saving, setSaving] = useState(false)
  const [photoInput, setPhotoInput] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/flights')
    setDeals((await res.json()) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openModal(deal?: Deal) {
    const target = deal ?? EMPTY
    setModal(target)
    try {
      setPhotoInput((JSON.parse(target.photos || '[]') as string[]).join('\n'))
    } catch { setPhotoInput('') }
  }

  async function save() {
    setSaving(true)
    const photos = photoInput.split('\n').map(u => u.trim()).filter(Boolean)
    const payload = { ...modal, photos: JSON.stringify(photos), price: Number(modal?.price ?? 0) }
    await fetch('/api/admin/flights', {
      method: modal?.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    await load()
    setModal(null)
    setSaving(false)
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
          <p className="text-gray-500 text-sm mt-1">Manage featured routes shown on the /flights page before searching.</p>
        </div>
        <button onClick={() => openModal()} className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus className="w-4 h-4" /> Add Deal
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Route', 'Labels', 'Price', 'Dates', 'Badge', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">Loading…</td></tr>
            ) : deals.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">No featured deals yet. Click &quot;Add Deal&quot; to create one.</td></tr>
            ) : deals.map(d => (
              <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-3 font-semibold text-[#0B1F3A]">{d.origin} → {d.destination}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{d.fromLabel && d.toLabel ? `${d.fromLabel} → ${d.toLabel}` : '—'}</td>
                <td className="px-5 py-3 font-bold text-[#C9A84C]">{d.currency} {d.price.toLocaleString()}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">
                  {d.departDate || '—'}{d.returnDate ? ` · ${d.returnDate}` : ''}
                  {d.tripType === 'ONEWAY' ? ' (1-way)' : ''}
                </td>
                <td className="px-5 py-3">
                  {d.badge ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">{d.badge}</span> : '—'}
                </td>
                <td className="px-5 py-3">
                  <button onClick={() => toggleActive(d)} className="flex items-center gap-1.5 text-sm">
                    {d.active
                      ? <><ToggleRight className="w-5 h-5 text-green-500" /><span className="text-green-600">Active</span></>
                      : <><ToggleLeft className="w-5 h-5 text-gray-400" /><span className="text-gray-400">Hidden</span></>}
                  </button>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openModal(d)} className="p-1.5 text-gray-400 hover:text-[#0B1F3A] hover:bg-gray-100 rounded-lg transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteDeal(d.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
              <h3 className="font-bold text-[#0B1F3A]">{modal.id ? 'Edit Deal' : 'New Featured Deal'}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Origin IATA *</label>
                  <input value={modal.origin ?? ''} onChange={e => setModal({ ...modal, origin: e.target.value })}
                    placeholder="e.g. YTO"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Destination IATA *</label>
                  <input value={modal.destination ?? ''} onChange={e => setModal({ ...modal, destination: e.target.value })}
                    placeholder="e.g. LON"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">From Label</label>
                  <input value={modal.fromLabel ?? ''} onChange={e => setModal({ ...modal, fromLabel: e.target.value })}
                    placeholder="e.g. Toronto"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">To Label</label>
                  <input value={modal.toLabel ?? ''} onChange={e => setModal({ ...modal, toLabel: e.target.value })}
                    placeholder="e.g. London"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Trip Type</label>
                  <select value={modal.tripType ?? 'ROUNDTRIP'} onChange={e => setModal({ ...modal, tripType: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]">
                    <option value="ROUNDTRIP">Round Trip</option>
                    <option value="ONEWAY">One Way</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Airline</label>
                  <input value={modal.airline ?? ''} onChange={e => setModal({ ...modal, airline: e.target.value })}
                    placeholder="e.g. Air Canada"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Depart Date</label>
                  <input type="date" value={modal.departDate ?? ''} onChange={e => setModal({ ...modal, departDate: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                {modal.tripType !== 'ONEWAY' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Return Date</label>
                    <input type="date" value={modal.returnDate ?? ''} onChange={e => setModal({ ...modal, returnDate: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Price *</label>
                  <input type="number" value={modal.price ?? 0} onChange={e => setModal({ ...modal, price: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                  <select value={modal.currency ?? 'GBP'} onChange={e => setModal({ ...modal, currency: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]">
                    {['GBP', 'USD', 'EUR', 'CAD', 'NGN', 'AED'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Badge</label>
                  <select value={modal.badge ?? ''} onChange={e => setModal({ ...modal, badge: e.target.value || null })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]">
                    <option value="">None</option>
                    {['Hot Deal', 'Featured', 'Limited', 'New Route'].map(b => <option key={b}>{b}</option>)}
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
                    placeholder="e.g. Direct via Air Canada — limited seats"
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
                  <p className="text-xs text-gray-400 mt-1">Add multiple URLs for a photo slideshow.</p>
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
                {saving ? 'Saving…' : 'Save Deal'}
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
