'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { PosterCompositor, defaultPosterData, type PosterData } from './PosterCompositor'
import { BRAND_PRESETS, FORMAT_PRESETS } from '@/lib/orbit/creative-presets'
import {
  ALL_TEMPLATES, TEMPLATE_MAP, templatesForCampaignType, TEMPLATE_CANVASES,
  type WalzTemplate, type CampaignType, CAMPAIGN_TYPE_LABELS,
} from '@/lib/orbit/templates'
import {
  buildTemplateComposition, type DesignComposition,
  defaultDesignControls, type DesignControls,
  scoreComposition, type QualityScoreResult,
  applyPolishAction, type PolishAction,
  applyVariationControls, type DesignVariation,
  TEMPLATE_SAFE_ZONES, type TemplateSafeZones,
} from '@/lib/orbit/composer'
import { DesignerControlsPanel } from './DesignerControlsPanel'

// ── Types ─────────────────────────────────────────────────────────────────────

type ImageSource  = 'ai' | 'library' | 'upload'
type VideoSrcMode = 'assets' | 'library' | 'upload'

interface LibraryMedia {
  id:         string
  filename:   string
  url:        string
  mimeType:   string
  sizeBytes:  number | null
  tags:       string[]
  altText:    string | null
  uploadedBy: string
  createdAt:  string
}

interface Asset {
  id:               string
  source:           'generated' | 'uploaded'
  mediaType:        'image' | 'video'
  format:           string
  publicUrl:        string | null
  prompt:           string | null
  altText:          string
  provider:         string | null
  model:            string | null
  generationStatus: string | null
  providerJobId:    string | null
  posterData:       PosterData | null
  isReference:      boolean
  status:           string
  createdAt:        string
  costUsd:          string
  width:            number | null
  height:           number | null
  durationMs:       number | null
}

interface ProviderHealth {
  status:     string   // 'configured' | 'disabled' | 'missing_key' | 'invalid_configuration'
  provider:   string
  model:      string
  enabled:    boolean
  configured: boolean
  reason:     string
}

interface Capabilities {
  openaiEnabled:    boolean
  replicateEnabled: boolean
  runwayEnabled:    boolean      // always false; kept for backward compat
  falVideoEnabled:  boolean
  imageHealth?:     ProviderHealth
  videoHealth?:     ProviderHealth
}

interface Props {
  campaignId:       string
  destination:      string
  objective:        string
  promotionDetails: string
  cta:              string
  tone:             string
}

// ── Tab definition ────────────────────────────────────────────────────────────

type Tab = 'POSTER' | 'SOCIAL' | 'VIDEO' | 'ASSETS' | 'DESIGNER'

// ── Provider / model display labels ──────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  openai:    'OpenAI GPT-Image',
  replicate: 'Replicate / Flux',
  fal:       'FAL.ai',
  runway:    'Runway (legacy)',
}

// Video model options shown in the VIDEO tab.
// Server validates these keys — never send arbitrary FAL endpoints.
const VIDEO_MODEL_OPTIONS = [
  { key: 'kling',    name: 'Kling 3.0',  tier: 'Recommended' },
  { key: 'veo',      name: 'Veo 3',      tier: 'Premium'     },
  { key: 'seedance', name: 'Seedance',   tier: 'Alternative' },
] as const

// Motion preset prompts — staff-friendly descriptions
const MOTION_PRESETS = [
  { key: 'cinematic_push',      label: 'Cinematic Push In',     prompt: 'Slow cinematic push-in camera movement, golden hour light, cinematic depth of field' },
  { key: 'slow_zoom',           label: 'Slow Zoom',             prompt: 'Gentle slow zoom into the scene, smooth parallax, soft ambient natural light' },
  { key: 'airport_arrival',     label: 'Airport Arrival',       prompt: 'Bustling airport arrival atmosphere, travellers in motion, warm terminal lighting' },
  { key: 'luxury_reveal',       label: 'Luxury Reveal',         prompt: 'Elegant luxury reveal with slow pan, premium atmosphere, rich warm tones' },
  { key: 'destination_panorama',label: 'Destination Panorama',  prompt: 'Wide sweeping panorama across the destination landscape, drone-like perspective' },
  { key: 'people_walking',      label: 'People Walking',        prompt: 'Travellers walking through the destination, natural movement, lively atmosphere' },
  { key: 'ocean_movement',      label: 'Ocean Movement',        prompt: 'Gentle ocean waves and coastal atmosphere, slow rhythmic movement, serene' },
  { key: 'city_motion',         label: 'City Motion',           prompt: 'City in motion with subtle camera drift, urban energy, vibrant street life' },
  { key: 'aircraft_movement',   label: 'Aircraft Movement',     prompt: 'Aircraft in graceful motion against a clear sky, contrails, sense of journey' },
  { key: 'celebration',         label: 'Celebration',           prompt: 'Joyful celebration atmosphere, people smiling and connecting, warm ambient light' },
]

// ── Provider status pill ──────────────────────────────────────────────────────

function ProviderStatusPill({ label, name, status, reason }: {
  label:   string
  name:    string
  status:  string
  reason?: string
}) {
  const colors: Record<string, string> = {
    configured:           'text-green-500',
    disabled:             'text-gray-600',
    missing_key:          'text-red-400',
    invalid_configuration: 'text-orange-400',
  }
  const dots: Record<string, string> = {
    configured:           '●',
    disabled:             '○',
    missing_key:          '●',
    invalid_configuration: '●',
  }
  const labels: Record<string, string> = {
    configured:           'Ready',
    disabled:             'Disabled',
    missing_key:          'Key missing',
    invalid_configuration: 'Bad config',
  }
  const color = colors[status] ?? 'text-gray-500'
  const dot   = dots[status]   ?? '○'
  const badge = labels[status] ?? status

  return (
    <div className="flex flex-col items-end" title={reason}>
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium ${color}`}>
        {dot} {name} · {badge}
      </span>
    </div>
  )
}

// ── Health row (for diagnostic panel) ────────────────────────────────────────

function HealthRow({ health }: { health: Record<string, unknown> | null | undefined }) {
  if (!health) return <p className="text-gray-600">No data</p>
  const statusColors: Record<string, string> = {
    configured:           'text-green-400',
    disabled:             'text-gray-500',
    missing_key:          'text-red-400',
    invalid_configuration: 'text-orange-400',
  }
  return (
    <div className="flex items-center gap-3">
      <span className={`font-semibold capitalize ${statusColors[String(health.status)] ?? 'text-gray-400'}`}>
        {String(health.status).replace(/_/g, ' ')}
      </span>
      <span className="text-gray-400">{String(health.model ?? '')}</span>
      <span className="text-gray-600">{String(health.reason ?? '')}</span>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  const colors: Record<string, string> = {
    pending:    'bg-yellow-900 text-yellow-300',
    processing: 'bg-blue-900 text-blue-300',
    queued:     'bg-yellow-900 text-yellow-300',
    completed:  'bg-green-900 text-green-300',
    failed:     'bg-red-900 text-red-300',
    draft:      'bg-gray-700 text-gray-300',
    approved:   'bg-green-900 text-green-300',
    rejected:   'bg-red-900 text-red-300',
  }
  const s = status ?? 'draft'
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize ${colors[s] ?? colors.draft}`}>
      {s}
    </span>
  )
}

// ── Asset thumbnail ───────────────────────────────────────────────────────────

function AssetThumb({
  asset, selected, onSelect, onAnimate, onDelete, falVideoEnabled,
}: {
  asset:           Asset
  selected:        boolean
  onSelect:        () => void
  onAnimate:       () => void
  onDelete:        () => void
  falVideoEnabled: boolean
}) {
  const isPending = asset.generationStatus === 'pending' || asset.generationStatus === 'processing' || asset.generationStatus === 'queued'

  return (
    <div
      className={`relative rounded-xl border overflow-hidden cursor-pointer transition-all ${
        selected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-800 hover:border-gray-600'
      }`}
      onClick={onSelect}
    >
      {asset.publicUrl && !isPending ? (
        asset.mediaType === 'video'
          ? <video src={asset.publicUrl} className="w-full aspect-square object-cover" muted playsInline />
          : <img src={asset.publicUrl} alt={asset.altText} className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-square bg-gray-900 flex flex-col items-center justify-center gap-2">
          {isPending ? (
            <>
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-500 capitalize">{asset.generationStatus}</span>
            </>
          ) : (
            <span className="text-gray-600 text-xs">No preview</span>
          )}
        </div>
      )}

      {/* Badges */}
      <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
        {asset.isReference && (
          <span className="bg-purple-900 text-purple-300 text-xs px-1.5 py-0.5 rounded">Ref</span>
        )}
        {asset.mediaType === 'video' && (
          <span className="bg-blue-900 text-blue-300 text-xs px-1.5 py-0.5 rounded">Video</span>
        )}
      </div>

      {/* Actions overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 flex gap-1 opacity-0 hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        {asset.mediaType === 'image' && !asset.isReference && falVideoEnabled && (
          <button
            onClick={onAnimate}
            className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-2 py-0.5 rounded transition-colors"
          >
            Animate
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-xs bg-red-900/80 hover:bg-red-800 text-red-300 px-2 py-0.5 rounded transition-colors"
        >
          Archive
        </button>
      </div>
    </div>
  )
}

// ── Source badge (ASSETS tab) ─────────────────────────────────────────────────

function SourceBadge({ provider, source }: { provider: string | null; source: string }) {
  if (provider === 'media_library') {
    return <span className="bg-teal-900/60 text-teal-400 text-xs px-1.5 py-0.5 rounded">Media Library</span>
  }
  if (provider === 'openai') {
    return <span className="bg-purple-900/60 text-purple-400 text-xs px-1.5 py-0.5 rounded">AI • OpenAI</span>
  }
  if (provider === 'fal') {
    return <span className="bg-blue-900/60 text-blue-400 text-xs px-1.5 py-0.5 rounded">AI • FAL</span>
  }
  if (provider === 'replicate') {
    return <span className="bg-orange-900/60 text-orange-400 text-xs px-1.5 py-0.5 rounded">AI • Flux</span>
  }
  if (provider === 'uploaded' || source === 'uploaded') {
    return <span className="bg-gray-700 text-gray-400 text-xs px-1.5 py-0.5 rounded">Uploaded</span>
  }
  return null
}

// ── Media Library Picker modal ────────────────────────────────────────────────

function MediaLibraryPicker({
  typeFilter,
  onSelect,
  onClose,
}: {
  typeFilter: 'all' | 'image' | 'video'
  onSelect:  (item: LibraryMedia) => void
  onClose:   () => void
}) {
  const [items,      setItems]      = useState<LibraryMedia[]>([])
  const [loading,    setLoading]    = useState(false)
  const [search,     setSearch]     = useState('')
  const [mediaType,  setMediaType]  = useState<'all' | 'image' | 'video'>(typeFilter)
  const [selected,   setSelected]   = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (q: string, t: 'all' | 'image' | 'video') => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '60' })
      if (q)          params.set('search', q)
      if (t !== 'all') params.set('type', t)
      const res  = await fetch(`/api/admin/marketing/media?${params}`)
      const data = await res.json()
      setItems(data.media ?? [])
    } catch { setItems([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load('', typeFilter) }, [load, typeFilter])

  function handleSearch(value: string) {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load(value, mediaType), 350)
  }

  function handleTypeChange(t: 'all' | 'image' | 'video') {
    setMediaType(t)
    load(search, t)
  }

  const selectedItem = items.find(i => i.id === selected)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" role="dialog" aria-label="Select from Media Library">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Select from Media Library</h2>
          <div className="flex items-center gap-3">
            <a
              href="/admin/marketing/media"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Open full Media Library ↗
            </a>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-xl leading-none"
              aria-label="Close picker"
            >
              ×
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800">
          <input
            type="search"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search by name or description…"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            aria-label="Search media library"
          />
          <div className="flex gap-1">
            {(['all', 'image', 'video'] as const).map(t => (
              <button
                key={t}
                onClick={() => handleTypeChange(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  mediaType === t
                    ? 'bg-indigo-700 text-white'
                    : 'text-gray-400 hover:text-gray-300 border border-gray-700'
                }`}
              >
                {t === 'all' ? 'All' : t === 'image' ? 'Images' : 'Videos'}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500 text-sm">No media found.</p>
              <p className="text-gray-600 text-xs mt-1">Try a different search or upload via the full Media Library.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3" role="list">
              {items.map(item => {
                const isVid = item.mimeType.startsWith('video/')
                return (
                  <button
                    key={item.id}
                    role="listitem"
                    onClick={() => setSelected(item.id === selected ? null : item.id)}
                    className={`group relative rounded-xl overflow-hidden border-2 aspect-square transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      selected === item.id
                        ? 'border-indigo-500 ring-1 ring-indigo-500'
                        : 'border-gray-800 hover:border-gray-600'
                    }`}
                    title={item.filename}
                    aria-pressed={selected === item.id}
                    aria-label={item.filename}
                  >
                    {isVid ? (
                      <video src={item.url} className="w-full h-full object-cover" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt={item.altText ?? item.filename} className="w-full h-full object-cover" />
                    )}
                    {isVid && (
                      <span className="absolute top-1 left-1 bg-blue-900/80 text-blue-300 text-xs px-1 py-0.5 rounded">Video</span>
                    )}
                    {selected === item.id && (
                      <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center">
                        <span className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-bold">✓</span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <p className="text-xs text-white truncate">{item.filename}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Selected preview + action */}
        <div className="border-t border-gray-800 px-5 py-4 flex items-center justify-between gap-4">
          {selectedItem ? (
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-700 flex-shrink-0">
                {selectedItem.mimeType.startsWith('video/')
                  ? <video src={selectedItem.url} className="w-full h-full object-cover" muted />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={selectedItem.url} alt="" className="w-full h-full object-cover" />
                }
              </div>
              <div className="min-w-0">
                <p className="text-xs text-white font-medium truncate">{selectedItem.filename}</p>
                <p className="text-xs text-gray-500">{selectedItem.mimeType} · {selectedItem.sizeBytes ? `${(selectedItem.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-600">No item selected</p>
          )}
          <button
            onClick={() => { if (selectedItem) onSelect(selectedItem) }}
            disabled={!selectedItem}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            Use this asset
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Upload zone (drag-and-drop + browse) ──────────────────────────────────────

function uploadWithXHR(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed: ${xhr.status}`))
    })
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.send(file)
  })
}

function UploadZone({
  accept,
  label,
  sublabel,
  progress,
  error,
  disabled,
  onFiles,
}: {
  accept:    string
  label:     string
  sublabel?: string
  progress:  number | null
  error:     string | null
  disabled?: boolean
  onFiles:   (files: File[]) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    if (disabled) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(files)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onDragOver={e => { e.preventDefault(); if (!disabled) setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click() }}
      className={`border-2 border-dashed rounded-xl px-4 py-8 text-center cursor-pointer transition-all select-none ${
        disabled
          ? 'border-gray-800 opacity-50 cursor-not-allowed'
          : isDragOver
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/30'
      }`}
    >
      {progress !== null ? (
        <div className="space-y-3">
          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">
            {progress < 100 ? `Uploading ${progress}%` : 'Processing…'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-sm text-gray-300">{label}</p>
          {sublabel && <p className="text-xs text-gray-600">{sublabel}</p>}
          <p className="text-xs text-indigo-400 hover:text-indigo-300 font-medium mt-2">Browse files</p>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        aria-hidden="true"
        onChange={e => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) { onFiles(files); e.target.value = '' }
        }}
      />
    </div>
  )
}

// ── Source selector (3-button toggle) ────────────────────────────────────────

function SourceSelector<T extends string>({
  value,
  options,
  onChange,
}: {
  value:    T
  options:  { key: T; icon: string; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
            value === o.key
              ? 'bg-indigo-700/40 border-indigo-600 text-white'
              : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
          }`}
        >
          <span className="text-base">{o.icon}</span>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Designer Mode Panel ───────────────────────────────────────────────────────

function DesignerModePanel({
  templateKey, campaignType, brief, commercialFields, format,
  generating, error, artDirecting, artDirectorSuggestion,
  onTemplateChange, onCampaignTypeChange, onBriefChange,
  onCommercialFieldChange, onFormatChange, onGenerate, onArtDirect,
}: {
  campaignId:              string
  templateKey:             string
  campaignType:            CampaignType
  brief:                   string
  commercialFields:        Record<string, string>
  format:                  string
  generating:              boolean
  error:                   string | null
  artDirecting:            boolean
  artDirectorSuggestion:   string | null
  onTemplateChange:        (key: string) => void
  onCampaignTypeChange:    (t: CampaignType) => void
  onBriefChange:           (v: string) => void
  onCommercialFieldChange: (fieldKey: string, val: string) => void
  onFormatChange:          (f: string) => void
  onGenerate:              () => void
  onArtDirect:             () => void
}) {
  const template: WalzTemplate = TEMPLATE_MAP[templateKey] ?? ALL_TEMPLATES[0]
  const eligibleTemplates = templatesForCampaignType(campaignType)
  const displayTemplates  = eligibleTemplates.length > 0 ? eligibleTemplates : ALL_TEMPLATES

  const FORMAT_OPTIONS = [
    { key: '1080x1920', label: 'Story 9:16' },
    { key: '1080x1350', label: 'Portrait 4:5' },
    { key: '1080x1080', label: 'Square 1:1' },
    { key: '1200x628',  label: 'Banner 16:9' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-950 to-indigo-900 border border-indigo-800 rounded-xl p-4">
        <p className="text-xs text-indigo-300 font-semibold uppercase tracking-widest mb-0.5">Graphic Designer Mode</p>
        <p className="text-sm text-indigo-100">
          AI generates the visual background only. All text and commercial values are set by you.
        </p>
      </div>

      {/* Campaign Type */}
      <div>
        <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Campaign Type</label>
        <select
          value={campaignType}
          onChange={e => onCampaignTypeChange(e.target.value as CampaignType)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          {(Object.entries(CAMPAIGN_TYPE_LABELS) as [CampaignType, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Template Picker */}
      <div>
        <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Template</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(displayTemplates.length > 0 ? displayTemplates : ALL_TEMPLATES).map(t => (
            <button
              key={t.key}
              onClick={() => onTemplateChange(t.key)}
              className={`text-left px-3 py-2.5 rounded-xl border transition-colors ${
                templateKey === t.key
                  ? 'border-indigo-500 bg-indigo-900/30 text-white'
                  : 'border-gray-800 text-gray-400 hover:border-gray-600 hover:text-gray-200'
              }`}
            >
              <p className="text-sm font-semibold">{t.label}</p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Visual Brief */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">
          Visual Brief
          <span className="ml-1 text-gray-600 normal-case">(optional — describe what you want to see in the image)</span>
        </label>
        <textarea
          value={brief}
          onChange={e => onBriefChange(e.target.value)}
          placeholder={`e.g. ${template.artDirection.visualMood}`}
          rows={3}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 resize-none"
        />
        <div className="flex items-center gap-2 mt-2">
          <p className="text-xs text-gray-600 flex-1">
            Art direction: {template.artDirection.subjectPlacement} subject · {template.artDirection.visualMood}
          </p>
          <button
            onClick={onArtDirect}
            disabled={artDirecting || !brief.trim()}
            className="text-xs bg-indigo-900/50 hover:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed border border-indigo-700 text-indigo-300 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            {artDirecting ? (
              <><span className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" />Thinking…</>
            ) : (
              'Suggest Creative Direction'
            )}
          </button>
        </div>
        {artDirectorSuggestion && (
          <div className="mt-2 bg-indigo-950/40 border border-indigo-800 rounded-lg px-3 py-2">
            <p className="text-xs text-indigo-300">Art Director: {artDirectorSuggestion}</p>
          </div>
        )}
      </div>

      {/* Commercial Fields — staff fills these in */}
      {template.commercialFields.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Text Layers</label>
            <span className="text-xs bg-amber-900/40 text-amber-400 border border-amber-800 px-1.5 py-0.5 rounded">Staff fills — AI never generates these</span>
          </div>
          <div className="space-y-2">
            {template.commercialFields.map(field => (
              <div key={field.layerKey}>
                <label className="block text-xs text-gray-500 mb-1">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                  {field.helpText && <span className="ml-1 text-gray-600">· {field.helpText}</span>}
                </label>
                {field.type === 'multiline' ? (
                  <textarea
                    value={commercialFields[field.layerKey] ?? ''}
                    onChange={e => onCommercialFieldChange(field.layerKey, e.target.value)}
                    placeholder={field.placeholder}
                    rows={2}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 resize-none"
                  />
                ) : (
                  <input
                    type="text"
                    value={commercialFields[field.layerKey] ?? ''}
                    onChange={e => onCommercialFieldChange(field.layerKey, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Format */}
      <div>
        <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Canvas Format</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {FORMAT_OPTIONS.map(f => {
            const supported = template.canvases.some(c => c.key === f.key)
            return (
              <button
                key={f.key}
                onClick={() => supported && onFormatChange(f.key)}
                disabled={!supported}
                className={`px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  format === f.key
                    ? 'border-indigo-500 bg-indigo-900/30 text-white'
                    : supported
                      ? 'border-gray-700 text-gray-400 hover:border-gray-600'
                      : 'border-gray-800 text-gray-700 cursor-not-allowed'
                }`}
              >
                {f.label}
                {!supported && <span className="block text-xs text-gray-700">—</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-3">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={onGenerate}
        disabled={generating}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {generating ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Generating visual…
          </>
        ) : (
          'Generate Graphic Design'
        )}
      </button>
      <p className="text-xs text-gray-600 text-center">
        AI generates the background image only. Your text layers are composited separately.
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function CreativeStudioSection({
  campaignId, destination, objective, promotionDetails, cta, tone,
}: Props) {
  const [activeTab,    setActiveTab]    = useState<Tab>('POSTER')
  const [assets,       setAssets]       = useState<Asset[]>([])
  const [caps,         setCaps]         = useState<Capabilities>({ openaiEnabled: false, replicateEnabled: false, runwayEnabled: false, falVideoEnabled: false, imageHealth: undefined, videoHealth: undefined })
  const [loading,      setLoading]      = useState(true)
  const [testingHealth, setTestingHealth] = useState(false)
  const [healthPanel,   setHealthPanel]   = useState(false)
  const [healthReport,  setHealthReport]  = useState<Record<string, unknown> | null>(null)
  // Authoritative provider state — fetched from the health endpoint (no DB dependency)
  const [providerHealth, setProviderHealth] = useState<{ image?: ProviderHealth; video?: ProviderHealth } | null>(null)
  // ── Image / asset source selector state ──────────────────────────────────────
  const [imageSource,    setImageSource]    = useState<ImageSource>('ai')
  const [videoSrcMode,   setVideoSrcMode]   = useState<VideoSrcMode>('assets')

  // ── Library picker state ──────────────────────────────────────────────────────
  const [showLibraryPicker,    setShowLibraryPicker]    = useState(false)
  const [libraryPickerFilter,  setLibraryPickerFilter]  = useState<'all' | 'image' | 'video'>('image')
  const [libraryPickerTarget,  setLibraryPickerTarget]  = useState<'creative' | 'video-source'>('creative')
  const [libraryFormat,        setLibraryFormat]        = useState<string>('1080x1080')
  const [attachingLibrary,     setAttachingLibrary]     = useState(false)
  const [libraryError,         setLibraryError]         = useState<string | null>(null)

  // ── Direct upload state ───────────────────────────────────────────────────────
  const [uploadProgress,  setUploadProgress]  = useState<number | null>(null)
  const [uploadError,     setUploadError]     = useState<string | null>(null)
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null)
  const [videoUploadError,    setVideoUploadError]    = useState<string | null>(null)
  const [showExistingVideo,   setShowExistingVideo]   = useState(false)

  // ── AI generation state ───────────────────────────────────────────────────────
  const [generating,   setGenerating]   = useState(false)
  const [genError,     setGenError]     = useState<string | null>(null)
  const [genErrorCode, setGenErrorCode] = useState<string | null>(null)
  const [selectedId,   setSelectedId]   = useState<string | null>(null)

  // Image generation form state
  const [format,       setFormat]       = useState('1080x1920')
  const [provider,     setProvider]     = useState<'openai' | 'replicate'>('openai')
  const [brandPreset,  setBrandPreset]  = useState('')
  const [promptHint,   setPromptHint]   = useState('')
  const [customPrompt, setCustomPrompt] = useState('')

  // Poster compositor state
  const [posterData,   setPosterData]   = useState<PosterData>(defaultPosterData())
  const [savingPoster, setSavingPoster] = useState(false)

  // Video state
  const [videoModel,      setVideoModel]      = useState<string>('kling')
  const [videoPrompt,     setVideoPrompt]     = useState('Slow cinematic camera movement, gentle parallax, golden hour light movement')
  const [videoDuration,   setVideoDuration]   = useState<5 | 10>(5)
  const [videoAspect,     setVideoAspect]     = useState('9:16')
  const [videoSource,     setVideoSource]     = useState<string>('')   // mediaId of source image
  const [videoError,      setVideoError]      = useState<string | null>(null)
  const [generatingVideo, setGeneratingVideo] = useState(false)

  // Reference image upload / removal / selection
  const refInputRef   = useRef<HTMLInputElement>(null)
  const [uploadingRef,    setUploadingRef]    = useState(false)
  const [refError,        setRefError]        = useState<string | null>(null)
  const [removingRefId,   setRemovingRefId]   = useState<string | null>(null)
  const [activeRefId,     setActiveRefId]     = useState<string | null>(null)

  // Designer Mode state
  const [designerTemplateKey,      setDesignerTemplateKey]      = useState<string>(ALL_TEMPLATES[0].key)
  const [designerCampaignType,     setDesignerCampaignType]     = useState<CampaignType>('general_promotion')
  const [designerBrief,            setDesignerBrief]            = useState('')
  const [designerCommercialFields, setDesignerCommercialFields] = useState<Record<string, string>>({})
  const [designerFormat,           setDesignerFormat]           = useState('1080x1350')
  const [generatingDesigner,       setGeneratingDesigner]       = useState(false)
  const [designerError,            setDesignerError]            = useState<string | null>(null)
  const [designerComposition,      setDesignerComposition]      = useState<DesignComposition | null>(null)
  const [baseComposition,          setBaseComposition]          = useState<DesignComposition | null>(null)
  const [artDirecting,             setArtDirecting]             = useState(false)
  const [artDirectorSuggestion,    setArtDirectorSuggestion]    = useState<string | null>(null)
  // Phase 3 designer controls
  const [designerControls,         setDesignerControls]         = useState<DesignControls>(defaultDesignControls())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [designerLayerOverrides,   setDesignerLayerOverrides]   = useState<Record<string, any>>({})
  const [qualityScore,             setQualityScore]             = useState<QualityScoreResult | null>(null)

  // Derived safe zones for current template
  const currentSafeZones: TemplateSafeZones | undefined = TEMPLATE_SAFE_ZONES[designerTemplateKey]

  // Rebuild composition when controls or layer overrides change
  function rebuildComposition(
    templateKey:      string,
    fields:           Record<string, string>,
    controls:         DesignControls,
    layerOverrides:   Record<string, Partial<DesignComposition['layers'][0]>>,
    visualAsset?:     { url: string; id?: string },
  ): DesignComposition {
    const template = TEMPLATE_MAP[templateKey] ?? ALL_TEMPLATES[0]
    const canvas   = TEMPLATE_CANVASES[designerFormat] ?? TEMPLATE_CANVASES['1080x1350']
    return buildTemplateComposition({
      template,
      commercialFields: fields,
      visualAsset,
      canvas,
      controls,
      layerOverrides: layerOverrides as Record<string, Partial<import('@/lib/orbit/composer/layer-model').DesignLayer>>,
    })
  }

  // Polling timers for pending jobs
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  async function loadAssets() {
    try {
      const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative`)
      if (!res.ok) return
      const data = await res.json()
      if (data.assets) setAssets(data.assets)
      setCaps(prev => ({
        ...prev,
        replicateEnabled: data.replicateEnabled ?? false,
        runwayEnabled:    false,
      }))
    } catch { /* non-fatal */ }
    finally { setLoading(false) }
  }

  async function loadHealth() {
    try {
      const res  = await fetch('/api/admin/orbit/creative/health')
      if (!res.ok) return
      const data = await res.json()
      setProviderHealth(data)
      setHealthReport(data)
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    loadAssets()
    loadHealth()
    return () => { Object.values(pollTimers.current).forEach(clearInterval) }
  }, [campaignId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Server-side polling: FAL async jobs tracked in DB
  const pollAsset = useCallback((assetId: string) => {
    if (pollTimers.current[assetId]) return
    pollTimers.current[assetId] = setInterval(async () => {
      try {
        const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative/${assetId}`)
        const data = await res.json()
        if (data.asset) {
          setAssets(prev => prev.map(a => a.id === assetId ? data.asset : a))
          const s = data.asset.generationStatus
          if (s !== 'pending' && s !== 'processing' && s !== 'queued') {
            clearInterval(pollTimers.current[assetId])
            delete pollTimers.current[assetId]
          }
        }
      } catch { /* non-fatal */ }
    }, 4000)
  }, [campaignId])

  useEffect(() => {
    assets.forEach(a => {
      const s = a.generationStatus
      if (s === 'pending' || s === 'processing' || s === 'queued') {
        pollAsset(a.id)
      }
    })
  }, [assets, pollAsset])

  // Sync posterData from selected asset
  useEffect(() => {
    const sel = assets.find(a => a.id === selectedId)
    if (sel?.posterData) setPosterData(sel.posterData as PosterData)
  }, [selectedId, assets])

  const selectedAsset   = assets.find(a => a.id === selectedId) ?? null

  // Derived from authoritative health endpoint — single source of truth for provider readiness
  const imageReady = providerHealth?.image?.configured === true
  const videoReady = providerHealth?.video?.configured === true

  // All non-reference images regardless of source (AI / library / uploaded)
  const campaignImages  = assets.filter(a => !a.isReference && a.mediaType === 'image')
  // Backward-compat alias used in GenerationControls
  const generatedImages = campaignImages
  const referenceImages = assets.filter(a => a.isReference)
  const videoAssets     = assets.filter(a => a.mediaType === 'video')

  // ── Generate image ─────────────────────────────────────────────────────────

  async function generateImage(tab: 'POSTER' | 'SOCIAL') {
    setGenerating(true); setGenError(null); setGenErrorCode(null)
    try {
      // Use explicitly selected reference, otherwise first available
      const chosenRefId = activeRefId
        ? referenceImages.find(r => r.id === activeRefId)?.id
        : referenceImages[0]?.id
      const body: Record<string, unknown> = {
        mode:             'image',
        provider,
        format,
        promptHint:       customPrompt || promptHint || promotionDetails,
        brandPreset:      brandPreset || undefined,
        prompt:           customPrompt || undefined,
        referenceMediaId: chosenRefId,
      }
      const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      let data: Record<string, unknown> = {}
      try {
        data = await res.json()
      } catch {
        throw new Error('[INTERNAL_SERVER_ERROR] Server returned an unexpected response. Please try again or contact support.')
      }
      if (!res.ok) {
        if (data.errorCode) setGenErrorCode(data.errorCode as string)
        throw new Error((data.error as string) ?? 'Generation failed')
      }
      if (data.media) {
        setAssets(prev => [data.media as typeof prev[0], ...prev])
        setSelectedId((data.media as { id: string }).id)
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  // ── Graphic Designer Mode generation ─────────────────────────────────────

  async function generateDesignerImage() {
    setGeneratingDesigner(true); setDesignerError(null)
    try {
      const body = {
        mode:             'image',
        designerMode:     true,
        templateKey:      designerTemplateKey,
        campaignType:     designerCampaignType,
        visualBrief:      designerBrief || undefined,
        commercialFields: designerCommercialFields,
        format:           designerFormat,
        provider:         'openai',
      }
      const res = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      let data: Record<string, unknown> = {}
      try { data = await res.json() } catch {
        throw new Error('[INTERNAL_SERVER_ERROR] Server returned an unexpected response. Please try again.')
      }
      if (!res.ok) {
        if (data.errorCode) setGenErrorCode(data.errorCode as string)
        throw new Error((data.error as string) ?? 'Designer generation failed')
      }
      if (data.media) {
        const media = data.media as Asset
        setAssets(prev => [media, ...prev])
        setSelectedId(media.id)

        // Build composition immediately and navigate to POSTER tab
        const template = TEMPLATE_MAP[designerTemplateKey]
        const canvasConfig = TEMPLATE_CANVASES[designerFormat]
        if (template && canvasConfig && media.publicUrl) {
          const visualAsset = { url: media.publicUrl, id: media.id }
          const base = buildTemplateComposition({
            template,
            commercialFields: designerCommercialFields,
            visualAsset,
            canvas: canvasConfig,
          })
          const composition = rebuildComposition(
            designerTemplateKey,
            designerCommercialFields,
            designerControls,
            designerLayerOverrides,
            visualAsset,
          )
          setBaseComposition(base)
          setDesignerComposition(composition)
          // Compute initial quality score
          setQualityScore(scoreComposition(composition, designerControls, TEMPLATE_SAFE_ZONES[designerTemplateKey]))
          // Apply to POSTER compositor dimensions
          setFormat(designerFormat)
          setActiveTab('POSTER')
        } else {
          setActiveTab('ASSETS')
        }
      }
    } catch (e) {
      setDesignerError(e instanceof Error ? e.message : 'Designer generation failed')
    } finally {
      setGeneratingDesigner(false)
    }
  }

  // ── Art Director — suggest creative direction ───────────────────────────────

  async function runArtDirector() {
    if (!designerBrief.trim()) return
    setArtDirecting(true); setArtDirectorSuggestion(null)
    try {
      const res = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative/art-direct`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          campaignDescription: designerBrief,
          campaignType:        designerCampaignType,
          preferredTemplate:   designerTemplateKey,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Art Director failed')
      if (data.templateKey) setDesignerTemplateKey(data.templateKey)
      setArtDirectorSuggestion(data.reasoning ?? null)
      // Optionally update brief with the subject description
      if (data.subject) setDesignerBrief(data.subject)
    } catch (e) {
      setArtDirectorSuggestion(`⚠ ${e instanceof Error ? e.message : 'Suggestion failed'}`)
    } finally {
      setArtDirecting(false)
    }
  }

  // ── Generate video via FAL.ai (async, DB-tracked) ─────────────────────────

  async function generateVideo() {
    setGeneratingVideo(true); setVideoError(null)
    try {
      if (!videoSource) throw new Error('Select a source image to animate')

      const body = {
        mode:            'video',
        provider:        'fal',
        videoModelKey:   videoModel,
        prompt:          videoPrompt,
        duration:        videoDuration,
        aspectRatio:     videoAspect,
        referenceMediaId: videoSource,
      }
      const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Video generation failed')
      // Asset starts as pending; pollAsset() timer picks it up automatically
      if (data.media) setAssets(prev => [data.media, ...prev])
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : 'Video generation failed')
    } finally {
      setGeneratingVideo(false)
    }
  }

  // ── Animate image with FAL.ai ──────────────────────────────────────────────

  async function animateAsset(assetId: string) {
    try {
      const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative/${assetId}/animate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          prompt:        'Slow cinematic camera movement, gentle parallax',
          duration:      5,
          videoModelKey: videoModel,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start animation')
      if (data.media) setAssets(prev => [data.media, ...prev])
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Animation failed')
    }
  }

  // ── Archive asset ──────────────────────────────────────────────────────────

  async function archiveAsset(assetId: string) {
    if (!confirm('Archive this asset? It will be removed from the campaign.')) return
    try {
      const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative/${assetId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.requiresConfirmation) {
          if (!confirm('This asset is attached to a published campaign. Archive anyway?')) return
          await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative/${assetId}`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm: true }),
          })
        }
        return
      }
      setAssets(prev => prev.filter(a => a.id !== assetId))
      if (selectedId === assetId) setSelectedId(null)
    } catch { /* non-fatal */ }
  }

  // ── Attach from Media Library ─────────────────────────────────────────────

  async function attachFromLibrary(
    item: LibraryMedia,
    asTarget: 'creative' | 'video-source',
    fmt?: string,
  ): Promise<string | null> {
    setAttachingLibrary(true)
    setLibraryError(null)
    try {
      const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative/library`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mediaLibraryId: item.id, format: fmt ?? '1080x1080' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not attach asset')

      if (data.media) {
        if (!data.alreadyAttached) {
          setAssets(prev => [data.media, ...prev])
        }
        setShowLibraryPicker(false)
        if (asTarget === 'creative') {
          setSelectedId(data.media.id)
        } else if (asTarget === 'video-source') {
          setVideoSource(data.media.id)
        }
        return data.media.id
      }
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : 'Attach failed')
    } finally {
      setAttachingLibrary(false)
    }
    return null
  }

  // ── Direct upload (non-reference) ─────────────────────────────────────────

  async function uploadDirectAsset(
    file: File,
    fmt: string,
    isVideo: boolean,
    onProgress: (pct: number) => void,
  ): Promise<void> {
    onProgress(0)

    // Step 1: get presigned URL
    const presignRes = await fetch(
      `/api/admin/orbit/campaigns/${campaignId}/creative/upload`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          mimeType:  file.type,
          fileSize:  file.size,
          format:    fmt,
          mediaType: isVideo ? 'video' : 'image',
        }),
      },
    )
    const presignData = await presignRes.json()
    if (!presignRes.ok) throw new Error(presignData.error ?? 'Upload init failed')

    // Step 2: upload directly to Supabase with progress tracking
    await uploadWithXHR(presignData.uploadUrl, file, pct => onProgress(Math.round(pct * 0.9)))

    // Step 3: confirm upload (marks generationStatus=completed)
    const confirmRes = await fetch(
      `/api/admin/orbit/campaigns/${campaignId}/creative/upload`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mediaId: presignData.mediaId, altText: file.name }),
      },
    )
    const confirmData = await confirmRes.json()
    if (!confirmRes.ok) throw new Error(confirmData.error ?? 'Upload confirm failed')

    onProgress(100)

    if (confirmData.media) {
      setAssets(prev => [confirmData.media, ...prev])
      setSelectedId(confirmData.media.id)
    }
  }

  async function handleImageUpload(files: File[], fmt: string) {
    const file = files[0]
    if (!file) return
    setUploadError(null)
    try {
      await uploadDirectAsset(file, fmt, false, setUploadProgress)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setTimeout(() => setUploadProgress(null), 1200)
    }
  }

  async function handleVideoFileUpload(files: File[], fmt: string) {
    const file = files[0]
    if (!file) return
    setVideoUploadError(null)
    try {
      await uploadDirectAsset(file, fmt, true, setVideoUploadProgress)
    } catch (e) {
      setVideoUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setTimeout(() => setVideoUploadProgress(null), 1200)
    }
  }

  // ── Save poster data ───────────────────────────────────────────────────────

  async function savePosterData() {
    if (!selectedId) return
    setSavingPoster(true)
    try {
      await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative/${selectedId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ posterData }),
      })
    } finally { setSavingPoster(false) }
  }

  // ── Upload reference image ─────────────────────────────────────────────────

  async function uploadReference(file: File) {
    setUploadingRef(true); setRefError(null)
    try {
      const presignRes = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative/reference`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mimeType: file.type, fileSize: file.size, label: file.name }),
      })
      let presignData: { mediaId?: string; uploadUrl?: string; storagePath?: string; publicUrl?: string; error?: string; errorCode?: string } = {}
      try {
        presignData = await presignRes.json()
      } catch {
        throw new Error('[REFERENCE_PRESIGN_FAILED] Upload service unavailable. Please try again.')
      }
      if (!presignRes.ok) throw new Error(presignData.error ?? '[REFERENCE_PRESIGN_FAILED] Upload init failed')
      if (!presignData.uploadUrl) throw new Error('[REFERENCE_UPLOAD_URL_INVALID] No upload URL returned from server')
      try { new URL(presignData.uploadUrl) } catch {
        throw new Error('[REFERENCE_UPLOAD_URL_INVALID] Server returned an invalid upload URL')
      }

      const upRes = await fetch(presignData.uploadUrl, {
        method: 'PUT', body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!upRes.ok) throw new Error('[REFERENCE_UPLOAD_FAILED] File upload to storage failed')

      // Reset input so the same file can be picked again after removal
      if (refInputRef.current) refInputRef.current.value = ''
      const freshData = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative`)
      if (freshData.ok) {
        const d = await freshData.json()
        if (d.assets) {
          setAssets(d.assets)
          // Auto-select the newly uploaded reference
          const newRef = (d.assets as typeof assets).find(
            a => a.isReference && !assets.some(existing => existing.id === a.id)
          )
          if (newRef) setActiveRefId(newRef.id)
        }
      }
    } catch (e) {
      setRefError(e instanceof Error ? e.message : 'Upload failed')
    } finally { setUploadingRef(false) }
  }

  // ── Remove reference image ────────────────────────────────────────────────

  async function removeReference(mediaId: string) {
    setRemovingRefId(mediaId); setRefError(null)
    try {
      const res = await fetch(
        `/api/admin/orbit/campaigns/${campaignId}/creative/reference?mediaId=${encodeURIComponent(mediaId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? 'Could not remove reference image')
      }
      // Reset input so the same file can be re-uploaded immediately
      if (refInputRef.current) refInputRef.current.value = ''
      setAssets(prev => prev.filter(a => a.id !== mediaId))
      // Clear active selection if the removed image was selected
      setActiveRefId(prev => prev === mediaId ? null : prev)
    } catch (e) {
      setRefError(e instanceof Error ? e.message : 'Remove failed')
    } finally { setRemovingRefId(null) }
  }

  // ── Provider health test ───────────────────────────────────────────────────

  async function runHealthTest() {
    setTestingHealth(true)
    setHealthPanel(true)
    try {
      const res  = await fetch('/api/admin/orbit/creative/health')
      const data = await res.json()
      setHealthReport(data)
    } catch {
      setHealthReport({ error: 'Could not reach health endpoint' })
    } finally {
      setTestingHealth(false)
    }
  }

  // ── Export poster composite ────────────────────────────────────────────────

  async function handleExport(blob: Blob) {
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href     = url
    link.download = `walz-poster-${campaignId.slice(-6)}.jpg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // ── Generation controls (shared POSTER / SOCIAL) ──────────────────────────

  function GenerationControls({ tab }: { tab: 'POSTER' | 'SOCIAL' }) {
    const availableFormats = tab === 'POSTER'
      ? ['1080x1920', '1080x1350']
      : ['1080x1080', '1024x1024', '1200x628', '1080x1350']

    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-semibold text-white">Generate Artwork</h3>

        {/* Provider */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Provider</label>
          <div className="flex gap-2">
            {(imageReady || !caps.replicateEnabled) && (
              <button
                onClick={() => setProvider('openai')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  provider === 'openai'
                    ? 'bg-indigo-700 border-indigo-600 text-white'
                    : 'border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
                disabled={!imageReady}
              >
                {PROVIDER_LABELS.openai}
                {!imageReady && providerHealth !== null && <span className="ml-1 text-gray-600">(off)</span>}
              </button>
            )}
            {caps.replicateEnabled && (
              <button
                onClick={() => setProvider('replicate')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  provider === 'replicate'
                    ? 'bg-indigo-700 border-indigo-600 text-white'
                    : 'border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {PROVIDER_LABELS.replicate}
              </button>
            )}
          </div>
          {!imageReady && !caps.replicateEnabled && providerHealth !== null && (() => {
            const s = providerHealth?.image?.status
            const reason = providerHealth?.image?.reason
            const msgs: Record<string, string> = {
              disabled:             'OpenAI image generation is disabled.',
              missing_key:          'OpenAI image generation is enabled but OPENAI_API_KEY is not set.',
              invalid_configuration: 'Image provider configuration is invalid. Check the provider diagnostic.',
            }
            return (
              <p className="mt-1 text-xs text-red-400">
                {s && msgs[s] ? msgs[s] : reason ? `Image provider unavailable: ${reason}` : 'OpenAI image provider is unavailable.'}
              </p>
            )
          })()}
        </div>

        {/* Format */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Format</label>
          <div className="flex flex-wrap gap-2">
            {availableFormats.map(f => {
              const fp = FORMAT_PRESETS[f]
              return (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    format === f
                      ? 'bg-indigo-700 border-indigo-600 text-white'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {fp?.label ?? f}
                  <span className="ml-1 text-gray-500">{f}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Brand preset */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Brand Preset</label>
          <select
            value={brandPreset}
            onChange={e => setBrandPreset(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">No preset</option>
            {Object.entries(BRAND_PRESETS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Prompt hint */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Visual direction / Prompt hint</label>
          <input
            type="text"
            value={promptHint}
            onChange={e => setPromptHint(e.target.value)}
            placeholder={`e.g. sunset over ${destination || 'the city'}, golden light`}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>

        {/* Custom prompt */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Custom prompt (overrides auto)</label>
          <textarea
            rows={2}
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            placeholder="Leave blank to use the auto-built prompt from campaign fields + brand preset"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none"
          />
        </div>

        {/* Reference images */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">Reference images</label>
            <button
              onClick={() => refInputRef.current?.click()}
              disabled={uploadingRef}
              className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
            >
              {uploadingRef ? 'Uploading…' : '+ Upload reference'}
            </button>
          </div>
          <input
            ref={refInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadReference(f) }}
          />
          {refError && <p className="text-xs text-red-400 mt-1">{refError}</p>}
          {referenceImages.length > 0 && (
            <>
              <p className="text-xs text-gray-500 mt-1 mb-1">
                Click a reference to select it for generation
              </p>
              <div className="flex gap-2 flex-wrap">
                {referenceImages.map(r => {
                  const isActive = activeRefId === r.id || (!activeRefId && r.id === referenceImages[0]?.id)
                  return (
                    <div
                      key={r.id}
                      className={`relative w-16 h-16 rounded overflow-hidden border-2 cursor-pointer group transition-all ${
                        isActive ? 'border-indigo-400 ring-2 ring-indigo-500/50' : 'border-gray-700 hover:border-gray-500'
                      }`}
                      onClick={() => setActiveRefId(r.id)}
                      title={isActive ? 'Active reference — will be used for generation' : 'Click to use as reference'}
                    >
                      {r.publicUrl && <img src={r.publicUrl} alt={r.altText} className="w-full h-full object-cover" />}
                      {/* Active badge */}
                      {isActive && (
                        <div className="absolute top-0 left-0 right-0 bg-indigo-500/80 text-white text-center py-0.5" style={{ fontSize: 8 }}>
                          ACTIVE
                        </div>
                      )}
                      {/* Remove button — visible on hover */}
                      <button
                        onClick={e => { e.stopPropagation(); removeReference(r.id) }}
                        disabled={removingRefId === r.id}
                        title="Remove this reference image"
                        className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-red-600/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        style={{ fontSize: 10 }}
                      >
                        {removingRefId === r.id ? '…' : '×'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
          <p className="text-xs text-gray-600 mt-1">
            Staff-uploaded reference images (destination, aircraft, hotel). Not for customer documents.
          </p>
        </div>

        {/* Reference active indicator — shown above Generate when a reference is selected */}
        {referenceImages.length > 0 && (() => {
          const activeRef = referenceImages.find(r =>
            activeRefId ? r.id === activeRefId : r.id === referenceImages[0]?.id
          )
          return activeRef ? (
            <div className="flex items-center gap-2 bg-indigo-950/60 border border-indigo-800/60 rounded-lg px-2.5 py-1.5">
              {activeRef.publicUrl && (
                <img
                  src={activeRef.publicUrl}
                  alt="Active reference"
                  className="w-8 h-8 rounded object-cover flex-shrink-0 border border-indigo-700"
                />
              )}
              <div className="min-w-0">
                <p className="text-xs text-indigo-300 font-medium leading-tight">Generating with reference</p>
                <p className="text-xs text-indigo-400/70 truncate leading-tight">{activeRef.altText || 'Reference image'}</p>
              </div>
            </div>
          ) : null
        })()}

        {genError && (
          <div className="bg-red-950 border border-red-800 text-red-300 text-xs rounded-lg px-3 py-2 space-y-1">
            <p>{genError}</p>
            {genErrorCode && (
              <p className="text-red-500 font-mono">{genErrorCode}</p>
            )}
          </div>
        )}

        <button
          onClick={() => generateImage(tab)}
          disabled={generating || (!imageReady && !caps.replicateEnabled)}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating…
            </span>
          ) : 'Generate Artwork'}
        </button>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-10 text-center text-gray-500 text-sm">
        Loading Creative Studio…
      </div>
    )
  }

  const formatPreset = FORMAT_PRESETS[format] ?? FORMAT_PRESETS['1080x1920']
  const bgUrl = selectedAsset?.publicUrl ?? null

  const IMAGE_SOURCE_OPTIONS: { key: ImageSource; icon: string; label: string }[] = [
    { key: 'ai',      icon: '✨', label: 'Generate AI' },
    { key: 'library', icon: '🖼',  label: 'Media Library' },
    { key: 'upload',  icon: '⬆',  label: 'Upload' },
  ]

  const VIDEO_SRC_OPTIONS: { key: VideoSrcMode; icon: string; label: string }[] = [
    { key: 'assets',  icon: '🎨', label: 'Campaign Assets' },
    { key: 'library', icon: '🖼',  label: 'Media Library' },
    { key: 'upload',  icon: '⬆',  label: 'Upload' },
  ]

  return (
    <div className="space-y-4">
      {/* Library picker modal */}
      {showLibraryPicker && (
        <MediaLibraryPicker
          typeFilter={libraryPickerFilter}
          onClose={() => { setShowLibraryPicker(false); setLibraryError(null) }}
          onSelect={item => attachFromLibrary(item, libraryPickerTarget, libraryFormat)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Creative Studio</h2>
          <p className="text-xs text-gray-500">
            Generate artwork · Compose poster · Animate with FAL.ai
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Per-provider status indicators */}
          <div className="flex items-center gap-2 text-xs">
            <ProviderStatusPill
              label="Image"
              name={providerHealth?.image?.model ?? 'OpenAI'}
              status={providerHealth?.image?.status ?? (providerHealth === null ? 'configured' : 'disabled')}
              reason={providerHealth?.image?.reason}
            />
            <ProviderStatusPill
              label="Video"
              name={providerHealth?.video?.model ?? 'Kling'}
              status={providerHealth?.video?.status ?? (providerHealth === null ? 'configured' : 'disabled')}
              reason={providerHealth?.video?.reason}
            />
          </div>
          <button
            onClick={runHealthTest}
            disabled={testingHealth}
            className="text-xs text-gray-500 hover:text-indigo-400 border border-gray-700 hover:border-indigo-600 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {testingHealth ? 'Testing…' : 'Test providers'}
          </button>
        </div>
      </div>

      {/* Health diagnostic panel */}
      {healthPanel && healthReport && (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-white">Provider Diagnostics</span>
            <button onClick={() => { setHealthPanel(false); setHealthReport(null) }} className="text-gray-600 hover:text-gray-400">✕</button>
          </div>
          {(healthReport as Record<string, unknown>).error ? (
            <p className="text-red-400">{String((healthReport as Record<string, unknown>).error)}</p>
          ) : (
            <div className="space-y-3">
              {/* Image */}
              <div>
                <p className="text-gray-500 uppercase tracking-wide mb-1">Image</p>
                <HealthRow health={(healthReport as Record<string, unknown>).image as Record<string, unknown>} />
              </div>
              {/* Video */}
              <div>
                <p className="text-gray-500 uppercase tracking-wide mb-1">Video</p>
                <HealthRow health={(healthReport as Record<string, unknown>).video as Record<string, unknown>} />
              </div>
              {/* Env presence */}
              <div>
                <p className="text-gray-500 uppercase tracking-wide mb-1">Environment Variables</p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries((healthReport as Record<string, unknown>).envPresence as Record<string, boolean> ?? {}).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <span className={v ? 'text-green-500' : 'text-red-500'}>{v ? '●' : '○'}</span>
                      <span className="text-gray-400 font-mono">{k}</span>
                      <span className={v ? 'text-green-600' : 'text-red-600'}>{v ? 'PRESENT' : 'MISSING'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {(['POSTER', 'SOCIAL', 'VIDEO', 'ASSETS', 'DESIGNER'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
            {t === 'ASSETS' && assets.filter(a => !a.isReference).length > 0 && (
              <span className="ml-1.5 bg-gray-800 text-gray-400 text-xs px-1.5 py-0.5 rounded-full">
                {assets.filter(a => !a.isReference).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── POSTER TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'POSTER' && (
        <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-4">
          <div className="space-y-4">
            {/* Source selector */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">Artwork Source</h3>
              <SourceSelector
                value={imageSource}
                options={IMAGE_SOURCE_OPTIONS}
                onChange={setImageSource}
              />
            </div>

            {/* Source panels */}
            {imageSource === 'ai' && <GenerationControls tab="POSTER" />}

            {imageSource === 'library' && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <p className="text-xs text-gray-500">Select an existing image from your Media Library to use as the poster background.</p>
                {libraryError && <p className="text-xs text-red-400">{libraryError}</p>}
                <button
                  onClick={() => {
                    setLibraryPickerFilter('image')
                    setLibraryPickerTarget('creative')
                    setLibraryFormat(format)
                    setShowLibraryPicker(true)
                  }}
                  disabled={attachingLibrary}
                  className="w-full px-4 py-2.5 border border-gray-700 hover:border-indigo-600 text-gray-300 hover:text-white text-sm rounded-xl transition-colors disabled:opacity-50"
                >
                  {attachingLibrary ? 'Attaching…' : 'Browse Media Library'}
                </button>
                {selectedAsset && selectedAsset.provider === 'media_library' && (
                  <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                    <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
                      {selectedAsset.publicUrl && <img src={selectedAsset.publicUrl} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <p className="text-xs text-gray-300 truncate">{selectedAsset.altText || 'Media Library asset'}</p>
                  </div>
                )}
              </div>
            )}

            {imageSource === 'upload' && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <p className="text-xs text-gray-500">Upload an image to use as the poster background (JPEG, PNG, or WebP, max 50 MB).</p>
                <UploadZone
                  accept="image/jpeg,image/png,image/webp"
                  label="Drop image here"
                  sublabel="JPEG, PNG, WebP · max 50 MB"
                  progress={uploadProgress}
                  error={uploadError}
                  onFiles={files => handleImageUpload(files, format)}
                />
              </div>
            )}

            {campaignImages.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Select background for compositor</p>
                <div className="grid grid-cols-3 gap-2">
                  {campaignImages.map(a => (
                    <AssetThumb
                      key={a.id}
                      asset={a}
                      selected={selectedId === a.id}
                      onSelect={() => setSelectedId(a.id)}
                      onAnimate={() => animateAsset(a.id)}
                      onDelete={() => archiveAsset(a.id)}
                      falVideoEnabled={videoReady}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Poster Compositor</h3>
              {selectedId && (
                <button
                  onClick={savePosterData}
                  disabled={savingPoster}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingPoster ? 'Saving…' : 'Save layers'}
                </button>
              )}
            </div>

            <PosterCompositor
              backgroundUrl={bgUrl}
              posterData={posterData}
              onChange={setPosterData}
              canvasWidth={formatPreset.width}
              canvasHeight={formatPreset.height}
              onExport={handleExport}
              composition={designerComposition ?? undefined}
              baseComposition={baseComposition ?? undefined}
              safeZones={currentSafeZones}
              showGuides={designerControls.showGuides}
              overlayStrength={designerControls.overlayStrength}
              onLayerChange={(layerId, patch) => {
                const updated = { ...designerLayerOverrides, [layerId]: { ...(designerLayerOverrides[layerId] ?? {}), ...patch } }
                setDesignerLayerOverrides(updated)
                // Rebuild composition with the override applied
                if (designerComposition) {
                  const visual = designerComposition.layers.find(l => l.type === 'image') as { src?: string; id?: string } | undefined
                  const newComp = rebuildComposition(
                    designerTemplateKey,
                    designerCommercialFields,
                    designerControls,
                    updated,
                    visual?.src ? { url: visual.src, id: visual.id ?? undefined } : undefined,
                  )
                  setDesignerComposition(newComp)
                  setQualityScore(scoreComposition(newComp, designerControls, currentSafeZones))
                }
              }}
            />

            {!selectedId && campaignImages.length === 0 && (
              <p className="text-xs text-gray-600 text-center">
                Generate artwork, select from Media Library, or upload an image — then select it to compose the poster.
              </p>
            )}

            <div className="bg-yellow-950/30 border border-yellow-900/50 rounded-lg px-3 py-2">
              <p className="text-xs text-yellow-700">
                <strong>Price grounding:</strong> Fares, routes, and commercial values must come from
                staff input in the compositor. AI never generates prices.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── SOCIAL TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'SOCIAL' && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          <div className="space-y-4">
            {/* Source selector */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">Artwork Source</h3>
              <SourceSelector
                value={imageSource}
                options={IMAGE_SOURCE_OPTIONS}
                onChange={setImageSource}
              />
            </div>

            {imageSource === 'ai'      && <GenerationControls tab="SOCIAL" />}

            {imageSource === 'library' && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <p className="text-xs text-gray-500">Pick an image from your Media Library to add to this campaign.</p>
                {libraryError && <p className="text-xs text-red-400">{libraryError}</p>}
                <button
                  onClick={() => {
                    setLibraryPickerFilter('image')
                    setLibraryPickerTarget('creative')
                    setLibraryFormat('1080x1080')
                    setShowLibraryPicker(true)
                  }}
                  disabled={attachingLibrary}
                  className="w-full px-4 py-2.5 border border-gray-700 hover:border-indigo-600 text-gray-300 hover:text-white text-sm rounded-xl transition-colors disabled:opacity-50"
                >
                  {attachingLibrary ? 'Attaching…' : 'Browse Media Library'}
                </button>
              </div>
            )}

            {imageSource === 'upload' && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <p className="text-xs text-gray-500">Upload an image directly (JPEG, PNG, or WebP, max 50 MB).</p>
                <UploadZone
                  accept="image/jpeg,image/png,image/webp"
                  label="Drop image here"
                  sublabel="JPEG, PNG, WebP · max 50 MB"
                  progress={uploadProgress}
                  error={uploadError}
                  onFiles={files => handleImageUpload(files, '1080x1080')}
                />
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Social Assets</h3>
            {campaignImages.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl py-16 text-center">
                <p className="text-gray-500 text-sm">No social assets yet.</p>
                <p className="text-gray-600 text-xs mt-1">Generate, pick from Media Library, or upload an image.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {campaignImages.map(a => (
                  <div key={a.id} className="space-y-1">
                    <AssetThumb
                      asset={a}
                      selected={selectedId === a.id}
                      onSelect={() => setSelectedId(a.id)}
                      onAnimate={() => animateAsset(a.id)}
                      onDelete={() => archiveAsset(a.id)}
                      falVideoEnabled={videoReady}
                    />
                    <p className="text-xs text-gray-500 truncate">{a.format}</p>
                    <StatusBadge status={a.generationStatus} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── VIDEO TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'VIDEO' && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          {/* Controls */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-white">Animate / Generate Video</h3>

            {!videoReady && providerHealth !== null && (() => {
              const vs = providerHealth?.video?.status
              const vreason = providerHealth?.video?.reason
              const videoMsgs: Record<string, string> = {
                disabled:             'FAL video generation is disabled.',
                missing_key:          'FAL API key is not configured.',
                invalid_configuration: 'Video provider configuration is invalid. Check the provider diagnostic.',
              }
              return (
                <div className="bg-yellow-950/40 border border-yellow-900/50 rounded-lg px-3 py-2">
                  <p className="text-xs text-yellow-600">
                    {vs && videoMsgs[vs] ? videoMsgs[vs] : vreason ? `FAL video provider unavailable: ${vreason}` : 'FAL.ai video provider is unavailable.'}
                  </p>
                </div>
              )
            })()}

            {/* Video model */}
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Video model</label>
              <div className="space-y-1.5">
                {VIDEO_MODEL_OPTIONS.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setVideoModel(m.key)}
                    disabled={!videoReady}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      videoModel === m.key
                        ? 'bg-indigo-700/40 border-indigo-600 text-white'
                        : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                    }`}
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      m.tier === 'Recommended' ? 'bg-green-900/60 text-green-400' :
                      m.tier === 'Premium'     ? 'bg-indigo-900/60 text-indigo-400' :
                                                 'bg-gray-800 text-gray-500'
                    }`}>
                      {m.tier}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Source image — 3-source selector */}
            <div className="space-y-2">
              <label className="text-xs text-gray-500 block">Source image</label>
              <SourceSelector
                value={videoSrcMode}
                options={VIDEO_SRC_OPTIONS}
                onChange={setVideoSrcMode}
              />

              {videoSrcMode === 'assets' && (
                <select
                  value={videoSource}
                  onChange={e => setVideoSource(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="">— Select a campaign image —</option>
                  {campaignImages.filter(a => a.publicUrl && a.generationStatus === 'completed').map(a => (
                    <option key={a.id} value={a.id}>
                      {a.format} · {a.provider ?? 'uploaded'} · {new Date(a.createdAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              )}

              {videoSrcMode === 'library' && (
                <div className="space-y-2">
                  {libraryError && <p className="text-xs text-red-400">{libraryError}</p>}
                  <button
                    onClick={() => {
                      setLibraryPickerFilter('image')
                      setLibraryPickerTarget('video-source')
                      setLibraryFormat('1080x1920')
                      setShowLibraryPicker(true)
                    }}
                    disabled={attachingLibrary}
                    className="w-full px-3 py-2 border border-gray-700 hover:border-indigo-600 text-gray-300 hover:text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                  >
                    {attachingLibrary ? 'Attaching…' : 'Pick from Media Library'}
                  </button>
                  {videoSource && (
                    <p className="text-xs text-green-400">Image selected — ready to animate</p>
                  )}
                </div>
              )}

              {videoSrcMode === 'upload' && (
                <UploadZone
                  accept="image/jpeg,image/png,image/webp"
                  label="Upload source image"
                  sublabel="JPEG, PNG, WebP · max 50 MB"
                  progress={uploadProgress}
                  error={uploadError}
                  onFiles={async files => {
                    const file = files[0]
                    if (!file) return
                    setUploadError(null)
                    try {
                      await uploadDirectAsset(file, '1080x1920', false, pct => setUploadProgress(Math.round(pct * 0.9)))
                      // After upload, select the newest campaign image
                      await loadAssets()
                      setVideoSrcMode('assets')
                    } catch (e) {
                      setUploadError(e instanceof Error ? e.message : 'Upload failed')
                    } finally { setTimeout(() => setUploadProgress(null), 1200) }
                  }}
                />
              )}
              <p className="text-xs text-gray-600">
                Use clean artwork — no prices. Add commercial text in Poster Compositor.
              </p>
            </div>

            {/* Motion preset picker */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Motion preset</label>
              <div className="grid grid-cols-2 gap-1">
                {MOTION_PRESETS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setVideoPrompt(p.prompt)}
                    className={`px-2 py-1.5 rounded text-xs border text-left transition-colors truncate ${
                      videoPrompt === p.prompt
                        ? 'bg-indigo-700/30 border-indigo-600 text-white'
                        : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                    title={p.prompt}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Motion prompt */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Motion instruction</label>
              <textarea
                rows={2}
                value={videoPrompt}
                onChange={e => setVideoPrompt(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none"
                placeholder="e.g. Slow cinematic camera movement, golden hour glow"
              />
            </div>

            {/* Duration + aspect ratio */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Duration</label>
                <select
                  value={videoDuration}
                  onChange={e => setVideoDuration(Number(e.target.value) as 5 | 10)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value={5}>5 seconds</option>
                  <option value={10}>10 seconds</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Aspect ratio</label>
                <select
                  value={videoAspect}
                  onChange={e => setVideoAspect(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="9:16">9:16 (Reel / Story)</option>
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="1:1">1:1 (Square)</option>
                </select>
              </div>
            </div>

            {videoError && (
              <div className="bg-red-950 border border-red-800 text-red-300 text-xs rounded-lg px-3 py-2">
                {videoError}
              </div>
            )}

            <button
              onClick={generateVideo}
              disabled={generatingVideo || !videoReady || !videoSource}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              {generatingVideo ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Starting generation…
                </span>
              ) : 'Generate Video'}
            </button>

            <p className="text-xs text-gray-600">
              Video generation is async — status updates every 4 seconds automatically.
              Do not animate artwork with prices baked in; add those in Poster Compositor.
            </p>

            {/* Use existing video — attach without animation */}
            <div className="border-t border-gray-800 pt-4">
              <button
                onClick={() => setShowExistingVideo(v => !v)}
                className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                <span>Use existing video (no AI animation)</span>
                <span>{showExistingVideo ? '▲' : '▼'}</span>
              </button>
              {showExistingVideo && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-gray-600">
                    Attach a video directly from your Media Library or upload one. It will not be sent to FAL.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setLibraryPickerFilter('video')
                        setLibraryPickerTarget('creative')
                        setLibraryFormat('1080x1920')
                        setShowLibraryPicker(true)
                      }}
                      disabled={attachingLibrary}
                      className="flex-1 px-3 py-2 border border-gray-700 hover:border-indigo-600 text-gray-300 hover:text-white text-xs rounded-lg transition-colors disabled:opacity-50"
                    >
                      🖼 From Media Library
                    </button>
                    <button
                      onClick={() => {/* trigger video upload input */}}
                      className="flex-1 px-3 py-2 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white text-xs rounded-lg transition-colors"
                      aria-label="Upload video"
                    >
                      ⬆ Upload video
                    </button>
                  </div>
                  <UploadZone
                    accept="video/mp4,video/quicktime,video/webm"
                    label="Drop video here"
                    sublabel="MP4, MOV, WebM · max 300 MB"
                    progress={videoUploadProgress}
                    error={videoUploadError}
                    onFiles={files => handleVideoFileUpload(files, '1080x1920')}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Video assets */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Video Assets</h3>
            {videoAssets.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl py-16 text-center">
                <p className="text-gray-500 text-sm">No videos yet.</p>
                <p className="text-gray-600 text-xs mt-1">
                  Select a source image and animate it, or attach an existing video.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {videoAssets.map(a => (
                  <div key={a.id} className="space-y-1">
                    <AssetThumb
                      asset={a}
                      selected={selectedId === a.id}
                      onSelect={() => setSelectedId(a.id)}
                      onAnimate={() => {}}
                      onDelete={() => archiveAsset(a.id)}
                      falVideoEnabled={false}
                    />
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={a.generationStatus} />
                      <span className="text-xs text-gray-600">{a.model ?? a.provider}</span>
                    </div>
                    {a.durationMs && (
                      <p className="text-xs text-gray-600">{a.durationMs / 1000}s</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ASSETS TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'ASSETS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {assets.filter(a => !a.isReference).length} assets · {referenceImages.length} references
            </p>
            <button
              onClick={loadAssets}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Refresh
            </button>
          </div>

          {assets.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl py-16 text-center">
              <p className="text-gray-500 text-sm">No assets yet.</p>
              <p className="text-gray-600 text-xs mt-1">Generate with AI, select from Media Library, or upload in the Poster or Social tabs.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {assets.map(a => (
                <div key={a.id} className="space-y-1.5">
                  <AssetThumb
                    asset={a}
                    selected={selectedId === a.id}
                    onSelect={() => { setSelectedId(a.id); setActiveTab(a.mediaType === 'video' ? 'VIDEO' : 'POSTER') }}
                    onAnimate={() => animateAsset(a.id)}
                    onDelete={() => archiveAsset(a.id)}
                    falVideoEnabled={caps.falVideoEnabled}
                  />

                  <div className="space-y-0.5 text-xs">
                    <div className="flex items-center gap-1 flex-wrap">
                      <StatusBadge status={a.generationStatus ?? a.status} />
                      {a.isReference && (
                        <span className="bg-purple-900/60 text-purple-400 text-xs px-1.5 py-0.5 rounded">Ref</span>
                      )}
                    </div>
                    <SourceBadge provider={a.provider} source={a.source} />
                    {a.model && (
                      <p className="text-gray-600 truncate">{a.model}</p>
                    )}
                    <p className="text-gray-700">
                      {a.format} · ${Number(a.costUsd).toFixed(3)}
                    </p>
                    <p className="text-gray-700">
                      {new Date(a.createdAt).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DESIGNER TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'DESIGNER' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
          {/* Left: form */}
          <DesignerModePanel
            campaignId={campaignId}
            templateKey={designerTemplateKey}
            campaignType={designerCampaignType}
            brief={designerBrief}
            commercialFields={designerCommercialFields}
            format={designerFormat}
            generating={generatingDesigner}
            error={designerError}
            artDirecting={artDirecting}
            artDirectorSuggestion={artDirectorSuggestion}
            onTemplateChange={(key) => { setDesignerTemplateKey(key); setDesignerCommercialFields({}) }}
            onCampaignTypeChange={setDesignerCampaignType}
            onBriefChange={setDesignerBrief}
            onCommercialFieldChange={(fieldKey, val) =>
              setDesignerCommercialFields(prev => ({ ...prev, [fieldKey]: val }))
            }
            onFormatChange={setDesignerFormat}
            onGenerate={generateDesignerImage}
            onArtDirect={runArtDirector}
          />
          {/* Right: design controls panel */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-3">Design Controls</p>
            <DesignerControlsPanel
              controls={designerControls}
              qualityScore={qualityScore ?? undefined}
              generating={generatingDesigner}
              onChange={newControls => {
                setDesignerControls(newControls)
                // Rebuild live if we have a composition
                if (designerComposition) {
                  const visual = designerComposition.layers.find(l => l.type === 'image') as { src?: string; id?: string } | undefined
                  const newComp = rebuildComposition(
                    designerTemplateKey,
                    designerCommercialFields,
                    newControls,
                    designerLayerOverrides,
                    visual?.src ? { url: visual.src, id: visual.id ?? undefined } : undefined,
                  )
                  setDesignerComposition(newComp)
                  setQualityScore(scoreComposition(newComp, newControls, currentSafeZones))
                }
              }}
              onPolish={(action: PolishAction) => {
                const newControls = applyPolishAction(designerControls, action)
                setDesignerControls(newControls)
                if (designerComposition) {
                  const visual = designerComposition.layers.find(l => l.type === 'image') as { src?: string; id?: string } | undefined
                  const newComp = rebuildComposition(
                    designerTemplateKey,
                    designerCommercialFields,
                    newControls,
                    designerLayerOverrides,
                    visual?.src ? { url: visual.src, id: visual.id ?? undefined } : undefined,
                  )
                  setDesignerComposition(newComp)
                  setQualityScore(scoreComposition(newComp, newControls, currentSafeZones))
                }
              }}
              onVariation={(variation: DesignVariation) => {
                const newControls = applyVariationControls(designerControls, variation)
                setDesignerControls(newControls)
                setDesignerBrief(variation.visualMoodModifier)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
