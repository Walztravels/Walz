'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Plus, Pencil, Trash2, X, ChevronUp, ChevronDown,
  Upload, Link as LinkIcon, Eye, CheckCircle, AlertCircle,
  Loader2, GripVertical, ToggleLeft, ToggleRight, Image as ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface HeroSlide {
  id:               string
  imageUrl:         string
  headline:         string
  subheadline:      string | null
  badgeEmoji:       string | null
  badgeText:        string | null
  ctaPrimaryText:   string
  ctaPrimaryLink:   string
  ctaSecondaryText: string | null
  ctaSecondaryLink: string | null
  overlayDarkness:  number
  slideOrder:       number
  active:           boolean
}

const EMPTY: Omit<HeroSlide, 'id'> = {
  imageUrl:         '',
  headline:         '',
  subheadline:      '',
  badgeEmoji:       '',
  badgeText:        '',
  ctaPrimaryText:   'Start Your Journey',
  ctaPrimaryLink:   '/plan/new',
  ctaSecondaryText: 'Chat with Jade',
  ctaSecondaryLink: 'https://wa.me/12317902336',
  overlayDarkness:  55,
  slideOrder:       0,
  active:           true,
}

const COMMON_PAGES = [
  { label: '/ — Home',             value: '/'          },
  { label: '/visa — Visa',         value: '/visa'      },
  { label: '/flights — Flights',   value: '/flights'   },
  { label: '/hotels — Hotels',     value: '/hotels'    },
  { label: '/tours — Tours',       value: '/tours'     },
  { label: '/packages — Packages', value: '/packages'  },
  { label: '/esim — eSIM',         value: '/esim'      },
  { label: '/about — About',       value: '/about'     },
  { label: '/plan/new — Plan Trip',value: '/plan/new'  },
  { label: 'Custom URL…',          value: '__custom__' },
]

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastMsg { type: 'success' | 'error'; text: string }

function Toast({ toast }: { toast: ToastMsg | null }) {
  if (!toast) return null
  return (
    <div className={cn(
      'fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold',
      toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
    )}>
      {toast.type === 'success'
        ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
        : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
      {toast.text}
    </div>
  )
}

// ── Live preview ──────────────────────────────────────────────────────────────

function SlidePreview({ slide }: { slide: Omit<HeroSlide, 'id'> }) {
  const overlay = `rgba(11,31,58,${(slide.overlayDarkness / 100).toFixed(2)})`
  return (
    <div
      className="relative w-full rounded-xl overflow-hidden flex items-center justify-center"
      style={{ height: 220, background: '#0B1F3A' }}
    >
      {slide.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slide.imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
          onError={() => {}}
        />
      )}
      <div className="absolute inset-0" style={{ background: overlay }} />
      <div className="relative z-10 text-center px-4">
        {(slide.badgeEmoji || slide.badgeText) && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C9A84C]/20 border border-[#C9A84C]/40 text-[#C9A84C] text-xs font-semibold mb-2">
            {slide.badgeEmoji && <span>{slide.badgeEmoji}</span>}
            {slide.badgeText && <span>{slide.badgeText}</span>}
          </div>
        )}
        <h3 className="text-white font-bold text-lg leading-tight mb-1 line-clamp-2">
          {slide.headline || 'Your headline here'}
        </h3>
        {slide.subheadline && (
          <p className="text-white/60 text-xs mb-2 line-clamp-2">{slide.subheadline}</p>
        )}
        <div className="flex items-center justify-center gap-2 mt-2">
          {slide.ctaPrimaryText && (
            <span className="px-3 py-1 bg-[#C9A84C] text-[#0B1F3A] rounded-full text-xs font-bold">
              {slide.ctaPrimaryText}
            </span>
          )}
          {slide.ctaSecondaryText && (
            <span className="px-3 py-1 border border-white/30 text-white rounded-full text-xs font-semibold">
              {slide.ctaSecondaryText}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── CTA link field ────────────────────────────────────────────────────────────

function CtaLinkField({
  label, value, onChange, required,
}: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  const isCustom = !COMMON_PAGES.some(p => p.value === value && p.value !== '__custom__')
  const [mode, setMode] = useState<'select' | 'custom'>(isCustom && value ? 'custom' : 'select')
  const selectVal = mode === 'custom' ? '__custom__' : (value || '')

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        value={selectVal}
        onChange={e => {
          if (e.target.value === '__custom__') { setMode('custom') }
          else { setMode('select'); onChange(e.target.value) }
        }}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
      >
        <option value="">— choose page —</option>
        {COMMON_PAGES.map(p => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      {mode === 'custom' && (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="https://… or /path"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
        />
      )}
    </div>
  )
}

// ── Slide card ────────────────────────────────────────────────────────────────

function SlideCard({
  slide, index, total,
  onEdit, onDelete, onToggle, onMoveUp, onMoveDown,
}: {
  slide: HeroSlide; index: number; total: number
  onEdit: () => void; onDelete: () => void
  onToggle: () => void; onMoveUp: () => void; onMoveDown: () => void
}) {
  return (
    <div className={cn(
      'flex items-center gap-4 p-4 bg-white rounded-xl border transition-all',
      slide.active ? 'border-gray-200' : 'border-gray-100 opacity-60',
    )}>
      {/* Thumbnail */}
      <div className="relative w-[120px] h-[70px] rounded-lg overflow-hidden bg-[#0B1F3A] flex-shrink-0">
        {slide.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slide.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-white/30" />
          </div>
        )}
        <div className="absolute top-1 left-1">
          <span className="bg-[#0B1F3A]/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            #{index + 1}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#0B1F3A] text-sm truncate">
          {slide.headline || <span className="text-gray-400 italic">No headline</span>}
        </p>
        {(slide.badgeEmoji || slide.badgeText) && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#C9A84C] font-medium mt-0.5">
            {slide.badgeEmoji} {slide.badgeText}
          </span>
        )}
        <p className="text-xs text-gray-400 mt-0.5 truncate">
          {slide.ctaPrimaryText} → {slide.ctaPrimaryLink}
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Move up/down */}
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Move up"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Move down"
        >
          <ChevronDown className="w-4 h-4" />
        </button>

        {/* Toggle active */}
        <button
          onClick={onToggle}
          className={cn('p-1.5 rounded-lg transition-colors', slide.active ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100')}
          title={slide.active ? 'Active — click to hide' : 'Hidden — click to show'}
        >
          {slide.active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
        </button>

        {/* Edit */}
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
          title="Edit slide"
        >
          <Pencil className="w-4 h-4" />
        </button>

        {/* Delete */}
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Delete slide"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HeroSlidesPage() {
  const [slides,        setSlides]        = useState<HeroSlide[]>([])
  const [loading,       setLoading]       = useState(true)
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editingSlide,  setEditingSlide]  = useState<HeroSlide | null>(null)
  const [form,          setForm]          = useState<Omit<HeroSlide, 'id'>>(EMPTY)
  const [saving,        setSaving]        = useState(false)
  const [deleteId,      setDeleteId]      = useState<string | null>(null)
  const [deleting,      setDeleting]      = useState(false)
  const [toast,         setToast]         = useState<ToastMsg | null>(null)
  const [uploadMode,    setUploadMode]    = useState<'upload' | 'url'>('url')
  const [uploadPreview, setUploadPreview] = useState<string>('')
  const [uploading,     setUploading]     = useState(false)
  const [urlDebounce,   setUrlDebounce]   = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(type: 'success' | 'error', text: string) {
    setToast({ type, text })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Load slides ─────────────────────────────────────────────────────────
  async function loadSlides() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/hero-slides')
      const data = await res.json()
      setSlides(Array.isArray(data) ? data : [])
    } catch {
      showToast('error', 'Failed to load slides')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSlides() }, [])

  // ── Open modal ───────────────────────────────────────────────────────────
  function openAdd() {
    setEditingSlide(null)
    setForm({ ...EMPTY, slideOrder: slides.length })
    setUploadMode('url')
    setUploadPreview('')
    setUrlDebounce('')
    setModalOpen(true)
  }

  function openEdit(slide: HeroSlide) {
    setEditingSlide(slide)
    setForm({
      imageUrl:         slide.imageUrl,
      headline:         slide.headline,
      subheadline:      slide.subheadline ?? '',
      badgeEmoji:       slide.badgeEmoji ?? '',
      badgeText:        slide.badgeText ?? '',
      ctaPrimaryText:   slide.ctaPrimaryText,
      ctaPrimaryLink:   slide.ctaPrimaryLink,
      ctaSecondaryText: slide.ctaSecondaryText ?? '',
      ctaSecondaryLink: slide.ctaSecondaryLink ?? '',
      overlayDarkness:  slide.overlayDarkness,
      slideOrder:       slide.slideOrder,
      active:           slide.active,
    })
    setUploadMode('url')
    setUploadPreview('')
    setUrlDebounce(slide.imageUrl)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingSlide(null)
    setUploadPreview('')
  }

  // ── Field helpers ────────────────────────────────────────────────────────
  function set<K extends keyof typeof form>(key: K, val: typeof form[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  // URL debounce preview
  function handleUrlChange(url: string) {
    set('imageUrl', url)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setUrlDebounce(url), 500)
  }

  // ── File upload ──────────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Local preview
    const localUrl = URL.createObjectURL(file)
    setUploadPreview(localUrl)

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/hero-slides/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        showToast('error', data.error || 'Upload failed')
        setUploadPreview('')
      } else {
        set('imageUrl', data.url)
        showToast('success', 'Image uploaded ✓')
      }
    } catch {
      showToast('error', 'Upload failed')
      setUploadPreview('')
    } finally {
      setUploading(false)
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.headline.trim()) { showToast('error', 'Headline is required'); return }
    if (!form.imageUrl.trim()) { showToast('error', 'Image is required'); return }
    if (!form.ctaPrimaryText.trim()) { showToast('error', 'Primary CTA text is required'); return }
    if (!form.ctaPrimaryLink.trim()) { showToast('error', 'Primary CTA link is required'); return }

    setSaving(true)
    try {
      const payload = {
        ...form,
        subheadline:      form.subheadline      || null,
        badgeEmoji:       form.badgeEmoji        || null,
        badgeText:        form.badgeText         || null,
        ctaSecondaryText: form.ctaSecondaryText  || null,
        ctaSecondaryLink: form.ctaSecondaryLink  || null,
      }
      const url  = editingSlide ? `/api/admin/hero-slides/${editingSlide.id}` : '/api/admin/hero-slides'
      const method = editingSlide ? 'PATCH' : 'POST'
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const data = await res.json()
        showToast('error', data.error || 'Save failed')
        return
      }
      showToast('success', 'Slide saved successfully ✓')
      closeModal()
      loadSlides()
    } catch {
      showToast('error', 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active ────────────────────────────────────────────────────────
  async function handleToggle(slide: HeroSlide) {
    await fetch(`/api/admin/hero-slides/${slide.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !slide.active }),
    })
    setSlides(prev => prev.map(s => s.id === slide.id ? { ...s, active: !s.active } : s))
  }

  // ── Reorder ──────────────────────────────────────────────────────────────
  async function moveSlide(index: number, direction: 'up' | 'down') {
    const next = [...slides]
    const swap = direction === 'up' ? index - 1 : index + 1
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    const reordered = next.map((s, i) => ({ ...s, slideOrder: i }))
    setSlides(reordered)
    await fetch('/api/admin/hero-slides/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: reordered.map(s => ({ id: s.id, slide_order: s.slideOrder })) }),
    })
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await fetch(`/api/admin/hero-slides/${deleteId}`, { method: 'DELETE' })
      setSlides(prev => prev.filter(s => s.id !== deleteId))
      showToast('success', 'Slide deleted')
      setDeleteId(null)
    } catch {
      showToast('error', 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  // ── Preview image src ────────────────────────────────────────────────────
  const previewImage = uploadMode === 'upload' ? (uploadPreview || form.imageUrl) : form.imageUrl

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Hero Slideshow</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage homepage rotating images</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Slide
        </button>
      </div>

      {/* Slide list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : slides.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-dashed border-gray-200">
          <span className="text-5xl mb-4">🖼️</span>
          <p className="font-semibold text-[#0B1F3A] text-lg mb-1">No slides yet</p>
          <p className="text-gray-400 text-sm mb-6">Add your first hero image to get started</p>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Your First Slide
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {slides.map((slide, i) => (
            <SlideCard
              key={slide.id}
              slide={slide}
              index={i}
              total={slides.length}
              onEdit={() => openEdit(slide)}
              onDelete={() => setDeleteId(slide.id)}
              onToggle={() => handleToggle(slide)}
              onMoveUp={() => moveSlide(i, 'up')}
              onMoveDown={() => moveSlide(i, 'down')}
            />
          ))}
          <p className="text-xs text-gray-400 text-center pt-2">
            {slides.length} slide{slides.length !== 1 ? 's' : ''} · Use arrows to reorder
          </p>
        </div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />

          {/* Panel */}
          <div className="relative ml-auto w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">

            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-[#0B1F3A]">
                {editingSlide ? 'Edit Slide' : 'Add New Slide'}
              </h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 p-6 space-y-6">

              {/* ── Live Preview ─────────────────────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Live Preview
                </p>
                <SlidePreview slide={{ ...form, imageUrl: previewImage }} />
              </div>

              {/* ── Image ──────────────────────────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Image <span className="text-red-500">*</span>
                </p>
                {/* Upload vs URL toggle */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setUploadMode('upload')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                      uploadMode === 'upload' ? 'bg-[#0B1F3A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                    )}
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload Photo
                  </button>
                  <button
                    onClick={() => setUploadMode('url')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                      uploadMode === 'url' ? 'bg-[#0B1F3A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                    )}
                  >
                    <LinkIcon className="w-3.5 h-3.5" /> Paste URL
                  </button>
                </div>

                {uploadMode === 'upload' ? (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                        uploading ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-gray-200 hover:border-[#C9A84C] hover:bg-[#C9A84C]/5',
                      )}
                    >
                      {uploading ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
                          <p className="text-sm text-gray-500">Uploading…</p>
                        </div>
                      ) : uploadPreview ? (
                        <div className="flex flex-col items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={uploadPreview} alt="" className="w-32 h-20 object-cover rounded-lg" />
                          <p className="text-xs text-green-600 font-semibold">Uploaded ✓ — click to change</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <Upload className="w-8 h-8" />
                          <p className="text-sm font-medium">Click to select or drag & drop</p>
                          <p className="text-xs">JPG, PNG, WebP · Max 5MB</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={form.imageUrl}
                      onChange={e => handleUrlChange(e.target.value)}
                      placeholder="https://images.unsplash.com/…"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
                    />
                    <p className="text-xs text-gray-400 mt-1">Preview updates after 500ms</p>
                  </div>
                )}
              </div>

              {/* ── Badge ──────────────────────────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Badge (optional)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Emoji</label>
                    <input
                      type="text"
                      value={form.badgeEmoji ?? ''}
                      onChange={e => set('badgeEmoji', e.target.value.slice(0, 4))}
                      placeholder="✈️"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Badge text</label>
                    <input
                      type="text"
                      value={form.badgeText ?? ''}
                      onChange={e => set('badgeText', e.target.value.slice(0, 40))}
                      placeholder="New Destinations"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
                    />
                  </div>
                </div>
              </div>

              {/* ── Headline ───────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-600">
                    Headline <span className="text-red-500">*</span>
                  </label>
                  <span className={cn('text-xs', form.headline.length > 55 ? 'text-red-500' : 'text-gray-400')}>
                    {form.headline.length}/60
                  </span>
                </div>
                <input
                  type="text"
                  value={form.headline}
                  onChange={e => set('headline', e.target.value.slice(0, 60))}
                  placeholder="The World Is Waiting For You."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
                />
              </div>

              {/* ── Subheadline ─────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-600">Subheadline</label>
                  <span className={cn('text-xs', (form.subheadline?.length ?? 0) > 110 ? 'text-red-500' : 'text-gray-400')}>
                    {form.subheadline?.length ?? 0}/120
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={form.subheadline ?? ''}
                  onChange={e => set('subheadline', e.target.value.slice(0, 120))}
                  placeholder="Flights. Visas. Hotels. Tours. All handled by experts."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
                />
              </div>

              {/* ── CTAs ────────────────────────────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Call to Action</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Primary text <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.ctaPrimaryText}
                      onChange={e => set('ctaPrimaryText', e.target.value)}
                      placeholder="Start Your Journey"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Secondary text
                    </label>
                    <input
                      type="text"
                      value={form.ctaSecondaryText ?? ''}
                      onChange={e => set('ctaSecondaryText', e.target.value)}
                      placeholder="Chat with Jade"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <CtaLinkField
                    label="Primary link"
                    value={form.ctaPrimaryLink}
                    onChange={v => set('ctaPrimaryLink', v)}
                    required
                  />
                  <CtaLinkField
                    label="Secondary link"
                    value={form.ctaSecondaryLink ?? ''}
                    onChange={v => set('ctaSecondaryLink', v)}
                  />
                </div>
              </div>

              {/* ── Overlay darkness ────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600">
                    Overlay darkness
                  </label>
                  <span className="text-xs font-bold text-[#C9A84C]">{form.overlayDarkness}%</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={80}
                  value={form.overlayDarkness}
                  onChange={e => set('overlayDarkness', Number(e.target.value))}
                  className="w-full accent-[#C9A84C]"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>30% — lighter</span>
                  <span>80% — darker</span>
                </div>
              </div>

              {/* ── Order + Active ───────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Display order</label>
                  <input
                    type="number"
                    min={0}
                    value={form.slideOrder}
                    onChange={e => set('slideOrder', Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">0 = first slide</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                  <button
                    type="button"
                    onClick={() => set('active', !form.active)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold w-full transition-colors',
                      form.active
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-gray-200 bg-gray-50 text-gray-500',
                    )}
                  >
                    {form.active
                      ? <><ToggleRight className="w-4 h-4" /> Active — showing</>
                      : <><ToggleLeft className="w-4 h-4" /> Hidden</>}
                  </button>
                </div>
              </div>
            </div>

            {/* Panel footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#C9A84C] hover:bg-[#b8943d] disabled:opacity-60 text-[#0B1F3A] font-bold rounded-xl transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? 'Saving…' : 'Save Slide'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ──────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-80 mx-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-base font-bold text-[#0B1F3A] text-center mb-1">Delete this slide?</h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              This removes it from the homepage permanently.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  )
}
