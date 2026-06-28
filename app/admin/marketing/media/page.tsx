'use client'

import { useState, useEffect, useRef } from 'react'
import { Image as ImageIcon, Upload, Trash2, Copy, Check, Loader2, X, Tag } from 'lucide-react'

type MediaItem = {
  id:        string
  filename:  string
  url:       string
  mimeType:  string
  sizeBytes: number | null
  tags:      string[]
  altText:   string | null
  uploadedBy: string
  createdAt:  string
}

const TAGS = ['visa', 'flights', 'tours', 'testimonial', 'destination', 'team', 'general']

function fmtSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function MediaLibraryPage() {
  const [media,       setMedia]       = useState<MediaItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filterTag,   setFilterTag]   = useState('')
  const [uploading,   setUploading]   = useState(false)
  const [uploadErr,   setUploadErr]   = useState('')
  const [copied,      setCopied]      = useState<string | null>(null)
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [showUpload,  setShowUpload]  = useState(false)
  const [preview,     setPreview]     = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [altText,     setAltText]     = useState('')
  const [dragOver,    setDragOver]    = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  function fetchMedia(tag?: string) {
    setLoading(true)
    fetch(`/api/admin/marketing/media${tag ? `?tag=${tag}` : ''}`)
      .then(r => r.json())
      .then((d: { media: MediaItem[] }) => { setMedia(d.media ?? []); setLoading(false) })
  }

  useEffect(() => { fetchMedia(filterTag || undefined) }, [filterTag])

  function handleFileSelect(file: File) {
    if (!file.type.startsWith('image/')) {
      setUploadErr('Only images are supported')
      return
    }
    setPendingFile(file)
    setPreview(URL.createObjectURL(file))
    setShowUpload(true)
  }

  async function uploadFile() {
    if (!pendingFile) return
    setUploading(true)
    setUploadErr('')
    try {
      const fd = new FormData()
      fd.append('file',    pendingFile)
      fd.append('tags',    JSON.stringify(selectedTags))
      fd.append('altText', altText)
      const res  = await fetch('/api/admin/marketing/media', { method: 'POST', body: fd })
      const data = await res.json() as { media?: MediaItem; error?: string }
      if (data.error) throw new Error(data.error)
      if (data.media) setMedia(prev => [data.media!, ...prev])
      setShowUpload(false)
      setPendingFile(null)
      setPreview(null)
      setSelectedTags([])
      setAltText('')
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function deleteMedia(id: string) {
    if (!confirm('Delete this image?')) return
    setDeleting(id)
    await fetch('/api/admin/marketing/media', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    })
    setMedia(prev => prev.filter(m => m.id !== id))
    setDeleting(null)
  }

  function copyUrl(url: string, id: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const toggleTag = (t: string) => {
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  return (
    <div className="space-y-5 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Media Library</h1>
            <p className="text-sm text-gray-500">{media.length} assets · {filterTag ? `Filtered: ${filterTag}` : 'All tags'}</p>
          </div>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl text-sm transition"
        >
          <Upload className="w-4 h-4" /> Upload Image
        </button>
      </div>

      {/* Tag filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterTag('')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
            !filterTag ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-400'
          }`}
        >
          All
        </button>
        {TAGS.map(t => (
          <button
            key={t}
            onClick={() => setFilterTag(filterTag === t ? '' : t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition capitalize ${
              filterTag === t ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading
        ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-square bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        )
        : media.length === 0
        ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ImageIcon className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-gray-400 font-medium">No images yet</p>
            <p className="text-gray-300 text-sm mt-1">Upload your first image to get started</p>
          </div>
        )
        : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {media.map(item => (
              <div key={item.id} className="group relative bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition">
                {/* Image */}
                <div className="aspect-square bg-gray-50 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.altText ?? item.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => copyUrl(item.url, item.id)}
                    className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-gray-700 hover:bg-amber-500 hover:text-white transition"
                    title="Copy URL"
                  >
                    {copied === item.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => deleteMedia(item.id)}
                    className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-gray-700 hover:bg-red-500 hover:text-white transition"
                    title="Delete"
                  >
                    {deleting === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>

                {/* Footer */}
                <div className="px-2 py-1.5">
                  <p className="text-[11px] text-gray-600 truncate font-medium">{item.filename}</p>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    {(item.tags ?? []).slice(0, 2).map(t => (
                      <span key={t} className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full capitalize">{t}</span>
                    ))}
                    {item.sizeBytes && (
                      <span className="text-[9px] text-gray-400 ml-auto">{fmtSize(item.sizeBytes)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      }

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setShowUpload(false); setPendingFile(null); setPreview(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Upload Image</h2>
              <button onClick={() => { setShowUpload(false); setPendingFile(null); setPreview(null) }}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">

              {/* Drop zone / preview */}
              {preview
                ? (
                  <div className="relative rounded-xl overflow-hidden aspect-video bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Preview" className="w-full h-full object-contain" />
                    <button
                      onClick={() => { setPendingFile(null); setPreview(null) }}
                      className="absolute top-2 right-2 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
                : (
                  <div
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition cursor-pointer ${dragOver ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-amber-400'}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f) }}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Drop image here or <span className="text-amber-600 font-medium">browse</span></p>
                    <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP · Max 10MB</p>
                  </div>
                )
              }

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
              />

              {/* Tags */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {TAGS.map(t => (
                    <button
                      key={t}
                      onClick={() => toggleTag(t)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition capitalize ${
                        selectedTags.includes(t) ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alt text */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Alt Text (for accessibility)</label>
                <input
                  value={altText}
                  onChange={e => setAltText(e.target.value)}
                  placeholder="Describe the image…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                />
              </div>

              {uploadErr && <p className="text-red-500 text-sm">{uploadErr}</p>}
            </div>

            <div className="px-5 pb-5 flex gap-2 justify-end">
              <button onClick={() => { setShowUpload(false); setPendingFile(null); setPreview(null) }} className="px-4 py-2 text-sm text-gray-500">
                Cancel
              </button>
              <button
                onClick={uploadFile}
                disabled={!pendingFile || uploading}
                className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-100 disabled:text-gray-400 text-white font-semibold rounded-xl text-sm transition"
              >
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4" /> Upload</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
