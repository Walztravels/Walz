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

interface Capabilities {
  openaiEnabled:    boolean
  replicateEnabled: boolean
  runwayEnabled:    boolean
}

interface Props {
  campaignId:      string
  destination:     string
  objective:       string
  promotionDetails: string
  cta:             string
  tone:            string
}

// ── Tab definition ────────────────────────────────────────────────────────────

type Tab = 'POSTER' | 'SOCIAL' | 'VIDEO' | 'ASSETS'

// ── Provider labels ───────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  openai:    'OpenAI GPT-Image',
  replicate: 'Replicate / Flux',
  runway:    'Runway Gen-4',
  falai:     'FAL.ai / Kling',
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  const colors: Record<string, string> = {
    pending:    'bg-yellow-900 text-yellow-300',
    processing: 'bg-blue-900 text-blue-300',
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
  asset, selected, onSelect, onAnimate, onDelete, runwayEnabled,
}: {
  asset:         Asset
  selected:      boolean
  onSelect:      () => void
  onAnimate:     () => void
  onDelete:      () => void
  runwayEnabled: boolean
}) {
  const isPending = asset.generationStatus === 'pending' || asset.generationStatus === 'processing'

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
        {asset.mediaType === 'image' && !asset.isReference && runwayEnabled && (
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
  const [caps,         setCaps]         = useState<Capabilities>({ openaiEnabled: false, replicateEnabled: false, runwayEnabled: false })
  const [loading,      setLoading]      = useState(true)
  const [generating,   setGenerating]   = useState(false)
  const [genError,     setGenError]     = useState<string | null>(null)
  const [selectedId,   setSelectedId]   = useState<string | null>(null)

  // Generation form state
  const [format,       setFormat]       = useState('1080x1920')
  const [provider,     setProvider]     = useState<'openai' | 'replicate'>('openai')
  const [brandPreset,  setBrandPreset]  = useState('')
  const [promptHint,   setPromptHint]   = useState('')
  const [customPrompt, setCustomPrompt] = useState('')

  // Poster compositor state
  const [posterData,   setPosterData]   = useState<PosterData>(defaultPosterData())
  const [savingPoster, setSavingPoster] = useState(false)

  // Video state
  const [videoProvider,  setVideoProvider]  = useState<'runway' | 'falai'>('runway')
  const [videoPrompt,    setVideoPrompt]    = useState('Slow cinematic camera movement, gentle parallax, golden hour light movement')
  const [videoDuration,  setVideoDuration]  = useState<5 | 10>(5)
  const [videoAspect,    setVideoAspect]    = useState('9:16')
  const [videoSource,    setVideoSource]    = useState<string>('') // mediaId of source image
  const [videoError,     setVideoError]     = useState<string | null>(null)
  const [generatingVideo, setGeneratingVideo] = useState(false)

  // Reference image upload
  const refInputRef = useRef<HTMLInputElement>(null)
  const [uploadingRef, setUploadingRef] = useState(false)
  const [refError,     setRefError]     = useState<string | null>(null)

  // Polling for pending jobs
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  async function loadAssets() {
    try {
      const res = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative`)
      const data = await res.json()
      if (data.assets) setAssets(data.assets)
      setCaps({
        openaiEnabled:    data.openaiEnabled    ?? false,
        replicateEnabled: data.replicateEnabled ?? false,
        runwayEnabled:    data.runwayEnabled    ?? false,
      })
    } catch { /* non-fatal */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadAssets()
    return () => { Object.values(pollTimers.current).forEach(clearInterval) }
  }, [campaignId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Start polling for any pending async jobs
  const pollAsset = useCallback((assetId: string) => {
    if (pollTimers.current[assetId]) return
    pollTimers.current[assetId] = setInterval(async () => {
      try {
        const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative/${assetId}`)
        const data = await res.json()
        if (data.asset) {
          setAssets(prev => prev.map(a => a.id === assetId ? data.asset : a))
          const s = data.asset.generationStatus
          if (s !== 'pending' && s !== 'processing') {
            clearInterval(pollTimers.current[assetId])
            delete pollTimers.current[assetId]
          }
        }
      } catch { /* non-fatal */ }
    }, 4000)
  }, [campaignId])

  // Auto-poll pending jobs
  useEffect(() => {
    assets.forEach(a => {
      if (a.generationStatus === 'pending' || a.generationStatus === 'processing') {
        pollAsset(a.id)
      }
    })
  }, [assets, pollAsset])

  // Sync posterData from selected asset
  useEffect(() => {
    const sel = assets.find(a => a.id === selectedId)
    if (sel?.posterData) setPosterData(sel.posterData as PosterData)
  }, [selectedId, assets])

  const selectedAsset = assets.find(a => a.id === selectedId) ?? null
  const generatedImages = assets.filter(a => !a.isReference && a.mediaType === 'image')
  const referenceImages = assets.filter(a => a.isReference)
  const videoAssets     = assets.filter(a => a.mediaType === 'video')

  // ── Generate image ─────────────────────────────────────────────────────────

  async function generateImage(tab: 'POSTER' | 'SOCIAL') {
    setGenerating(true); setGenError(null)
    try {
      const body: Record<string, unknown> = {
        mode: 'image',
        provider,
        format: tab === 'SOCIAL' ? format : format,
        promptHint:  customPrompt || promptHint || promotionDetails,
        brandPreset: brandPreset || undefined,
        prompt:      customPrompt || undefined,
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

  // ── Generate video ─────────────────────────────────────────────────────────

  async function generateVideo() {
    setGeneratingVideo(true); setVideoError(null)
    try {
      if (videoProvider === 'runway') {
        if (!videoSource) throw new Error('Select a source image to animate')
        const body = {
          mode: 'video', provider: 'runway',
          prompt: videoPrompt, duration: videoDuration,
          aspectRatio: videoAspect, referenceMediaId: videoSource,
        }
        const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Video generation failed')
        if (data.media) setAssets(prev => [data.media, ...prev])
      } else {
        // FAL.ai via existing route
        const body = {
          mode: videoSource ? 'image' : 'text',
          prompt: videoPrompt, duration: videoDuration,
          aspectRatio: videoAspect, imageUrl: videoSource
            ? assets.find(a => a.id === videoSource)?.publicUrl : undefined,
        }
        const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/generate-video`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Video generation failed')
        // FAL returns requestId — poll existing endpoint
        if (data.requestId) {
          const pollRes = await pollFAL(data.requestId, data.model, data.aspectRatio, data.duration, data.prompt)
          if (pollRes) setAssets(prev => [pollRes, ...prev])
        }
      }
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : 'Video generation failed')
    } finally {
      setGeneratingVideo(false)
    }
  }

  async function pollFAL(requestId: string, model: string, aspectRatio: string, duration: number, prompt: string): Promise<Asset | null> {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const res  = await fetch(
        `/api/admin/orbit/campaigns/${campaignId}/generate-video?requestId=${requestId}&model=${encodeURIComponent(model)}&aspectRatio=${aspectRatio}&duration=${duration}&prompt=${encodeURIComponent(prompt)}`
      )
      const data = await res.json()
      if (data.status === 'done') return data as unknown as Asset
      if (data.status === 'failed') throw new Error(data.error ?? 'FAL.ai generation failed')
    }
    throw new Error('FAL.ai generation timed out')
  }

  // ── Animate image with Runway ──────────────────────────────────────────────

  async function animateAsset(assetId: string) {
    try {
      const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative/${assetId}/animate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt: 'Slow cinematic camera movement, gentle parallax', duration: 5 }),
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
      // Get presigned URL
      const presignRes = await fetch(`/api/admin/orbit/campaigns/${campaignId}/creative/reference`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mimeType: file.type, fileSize: file.size, label: file.name }),
      })
      const presignData = await presignRes.json()
      if (!presignRes.ok) throw new Error(presignData.error ?? 'Upload init failed')

      // Upload directly to Supabase
      const upRes = await fetch(presignData.uploadUrl, {
        method: 'PUT', body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!upRes.ok) throw new Error('File upload failed')

      // Reload assets
      await loadAssets()
    } catch (e) {
      setRefError(e instanceof Error ? e.message : 'Upload failed')
    } finally { setUploadingRef(false) }
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

  // ── Render controls shared between POSTER and SOCIAL tabs ─────────────────

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Creative Studio</h2>
          <p className="text-xs text-gray-500">
            Generate artwork · Compose poster · Animate with Runway
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          {caps.openaiEnabled    && <span className="text-green-600">● OpenAI</span>}
          {caps.replicateEnabled && <span className="text-green-600">● Replicate</span>}
          {caps.runwayEnabled    && <span className="text-green-600">● Runway</span>}
          {!caps.openaiEnabled && !caps.replicateEnabled && !caps.runwayEnabled && (
            <span className="text-yellow-600">No AI providers configured</span>
          )}
        </div>
      </div>

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
          {/* Left: controls + asset grid */}
          <div className="space-y-4">
            <GenerationControls tab="POSTER" />

            {/* Generated assets for selection */}
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
                      runwayEnabled={caps.runwayEnabled}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Poster Compositor */}
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
                      runwayEnabled={caps.runwayEnabled}
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

            {/* Provider */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Video provider</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setVideoProvider('runway')}
                  disabled={!caps.runwayEnabled}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    videoProvider === 'runway'
                      ? 'bg-indigo-700 border-indigo-600 text-white'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Runway Gen-4 {!caps.runwayEnabled && '(off)'}
                </button>
                <button
                  onClick={() => setVideoProvider('falai')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    videoProvider === 'falai'
                      ? 'bg-indigo-700 border-indigo-600 text-white'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  FAL.ai / Kling
                </button>
              </div>
            </div>

            {/* Source image */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Source image (image-to-video)</label>
              <select
                value={videoSource}
                onChange={e => setVideoSource(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">Text-to-video (no source)</option>
                {generatedImages.filter(a => a.publicUrl && a.generationStatus === 'completed').map(a => (
                  <option key={a.id} value={a.id}>
                    {a.format} — {a.provider ?? 'generated'} — {new Date(a.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            {/* Motion prompt */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Motion instruction</label>
              <textarea
                rows={3}
                value={videoPrompt}
                onChange={e => setVideoPrompt(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none"
                placeholder="e.g. Slow cinematic camera movement, aircraft lights in background, golden-hour glow"
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
              disabled={generatingVideo}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              {generatingVideo ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Starting generation…
                </span>
              ) : 'Generate Video'}
            </button>

            <p className="text-xs text-gray-600">
              Video generation is async. Status updates every 4 seconds. Do not animate text baked into source images.
            </p>
          </div>

          {/* Video assets */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Video Assets</h3>
            {videoAssets.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl py-16 text-center">
                <p className="text-gray-500 text-sm">No videos yet.</p>
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
                      runwayEnabled={false}
                    />
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={a.generationStatus} />
                      <span className="text-xs text-gray-600">{a.provider}</span>
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
                    runwayEnabled={caps.runwayEnabled}
                  />

                  <div className="space-y-0.5 text-xs">
                    <div className="flex items-center gap-1 flex-wrap">
                      <StatusBadge status={a.generationStatus ?? a.status} />
                      {a.isReference && (
                        <span className="text-purple-400">Ref</span>
                      )}
                    </div>
                    <p className="text-gray-600 truncate">
                      {a.provider ? PROVIDER_LABELS[a.provider] ?? a.provider : 'uploaded'}
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
