'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X,
  MapPin, Clock, DollarSign, Upload, Image as ImageIcon,
  GripVertical, Star, CheckCircle, AlertCircle, Loader2,
} from 'lucide-react'

interface Tour {
  id: string; name: string; slug: string; description: string; highlights: string
  price: number; currency: string; duration: string; location: string
  imageUrl: string | null; photos: string[]
  active: boolean; order: number
}

const EMPTY: Omit<Tour, 'id'> = {
  name: '', slug: '', description: '', highlights: '[]',
  price: 0, currency: 'GBP', duration: '', location: '',
  imageUrl: '', photos: [], active: true, order: 0,
}

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── Toast ──────────────────────────────────────────────────────────────────

interface ToastMsg { type: 'success' | 'error'; text: string }

function Toast({ toast }: { toast: ToastMsg | null }) {
  if (!toast) return null
  return (
    <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold transition-all ${
      toast.type === 'success'
        ? 'bg-green-600 text-white'
        : 'bg-red-600 text-white'
    }`}>
      {toast.type === 'success'
        ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
        : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
      {toast.text}
    </div>
  )
}

// ── Photo thumbnail grid ───────────────────────────────────────────────────

interface PhotoGridProps {
  photos: string[]
  onReorder: (photos: string[]) => void
  onDelete: (index: number) => void
}

function PhotoGrid({ photos, onReorder, onDelete }: PhotoGridProps) {
  const dragIndexRef = useRef<number | null>(null)

  function handleDragStart(i: number) { dragIndexRef.current = i }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === i) return
    const next = [...photos]
    const [moved] = next.splice(from, 1)
    next.splice(i, 0, moved)
    dragIndexRef.current = i
    onReorder(next)
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {photos.map((url, i) => (
        <div
          key={url + i}
          draggable
          onDragStart={() => handleDragStart(i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDragEnd={() => { dragIndexRef.current = null }}
          className="relative group rounded-xl overflow-hidden bg-gray-100 cursor-grab active:cursor-grabbing border-2 border-transparent hover:border-[#C9A84C] transition-colors"
          style={{ aspectRatio: '4/3' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />

          {i === 0 && (
            <div className="absolute top-1 left-1 bg-[#C9A84C] text-[#0B1F3A] text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5" /> Cover
            </div>
          )}

          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-black/50 rounded p-0.5"><GripVertical className="w-3 h-3 text-white" /></div>
          </div>

          <button
            type="button"
            onClick={() => onDelete(i)}
            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/90 text-white rounded-md p-0.5"
          >
            <X className="w-3 h-3" />
          </button>

          <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] rounded px-1 leading-4">{i + 1}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ToursPage() {
  const [tours, setTours]             = useState<Tour[]>([])
  const [loading, setLoading]         = useState(true)
  const [modal, setModal]             = useState<Partial<Tour> | null>(null)
  const [saving, setSaving]           = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [toast, setToast]             = useState<ToastMsg | null>(null)
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null)
  const fileRef                       = useRef<HTMLInputElement>(null)
  const autoSaveTimer                 = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSavedSnapshot             = useRef<string>('')

  function showToast(type: 'success' | 'error', text: string) {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/tours')
    setTours((await res.json()) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  // ── Auto-save every 30s when editing an existing tour ─────────────────────
  useEffect(() => {
    if (!modal?.id || saving || uploading) return

    autoSaveTimer.current = setInterval(async () => {
      const snap = JSON.stringify(modal)
      if (snap === lastSavedSnapshot.current) return          // nothing changed
      const photos = modal.photos ?? []
      const imageUrl = photos[0] ?? modal.imageUrl ?? ''
      const res = await fetch('/api/admin/tours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...modal, photos, imageUrl, price: Number(modal.price ?? 0) }),
      })
      if (res.ok) {
        lastSavedSnapshot.current = snap
        setAutoSavedAt(new Date())
      }
    }, 30_000)

    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current) }
  }, [modal, saving, uploading])

  function openModal(tour: Partial<Tour>) {
    setModal({ ...EMPTY, ...tour })
    setUploadProgress('')
    setAutoSavedAt(null)
    lastSavedSnapshot.current = JSON.stringify({ ...EMPTY, ...tour })
  }

  // ── Photo upload ──────────────────────────────────────────────────────────

  async function uploadFile(file: File, slug: string, index: number): Promise<string | null> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('key', `tour_${slug}_photo_${index}_${Date.now()}`)
    formData.append('label', `Tour Photo — ${slug} #${index + 1}`)
    const res = await fetch('/api/admin/images', { method: 'POST', body: formData })
    if (!res.ok) return null
    const data = await res.json() as { url: string }
    return data.url
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ''

    const currentPhotos = modal?.photos ?? []
    const toUpload = files.slice(0, 10 - currentPhotos.length)
    if (!toUpload.length) return

    setUploading(true)
    const slug = modal?.slug || toSlug(modal?.name ?? 'tour')
    const uploaded: string[] = []

    for (let i = 0; i < toUpload.length; i++) {
      setUploadProgress(`Uploading ${i + 1} of ${toUpload.length}…`)
      const url = await uploadFile(toUpload[i], slug, currentPhotos.length + i)
      if (url) uploaded.push(url)
    }

    const newPhotos = [...currentPhotos, ...uploaded]
    setModal((m) => m ? { ...m, photos: newPhotos, imageUrl: newPhotos[0] ?? m.imageUrl } : m)
    setUploading(false)
    setUploadProgress('')
  }

  function reorderPhotos(photos: string[]) {
    setModal((m) => m ? { ...m, photos, imageUrl: photos[0] ?? '' } : m)
  }

  function deletePhoto(index: number) {
    const photos = (modal?.photos ?? []).filter((_, i) => i !== index)
    setModal((m) => m ? { ...m, photos, imageUrl: photos[0] ?? '' } : m)
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true)
    const method = modal?.id ? 'PUT' : 'POST'
    const photos = modal?.photos ?? []
    const imageUrl = photos[0] ?? modal?.imageUrl ?? ''

    try {
      const res = await fetch('/api/admin/tours', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...modal, photos, imageUrl, price: Number(modal?.price ?? 0) }),
      })
      if (!res.ok) throw new Error('Save failed')
      await load()
      setModal(null)
      showToast('success', 'Tour saved successfully')
    } catch {
      showToast('error', 'Error saving tour. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTour(id: string) {
    if (!confirm('Delete this tour listing?')) return
    await fetch('/api/admin/tours', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await load()
    showToast('success', 'Tour deleted')
  }

  async function toggleActive(t: Tour) {
    await fetch('/api/admin/tours', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, active: !t.active }),
    })
    await load()
    showToast('success', t.active ? 'Tour hidden from website' : 'Tour now visible on website')
  }

  const coverPhoto = (t: Tour) => t.photos?.[0] ?? t.imageUrl ?? null
  const photoCount = modal?.photos?.length ?? 0

  return (
    <div>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Tour Listings</h1>
          <p className="text-gray-500 text-sm mt-1">Add, edit and manage tour packages shown on the website.</p>
        </div>
        <button
          onClick={() => openModal(EMPTY)}
          className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Tour
        </button>
      </div>

      {/* ── Tour grid ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Loading…</div>
      ) : tours.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
          No tours yet. Click &quot;Add Tour&quot; to create one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tours.map((t) => (
            <div
              key={t.id}
              className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${
                t.active ? 'border-gray-100' : 'border-gray-200 opacity-60'
              }`}
            >
              <div className="h-44 bg-gray-100 overflow-hidden relative">
                {coverPhoto(t) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverPhoto(t)!} alt={t.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <ImageIcon className="w-10 h-10" />
                  </div>
                )}
                {(t.photos?.length ?? 0) > 1 && (
                  <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                    +{t.photos.length - 1} more
                  </div>
                )}
              </div>

              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-[#0B1F3A] leading-tight">{t.name}</h3>
                  <button onClick={() => toggleActive(t)} className="ml-2 flex-shrink-0" title={t.active ? 'Hide from website' : 'Show on website'}>
                    {t.active
                      ? <ToggleRight className="w-5 h-5 text-green-500" />
                      : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                  </button>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">{t.description}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-4 flex-wrap">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{t.location}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t.duration}</span>
                  <span className="flex items-center gap-1 font-bold text-[#C9A84C]">
                    <DollarSign className="w-3 h-3" />
                    {new Intl.NumberFormat('en-GB', { style: 'currency', currency: t.currency }).format(t.price)}
                  </span>
                </div>
                <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => openModal(t)}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#0B1F3A] px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => deleteTour(t.id)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL — fixed height, scrollable body, sticky footer
      ══════════════════════════════════════════════════════════════════════ */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          {/* Modal card — flex column with capped height */}
          <div
            className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            {/* ── Sticky header ──────────────────────────────────────── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="font-bold text-[#0B1F3A] text-lg">
                  {modal.id ? 'Edit Tour' : 'New Tour'}
                </h3>
                {autoSavedAt && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Auto saved at {autoSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Scrollable body ─────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-5">

                {/* Tour Name */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Tour Name *</label>
                  <input
                    value={modal.name ?? ''}
                    onChange={(e) => setModal({ ...modal, name: e.target.value, slug: toSlug(e.target.value) })}
                    placeholder="e.g. Niagara Falls VIP Experience"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description *</label>
                  <textarea
                    value={modal.description ?? ''}
                    onChange={(e) => setModal({ ...modal, description: e.target.value })}
                    rows={3}
                    placeholder="Describe this tour…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C] resize-none"
                  />
                </div>

                {/* Location / Duration / Price / Currency */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Location *</label>
                    <input
                      value={modal.location ?? ''}
                      onChange={(e) => setModal({ ...modal, location: e.target.value })}
                      placeholder="e.g. Niagara Falls, Canada"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Duration *</label>
                    <input
                      value={modal.duration ?? ''}
                      onChange={(e) => setModal({ ...modal, duration: e.target.value })}
                      placeholder="e.g. Full day · 8 hours"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Price *</label>
                    <input
                      type="number"
                      value={modal.price ?? 0}
                      onChange={(e) => setModal({ ...modal, price: Number(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                    <select
                      value={modal.currency ?? 'GBP'}
                      onChange={(e) => setModal({ ...modal, currency: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]"
                    >
                      {['GBP', 'USD', 'EUR', 'NGN', 'AED'].map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {/* Photos — 2-col grid, max 120px thumbnails */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-medium text-gray-500">
                      Photos
                      <span className="ml-1 text-gray-400 font-normal">
                        ({photoCount}/10) — drag to reorder · first = cover
                      </span>
                    </label>
                    {photoCount < 10 && (
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 text-xs text-[#C9A84C] hover:text-[#0B1F3A] font-medium disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {uploading ? uploadProgress : 'Add photos'}
                      </button>
                    )}
                  </div>

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFilesSelected}
                  />

                  {photoCount > 0 ? (
                    <div className="space-y-3">
                      <PhotoGrid
                        photos={modal.photos ?? []}
                        onReorder={reorderPhotos}
                        onDelete={deletePhoto}
                      />
                      {photoCount < 10 && (
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={uploading}
                          className="w-full h-14 flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 hover:border-[#C9A84C] text-gray-400 hover:text-[#C9A84C] rounded-xl text-xs transition-all disabled:opacity-50"
                        >
                          <Upload className="w-4 h-4" />
                          {uploading ? uploadProgress : `Add more (${10 - photoCount} remaining)`}
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="w-full h-28 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 hover:border-[#C9A84C] text-gray-400 hover:text-[#C9A84C] rounded-xl text-sm transition-all disabled:opacity-50"
                    >
                      <Upload className="w-6 h-6" />
                      <span className="font-medium">{uploading ? uploadProgress : 'Upload tour photos'}</span>
                      <span className="text-xs text-gray-300">JPG, PNG, WebP · up to 10 · first = cover</span>
                    </button>
                  )}
                </div>

                {/* Show on website toggle */}
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={modal.active ?? true}
                    onChange={(e) => setModal({ ...modal, active: e.target.checked })}
                    className="w-4 h-4 accent-[#C9A84C]"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Show on website</span>
                    <p className="text-xs text-gray-400 mt-0.5">Tour appears on /tours and homepage when active</p>
                  </div>
                </label>

              </div>
            </div>

            {/* ── Sticky footer — always visible ──────────────────────── */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-white rounded-b-2xl flex gap-3">
              <button
                onClick={save}
                disabled={saving || uploading}
                className="flex-1 flex items-center justify-center gap-2 bg-[#0B1F3A] hover:bg-[#1a3358] text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  'Save Tour'
                )}
              </button>
              <button
                onClick={() => setModal(null)}
                className="px-6 border border-gray-200 hover:bg-gray-50 text-gray-600 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Toast notification */}
      <Toast toast={toast} />
    </div>
  )
}
