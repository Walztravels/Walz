'use client'

import { useState, useEffect } from 'react'
import {
  Plus, Pencil, X, Check, ToggleLeft, ToggleRight, Loader2, Mail, Phone,
  AlertTriangle, RefreshCw,
} from 'lucide-react'

interface CPBalance {
  amount:   number
  currency: string
  low:      boolean
}

interface Supplier {
  id:             string
  slug:           string
  name:           string
  adapter_type:   string
  contact_email:  string | null
  contact_phone:  string | null
  category_slugs: string[]
  is_active:      boolean
}

const emptySupplier = (): Omit<Supplier, 'id'> => ({
  slug: '', name: '', adapter_type: 'manual',
  contact_email: '', contact_phone: '',
  category_slugs: [], is_active: true,
})

export default function AdminSuppliersPage() {
  const [suppliers,    setSuppliers]    = useState<Supplier[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showCreate,   setShowCreate]   = useState(false)
  const [creating,     setCreating]     = useState(false)
  const [saving,       setSaving]       = useState<string | null>(null)
  const [draft,        setDraft]        = useState(emptySupplier())
  const [editDrafts,   setEditDrafts]   = useState<Record<string, Supplier>>({})
  const [cpBalance,    setCpBalance]    = useState<CPBalance | null>(null)
  const [cpBalLoading, setCpBalLoading] = useState(false)

  useEffect(() => {
    void fetch('/api/admin/concierge/suppliers')
      .then(r => r.json() as Promise<{ suppliers: Supplier[] }>)
      .then(d => setSuppliers(d.suppliers ?? []))
      .finally(() => setLoading(false))
  }, [])

  const fetchCpBalance = () => {
    setCpBalLoading(true)
    void fetch('/api/admin/concierge/comfortpass/balance')
      .then(r => r.json() as Promise<{ enabled: boolean; balance: CPBalance | null }>)
      .then(d => { if (d.enabled && d.balance) setCpBalance(d.balance) })
      .finally(() => setCpBalLoading(false))
  }

  const handleToggleActive = async (sup: Supplier) => {
    setSaving(sup.id)
    const res = await fetch(`/api/admin/concierge/suppliers/${sup.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !sup.is_active }),
    })
    if (res.ok) {
      const { supplier } = await res.json() as { supplier: Supplier }
      setSuppliers(prev => prev.map(s => s.id === sup.id ? supplier : s))
    }
    setSaving(null)
  }

  const handleSaveEdit = async (id: string) => {
    const data = editDrafts[id]
    if (!data) return
    setSaving(id)
    const res = await fetch(`/api/admin/concierge/suppliers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:           data.name,
        contact_email:  data.contact_email || null,
        contact_phone:  data.contact_phone || null,
        category_slugs: data.category_slugs,
        adapter_type:   data.adapter_type,
      }),
    })
    if (res.ok) {
      const { supplier } = await res.json() as { supplier: Supplier }
      setSuppliers(prev => prev.map(s => s.id === id ? supplier : s))
      setEditDrafts(prev => { const n = { ...prev }; delete n[id]; return n })
    }
    setSaving(null)
  }

  const handleCreate = async () => {
    if (!draft.slug || !draft.name) return
    setCreating(true)
    const res = await fetch('/api/admin/concierge/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    if (res.ok) {
      const { supplier } = await res.json() as { supplier: Supplier }
      setSuppliers(prev => [...prev, supplier])
      setDraft(emptySupplier())
      setShowCreate(false)
    }
    setCreating(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* ComfortPass balance card */}
      <div className="bg-white rounded-xl border border-[#C9A84C]/30 p-4 mb-6 flex items-center gap-4 shadow-sm">
        <div className="flex-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-0.5">ComfortPass Balance</p>
          {cpBalance ? (
            <div className="flex items-center gap-2">
              <p className={`text-2xl font-bold ${cpBalance.low ? 'text-red-600' : 'text-[#0B1F3A]'}`}>
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: cpBalance.currency }).format(cpBalance.amount)}
              </p>
              {cpBalance.low && (
                <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" /> Low Balance
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">{cpBalLoading ? 'Checking…' : 'Click to check'}</p>
          )}
        </div>
        <button
          onClick={fetchCpBalance}
          disabled={cpBalLoading}
          className="flex items-center gap-2 text-sm text-[#0B1F3A] border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${cpBalLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#0B1F3A]">Concierge Suppliers</h1>
          <p className="text-sm text-gray-500">{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreate(p => !p)}
          className="flex items-center gap-2 bg-[#0B1F3A] text-[#C9A84C] text-sm font-bold px-4 py-2 rounded-lg hover:bg-[#162d52] transition-colors">
          <Plus className="w-4 h-4" /> New Supplier
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-[#C9A84C]/30 p-5 mb-5 shadow-sm">
          <p className="text-sm font-bold text-[#0B1F3A] mb-4">New Supplier</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <input placeholder="Slug" value={draft.slug}
              onChange={e => setDraft(p => ({ ...p, slug: e.target.value }))}
              className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
            <input placeholder="Name" value={draft.name}
              onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
              className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
            <input placeholder="Contact email" value={draft.contact_email ?? ''}
              onChange={e => setDraft(p => ({ ...p, contact_email: e.target.value }))}
              className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
            <input placeholder="Contact phone" value={draft.contact_phone ?? ''}
              onChange={e => setDraft(p => ({ ...p, contact_phone: e.target.value }))}
              className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
            <input placeholder="Category slugs (comma-separated)" value={draft.category_slugs.join(', ')}
              onChange={e => setDraft(p => ({
                ...p, category_slugs: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
              }))}
              className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A] sm:col-span-2" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating || !draft.slug || !draft.name}
              className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold px-4 py-2 rounded-lg hover:bg-[#d4b86e] disabled:opacity-50 transition-colors">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Create
            </button>
            <button onClick={() => setShowCreate(false)}
              className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Supplier list */}
      <div className="space-y-2">
        {suppliers.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
            <p className="text-gray-400 text-sm">No suppliers yet. Add one above.</p>
          </div>
        )}
        {suppliers.map(sup => {
          const isEditing = sup.id in editDrafts
          const data      = isEditing ? editDrafts[sup.id] : sup
          const isSaving  = saving === sup.id

          return (
            <div key={sup.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              {isEditing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input placeholder="Name" value={data.name}
                      onChange={e => setEditDrafts(p => ({ ...p, [sup.id]: { ...p[sup.id], name: e.target.value } }))}
                      className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
                    <input placeholder="Contact email" value={data.contact_email ?? ''}
                      onChange={e => setEditDrafts(p => ({ ...p, [sup.id]: { ...p[sup.id], contact_email: e.target.value } }))}
                      className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
                    <input placeholder="Contact phone" value={data.contact_phone ?? ''}
                      onChange={e => setEditDrafts(p => ({ ...p, [sup.id]: { ...p[sup.id], contact_phone: e.target.value } }))}
                      className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
                    <input placeholder="Category slugs (comma-separated)" value={data.category_slugs.join(', ')}
                      onChange={e => setEditDrafts(p => ({
                        ...p,
                        [sup.id]: {
                          ...p[sup.id],
                          category_slugs: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                        },
                      }))}
                      className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleSaveEdit(sup.id)} disabled={isSaving}
                      className="flex items-center gap-2 bg-[#0B1F3A] text-[#C9A84C] text-sm font-bold px-4 py-2 rounded-lg hover:bg-[#162d52] disabled:opacity-50 transition-colors">
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Save
                    </button>
                    <button onClick={() => setEditDrafts(prev => { const n = { ...prev }; delete n[sup.id]; return n })}
                      className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#0B1F3A]">{sup.name}</p>
                    <p className="text-xs text-gray-400">{sup.slug} · {sup.adapter_type}</p>
                    <div className="flex flex-wrap gap-3 mt-1">
                      {sup.contact_email && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Mail className="w-3 h-3" /> {sup.contact_email}
                        </span>
                      )}
                      {sup.contact_phone && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Phone className="w-3 h-3" /> {sup.contact_phone}
                        </span>
                      )}
                    </div>
                    {sup.category_slugs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {sup.category_slugs.map(s => (
                          <span key={s} className="text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sup.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {sup.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button onClick={() => handleToggleActive(sup)} disabled={isSaving}
                    className="text-gray-400 hover:text-[#0B1F3A] transition-colors">
                    {isSaving
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : sup.is_active
                        ? <ToggleRight className="w-5 h-5 text-green-500" />
                        : <ToggleLeft className="w-5 h-5" />
                    }
                  </button>
                  <button onClick={() => setEditDrafts(p => ({ ...p, [sup.id]: { ...sup } }))}
                    className="text-gray-400 hover:text-[#0B1F3A] transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
