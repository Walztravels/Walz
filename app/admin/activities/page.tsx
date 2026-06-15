'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Eye, EyeOff, Star, StarOff, ExternalLink, X } from 'lucide-react'

interface Activity {
  id: string; title: string; slug: string; price: number; currency: string
  category: string; location: string; duration: string; badge?: string
  isFeatured: boolean; isPublished: boolean; image?: string
  bookings?: { id: string }[]
}

const CATEGORIES = ['beach','culture','wildlife','adventure','food','air']
const CURRENCIES = ['GBP','USD','EUR','CAD','NGN','GHS','AED']
const SYM: Record<string,string> = { GBP:'£',USD:'$',EUR:'€',CAD:'CA$',NGN:'₦',GHS:'₵',AED:'AED ' }

const EMPTY_FORM = {
  title:'', slug:'', description:'', shortDesc:'', image:'',
  price:'', currency:'GBP', duration:'', location:'', meetingPoint:'',
  category:'beach', badge:'', included:'', notIncluded:'', notes:'',
  isFeatured: false, isPublished: false,
}

export default function ActivitiesAdminPage() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [modal,      setModal]      = useState<'add' | 'edit' | null>(null)
  const [editing,    setEditing]    = useState<Activity | null>(null)
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [saving,     setSaving]     = useState(false)

  async function load() {
    const r = await fetch('/api/admin/activities')
    const d = await r.json()
    setActivities(d.activities ?? [])
  }
  useEffect(() => { load() }, [])

  function openAdd() {
    setForm(EMPTY_FORM); setEditing(null); setModal('add')
  }

  function openEdit(a: Activity) {
    setForm({ ...EMPTY_FORM, ...a as any, price: String(a.price) })
    setEditing(a); setModal('edit')
  }

  async function save() {
    setSaving(true)
    const slug = form.slug || form.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const body = {
      ...form,
      slug,
      price:       Number(form.price),
      included:    form.included ? form.included.split('\n').filter(Boolean) : [],
      notIncluded: form.notIncluded ? form.notIncluded.split('\n').filter(Boolean) : [],
    }
    await fetch(`/api/admin/activities${editing ? `/${editing.id}` : ''}`, {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false); setModal(null); load()
  }

  async function toggle(id: string, field: 'isPublished' | 'isFeatured', val: boolean) {
    await fetch(`/api/admin/activities/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !val }),
    })
    load()
  }

  async function del(id: string) {
    if (!confirm('Delete this activity?')) return
    await fetch(`/api/admin/activities/${id}`, { method: 'DELETE' })
    load()
  }

  const f = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Activities</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {activities.length} total · {activities.filter(a => a.isFeatured).length} featured · {activities.filter(a => a.isPublished).length} published
          </p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-[#d4b45f]">
          <Plus className="w-4 h-4" /> Add Activity
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Activity','Category','Price','Duration','Featured','Published','Bookings',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activities.length === 0 && (
              <tr><td colSpan={8} className="text-center py-16 text-gray-400 text-sm">
                No activities yet — add your first
              </td></tr>
            )}
            {activities.map(a => (
              <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-semibold text-[#0B1F3A]">{a.title}</p>
                  <p className="text-xs text-gray-400">{a.location}</p>
                </td>
                <td className="px-4 py-3 capitalize">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{a.category}</span>
                </td>
                <td className="px-4 py-3 font-medium text-[#0B1F3A]">
                  {SYM[a.currency]}{a.price.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{a.duration}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggle(a.id, 'isFeatured', a.isFeatured)}
                    className={`p-1.5 rounded-lg transition-colors ${a.isFeatured ? 'text-[#C9A84C] bg-amber-50' : 'text-gray-300 hover:text-gray-400'}`}>
                    {a.isFeatured ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggle(a.id, 'isPublished', a.isPublished)}
                    className={`p-1.5 rounded-lg transition-colors ${a.isPublished ? 'text-green-500 bg-green-50' : 'text-gray-300 hover:text-gray-400'}`}>
                    {a.isPublished ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm font-semibold text-[#0B1F3A]">{a.bookings?.length ?? 0}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <a href={`/activities/${a.slug}`} target="_blank"
                      className="p-1.5 text-gray-400 hover:text-[#C9A84C] transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => openEdit(a)} className="p-1.5 text-gray-400 hover:text-[#0B1F3A] transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => del(a.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-[#0B1F3A] text-lg">
                {modal === 'add' ? 'Add Activity' : 'Edit Activity'}
              </h2>
              <button onClick={() => setModal(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              {([
                { label: 'Title *',                    key: 'title',        span: 2 },
                { label: 'Slug (auto if empty)',       key: 'slug',         span: 2 },
                { label: 'Short Description',          key: 'shortDesc',    span: 2 },
                { label: 'Image URL',                  key: 'image',        span: 2 },
                { label: 'Location *',                 key: 'location' },
                { label: 'Duration *',                 key: 'duration', ph: 'e.g. 6 hours' },
                { label: 'Meeting Point',              key: 'meetingPoint', span: 2 },
                { label: 'Badge',                      key: 'badge', ph: 'Bestseller / Walz Pick / Top Rated' },
              ] as { label: string; key: keyof typeof EMPTY_FORM; span?: number; ph?: string }[]).map(field => (
                <div key={field.key} className={field.span === 2 ? 'col-span-2' : ''}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{field.label}</label>
                  <input value={String(form[field.key])} placeholder={field.ph}
                    onChange={f(field.key)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C] transition-colors" />
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Price *</label>
                <input type="number" value={form.price} onChange={f('price')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                <select value={form.currency} onChange={f('currency')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <select value={form.category} onChange={f('category')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]">
                  {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-4 pt-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.isFeatured}
                    onChange={e => setForm(p => ({ ...p, isFeatured: e.target.checked }))}
                    className="accent-[#C9A84C]" />
                  Featured
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.isPublished}
                    onChange={e => setForm(p => ({ ...p, isPublished: e.target.checked }))}
                    className="accent-[#C9A84C]" />
                  Published
                </label>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">What&apos;s Included (one per line)</label>
                <textarea value={form.included} rows={3} onChange={f('included')}
                  placeholder="Local guide&#10;Transport&#10;Entrance fees"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Full Description *</label>
                <textarea value={form.description} rows={4} onChange={f('description')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes / Important Info</label>
                <textarea value={form.notes} rows={2} onChange={f('notes')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setModal(null)}
                className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="flex-1 bg-[#C9A84C] text-[#0B1F3A] font-bold py-2.5 rounded-xl text-sm hover:bg-[#d4b45f] disabled:opacity-50">
                {saving ? 'Saving…' : modal === 'add' ? 'Create Activity' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
