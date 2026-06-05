'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react'

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

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/flights')
    setDeals((await res.json()) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    const method = modal?.id ? 'PUT' : 'POST'
    await fetch('/api/admin/flights', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...modal, price: Number(modal?.price ?? 0) }),
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
          <p className="text-gray-500 text-sm mt-1">Manage featured destinations and pricing displayed on the homepage.</p>
        </div>
        <button onClick={() => setModal(EMPTY)} className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus className="w-4 h-4" /> Add Deal
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Route', 'Price', 'Airline', 'Status', 'Actions'].map((h) => (
                <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Loading…</td></tr>
            ) : deals.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">No featured deals yet. Click &quot;Add Deal&quot; to create one.</td></tr>
            ) : deals.map((d) => (
              <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-6 py-4 font-semibold text-[#0B1F3A]">{d.origin} → {d.destination}</td>
                <td className="px-6 py-4 font-bold text-[#C9A84C]">
                  {new Intl.NumberFormat('en-GB', { style: 'currency', currency: d.currency }).format(d.price)}
                </td>
                <td className="px-6 py-4 text-gray-600">{d.airline ?? '—'}</td>
                <td className="px-6 py-4">
                  <button onClick={() => toggleActive(d)} className="flex items-center gap-1.5 text-sm">
                    {d.active
                      ? <><ToggleRight className="w-5 h-5 text-green-500" /><span className="text-green-600">Active</span></>
                      : <><ToggleLeft className="w-5 h-5 text-gray-400" /><span className="text-gray-400">Hidden</span></>
                    }
                  </button>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setModal(d)} className="p-1.5 text-gray-400 hover:text-[#0B1F3A] hover:bg-gray-100 rounded-lg transition-colors">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-[#0B1F3A]">{modal.id ? 'Edit Deal' : 'New Featured Deal'}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Origin *</label>
                  <input value={modal.origin ?? ''} onChange={(e) => setModal({ ...modal, origin: e.target.value })} placeholder="e.g. London" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Destination *</label>
                  <input value={modal.destination ?? ''} onChange={(e) => setModal({ ...modal, destination: e.target.value })} placeholder="e.g. Dubai" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Price *</label>
                  <input type="number" value={modal.price ?? 0} onChange={(e) => setModal({ ...modal, price: Number(e.target.value) })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                  <select value={modal.currency ?? 'GBP'} onChange={(e) => setModal({ ...modal, currency: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]">
                    {['GBP', 'USD', 'EUR', 'NGN', 'AED'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Airline</label>
                <input value={modal.airline ?? ''} onChange={(e) => setModal({ ...modal, airline: e.target.value })} placeholder="e.g. British Airways" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Image URL</label>
                <input value={modal.imageUrl ?? ''} onChange={(e) => setModal({ ...modal, imageUrl: e.target.value })} placeholder="https://…" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={modal.active ?? true} onChange={(e) => setModal({ ...modal, active: e.target.checked })} className="w-4 h-4 accent-[#C9A84C]" />
                <span className="text-sm text-gray-700">Show on homepage</span>
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={save} disabled={saving} className="flex-1 bg-[#0B1F3A] hover:bg-[#1a3358] text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Deal'}
              </button>
              <button onClick={() => setModal(null)} className="px-6 border border-gray-200 hover:bg-gray-50 text-gray-600 py-2.5 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
