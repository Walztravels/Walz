'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { PosterCompositor, defaultPosterData, type PosterData } from './PosterCompositor'
import { BRAND_PRESETS, FORMAT_PRESETS } from '@/lib/orbit/creative-presets'

// ── Types ─────────────────────────────────────────────────────────────────────

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

type Tab = 'POSTER' | 'SOCIAL' | 'VIDEO' | 'ASSETS'

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
  const [generating,   setGenerating]   = useState(false)
  const [genError,     setGenError]     = useState<string | null>(null)
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

  // Reference image upload
  const refInputRef = useRef<HTMLInputElement>(null)
  const [uploadingRef, setUploadingRef] = useState(false)
  const [refError,     setRefError]     = useState<string | null>(null)

  // Polling timers for pending jobs
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  async function loadAssets() {
    try {
      const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative`)
      const data = await res.json()
      if (data.assets) setAssets(data.assets)
      setCaps({
        openaiEnabled:    data.openaiEnabled    ?? false,
        replicateEnabled: data.replicateEnabled ?? false,
        runwayEnabled:    false,
        falVideoEnabled:  data.falVideoEnabled  ?? false,
        imageHealth:      data.imageHealth      ?? undefined,
        videoHealth:      data.videoHealth      ?? undefined,
      })
    } catch { /* non-fatal */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadAssets()
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
  const generatedImages = assets.filter(a => !a.isReference && a.mediaType === 'image')
  const referenceImages = assets.filter(a => a.isReference)
  const videoAssets     = assets.filter(a => a.mediaType === 'video')

  // ── Generate image ─────────────────────────────────────────────────────────

  async function generateImage(tab: 'POSTER' | 'SOCIAL') {
    setGenerating(true); setGenError(null)
    try {
      const body: Record<string, unknown> = {
        mode:         'image',
        provider,
        format,
        promptHint:   customPrompt || promptHint || promotionDetails,
        brandPreset:  brandPreset || undefined,
        prompt:       customPrompt || undefined,
        referenceMediaId: referenceImages[0]?.id ?? undefined,
      }
      const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      if (data.media) {
        setAssets(prev => [data.media, ...prev])
        setSelectedId(data.media.id)
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
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
      const presignData = await presignRes.json()
      if (!presignRes.ok) throw new Error(presignData.error ?? 'Upload init failed')

      const upRes = await fetch(presignData.uploadUrl, {
        method: 'PUT', body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!upRes.ok) throw new Error('File upload failed')

      await loadAssets()
    } catch (e) {
      setRefError(e instanceof Error ? e.message : 'Upload failed')
    } finally { setUploadingRef(false) }
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
            {(caps.openaiEnabled || !caps.replicateEnabled) && (
              <button
                onClick={() => setProvider('openai')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  provider === 'openai'
                    ? 'bg-indigo-700 border-indigo-600 text-white'
                    : 'border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
                disabled={!caps.openaiEnabled}
              >
                {PROVIDER_LABELS.openai}
                {!caps.openaiEnabled && <span className="ml-1 text-gray-600">(off)</span>}
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
          {!caps.openaiEnabled && !caps.replicateEnabled && (
            <p className="mt-1 text-xs text-red-400">
              No image provider configured. Set ORBIT_AI_IMAGE_ENABLED=true or REPLICATE_API_TOKEN.
            </p>
          )}
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
            <div className="flex gap-2 mt-2 flex-wrap">
              {referenceImages.map(r => (
                <div key={r.id} className="relative w-14 h-14 rounded overflow-hidden border border-gray-700">
                  {r.publicUrl && <img src={r.publicUrl} alt={r.altText} className="w-full h-full object-cover" />}
                  <div className="absolute inset-0 bg-black/40 flex items-end p-0.5">
                    <span className="text-xs text-white/80 truncate" style={{ fontSize: 8 }}>Ref</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-600 mt-1">
            Staff-uploaded reference images (destination, aircraft, hotel). Not for customer documents.
          </p>
        </div>

        {genError && (
          <div className="bg-red-950 border border-red-800 text-red-300 text-xs rounded-lg px-3 py-2">
            {genError}
          </div>
        )}

        <button
          onClick={() => generateImage(tab)}
          disabled={generating || (!caps.openaiEnabled && !caps.replicateEnabled)}
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

  return (
    <div className="space-y-4">
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
              name={caps.imageHealth?.model ?? 'OpenAI'}
              status={caps.imageHealth?.status ?? (caps.openaiEnabled ? 'configured' : 'disabled')}
              reason={caps.imageHealth?.reason}
            />
            <ProviderStatusPill
              label="Video"
              name={caps.videoHealth?.model ?? 'Kling'}
              status={caps.videoHealth?.status ?? (caps.falVideoEnabled ? 'configured' : 'disabled')}
              reason={caps.videoHealth?.reason}
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
        {(['POSTER', 'SOCIAL', 'VIDEO', 'ASSETS'] as Tab[]).map(t => (
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
            <GenerationControls tab="POSTER" />

            {generatedImages.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Select background for compositor</p>
                <div className="grid grid-cols-3 gap-2">
                  {generatedImages.map(a => (
                    <AssetThumb
                      key={a.id}
                      asset={a}
                      selected={selectedId === a.id}
                      onSelect={() => setSelectedId(a.id)}
                      onAnimate={() => animateAsset(a.id)}
                      onDelete={() => archiveAsset(a.id)}
                      falVideoEnabled={caps.falVideoEnabled}
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
            />

            {!selectedId && generatedImages.length === 0 && (
              <p className="text-xs text-gray-600 text-center">
                Generate artwork above, then select it to compose the poster.
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
          <GenerationControls tab="SOCIAL" />

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Social Assets</h3>
            {generatedImages.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl py-16 text-center">
                <p className="text-gray-500 text-sm">No social assets yet.</p>
                <p className="text-gray-600 text-xs mt-1">Generate artwork from the controls panel.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {generatedImages.map(a => (
                  <div key={a.id} className="space-y-1">
                    <AssetThumb
                      asset={a}
                      selected={selectedId === a.id}
                      onSelect={() => setSelectedId(a.id)}
                      onAnimate={() => animateAsset(a.id)}
                      onDelete={() => archiveAsset(a.id)}
                      falVideoEnabled={caps.falVideoEnabled}
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

            {!caps.falVideoEnabled && (
              <div className="bg-yellow-950/40 border border-yellow-900/50 rounded-lg px-3 py-2">
                <p className="text-xs text-yellow-600">
                  FAL.ai video is not enabled. Set ORBIT_AI_VIDEO_ENABLED=true and FALAI_API_KEY.
                </p>
              </div>
            )}

            {/* Video model */}
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Video model</label>
              <div className="space-y-1.5">
                {VIDEO_MODEL_OPTIONS.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setVideoModel(m.key)}
                    disabled={!caps.falVideoEnabled}
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

            {/* Source image */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Source image (required)</label>
              <select
                value={videoSource}
                onChange={e => setVideoSource(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">— Select a generated image —</option>
                {generatedImages.filter(a => a.publicUrl && a.generationStatus === 'completed').map(a => (
                  <option key={a.id} value={a.id}>
                    {a.format} · {a.provider ?? 'generated'} · {new Date(a.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-600 mt-0.5">
                Select clean artwork without commercial text overlaid. Add prices in Poster Compositor instead.
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
              disabled={generatingVideo || !caps.falVideoEnabled || !videoSource}
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
              Do not animate artwork with prices or commercial text baked in; add those in Poster Compositor.
            </p>
          </div>

          {/* Video assets */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Video Assets</h3>
            {videoAssets.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl py-16 text-center">
                <p className="text-gray-500 text-sm">No videos yet.</p>
                <p className="text-gray-600 text-xs mt-1">
                  Select a source image and click Generate Video.
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
              <p className="text-gray-600 text-xs mt-1">Generate artwork in the Poster or Social tabs.</p>
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
                        <span className="text-purple-400">Ref</span>
                      )}
                    </div>
                    <p className="text-gray-600 truncate">
                      {a.provider ? (PROVIDER_LABELS[a.provider] ?? a.provider) : 'uploaded'}
                      {a.model ? ` / ${a.model}` : ''}
                    </p>
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
    </div>
  )
}
