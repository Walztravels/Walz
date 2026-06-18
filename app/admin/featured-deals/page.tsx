'use client'
import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, Check, Tag } from 'lucide-react'

interface FeaturedDeal {
  id: string
  origin: string
  destination: string
  fromLabel: string
  toLabel: string
  tripType: string
  departDate: string | null
  returnDate: string | null
  price: number
  currency: string
  airline: string | null
  caption: string | null
  badge: string | null
  imageUrl: string | null
  active: boolean
  order: number
}

const EMPTY: Partial<FeaturedDeal> = {
  origin: '', destination: '', fromLabel: '', toLabel: '', tripType: 'ROUNDTRIP',
  price: 0, currency: 'GBP', active: true, order: 0,
}

export default function FeaturedDealsPage() {
  const [items,   setItems]   = useState<FeaturedDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [form,    setForm]    = useState<Partial<FeaturedDeal>>(EMPTY)
  const [showAdd, setShowAdd] = useState(false)
  const [saving,  setSaving]  = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res  = await fetch('/api/admin/featured-deals')
    const data = await res.json()
    setItems(data.items ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save(id: string) {
    setSaving(id)
    await fetch(`/api/admin/featured-deals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(null); setEditing(null); load()
  }

  async function create() {
    setSaving('new')
    await fetch('/api/admin/featured-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(null); setShowAdd(false); setForm(EMPTY); load()
  }

  async function del(id: string) {
    if (!confirm('Delete this deal?')) return
    await fetch(`/api/admin/featured-deals/${id}`, { method: 'DELETE' })
    load()
  }

  async function toggle(item: FeaturedDeal) {
    await fetch(`/api/admin/featured-deals/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active }),
    })
    load()
  }

  function Field({ label, field, type = 'text', placeholder = '' }: { label: string; field: keyof FeaturedDeal; type?: string; placeholder?: string }) {
    return (
      <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">{label}</label>
        <input
          type={type}
          value={(form[field] as string) ?? ''}
          onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]"
        />
      </div>
    )
  }

  function EditForm({ onSave, isNew }: { onSave: () => void; isNew?: boolean }) {
    return (
      <div className="space-y-3 bg-[#F5F0E8] rounded-2xl p-4 mt-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Origin (IATA)" field="origin" placeholder="LHR" />
          <Field label="Destination (IATA)" field="destination" placeholder="DXB" />
          <Field label="From Label" field="fromLabel" placeholder="London" />
          <Field label="To Label" field="toLabel" placeholder="Dubai" />
          <Field label="Price" field="price" type="number" />
          <Field label="Currency" field="currency" placeholder="GBP" />
          <Field label="Airline" field="airline" placeholder="Emirates" />
          <Field label="Badge" field="badge" placeholder="BEST DEAL" />
          <Field label="Depart Date" field="departDate" type="date" />
          <Field label="Return Date" field="returnDate" type="date" />
        </div>
        <Field label="Image URL" field="imageUrl" placeholder="https://..." />
        <Field label="Caption" field="caption" placeholder="Short description…" />
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Trip Type</label>
          <select
            value={form.tripType ?? 'ROUNDTRIP'}
            onChange={e => setForm(p => ({ ...p, tripType: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]">
            <option value="ROUNDTRIP">Round Trip</option>
            <option value="ONEWAY">One Way</option>
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => { setEditing(null); setShowAdd(false); setForm(EMPTY) }}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
          <button onClick={onSave} disabled={!!saving}
            className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isNew ? 'Add Deal' : 'Save Changes'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Featured Deals</h1>
          <p className="text-gray-400 text-sm mt-0.5">Flight deals shown on the homepage and flights page</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditing(null); setForm(EMPTY) }}
          className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm">
          <Plus className="w-4 h-4" /> Add Deal
        </button>
      </div>

      {showAdd && <EditForm onSave={create} isNew />}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <Tag className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No featured deals yet. Add one above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#0B1F3A] text-sm">
                    {item.fromLabel || item.origin} → {item.toLabel || item.destination}
                    {item.badge && (
                      <span className="ml-2 text-[10px] bg-[#C9A84C] text-[#0B1F3A] font-bold px-2 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.currency} {item.price.toLocaleString()} · {item.airline ?? 'Any airline'} · {item.tripType}
                  </p>
                </div>
                <button onClick={() => toggle(item)}>
                  {item.active
                    ? <ToggleRight className="w-6 h-6 text-green-500" />
                    : <ToggleLeft  className="w-6 h-6 text-gray-300" />}
                </button>
                <button
                  onClick={() => { setEditing(item.id); setForm({ ...item }); setShowAdd(false) }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#0B1F3A]">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => del(item.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
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
