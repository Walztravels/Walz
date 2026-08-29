'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { DEFAULT_EXTRAS, type FlightExtra } from '@/lib/flights/extras'
import { getCurrencySymbol } from '@/lib/currency'

const CATEGORIES = ['All', 'Transport', 'Comfort', 'Protection', 'Convenience', 'Baggage', 'Technology', 'Documents']

interface EditModal {
  extra:    FlightExtra
  name:     string
  price:    string
  photoUrl: string
}

export default function FlightExtrasAdminPage() {
  const [extras, setExtras]     = useState<FlightExtra[]>(DEFAULT_EXTRAS)
  const [filter, setFilter]     = useState('All')
  const [saving, setSaving]     = useState(false)
  const [saved,  setSaved]      = useState(false)

  useEffect(() => {
    fetch('/api/admin/extras')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.extras) && data.extras.length > 0) {
          setExtras(data.extras)
        }
      })
      .catch(() => {})
  }, [])

  const [modal,      setModal]      = useState<EditModal | null>(null)
  const [photoMode,  setPhotoMode]  = useState<'url' | 'upload'>('url')
  const [photoError, setPhotoError] = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const filtered    = filter === 'All' ? extras : extras.filter(e => e.category === filter)
  const activeCount = extras.filter(e => e.enabled).length

  async function patchExtra(id: string, updates: Partial<Omit<FlightExtra, 'id'>>) {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/admin/extras', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.extra) {
          setExtras(prev => prev.map(e => e.id === id ? data.extra : e))
        }
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch { /* silent */ } finally {
      setSaving(false)
    }
  }

  function openEdit(extra: FlightExtra) {
    setModal({ extra, name: extra.name, price: String(extra.price), photoUrl: extra.photoUrl })
    setPhotoMode('url')
    setPhotoError(false)
  }

  async function saveEdit() {
    if (!modal) return
    const isLive = modal.extra.livePriced
    const price  = isLive ? modal.extra.price : Number(modal.price)
    if (!isLive && (isNaN(price) || price <= 0)) return

    await patchExtra(modal.extra.id, {
      name:     modal.name.trim() || modal.extra.name,
      price:    price,
      photoUrl: modal.photoUrl || modal.extra.photoUrl,
    })
    setModal(null)
  }

  function toggleEnabled(id: string) {
    const extra = extras.find(e => e.id === id)
    if (!extra) return
    patchExtra(id, { enabled: !extra.enabled })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !modal) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/admin/extras/${modal.extra.id}/photo`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.photoUrl) {
        setModal(m => m ? { ...m, photoUrl: data.photoUrl } : m)
        setPhotoError(false)
      } else {
        alert('Upload failed: ' + (data.error ?? 'Unknown error'))
      }
    } catch (err) {
      alert('Upload failed — check your connection and try again.')
      console.error('[extras-photo]', err)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0B1F3A]">Flight Extras</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage ancillary services shown on the checkout extras page.</p>
        </div>
        {(saving || saved) && (
          <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg ${saved ? 'bg-green-50 text-green-600' : 'bg-[#C9A84C]/10 text-[#8B6914]'}`}>
            {saving ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Live — visible to customers
              </>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 max-w-xs">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Active Services</p>
          <p className="text-2xl font-bold text-[#0B1F3A]">{activeCount} / {extras.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">currently showing to customers</p>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === cat ? 'bg-[#0B1F3A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Extras table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Service</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(extra => (
              <tr key={extra.id} className={`transition-colors hover:bg-gray-50 ${!extra.enabled ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openEdit(extra)}
                      className="relative group flex-shrink-0 rounded-lg overflow-hidden w-12 h-9 focus:outline-none"
                      title="Click to change photo"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={extra.photoUrl} alt={extra.name} className="w-12 h-9 object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    </button>
                    <div>
                      <span className="font-medium text-[#0B1F3A]">{extra.name}</span>
                      {extra.livePriced && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Live pricing</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#0B1F3A]/5 text-[#0B1F3A]/60 font-medium">{extra.category}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {extra.livePriced
                    ? <span className="text-xs text-gray-400">via ComfortPass</span>
                    : <span className="font-bold text-[#0B1F3A]">{getCurrencySymbol(extra.currency)}{extra.price}</span>
                  }
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleEnabled(extra.id)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${extra.enabled ? 'bg-[#C9A84C]' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${extra.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(extra)} className="text-xs text-gray-400 hover:text-[#0B1F3A] transition-colors font-medium">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Lounge, Fast Track, Transfer, and Meet &amp; Greet are priced live via ComfortPass per departure airport — the price shown to customers comes from the API, not this table.
        Click any photo or Edit to update the image or name.
      </p>

      {/* Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">

            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#0B1F3A] text-lg">Edit Extra</h2>
              <button onClick={() => setModal(null)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Photo section */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Photo</label>

              <div className="relative w-full h-40 rounded-xl overflow-hidden bg-gray-100 mb-3">
                {modal.photoUrl && !photoError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={modal.photoUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={() => setPhotoError(true)}
                    onLoad={() => setPhotoError(false)}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 gap-1">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs">No preview</span>
                  </div>
                )}
              </div>

              <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-3 text-xs font-semibold">
                {(['url', 'upload'] as const).map(mode => (
                  <button key={mode} onClick={() => setPhotoMode(mode)}
                    className={`flex-1 py-2 transition-colors capitalize ${photoMode === mode ? 'bg-[#0B1F3A] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    {mode === 'url' ? 'Image URL' : 'Upload File'}
                  </button>
                ))}
              </div>

              {photoMode === 'url' ? (
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={modal.photoUrl}
                  onChange={e => { setModal(m => m ? { ...m, photoUrl: e.target.value } : m); setPhotoError(false) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] placeholder:text-gray-300"
                />
              ) : (
                <div>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full border-2 border-dashed border-gray-200 rounded-lg py-4 text-sm text-gray-400 hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Uploading…
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Click to choose image
                      </>
                    )}
                  </button>
                  {modal.photoUrl && !uploading && (
                    <p className="text-xs text-green-600 mt-1.5 text-center">Photo saved to storage</p>
                  )}
                </div>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Service Name</label>
              <input
                type="text"
                value={modal.name}
                onChange={e => setModal(m => m ? { ...m, name: e.target.value } : m)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]"
              />
            </div>

            {/* Price — only editable for manual extras */}
            {!modal.extra.livePriced && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Price ({modal.extra.currency || 'GBP'})</label>
                <input
                  type="number"
                  value={modal.price}
                  min={1}
                  onChange={e => setModal(m => m ? { ...m, price: e.target.value } : m)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]"
                />
              </div>
            )}
            {modal.extra.livePriced && (
              <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                Price is set live by ComfortPass per departure airport — not editable here.
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={saveEdit}
                className="flex-1 py-2.5 rounded-xl bg-[#0B1F3A] text-white text-sm font-bold hover:bg-[#152D52] active:scale-[0.98] transition-all">
                Save Changes
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
