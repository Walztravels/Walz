'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, Trash2, Eye, CheckCircle, X, Image as ImageIcon } from 'lucide-react'

interface SiteImage {
  id: string; key: string; label: string; url: string; updatedAt: string
}

const IMAGE_SLOTS = [
  { key: 'hero', label: 'Homepage Hero Image', hint: 'Main banner image shown at the top of the homepage (recommended: 1920×1080)' },
  { key: 'dest_london', label: 'Destination — London', hint: 'Card image for London destination' },
  { key: 'dest_dubai', label: 'Destination — Dubai', hint: 'Card image for Dubai destination' },
  { key: 'dest_paris', label: 'Destination — Paris', hint: 'Card image for Paris destination' },
  { key: 'dest_newyork', label: 'Destination — New York', hint: 'Card image for New York destination' },
  { key: 'tour_hero', label: 'Tours Hero Image', hint: 'Banner image on the tours page' },
  { key: 'visa_hero', label: 'Visa Services Hero', hint: 'Banner image on the visa services page' },
  { key: 'about_hero', label: 'About Page Hero', hint: 'Banner image on the about page' },
]

export default function ImagesPage() {
  const [images, setImages] = useState<SiteImage[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ key: string; url: string; file?: File } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/images')
    setImages((await res.json()) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function getImage(key: string) {
    return images.find((i) => i.key === key) ?? null
  }

  function handleFileSelect(key: string, label: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview({ key, url, file })
    e.target.value = ''
  }

  async function confirmUpload() {
    if (!preview?.file) return
    setUploading(preview.key)
    const formData = new FormData()
    formData.append('file', preview.file)
    formData.append('key', preview.key)
    formData.append('label', IMAGE_SLOTS.find((s) => s.key === preview.key)?.label ?? preview.key)

    const res = await fetch('/api/admin/images', { method: 'POST', body: formData })
    if (res.ok) {
      await load()
      setPreview(null)
    } else {
      alert('Upload failed. Is Supabase Storage configured?')
    }
    setUploading(null)
  }

  async function deleteImage(key: string) {
    if (!confirm('Delete this image?')) return
    setDeleting(key)
    await fetch('/api/admin/images', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
    await load()
    setDeleting(null)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Image Management</h1>
        <p className="text-gray-500 text-sm mt-1">Upload and replace images used across the website. Changes publish immediately.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {IMAGE_SLOTS.map((slot) => {
          const existing = getImage(slot.key)
          const isUploading = uploading === slot.key
          const isDeleting = deleting === slot.key

          return (
            <div key={slot.key} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Preview area */}
              <div className="h-44 bg-gray-100 relative overflow-hidden group">
                {existing ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={existing.url} alt={slot.label} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => setPreview({ key: slot.key, url: existing.url })}
                        className="p-2 bg-white/90 rounded-xl text-gray-700 hover:bg-white transition-colors"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteImage(slot.key)}
                        disabled={isDeleting}
                        className="p-2 bg-red-500/90 rounded-xl text-white hover:bg-red-500 transition-colors disabled:opacity-60"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {isDeleting && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center text-sm text-gray-500">Deleting…</div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                    <ImageIcon className="w-10 h-10 mb-2" />
                    <span className="text-sm">No image uploaded</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="font-semibold text-[#0B1F3A] text-sm mb-1">{slot.label}</div>
                <div className="text-xs text-gray-400 mb-3 leading-relaxed">{slot.hint}</div>

                {/* Upload button */}
                <input
                  ref={(el) => { fileRefs.current[slot.key] = el }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(slot.key, slot.label, e)}
                />
                <button
                  onClick={() => fileRefs.current[slot.key]?.click()}
                  disabled={isUploading}
                  className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 hover:border-[#C9A84C] text-gray-500 hover:text-[#C9A84C] py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
                >
                  <Upload className="w-4 h-4" />
                  {isUploading ? 'Uploading…' : existing ? 'Replace Image' : 'Upload Image'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Preview / Confirm Modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[#0B1F3A]">{preview.file ? 'Preview & Confirm Upload' : 'Image Preview'}</h3>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="rounded-xl overflow-hidden mb-4 bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.url} alt="Preview" className="w-full max-h-72 object-contain" />
            </div>

            {preview.file && (
              <div className="mb-4 text-sm text-gray-500">
                <span className="font-medium">{preview.file.name}</span>
                {' · '}{(preview.file.size / 1024 / 1024).toFixed(2)} MB
              </div>
            )}

            {preview.file ? (
              <div className="flex gap-3">
                <button
                  onClick={confirmUpload}
                  disabled={!!uploading}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#0B1F3A] hover:bg-[#1a3358] text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
                >
                  <CheckCircle className="w-4 h-4" />
                  {uploading ? 'Uploading…' : 'Publish Image'}
                </button>
                <button onClick={() => setPreview(null)} className="px-6 border border-gray-200 hover:bg-gray-50 text-gray-600 py-2.5 rounded-xl text-sm font-medium transition-colors">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setPreview(null)} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium transition-colors">Close</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
