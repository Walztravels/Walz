'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Image as ImageIcon, Upload, RotateCcw, PenLine,
  Check, X, ChevronDown, ChevronUp, Lock,
  Layers, Star, RefreshCw, Settings2,
} from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MediaItem {
  id:           string
  media_key:    string
  label:        string
  page:         string
  section:      string
  media_type:   string
  current_url:  string | null
  original_url: string | null
  file_name:    string | null
  file_size:    number | null
  alt_text:     string | null
  updated_at:   string | null
  updated_by:   string | null
}

interface Toast {
  id:      number
  type:    'success' | 'error'
  message: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_OPTIONS = [
  { value: 'all',       label: 'All Pages'  },
  { value: 'all',       label: '——',         divider: true },
  { value: 'homepage',  label: 'Homepage'   },
  { value: 'about',     label: 'About'      },
  { value: 'tours',     label: 'Tours'      },
  { value: 'packages',  label: 'Packages'   },
  { value: 'visa',      label: 'Visa'       },
  { value: 'insurance', label: 'Insurance'  },
  { value: 'transfers', label: 'Transfers'  },
  { value: 'esim',      label: 'eSIM'       },
  { value: 'help',      label: 'Help'       },
  { value: 'blog',      label: 'Blog'       },
  { value: 'all',       label: 'All Pages (Brand)', divider: true },
]

const TYPE_OPTIONS = [
  { value: 'all',   label: 'All Types'        },
  { value: 'logo',  label: 'Logo & Brand'     },
  { value: 'icon',  label: 'Icons & Favicons' },
  { value: 'image', label: 'Images'           },
]

const PAGE_LABELS: Record<string, string> = {
  all:       'Brand & Global',
  homepage:  'Homepage',
  about:     'About Page',
  tours:     'Tours',
  packages:  'Packages',
  visa:      'Visa',
  insurance: 'Insurance',
  transfers: 'Transfers',
  esim:      'eSIM / Jade Connect',
  help:      'Help Centre',
  blog:      'Blog',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCustom(item: MediaItem) {
  return (
    !!item.file_name ||
    (item.current_url !== item.original_url && !!item.original_url)
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Media Card ────────────────────────────────────────────────────────────────

function MediaCard({
  item,
  onReplace,
  onAltEdit,
  onReset,
  resetting,
}: {
  item:       MediaItem
  onReplace:  (item: MediaItem) => void
  onAltEdit:  (item: MediaItem) => void
  onReset:    (item: MediaItem) => void
  resetting:  string | null
}) {
  const custom  = isCustom(item)
  const loading = resetting === item.media_key

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
      {/* Image preview */}
      <div className="relative h-44 bg-gray-100 overflow-hidden group">
        {item.current_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.current_url}
            alt={item.alt_text ?? item.label}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='176' fill='%23E2D9CC'%3E%3Crect width='200' height='176'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='12'%3ENo preview%3C/text%3E%3C/svg%3E"
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-2">
            <ImageIcon className="w-10 h-10" />
            <span className="text-xs">No image set</span>
          </div>
        )}

        {/* Custom badge */}
        {custom && (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-[#C9A84C] text-[#0B1F3A] text-[10px] font-bold rounded-full">
            Custom
          </span>
        )}

        {loading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <p className="text-[#0B1F3A] font-semibold text-sm leading-tight mb-0.5">{item.label}</p>
        <p className="text-gray-400 text-xs mb-1 capitalize">{PAGE_LABELS[item.page] ?? item.page} · {item.section}</p>

        {item.file_name ? (
          <p className="text-gray-400 text-[11px] truncate" title={item.file_name}>{item.file_name}</p>
        ) : (
          <p className="text-gray-300 text-[11px]">Default image</p>
        )}

        {item.file_size && (
          <p className="text-gray-300 text-[11px]">{formatBytes(item.file_size)}</p>
        )}

        {item.updated_at && (
          <p className="text-gray-300 text-[11px] mt-0.5">
            {item.updated_by ? `${item.updated_by} · ` : ''}{timeAgo(item.updated_at)}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          <button
            onClick={() => onReplace(item)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] text-xs font-bold rounded-lg transition-colors"
          >
            <Upload className="w-3 h-3" />
            Replace
          </button>

          <button
            onClick={() => onAltEdit(item)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 hover:border-[#C9A84C] text-gray-600 hover:text-[#C9A84C] text-xs font-medium rounded-lg transition-colors"
          >
            <PenLine className="w-3 h-3" />
            Alt Text
          </button>

          {custom && (
            <button
              onClick={() => onReset(item)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 hover:border-red-400 text-red-400 hover:text-red-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MediaImagesPage() {
  const router = useRouter()
  const { role, loading: permLoading } = useStaffPermissions()

  // ── Data ───────────────────────────────────────────────────────────────────
  const [media,   setMedia]   = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [setupRunning, setSetupRunning] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search,     setSearch]     = useState('')
  const [pageFilter, setPageFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  // ── Collapsed sections ─────────────────────────────────────────────────────
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['all', 'homepage', 'about']))

  // ── Replace modal ──────────────────────────────────────────────────────────
  const [replaceTarget,  setReplaceTarget]  = useState<MediaItem | null>(null)
  const [previewFile,    setPreviewFile]    = useState<File | null>(null)
  const [previewUrl,     setPreviewUrl]     = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading,      setUploading]      = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Alt text edit ──────────────────────────────────────────────────────────
  const [altEditKey,   setAltEditKey]   = useState<string | null>(null)
  const [altEditValue, setAltEditValue] = useState('')
  const [savingAlt,    setSavingAlt]    = useState(false)

  // ── Reset ──────────────────────────────────────────────────────────────────
  const [resetting, setResetting] = useState<string | null>(null)

  // ── Toasts ─────────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  function showToast(type: Toast['type'], message: string) {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  // ── Access guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!permLoading && role !== 'super_admin') {
      router.replace('/admin/unauthorized')
    }
  }, [permLoading, role, router])

  // ── Load media ─────────────────────────────────────────────────────────────
  const loadMedia = useCallback(async () => {
    setLoading(true)
    setDbError(null)
    try {
      const res  = await fetch('/api/admin/media', { credentials: 'include' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setDbError(data?.error ?? 'Failed to load media')
        return
      }
      setMedia(data.media ?? [])
    } catch (e: unknown) {
      setDbError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMedia() }, [loadMedia])

  // ── Setup DB ───────────────────────────────────────────────────────────────
  async function runSetup() {
    setSetupRunning(true)
    try {
      const res  = await fetch('/api/admin/media/setup', { method: 'POST', credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast('success', 'Database table created and seeded.')
        await loadMedia()
      } else {
        showToast('error', data.error ?? 'Setup failed')
      }
    } catch {
      showToast('error', 'Setup request failed')
    } finally {
      setSetupRunning(false)
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total   = media.length
    const custom  = media.filter(isCustom).length
    const defaults = total - custom
    const latest  = media
      .filter(m => m.updated_at)
      .sort((a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime())[0]
    return { total, custom, defaults, lastUpdated: latest?.updated_at ?? null }
  }, [media])

  // ── Filtered + grouped ─────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = media.filter(item => {
      if (q && !item.label.toLowerCase().includes(q) && !item.media_key.includes(q)) return false
      if (pageFilter !== 'all' && item.page !== pageFilter) return false
      if (typeFilter !== 'all' && item.media_type !== typeFilter) return false
      return true
    })

    const byPage: Record<string, MediaItem[]> = {}
    for (const item of filtered) {
      if (!byPage[item.page]) byPage[item.page] = []
      byPage[item.page].push(item)
    }

    // Sort pages: 'all' first, then alphabetical
    return Object.entries(byPage).sort(([a], [b]) => {
      if (a === 'all') return -1
      if (b === 'all') return 1
      return a.localeCompare(b)
    })
  }, [media, search, pageFilter, typeFilter])

  function toggleSection(page: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(page)) next.delete(page); else next.add(page)
      return next
    })
  }

  // ── Replace actions ────────────────────────────────────────────────────────
  function openReplace(item: MediaItem) {
    setReplaceTarget(item)
    setPreviewFile(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setUploadProgress(0)
  }

  function closeReplace() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setReplaceTarget(null)
    setPreviewFile(null)
    setPreviewUrl(null)
    setUploadProgress(0)
    setUploading(false)
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 10 * 1024 * 1024) {
      showToast('error', 'File too large — maximum is 10 MB')
      e.target.value = ''
      return
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']
    if (!allowed.includes(f.type)) {
      showToast('error', 'Invalid file — use JPG, PNG, WebP, SVG or GIF')
      e.target.value = ''
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    e.target.value = ''
  }

  async function confirmReplace() {
    if (!replaceTarget || !previewFile) return
    setUploading(true)
    setUploadProgress(5)

    // Simulate progress while uploading
    const ticker = setInterval(() => {
      setUploadProgress(p => Math.min(p + 8, 85))
    }, 200)

    const fd = new FormData()
    fd.append('media_key', replaceTarget.media_key)
    fd.append('file', previewFile)
    if (replaceTarget.alt_text) fd.append('alt_text', replaceTarget.alt_text)

    try {
      const res  = await fetch('/api/admin/media', { method: 'PATCH', body: fd, credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      clearInterval(ticker)

      if (res.ok) {
        setUploadProgress(100)
        await loadMedia()
        showToast('success', `✓ ${replaceTarget.label} updated — changes live immediately`)
        setTimeout(closeReplace, 600)
      } else {
        showToast('error', data.error ?? 'Upload failed')
        setUploadProgress(0)
      }
    } catch {
      clearInterval(ticker)
      showToast('error', 'Network error — please retry')
      setUploadProgress(0)
    } finally {
      setUploading(false)
    }
  }

  // ── Alt text actions ───────────────────────────────────────────────────────
  function openAltEdit(item: MediaItem) {
    setAltEditKey(item.media_key)
    setAltEditValue(item.alt_text ?? '')
  }

  async function saveAlt() {
    if (!altEditKey) return
    setSavingAlt(true)
    const fd = new FormData()
    fd.append('media_key', altEditKey)
    fd.append('alt_text',  altEditValue)
    const res  = await fetch('/api/admin/media', { method: 'PATCH', body: fd, credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      await loadMedia()
      showToast('success', 'Alt text saved')
      setAltEditKey(null)
    } else {
      showToast('error', data.error ?? 'Failed to save alt text')
    }
    setSavingAlt(false)
  }

  // ── Reset actions ──────────────────────────────────────────────────────────
  async function handleReset(item: MediaItem) {
    if (!confirm(`Reset "${item.label}" to the default image?`)) return
    setResetting(item.media_key)
    const res  = await fetch('/api/admin/media', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ media_key: item.media_key }),
      credentials: 'include',
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      await loadMedia()
      showToast('success', `${item.label} reset to default`)
    } else {
      showToast('error', data.error ?? 'Reset failed')
    }
    setResetting(null)
  }

  // ── Loading / access guard ─────────────────────────────────────────────────
  if (permLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Lock className="w-10 h-10 text-gray-300" />
        <p className="text-gray-500 font-medium">Access restricted to Super Admin</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl">

      {/* ── Toasts ─────────────────────────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold pointer-events-auto max-w-xs',
              t.type === 'success'
                ? 'bg-[#0B1F3A] text-white border border-[#C9A84C]/30'
                : 'bg-red-50 text-red-700 border border-red-200',
            )}
          >
            {t.type === 'success'
              ? <Check className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
              : <X className="w-4 h-4 flex-shrink-0" />
            }
            {t.message}
          </div>
        ))}
      </div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-5 h-5 text-[#C9A84C]" />
          <h1 className="text-xl font-bold text-[#0B1F3A]">Media & Images</h1>
        </div>
        <p className="text-sm text-gray-400">
          Replace any photo, logo, icon or hero image across the website. Changes go live immediately — no redeployment needed.
        </p>
      </div>

      {/* ── DB error / setup ───────────────────────────────────────────────── */}
      {dbError && (
        <div className="mb-6 p-5 bg-amber-50 border border-amber-200 rounded-2xl">
          <p className="text-amber-800 font-semibold text-sm mb-2">Media database not set up yet</p>
          <p className="text-amber-700 text-xs mb-4">{dbError}</p>
          <button
            onClick={runSetup}
            disabled={setupRunning}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0B1F3A] text-white text-sm font-bold rounded-xl hover:bg-[#0d2345] transition-colors disabled:opacity-60"
          >
            {setupRunning
              ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Setting up…</>
              : <><Settings2 className="w-4 h-4" /> Run Database Setup</>
            }
          </button>
        </div>
      )}

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { icon: Layers, label: 'Total Managed',    value: String(stats.total),    sub: 'media items' },
          { icon: Star,   label: 'Custom Uploads',   value: String(stats.custom),   sub: 'replaced' },
          { icon: ImageIcon, label: 'Using Defaults',value: String(stats.defaults), sub: 'originals' },
          { icon: RefreshCw, label: 'Last Updated',  value: stats.lastUpdated ? timeAgo(stats.lastUpdated) : '—', sub: 'most recent' },
        ].map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-[#C9A84C]" />
              <span className="text-xs text-gray-400 font-medium">{label}</span>
            </div>
            <p className="text-2xl font-bold text-[#0B1F3A] leading-none">{value}</p>
            <p className="text-xs text-gray-300 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1 min-w-0">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by label or key…"
            className="w-full h-10 pl-4 pr-4 rounded-xl border border-gray-200 text-sm text-[#0B1F3A] placeholder-gray-300 outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] bg-white"
          />
        </div>

        <select
          value={pageFilter}
          onChange={e => setPageFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-[#0B1F3A] outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] bg-white"
        >
          <option value="all">All Pages</option>
          <option value="homepage">Homepage</option>
          <option value="about">About</option>
          <option value="tours">Tours</option>
          <option value="packages">Packages</option>
          <option value="visa">Visa</option>
          <option value="insurance">Insurance</option>
          <option value="transfers">Transfers</option>
          <option value="esim">eSIM</option>
          <option value="help">Help</option>
          <option value="blog">Blog</option>
        </select>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-[#0B1F3A] outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] bg-white"
        >
          {TYPE_OPTIONS.map(o => (
            <option key={o.value + o.label} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* ── Media grid grouped by page ─────────────────────────────────────── */}
      {groups.length === 0 && !dbError && (
        <div className="text-center py-16 text-gray-400 text-sm">
          {search ? `No results for "${search}"` : 'No media items found'}
        </div>
      )}

      <div className="space-y-6">
        {groups.map(([page, items]) => {
          const open = openSections.has(page)
          return (
            <div key={page} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Section header */}
              <button
                type="button"
                onClick={() => toggleSection(page)}
                className="w-full flex items-center justify-between gap-4 px-6 py-4 hover:bg-gray-50/60 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-[#0B1F3A]">
                    {PAGE_LABELS[page] ?? page.charAt(0).toUpperCase() + page.slice(1)}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold">
                    {items.length}
                  </span>
                  <span className="text-xs text-[#C9A84C] font-medium">
                    {items.filter(isCustom).length > 0
                      ? `${items.filter(isCustom).length} custom`
                      : 'all defaults'
                    }
                  </span>
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {/* Items grid */}
              {open && (
                <div className="border-t border-gray-100 px-6 py-6">

                  {/* Alt text edit (inline) */}
                  {altEditKey && items.some(i => i.media_key === altEditKey) && (
                    <div className="mb-5 p-4 bg-[#F5F2EE] rounded-xl border border-[#C9A84C]/20">
                      <p className="text-xs font-bold text-[#0B1F3A] mb-2">
                        Edit Alt Text — {items.find(i => i.media_key === altEditKey)?.label}
                      </p>
                      <div className="flex gap-2">
                        <input
                          autoFocus
                          value={altEditValue}
                          onChange={e => setAltEditValue(e.target.value)}
                          placeholder="Descriptive alt text for accessibility…"
                          className="flex-1 h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[#C9A84C]/30 bg-white"
                        />
                        <button
                          onClick={saveAlt}
                          disabled={savingAlt}
                          className="flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] text-white text-xs font-bold rounded-lg hover:bg-[#0d2345] transition-colors disabled:opacity-60"
                        >
                          {savingAlt ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Save
                        </button>
                        <button
                          onClick={() => setAltEditKey(null)}
                          className="px-3 py-2 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {items.map(item => (
                      <MediaCard
                        key={item.media_key}
                        item={item}
                        onReplace={openReplace}
                        onAltEdit={openAltEdit}
                        onReset={handleReset}
                        resetting={resetting}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Logo notes ─────────────────────────────────────────────────────── */}
      {!dbError && media.length > 0 && (
        <div className="mt-8 p-5 bg-[#0B1F3A] rounded-2xl">
          <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-wider mb-2">Logo Upload Guidelines</p>
          <p className="text-white/60 text-xs leading-relaxed">
            Recommended logo size: <strong className="text-white">200 × 60 px</strong> · Format: <strong className="text-white">PNG with transparent background</strong> or SVG for best quality.
            Logo changes appear on all pages immediately. Favicon changes require a redeployment to take full effect in all browsers.
          </p>
        </div>
      )}

      {/* ── Replace modal ───────────────────────────────────────────────────── */}
      {replaceTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">Replace Image</p>
                <h3 className="font-bold text-[#0B1F3A] text-sm">{replaceTarget.label}</h3>
              </div>
              <button onClick={closeReplace} disabled={uploading} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Side by side comparison */}
            <div className="grid grid-cols-2 gap-4 p-6 bg-gray-50">
              {/* Current */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Current</p>
                <div className="relative h-40 rounded-xl overflow-hidden bg-gray-200">
                  {replaceTarget.current_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={replaceTarget.current_url}
                      alt={replaceTarget.label}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                      No current image
                    </div>
                  )}
                </div>
              </div>

              {/* New preview */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">New Image</p>
                <div
                  className={cn(
                    'relative h-40 rounded-xl overflow-hidden border-2 border-dashed transition-colors cursor-pointer',
                    previewUrl
                      ? 'border-[#C9A84C] bg-gray-100'
                      : 'border-gray-300 bg-gray-100 hover:border-[#C9A84C]',
                  )}
                  onClick={() => !uploading && fileInputRef.current?.click()}
                >
                  {previewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={previewUrl} alt="New preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                      <Upload className="w-6 h-6" />
                      <span className="text-xs font-medium">Click to choose file</span>
                      <span className="text-[10px] text-gray-300">JPG · PNG · WebP · SVG · Max 10 MB</span>
                    </div>
                  )}
                </div>
                {previewFile && (
                  <p className="text-xs text-gray-400 mt-1.5 truncate">
                    {previewFile.name} · {formatBytes(previewFile.size)}
                  </p>
                )}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
              className="hidden"
              onChange={handleFilePick}
            />

            {/* Alt text */}
            <div className="px-6 pb-4">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Alt Text <span className="font-normal text-gray-300">(optional)</span>
              </label>
              <input
                value={replaceTarget.alt_text ?? ''}
                onChange={e => setReplaceTarget({ ...replaceTarget, alt_text: e.target.value })}
                placeholder="Describe this image for accessibility…"
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
              />
            </div>

            {/* Progress bar */}
            {uploading && (
              <div className="px-6 pb-3">
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#C9A84C] rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Uploading… {uploadProgress}%</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={closeReplace}
                disabled={uploading}
                className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmReplace}
                disabled={!previewFile || uploading}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#0B1F3A] text-white text-sm font-bold rounded-xl hover:bg-[#0d2345] transition-colors disabled:opacity-50"
              >
                {uploading
                  ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Uploading…</>
                  : <><Check className="w-4 h-4" /> Save Image</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
