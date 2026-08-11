'use client'

import { useState, useEffect } from 'react'

interface PaymentMilestone {
  id: string
  label: string
  amount: number
  currency: string
  due_date: string | null
  paid: boolean
  notes: string | null
  sort_order: number
}

interface PackageOption {
  id: string
  name: string
  description: string | null
  price: number | null
  currency: string
  is_selected: boolean
  features: string[]
  sort_order: number
}

const CURRENCY_SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', NGN: '₦', CAD: 'CA$', AED: 'AED ',
}

export function PaymentScheduleEditor({ itinId, currency }: { itinId: string; currency: string }) {
  const [items, setItems]     = useState<PaymentMilestone[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)
  const [form, setForm]       = useState({ label: 'Deposit', amount: '', due_date: '', notes: '' })
  const sym = CURRENCY_SYM[currency] || ''

  const load = () => {
    fetch(`/api/admin/itineraries/${itinId}/payment-schedule`)
      .then(r => r.json())
      .then((d: { schedule?: PaymentMilestone[] }) => setItems(d.schedule ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [itinId])

  const add = async () => {
    if (!form.label || !form.amount) return
    setAdding(true)
    const res = await fetch(`/api/admin/itineraries/${itinId}/payment-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: form.label, amount: Number(form.amount), currency, due_date: form.due_date || null, notes: form.notes || null }),
    })
    if (res.ok) { setForm({ label: 'Deposit', amount: '', due_date: '', notes: '' }); load() }
    setAdding(false)
  }

  const togglePaid = async (item: PaymentMilestone) => {
    await fetch(`/api/admin/itineraries/${itinId}/payment-schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id, paid: !item.paid, paid_at: !item.paid ? new Date().toISOString() : null }),
    })
    load()
  }

  const del = async (itemId: string) => {
    if (!confirm('Delete this payment milestone?')) return
    await fetch(`/api/admin/itineraries/${itinId}/payment-schedule`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    })
    load()
  }

  const totalPaid      = items.filter(i => i.paid).reduce((s, i) => s + i.amount, 0)
  const totalPending   = items.filter(i => !i.paid).reduce((s, i) => s + i.amount, 0)
  const totalScheduled = items.reduce((s, i) => s + i.amount, 0)

  const isOverdue = (item: PaymentMilestone) => !item.paid && item.due_date && new Date(item.due_date) < new Date()

  return (
    <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
      <h3 className="text-white font-bold text-sm mb-4">Payment Schedule</h3>

      {totalScheduled > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Total Scheduled', value: totalScheduled, color: 'text-amber-400' },
            { label: 'Received',        value: totalPaid,      color: 'text-green-400' },
            { label: 'Outstanding',     value: totalPending,   color: totalPending > 0 ? 'text-red-400' : 'text-white/30' },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.03] rounded-xl p-3 text-center">
              <p className={`text-lg font-bold ${s.color}`}>{sym}{s.value.toLocaleString()}</p>
              <p className="text-white/30 text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-white/30 text-sm">Loading…</p>
      ) : items.length > 0 ? (
        <div className="space-y-2 mb-4">
          {items.map(item => (
            <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border ${item.paid ? 'bg-green-500/5 border-green-500/20' : isOverdue(item) ? 'bg-red-500/5 border-red-500/20' : 'bg-white/[0.02] border-white/[0.06]'}`}>
              <button
                onClick={() => togglePaid(item)}
                className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition ${item.paid ? 'bg-green-500 border-green-500' : isOverdue(item) ? 'border-red-400' : 'border-white/30 hover:border-amber-400'}`}
              >
                {item.paid && <span className="text-white text-[10px] leading-none block text-center">✓</span>}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">{item.label}</p>
                {item.notes && <p className="text-white/40 text-xs truncate">{item.notes}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`font-bold text-sm ${item.paid ? 'text-green-400' : 'text-amber-400'}`}>{sym}{item.amount.toLocaleString()}</p>
                {item.due_date && <p className={`text-xs ${isOverdue(item) ? 'text-red-400' : 'text-white/30'}`}>Due {new Date(item.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{isOverdue(item) ? ' — OVERDUE' : ''}</p>}
              </div>
              <button onClick={() => del(item.id)} className="text-white/20 hover:text-red-400 transition ml-1">✕</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-white/30 text-sm mb-4">No payment milestones yet.</p>
      )}

      {/* Add form */}
      <div className="border-t border-white/[0.06] pt-4 space-y-3">
        <p className="text-white/40 text-xs font-bold uppercase tracking-wider">Add Milestone</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-white/40 text-xs mb-1 block">Label</label>
            <select value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} className="w-full bg-white/5 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400">
              {['Deposit', 'Interim Payment', 'Balance', 'Final Payment', 'Visa Fee', 'Insurance', 'Other'].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-white/40 text-xs mb-1 block">Amount ({currency})</label>
            <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" className="w-full bg-white/5 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400" />
          </div>
          <div>
            <label className="text-white/40 text-xs mb-1 block">Due Date</label>
            <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} className="w-full bg-white/5 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400" />
          </div>
          <div>
            <label className="text-white/40 text-xs mb-1 block">Notes (optional)</label>
            <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. via Stripe" className="w-full bg-white/5 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400" />
          </div>
        </div>
        <button onClick={add} disabled={adding || !form.label || !form.amount} className="bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 px-5 rounded-xl text-sm transition disabled:opacity-40">
          {adding ? 'Adding…' : '+ Add Milestone'}
        </button>
      </div>
    </div>
  )
}

const PACKAGE_NAMES = ['Essential', 'Signature', 'Luxury', 'VIP', 'Bespoke'] as const

export function PackageOptionsEditor({ itinId, currency }: { itinId: string; currency: string }) {
  const [options, setOptions] = useState<PackageOption[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)
  const [form, setForm]       = useState({ name: 'Signature', price: '', description: '', features: '' })
  const sym = CURRENCY_SYM[currency] || ''

  const load = () => {
    fetch(`/api/admin/itineraries/${itinId}/package-options`)
      .then(r => r.json())
      .then((d: { options?: PackageOption[] }) => setOptions(d.options ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [itinId])

  const add = async () => {
    if (!form.name) return
    setAdding(true)
    const features = form.features.split('\n').map(f => f.trim()).filter(Boolean)
    const res = await fetch(`/api/admin/itineraries/${itinId}/package-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, price: form.price ? Number(form.price) : null, currency, description: form.description || null, features }),
    })
    if (res.ok) { setForm({ name: 'Signature', price: '', description: '', features: '' }); load() }
    setAdding(false)
  }

  const selectOption = async (optionId: string) => {
    await fetch(`/api/admin/itineraries/${itinId}/package-options`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId, is_selected: true }),
    })
    load()
  }

  const del = async (optionId: string) => {
    if (!confirm('Delete this package option?')) return
    await fetch(`/api/admin/itineraries/${itinId}/package-options`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId }),
    })
    load()
  }

  const TIER_COLORS: Record<string, string> = {
    Essential: 'border-blue-500/30 bg-blue-500/5',
    Signature: 'border-amber-400/30 bg-amber-400/5',
    Luxury:    'border-purple-500/30 bg-purple-500/5',
    VIP:       'border-rose-500/30 bg-rose-500/5',
    Bespoke:   'border-green-500/30 bg-green-500/5',
  }

  return (
    <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
      <h3 className="text-white font-bold text-sm mb-4">Package Options</h3>
      <p className="text-white/40 text-xs mb-4">Create multiple package tiers for the client to choose from. Only the price the client sees — internal costs stay private.</p>

      {loading ? (
        <p className="text-white/30 text-sm">Loading…</p>
      ) : options.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          {options.map(opt => (
            <div key={opt.id} className={`border rounded-xl p-4 relative ${TIER_COLORS[opt.name] || 'border-white/10 bg-white/[0.02]'} ${opt.is_selected ? 'ring-2 ring-amber-400' : ''}`}>
              {opt.is_selected && <span className="absolute top-2 right-2 bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">Selected</span>}
              <p className="text-white font-bold text-sm">{opt.name}</p>
              {opt.price != null && <p className="text-amber-400 font-bold text-lg mt-0.5">{sym}{opt.price.toLocaleString()}</p>}
              {opt.description && <p className="text-white/50 text-xs mt-1">{opt.description}</p>}
              {opt.features.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {opt.features.map((f, i) => <li key={i} className="text-white/60 text-xs flex gap-1.5"><span className="text-green-400">✓</span>{f}</li>)}
                </ul>
              )}
              <div className="flex gap-2 mt-3">
                <button onClick={() => selectOption(opt.id)} disabled={opt.is_selected} className="flex-1 bg-white/5 hover:bg-white/10 text-white text-xs font-bold py-2 rounded-lg transition disabled:opacity-30">
                  {opt.is_selected ? 'Selected' : 'Mark Selected'}
                </button>
                <button onClick={() => del(opt.id)} className="p-2 text-white/20 hover:text-red-400 transition rounded-lg">✕</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-white/30 text-sm mb-5">No package options yet. Add tiers for the client to choose from.</p>
      )}

      {/* Add form */}
      <div className="border-t border-white/[0.06] pt-4 space-y-3">
        <p className="text-white/40 text-xs font-bold uppercase tracking-wider">Add Package</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-white/40 text-xs mb-1 block">Tier</label>
            <select value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full bg-white/5 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400">
              {PACKAGE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="text-white/40 text-xs mb-1 block">Client Price ({currency})</label>
            <input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="0" className="w-full bg-white/5 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400" />
          </div>
          <div className="col-span-2">
            <label className="text-white/40 text-xs mb-1 block">Description</label>
            <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="One-line summary of this tier" className="w-full bg-white/5 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400" />
          </div>
          <div className="col-span-2">
            <label className="text-white/40 text-xs mb-1 block">Features (one per line)</label>
            <textarea value={form.features} onChange={e => setForm(p => ({ ...p, features: e.target.value }))} placeholder={"Daily breakfast included\nAirport transfer\nPrivate guide"} rows={3} className="w-full bg-white/5 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400 resize-none" />
          </div>
        </div>
        <button onClick={add} disabled={adding} className="bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 px-5 rounded-xl text-sm transition disabled:opacity-40">
          {adding ? 'Adding…' : '+ Add Package Option'}
        </button>
      </div>
    </div>
  )
}
