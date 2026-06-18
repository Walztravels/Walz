'use client'
import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, Check, Star } from 'lucide-react'

interface Testimonial {
  id: string
  name: string
  location: string
  trip: string
  rating: number
  text: string
  initials: string
  active: boolean
  sortOrder: number
}

const EMPTY: Partial<Testimonial> = {
  name: '', location: '', trip: '', rating: 5, text: '', initials: '', active: true, sortOrder: 99,
}

const DEFAULT_SEEDS = [
  { name: 'Amara Osei',     location: 'London, UK',       trip: 'Dubai Honeymoon',      rating: 5, text: 'Walz Travels made our Dubai honeymoon absolutely perfect. From the business class flights to the Burj Al Arab stay, every detail was flawless.', initials: 'AO', sortOrder: 1 },
  { name: 'Patrick Brennan', location: 'Dublin, Ireland', trip: 'Dublin Private Tour',   rating: 5, text: "Booked the private Dublin tour for my parents' anniversary and they were blown away. The guide was so knowledgeable.", initials: 'PB', sortOrder: 2 },
  { name: 'Priya Sharma',   location: 'Manchester, UK',   trip: 'US Visa Assistance',   rating: 5, text: 'Getting a US visa seemed impossible until Walz Travels stepped in. They guided us through every single document, and we had our visas within 3 weeks.', initials: 'PS', sortOrder: 3 },
  { name: 'Kwame A.',       location: 'Accra',            trip: 'Canada Visitor Visa',   rating: 5, text: 'Canada visa approved first attempt. The document checklist was perfect — not a single thing missing.', initials: 'KA', sortOrder: 4 },
  { name: 'Blessing O.',    location: 'London',           trip: 'UAE Business Travel',   rating: 5, text: 'Dubai business trip sorted in 48 hours. Visa, flights and hotel all handled without me having to chase anyone.', initials: 'BO', sortOrder: 5 },
]

export default function TestimonialsAdminPage() {
  const [items,   setItems]   = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [form,    setForm]    = useState<Partial<Testimonial>>(EMPTY)
  const [showAdd, setShowAdd] = useState(false)
  const [saving,  setSaving]  = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res  = await fetch('/api/admin/testimonials')
    const data = await res.json()
    setItems(data.items ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save(id: string) {
    setSaving(id)
    await fetch(`/api/admin/testimonials/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(null); setEditing(null); load()
  }

  async function create() {
    setSaving('new')
    await fetch('/api/admin/testimonials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(null); setShowAdd(false); setForm(EMPTY); load()
  }

  async function del(id: string) {
    if (!confirm('Delete this testimonial?')) return
    await fetch(`/api/admin/testimonials/${id}`, { method: 'DELETE' })
    load()
  }

  async function toggle(item: Testimonial) {
    await fetch(`/api/admin/testimonials/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active }),
    })
    load()
  }

  async function seedDefaults() {
    setSaving('seed')
    for (const d of DEFAULT_SEEDS) {
      await fetch('/api/admin/testimonials', {
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
        <div className="grid grid-cols-2 gap-3">
          {([['Client Name', 'name'], ['Location', 'location'], ['Trip / Service', 'trip'], ['Initials (2 chars)', 'initials']] as [string, string][]).map(([label, field]) => (
            <div key={field}>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">{label}</label>
              <input
                value={(form as Record<string, unknown>)[field] as string ?? ''}
                onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
          ))}
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Review Text</label>
          <textarea
            value={form.text ?? ''}
            onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Rating (1–5)</label>
            <input type="number" min={1} max={5} value={form.rating ?? 5}
              onChange={e => setForm(p => ({ ...p, rating: parseInt(e.target.value) }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Sort Order</label>
            <input type="number" value={form.sortOrder ?? 99}
              onChange={e => setForm(p => ({ ...p, sortOrder: parseInt(e.target.value) }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => { setEditing(null); setShowAdd(false); setForm(EMPTY) }}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!!saving}
            className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isNew ? 'Add Testimonial' : 'Save Changes'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Testimonials</h1>
          <p className="text-gray-400 text-sm mt-0.5">Manage client reviews shown on the homepage</p>
        </div>
        <div className="flex gap-2">
          {items.length === 0 && (
            <button
              onClick={seedDefaults}
              disabled={saving === 'seed'}
              className="flex items-center gap-1.5 text-xs text-gray-400 border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 disabled:opacity-60">
              {saving === 'seed' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Import Defaults
            </button>
          )}
          <button
            onClick={() => { setShowAdd(true); setEditing(null); setForm(EMPTY) }}
            className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm">
            <Plus className="w-4 h-4" /> Add Review
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
          <Star className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No testimonials yet. Add one above or click &quot;Import Defaults&quot;.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-full bg-[#0B1F3A] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {item.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#0B1F3A] text-sm">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.location} · {item.trip}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">&quot;{item.text}&quot;</p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {Array.from({ length: item.rating }).map((_, i) => (
                    <Star key={i} className="w-3 h-3 text-[#C9A84C] fill-[#C9A84C]" />
                  ))}
                </div>
                <button onClick={() => toggle(item)} className="flex-shrink-0" title={item.active ? 'Active' : 'Inactive'}>
                  {item.active
                    ? <ToggleRight className="w-6 h-6 text-green-500" />
                    : <ToggleLeft  className="w-6 h-6 text-gray-300" />}
                </button>
                <button
                  onClick={() => { setEditing(item.id); setForm({ ...item }); setShowAdd(false) }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#0B1F3A]">
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => del(item.id)}
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
