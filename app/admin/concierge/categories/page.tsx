'use client'

import { useState, useEffect } from 'react'
import {
  Plus, Pencil, X, Check, ToggleLeft, ToggleRight, Loader2, ChevronDown, ChevronUp, GripVertical,
} from 'lucide-react'

interface RequiredField {
  key:      string
  label:    string
  type:     string
  required: boolean
  options?: string[]
}

interface Category {
  id:               string
  slug:             string
  name:             string
  description:      string | null
  icon:             string | null
  fulfilment_modes: string[]
  required_fields:  RequiredField[]
  is_active:        boolean
  sort_order:       number
}

const FULFILMENT_OPTIONS = ['instant', 'request_to_book', 'bespoke']
const FIELD_TYPES        = ['text', 'date', 'number', 'select']

const emptyCategory = (): Omit<Category, 'id'> => ({
  slug: '', name: '', description: '', icon: '',
  fulfilment_modes: ['request_to_book'],
  required_fields: [],
  is_active: true, sort_order: 99,
})

const emptyField = (): RequiredField => ({
  key: '', label: '', type: 'text', required: true,
})

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading,    setLoading]    = useState(true)
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [creating,   setCreating]   = useState(false)
  const [saving,     setSaving]     = useState<string | null>(null)
  const [draft,      setDraft]      = useState(emptyCategory())
  const [editDrafts, setEditDrafts] = useState<Record<string, Category>>({})

  useEffect(() => {
    void fetch('/api/admin/concierge/categories')
      .then(r => r.json() as Promise<{ categories: Category[] }>)
      .then(d => setCategories(d.categories ?? []))
      .finally(() => setLoading(false))
  }, [])

  const handleToggleActive = async (cat: Category) => {
    setSaving(cat.id)
    const res = await fetch(`/api/admin/concierge/categories/${cat.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !cat.is_active }),
    })
    if (res.ok) {
      const { category } = await res.json() as { category: Category }
      setCategories(prev => prev.map(c => c.id === cat.id ? category : c))
    }
    setSaving(null)
  }

  const handleSaveEdit = async (id: string) => {
    const data = editDrafts[id]
    if (!data) return
    setSaving(id)
    const res = await fetch(`/api/admin/concierge/categories/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:             data.name,
        description:      data.description,
        icon:             data.icon,
        fulfilment_modes: data.fulfilment_modes,
        required_fields:  data.required_fields,
        sort_order:       data.sort_order,
      }),
    })
    if (res.ok) {
      const { category } = await res.json() as { category: Category }
      setCategories(prev => prev.map(c => c.id === id ? category : c))
      setEditDrafts(prev => { const n = { ...prev }; delete n[id]; return n })
    }
    setSaving(null)
  }

  const handleCreate = async () => {
    if (!draft.slug || !draft.name) return
    setCreating(true)
    const res = await fetch('/api/admin/concierge/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    if (res.ok) {
      const { category } = await res.json() as { category: Category }
      setCategories(prev => [...prev, category])
      setDraft(emptyCategory())
      setShowCreate(false)
    }
    setCreating(false)
  }

  const startEdit = (cat: Category) => {
    setEditDrafts(prev => ({ ...prev, [cat.id]: { ...cat } }))
    setExpanded(cat.id)
  }

  const cancelEdit = (id: string) => {
    setEditDrafts(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const updateField = (catId: string, idx: number, updates: Partial<RequiredField>) => {
    setEditDrafts(prev => ({
      ...prev,
      [catId]: {
        ...prev[catId],
        required_fields: prev[catId].required_fields.map((f, i) => i === idx ? { ...f, ...updates } : f),
      },
    }))
  }

  const addField = (catId: string) => {
    setEditDrafts(prev => ({
      ...prev,
      [catId]: { ...prev[catId], required_fields: [...prev[catId].required_fields, emptyField()] },
    }))
  }

  const removeField = (catId: string, idx: number) => {
    setEditDrafts(prev => ({
      ...prev,
      [catId]: { ...prev[catId], required_fields: prev[catId].required_fields.filter((_, i) => i !== idx) },
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#0B1F3A]">Concierge Categories</h1>
          <p className="text-sm text-gray-500">{categories.length} categories</p>
        </div>
        <button
          onClick={() => setShowCreate(p => !p)}
          className="flex items-center gap-2 bg-[#0B1F3A] text-[#C9A84C] text-sm font-bold px-4 py-2 rounded-lg hover:bg-[#162d52] transition-colors">
          <Plus className="w-4 h-4" /> New Category
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-[#C9A84C]/30 p-5 mb-5 shadow-sm">
          <p className="text-sm font-bold text-[#0B1F3A] mb-4">New Category</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input placeholder="Slug (e.g. private-aviation)" value={draft.slug}
              onChange={e => setDraft(p => ({ ...p, slug: e.target.value }))}
              className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
            <input placeholder="Display name" value={draft.name}
              onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
              className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
            <input placeholder="Description" value={draft.description ?? ''}
              onChange={e => setDraft(p => ({ ...p, description: e.target.value }))}
              className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A] sm:col-span-2" />
            <input placeholder="Icon emoji (e.g. ✈)" value={draft.icon ?? ''}
              onChange={e => setDraft(p => ({ ...p, icon: e.target.value }))}
              className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
            <input type="number" placeholder="Sort order" value={draft.sort_order}
              onChange={e => setDraft(p => ({ ...p, sort_order: Number(e.target.value) }))}
              className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
          </div>
          <div className="flex gap-2 flex-wrap mb-4">
            {FULFILMENT_OPTIONS.map(m => (
              <button key={m}
                onClick={() => setDraft(p => ({
                  ...p,
                  fulfilment_modes: p.fulfilment_modes.includes(m)
                    ? p.fulfilment_modes.filter(x => x !== m)
                    : [...p.fulfilment_modes, m],
                }))}
                className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${
                  draft.fulfilment_modes.includes(m)
                    ? 'bg-[#0B1F3A] text-[#C9A84C] border-[#0B1F3A]'
                    : 'bg-white text-gray-500 border-gray-200'
                }`}>
                {m.replace('_', ' ')}
              </button>
            ))}
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

      {/* Category list */}
      <div className="space-y-2">
        {categories.map(cat => {
          const isEditing  = cat.id in editDrafts
          const data       = isEditing ? editDrafts[cat.id] : cat
          const isSaving   = saving === cat.id
          const isExpanded = expanded === cat.id

          return (
            <div key={cat.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                <span className="text-2xl w-8 text-center flex-shrink-0">{cat.icon ?? '✦'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#0B1F3A]">{cat.name}</p>
                  <p className="text-xs text-gray-400">{cat.slug} · {cat.fulfilment_modes.join(', ')}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cat.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {cat.is_active ? 'Active' : 'Inactive'}
                </span>
                <button onClick={() => handleToggleActive(cat)} disabled={isSaving}
                  className="text-gray-400 hover:text-[#0B1F3A] transition-colors">
                  {isSaving
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : cat.is_active
                      ? <ToggleRight className="w-5 h-5 text-green-500" />
                      : <ToggleLeft className="w-5 h-5" />
                  }
                </button>
                <button onClick={() => isEditing ? cancelEdit(cat.id) : startEdit(cat)}
                  className="text-gray-400 hover:text-[#0B1F3A] transition-colors">
                  {isEditing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                </button>
                <button onClick={() => setExpanded(isExpanded ? null : cat.id)}
                  className="text-gray-400 hover:text-[#0B1F3A] transition-colors">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {/* Expanded / edit panel */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-50 bg-gray-50/40 pt-4 space-y-4">
                  {isEditing ? (
                    <>
                      {/* Edit fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input placeholder="Name" value={data.name}
                          onChange={e => setEditDrafts(p => ({ ...p, [cat.id]: { ...p[cat.id], name: e.target.value } }))}
                          className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] bg-white text-[#0B1F3A]" />
                        <input placeholder="Icon emoji" value={data.icon ?? ''}
                          onChange={e => setEditDrafts(p => ({ ...p, [cat.id]: { ...p[cat.id], icon: e.target.value } }))}
                          className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] bg-white text-[#0B1F3A]" />
                        <input placeholder="Description" value={data.description ?? ''}
                          onChange={e => setEditDrafts(p => ({ ...p, [cat.id]: { ...p[cat.id], description: e.target.value } }))}
                          className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] bg-white text-[#0B1F3A] sm:col-span-2" />
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        {FULFILMENT_OPTIONS.map(m => (
                          <button key={m}
                            onClick={() => setEditDrafts(prev => ({
                              ...prev,
                              [cat.id]: {
                                ...prev[cat.id],
                                fulfilment_modes: prev[cat.id].fulfilment_modes.includes(m)
                                  ? prev[cat.id].fulfilment_modes.filter(x => x !== m)
                                  : [...prev[cat.id].fulfilment_modes, m],
                              },
                            }))}
                            className={`text-xs px-3 py-1 rounded-full border font-semibold transition-all ${
                              data.fulfilment_modes.includes(m)
                                ? 'bg-[#0B1F3A] text-[#C9A84C] border-[#0B1F3A]'
                                : 'bg-white text-gray-500 border-gray-200'
                            }`}>
                            {m.replace('_', ' ')}
                          </button>
                        ))}
                      </div>

                      {/* Required fields editor */}
                      <div>
                        <p className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">Required Fields</p>
                        <div className="space-y-2">
                          {data.required_fields.map((f, idx) => (
                            <div key={idx} className="flex gap-2 items-center bg-white rounded-lg border border-gray-100 p-2">
                              <input placeholder="key" value={f.key}
                                onChange={e => updateField(cat.id, idx, { key: e.target.value })}
                                className="w-24 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
                              <input placeholder="Label" value={f.label}
                                onChange={e => updateField(cat.id, idx, { label: e.target.value })}
                                className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]" />
                              <select value={f.type} onChange={e => updateField(cat.id, idx, { type: e.target.value })}
                                className="text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-[#C9A84C] bg-white text-[#0B1F3A]">
                                {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <button
                                onClick={() => updateField(cat.id, idx, { required: !f.required })}
                                className={`text-[10px] px-2 py-1 rounded font-bold border ${
                                  f.required ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                                }`}>
                                {f.required ? 'Req' : 'Opt'}
                              </button>
                              <button onClick={() => removeField(cat.id, idx)}
                                className="text-gray-400 hover:text-red-500 transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => addField(cat.id)}
                          className="mt-2 text-xs text-[#C9A84C] hover:text-[#0B1F3A] font-semibold flex items-center gap-1 transition-colors">
                          <Plus className="w-3.5 h-3.5" /> Add field
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => handleSaveEdit(cat.id)} disabled={isSaving}
                          className="flex items-center gap-2 bg-[#0B1F3A] text-[#C9A84C] text-sm font-bold px-4 py-2 rounded-lg hover:bg-[#162d52] disabled:opacity-50 transition-colors">
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          Save changes
                        </button>
                        <button onClick={() => cancelEdit(cat.id)}
                          className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    /* Read-only view */
                    <>
                      {cat.description && <p className="text-sm text-gray-600">{cat.description}</p>}
                      {cat.required_fields.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">Required Fields</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {cat.required_fields.map(f => (
                              <div key={f.key} className="flex items-center gap-2 text-xs bg-white border border-gray-100 rounded-lg px-3 py-2">
                                <span className="text-gray-400 font-mono">{f.key}</span>
                                <span className="flex-1 text-[#0B1F3A] font-medium">{f.label}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${f.required ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'}`}>
                                  {f.required ? 'req' : 'opt'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
