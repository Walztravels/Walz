'use client'

import { useEffect, useState, useCallback } from 'react'
import { Package, RefreshCw, Loader2, Plus, Edit2, Trash2, X, Check } from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

interface Supplier {
  id: string
  name: string
  type: string
  contact: string | null
  phone: string | null
  website: string | null
  status: string
  notes: string | null
  createdAt: string
}

const EMPTY: Omit<Supplier, 'id' | 'createdAt'> = {
  name: '', type: '', contact: '', phone: '', website: '', status: 'active', notes: '',
}

const SEED = [
  { name: 'Hotelbeds',     type: 'Activities & Hotels',  contact: 'integrations.btb@hotelbeds.com',  status: 'active', notes: 'TEST environment — certification pending' },
  { name: 'Duffel',        type: 'Flights',              contact: 'api@duffel.com',                  status: 'active', notes: 'Live API connected' },
  { name: 'Stripe',        type: 'Payments',             contact: 'support@stripe.com',              status: 'active', notes: 'Live' },
  { name: 'Flutterwave',   type: 'Payments',             contact: 'developers@flutterwave.com',      status: 'active', notes: 'Live' },
  { name: 'Viator',        type: 'Tours & Activities',   contact: 'partners@viator.com',             status: 'active', notes: 'Affiliate integration' },
  { name: 'TravelPayouts', type: 'Affiliate Network',    contact: 'support@travelpayouts.com',       status: 'active', notes: 'Marker: 539656' },
  { name: 'Resend',        type: 'Email Service',        contact: 'support@resend.com',              status: 'active', notes: 'bookings@walztravels.com sender' },
  { name: 'Supabase',      type: 'Database & Storage',   contact: 'support@supabase.com',            status: 'active', notes: 'Production DB' },
]

export default function SuppliersPage() {
  const { can }                = useStaffPermissions()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing]     = useState<Supplier | null>(null)
  const [form, setForm]           = useState<typeof EMPTY>(EMPTY)
  const [saving, setSaving]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/suppliers')
    const d   = await res.json()
    let list  = d.suppliers ?? []
    if (list.length === 0) {
      // Seed on first load
      const seed = await fetch('/api/admin/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: SEED }),
      })
      const s = await seed.json()
      list = s.suppliers ?? []
    }
    setSuppliers(list)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const canEdit = can('settings_edit')

  function openAdd() {
    setForm(EMPTY)
    setEditing(null)
    setModal('add')
  }

  function openEdit(s: Supplier) {
    setForm({ name: s.name, type: s.type, contact: s.contact ?? '', phone: s.phone ?? '', website: s.website ?? '', status: s.status, notes: s.notes ?? '' })
    setEditing(s)
    setModal('edit')
  }

  async function save() {
    setSaving(true)
    if (modal === 'add') {
      const res = await fetch('/api/admin/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (d.supplier) setSuppliers(prev => [d.supplier, ...prev])
    } else if (modal === 'edit' && editing) {
      const res = await fetch(`/api/admin/suppliers/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (d.supplier) setSuppliers(prev => prev.map(s => s.id === editing.id ? d.supplier : s))
    }
    setSaving(false)
    setModal(null)
  }

  async function remove(id: string) {
    if (!confirm('Delete this supplier?')) return
    await fetch(`/api/admin/suppliers/${id}`, { method: 'DELETE' })
    setSuppliers(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Suppliers & Partners</h1>
          <p className="text-sm text-gray-400 mt-0.5">{suppliers.length} integrations and supplier contacts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-[#C9A84C] transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canEdit && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-[#0B1F3A] text-white rounded-xl text-sm font-semibold hover:bg-[#0B1F3A]/90 transition-colors">
              <Plus className="w-4 h-4" />
              Add Supplier
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suppliers.map(s => (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#0B1F3A] rounded-xl flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-[#C9A84C]" />
                  </div>
                  <div>
                    <p className="font-bold text-[#0B1F3A]">{s.name}</p>
                    <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s.type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {s.status}
                  </span>
                  {canEdit && (
                    <>
                      <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-[#0B1F3A] transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(s.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {s.contact && <p className="text-xs text-gray-500 mt-3">📧 {s.contact}</p>}
              {s.phone   && <p className="text-xs text-gray-500">📱 {s.phone}</p>}
              {s.website && <a href={s.website} target="_blank" rel="noreferrer" className="text-xs text-[#C9A84C] hover:underline">🔗 {s.website}</a>}
              {s.notes   && <p className="text-xs text-gray-400 mt-2 italic">{s.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-[#0B1F3A]">{modal === 'add' ? 'Add Supplier' : 'Edit Supplier'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {(['name', 'type', 'contact', 'phone', 'website'] as const).map(field => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 capitalize">{field}</label>
                  <input value={form[field] ?? ''} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <textarea value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={save} disabled={saving || !form.name}
                className="flex-1 py-2.5 bg-[#0B1F3A] text-white rounded-xl text-sm font-semibold hover:bg-[#0B1F3A]/90 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {modal === 'add' ? 'Add' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
