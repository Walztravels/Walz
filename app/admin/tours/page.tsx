'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, MapPin, Clock, DollarSign, Upload, Image as ImageIcon } from 'lucide-react'

interface Tour {
  id: string; name: string; slug: string; description: string; highlights: string
  price: number; currency: string; duration: string; location: string; imageUrl: string | null
  active: boolean; order: number
}

const EMPTY: Omit<Tour, 'id'> = {
  name: '', slug: '', description: '', highlights: '[]',
  price: 0, currency: 'GBP', duration: '', location: '', imageUrl: '', active: true, order: 0,
}

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function ToursPage() {
  const [tours, setTours] = useState<Tour[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Partial<Tour> | null>(null)
  const [saving, setSaving] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/tours')
    setTours((await res.json()) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openModal(tour: Partial<Tour>) {
    setModal(tour)
    setImageFile(null)
    setImagePreview(tour.imageUrl ?? null)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
    setModal((m) => m ? { ...m, imageUrl: '' } : m)
  }

  async function save() {
    setSaving(true)
    let imageUrl = modal?.imageUrl ?? ''

    // Upload new image if one was selected
    if (imageFile) {
      setUploading(true)
      const slug = modal?.slug || toSlug(modal?.name ?? 'tour')
      const formData = new FormData()
      formData.append('file', imageFile)
      formData.append('key', `tour_${slug}`)
      formData.append('label', `Tour Image — ${modal?.name ?? slug}`)

      const res = await fetch('/api/admin/images', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        imageUrl = data.url
      } else {
        alert('Image upload failed. Check Supabase Storage is configured.')
        setUploading(false)
        setSaving(false)
        return
      }
      setUploading(false)
    }

    const method = modal?.id ? 'PUT' : 'POST'
    await fetch('/api/admin/tours', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...modal, imageUrl, price: Number(modal?.price ?? 0) }),
    })
    await load()
    setModal(null)
    setImageFile(null)
    setImagePreview(null)
    setSaving(false)
  }

  async function deleteTour(id: string) {
    if (!confirm('Delete this tour listing?')) return
    await fetch('/api/admin/tours', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
  }

  async function toggleActive(t: Tour) {
    await fetch('/api/admin/tours', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, active: !t.active }),
    })
    await load()
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Tour Listings</h1>
          <p className="text-gray-500 text-sm mt-1">Add, edit and manage tour packages shown on the website.</p>
        </div>
        <button onClick={() => openModal(EMPTY)} className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus className="w-4 h-4" /> Add Tour
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Loading…</div>
      ) : tours.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">No tours yet. Click &quot;Add Tour&quot; to create one.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tours.map((t) => (
            <div key={t.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${t.active ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
              <div className="h-40 bg-gray-100 overflow-hidden">
                {t.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <ImageIcon className="w-10 h-10" />
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-[#0B1F3A]">{t.name}</h3>
                  <button onClick={() => toggleActive(t)} className="ml-2 flex-shrink-0">
                    {t.active
                      ? <ToggleRight className="w-5 h-5 text-green-500" />
                      : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                  </button>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">{t.description}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{t.location}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t.duration}</span>
                  <span className="flex items-center gap-1 font-bold text-[#C9A84C]"><DollarSign className="w-3 h-3" />
                    {new Intl.NumberFormat('en-GB', { style: 'currency', currency: t.currency }).format(t.price)}
                  </span>
                </div>
                <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                  <button onClick={() => openModal(t)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#0B1F3A] px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => deleteTour(t.id)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl shadow-2xl my-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-[#0B1F3A]">{modal.id ? 'Edit Tour' : 'New Tour'}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tour Name *</label>
                <input
                  value={modal.name ?? ''}
                  onChange={(e) => setModal({ ...modal, name: e.target.value, slug: toSlug(e.target.value) })}
                  placeholder="e.g. Dubai Desert Safari"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description *</label>
                <textarea
                  value={modal.description ?? ''}
                  onChange={(e) => setModal({ ...modal, description: e.target.value })}
                  rows={3}
                  placeholder="Describe this tour…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C] resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Location *</label>
                  <input value={modal.location ?? ''} onChange={(e) => setModal({ ...modal, location: e.target.value })} placeholder="e.g. Dubai, UAE" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Duration *</label>
                  <input value={modal.duration ?? ''} onChange={(e) => setModal({ ...modal, duration: e.target.value })} placeholder="e.g. 3 days" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
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

              {/* Image Upload */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Tour Image</label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

                {imagePreview ? (
                  <div className="relative rounded-xl overflow-hidden bg-gray-100 h-44">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors group flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 bg-white/90 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      >
                        <Upload className="w-3.5 h-3.5" /> Change
                      </button>
                      <button
                        type="button"
                        onClick={clearImage}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 bg-red-500/90 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      >
                        <X className="w-3.5 h-3.5" /> Remove
                      </button>
                    </div>
                    {imageFile && (
                      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-lg">
                        {imageFile.name} · {(imageFile.size / 1024 / 1024).toFixed(1)} MB
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full h-28 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 hover:border-[#C9A84C] text-gray-400 hover:text-[#C9A84C] rounded-xl text-sm transition-all"
                  >
                    <Upload className="w-5 h-5" />
                    <span>Click to upload image</span>
                    <span className="text-xs text-gray-300">JPG, PNG, WebP — recommended 800×600</span>
                  </button>
                )}
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={modal.active ?? true} onChange={(e) => setModal({ ...modal, active: e.target.checked })} className="w-4 h-4 accent-[#C9A84C]" />
                <span className="text-sm text-gray-700">Show on website</span>
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 bg-[#0B1F3A] hover:bg-[#1a3358] text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
              >
                {uploading ? 'Uploading image…' : saving ? 'Saving…' : 'Save Tour'}
              </button>
              <button onClick={() => setModal(null)} className="px-6 border border-gray-200 hover:bg-gray-50 text-gray-600 py-2.5 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
