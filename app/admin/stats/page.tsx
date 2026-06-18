'use client'
import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, Check, TrendingUp } from 'lucide-react'

interface HomeStat {
  id: string
  value: number
  suffix: string
  label: string
  sortOrder: number
  active: boolean
}

const EMPTY: Partial<HomeStat> = { value: 0, suffix: '', label: '', sortOrder: 99, active: true }

const DEFAULT_SEEDS = [
  { value: 90,   suffix: '%+', label: 'Visa Approval Rate', sortOrder: 1 },
  { value: 6,    suffix: '',   label: 'Markets Served',      sortOrder: 2 },
  { value: 24,   suffix: '/7', label: 'Expert Support',      sortOrder: 3 },
  { value: 5000, suffix: '+',  label: 'Trips Planned',       sortOrder: 4 },
]

export default function StatsAdminPage() {
  const [items,   setItems]   = useState<HomeStat[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [form,    setForm]    = useState<Partial<HomeStat>>(EMPTY)
  const [showAdd, setShowAdd] = useState(false)
  const [saving,  setSaving]  = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res  = await fetch('/api/admin/home-stats')
    const data = await res.json()
    setItems(data.items ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save(id: string) {
    setSaving(id)
    await fetch(`/api/admin/home-stats/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(null); setEditing(null); load()
  }

  async function create() {
    setSaving('new')
    await fetch('/api/admin/home-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, value: parseInt(String(form.value ?? 0)) }),
    })
    setSaving(null); setShowAdd(false); setForm(EMPTY); load()
  }

  async function del(id: string) {
    if (!confirm('Delete this stat?')) return
    await fetch(`/api/admin/home-stats/${id}`, { method: 'DELETE' })
    load()
  }

  async function toggle(item: HomeStat) {
    await fetch(`/api/admin/home-stats/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active }),
    })
    load()
  }

  async function seedDefaults() {
    setSaving('seed')
    for (const d of DEFAULT_SEEDS) {
      await fetch('/api/admin/home-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      })
    }
    setSaving(null); load()
  }

  function EditForm({ onSave, isNew }: { onSave: () => void; isNew?: boolean }) {
    return (
      <div className="space-y-3 bg-[#F5F0E8] rounded-2xl p-4 mt-2">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Value</label>
            <input type="number" value={form.value ?? 0}
              onChange={e => setForm(p => ({ ...p, value: parseInt(e.target.value) }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Suffix</label>
            <input value={form.suffix ?? ''}
              onChange={e => setForm(p => ({ ...p, suffix: e.target.value }))}
              placeholder="%+, /7, +"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Sort</label>
            <input type="number" value={form.sortOrder ?? 99}
              onChange={e => setForm(p => ({ ...p, sortOrder: parseInt(e.target.value) }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]" />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Label</label>
          <input value={form.label ?? ''}
            onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
            placeholder="e.g. Visa Approval Rate"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]" />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => { setEditing(null); setShowAdd(false); setForm(EMPTY) }}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onSave} disabled={!!saving}
            className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isNew ? 'Add Stat' : 'Save Changes'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Homepage Stats</h1>
          <p className="text-gray-400 text-sm mt-0.5">Numbers shown in the stats strip below the hero</p>
        </div>
        <div className="flex gap-2">
          {items.length === 0 && (
            <button onClick={seedDefaults} disabled={saving === 'seed'}
              className="flex items-center gap-1.5 text-xs text-gray-400 border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 disabled:opacity-60">
              {saving === 'seed' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Import Defaults
            </button>
          )}
          <button
            onClick={() => { setShowAdd(true); setEditing(null); setForm(EMPTY) }}
            className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm">
            <Plus className="w-4 h-4" /> Add Stat
          </button>
        </div>
      </div>

      {showAdd && <EditForm onSave={create} isNew />}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <TrendingUp className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No stats yet. Add one or click &quot;Import Defaults&quot;.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                <div className="flex-1">
                  <p className="font-bold text-[#0B1F3A]">
                    <span className="text-[#C9A84C] text-xl">{item.value.toLocaleString()}{item.suffix}</span>
                    {' '}
                    <span className="text-sm text-gray-500">{item.label}</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Sort: {item.sortOrder}</p>
                </div>
                <button onClick={() => toggle(item)} title={item.active ? 'Active' : 'Inactive'}>
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
