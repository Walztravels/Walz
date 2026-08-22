'use client'

import { useEffect, useRef, useState } from 'react'
import { FLUX_FORMATS, type FluxFormat } from '@/lib/orbit/replicate-adapter'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Play } from 'lucide-react'

// ── Client-side upload limits (source: Buffer API docs + platform specs) ──────
// Buffer enforces 300 MB for Instagram video. Duration limits:
//   Reel    — 90 s (practical marketing limit; Instagram supports longer)
//   Story   — 60 s (Instagram Story video limit)
//   Feed    — 900 s / 15 min (Buffer's Instagram max)
const MAX_VIDEO_BYTES  = 300 * 1024 * 1024
const MAX_IMAGE_BYTES  =  50 * 1024 * 1024
const VIDEO_DURATION_LIMITS: Record<string, number> = {
  reel:       90,
  story:      60,
  feed_video: 900,
}
const VIDEO_FORMAT_LABELS: Record<string, string> = {
  reel:       'Reel (9:16, max 90 s)',
  story:      'Story (9:16, max 60 s)',
  feed_video: 'Feed video (max 15 min)',
}

interface MediaItem {
  id:           string
  source:       string
  publicUrl:    string | null
  format:       string
  mediaType?:   string
  durationMs?:  number | null
  destination:  string | null
  prompt:       string | null
  altText:      string
  costUsd:      string
  status:       string
  approvedBy:   string | null
  createdAt:    string
  _fromMarketing?: boolean
}

interface Props {
  campaignId: string
  campaignContext: {
    destination: string
    objective: string
    cta: string
    promotionDetails: string
  }
}

const STATUS_CHIP: Record<string, string> = {
  draft:    'bg-gray-700 text-gray-300',
  approved: 'bg-green-900 text-green-300',
  rejected: 'bg-red-900 text-red-300',
}

const FORMAT_LABELS: Record<string, string> = {
  '1080x1920': 'Story / WhatsApp Status',
  '1080x1350': 'Instagram Feed',
  '1200x628':  'Facebook Ad',
  '1024x1024': 'Square',
  reel:        'Reel',
  story:       'Story',
  feed_video:  'Feed video',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const vid = document.createElement('video')
    vid.preload = 'metadata'
    vid.onloadedmetadata = () => {
      URL.revokeObjectURL(vid.src)
      if (!isFinite(vid.duration) || isNaN(vid.duration)) {
        reject(new Error('Could not determine video duration'))
      } else {
        resolve(vid.duration * 1000)
      }
    }
    vid.onerror = () => { URL.revokeObjectURL(vid.src); reject(new Error('Invalid video file')) }
    vid.src = URL.createObjectURL(file)
  })
}

function uploadWithProgress(
  url: string, file: File, onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed: ${xhr.status} — ${xhr.responseText.slice(0, 200)}`))
    }
    xhr.onerror = () => reject(new Error('Upload failed — network error'))
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.send(file)
  })
}

// ── Sortable card (approved items) ────────────────────────────────────────────

function SortableMediaCard({
  item, position, onReject, onRemove,
}: {
  item:     MediaItem
  position: number
  onReject: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const isVideo = item.mediaType === 'video'

  return (
    <div
      ref={setNodeRef} style={style}
      className={`flex gap-3 items-center bg-gray-900 border border-gray-800 rounded-xl p-3 transition ${isDragging ? 'opacity-50 shadow-2xl ring-1 ring-indigo-500' : ''}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab text-gray-600 hover:text-gray-400 p-1 touch-none">
        <GripVertical className="w-4 h-4" />
      </div>
      <span className="w-6 h-6 rounded-full bg-indigo-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
        {position}
      </span>

      {/* Thumbnail */}
      {item.publicUrl ? (
        isVideo ? (
          <div className="w-14 h-14 bg-gray-800 rounded-lg flex-shrink-0 flex items-center justify-center relative overflow-hidden">
            <video src={item.publicUrl} className="w-full h-full object-cover" muted />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Play className="w-4 h-4 text-white" />
            </div>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.publicUrl} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
        )
      ) : (
        <div className="w-14 h-14 bg-gray-800 rounded-lg flex-shrink-0 flex items-center justify-center text-gray-600 text-[10px]">
          No preview
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 font-medium truncate">
          {isVideo && <span className="text-purple-400 mr-1">▶</span>}
          {FORMAT_LABELS[item.format] ?? item.format}
        </p>
        <p className="text-xs text-gray-600 mt-0.5">
          {item.source === 'uploaded' ? (isVideo ? 'Uploaded video' : 'Real photo') : 'Generated'}
          {item.durationMs ? ` · ${fmtDuration(item.durationMs)}` : ''}
        </p>
        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-900 text-green-300">approved</span>
      </div>
      <div className="flex flex-col gap-1 items-end flex-shrink-0">
        {item.publicUrl && (
          <a href={item.publicUrl} download target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
            Download
          </a>
        )}
        <button onClick={onReject} className="text-[11px] text-red-500 hover:text-red-400 transition-colors">
          Reject
        </button>
        <button onClick={onRemove} className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors">
          {item.source === 'uploaded' ? 'Detach' : 'Delete'}
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ImagesSection({ campaignId, campaignContext }: Props) {
  const [media, setMedia]               = useState<MediaItem[]>([])
  const [mediaOrder, setMediaOrder]     = useState<string[]>([])
  const [library, setLibrary]           = useState<MediaItem[]>([])
  const [cap, setCap]                   = useState(8)
  const [used, setUsed]                 = useState(0)
  const [imageCostUsd, setImageCostUsd] = useState('0')
  const [configured, setConfigured]     = useState<boolean | null>(null)
  const [loading, setLoading]           = useState(true)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Image generation
  const [format, setFormat]           = useState<FluxFormat>('1080x1920')
  const [promptHint, setPromptHint]   = useState(campaignContext.promotionDetails.slice(0, 120))
  const [builtPrompt, setBuiltPrompt] = useState('')
  const [showForm, setShowForm]       = useState(false)
  const [generating, setGenerating]   = useState(false)
  const [genError, setGenError]       = useState<string | null>(null)
  const [capError, setCapError]       = useState<string | null>(null)

  // Upload state (shared by image + video)
  const imageInputRef    = useRef<HTMLInputElement>(null)
  const videoInputRef    = useRef<HTMLInputElement>(null)
  const [uploading, setUploading]         = useState(false)
  const [uploadPct, setUploadPct]         = useState<number | null>(null)
  const [uploadError, setUploadError]     = useState<string | null>(null)

  // Video-specific
  const [videoFormat, setVideoFormat] = useState<'reel' | 'story' | 'feed_video'>('reel')
  const [showVideoOpts, setShowVideoOpts] = useState(false)

  async function load(fmt?: string) {
    try {
      const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/images${fmt ? `?format=${fmt}` : ''}`)
      const data = await res.json()
      if (data.media)          setMedia(data.media)
      if (data.mediaOrder)     setMediaOrder(data.mediaOrder as string[])
      if (data.libraryMatches) setLibrary(data.libraryMatches)
      if (data.cap !== undefined) setCap(data.cap)
      if (data.used !== undefined) setUsed(data.used)
      if (data.imageCostUsd !== undefined) setImageCostUsd(String(data.imageCostUsd))
      if (typeof data.replicateConfigured === 'boolean') setConfigured(data.replicateConfigured)
      if (data.prompt) setBuiltPrompt(data.prompt)
    } catch { /* non-fatal */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load(format) }, [campaignId]) // eslint-disable-line

  useEffect(() => {
    if (!loading) load(format)
  }, [format]) // eslint-disable-line

  async function generate() {
    setGenerating(true); setGenError(null); setCapError(null)
    try {
      const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, promptHint }),
      })
      const data = await res.json()
      if (data.capReached) { setCapError(data.error); return }
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      if (data.prompt) setBuiltPrompt(data.prompt)
      setShowForm(false)
      await load(format)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  async function attachLibraryItem(item: MediaItem) {
    const url = item._fromMarketing
      ? `/api/admin/orbit/media/from-marketing/${item.id}`
      : `/api/admin/orbit/media/${item.id}/attach`
    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, format }),
    })
    const data = await res.json()
    if (data.capReached) { setCapError(data.error); return }
    await load(format)
  }

  async function mediaAction(imageId: string, action: string) {
    await fetch(`/api/admin/orbit/campaigns/${campaignId}/images/${imageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    await load(format)
  }

  async function removeMedia(imageId: string) {
    await fetch(`/api/admin/orbit/campaigns/${campaignId}/images/${imageId}`, { method: 'DELETE' })
    await load(format)
  }

  // Shared presign upload — works for images and videos
  async function presignUpload(file: File, uploadMediaType: 'image' | 'video', uploadFormat: string, durationMs?: number) {
    setUploading(true); setUploadError(null); setUploadPct(0)
    try {
      const presignRes = await fetch('/api/admin/orbit/media/presign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileSize:    file.size,
          mimeType:    file.type,
          format:      uploadFormat,
          destination: campaignContext.destination,
          campaignId,
          mediaType:   uploadMediaType,
          durationMs,
        }),
      })
      const presignData = await presignRes.json()
      if (!presignRes.ok) throw new Error(presignData.error ?? 'Failed to get upload URL')

      await uploadWithProgress(presignData.uploadUrl, file, setUploadPct)
      await load(format)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      setUploadPct(null)
      if (imageInputRef.current) imageInputRef.current.value = ''
      if (videoInputRef.current) videoInputRef.current.value = ''
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError(`Image must be under 50 MB (this file is ${(file.size / 1024 / 1024).toFixed(1)} MB)`)
      return
    }
    await presignUpload(file, 'image', format)
  }

  async function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)

    if (file.size > MAX_VIDEO_BYTES) {
      setUploadError(`Video must be under 300 MB (Buffer's Instagram limit). This file is ${(file.size / 1024 / 1024).toFixed(0)} MB.`)
      if (videoInputRef.current) videoInputRef.current.value = ''
      return
    }

    let durationMs: number
    try {
      durationMs = await getVideoDuration(file)
    } catch {
      setUploadError('Could not read video duration. Ensure the file is a valid MP4 or MOV.')
      if (videoInputRef.current) videoInputRef.current.value = ''
      return
    }

    const maxSec = VIDEO_DURATION_LIMITS[videoFormat] ?? 900
    if (durationMs / 1000 > maxSec) {
      const label = VIDEO_FORMAT_LABELS[videoFormat] ?? videoFormat
      setUploadError(
        `This video is ${fmtDuration(durationMs)} but the ${label} limit is ${maxSec < 60 ? maxSec + 's' : Math.floor(maxSec / 60) + ' min'}. ` +
        `Trim it or choose a different video type.`
      )
      if (videoInputRef.current) videoInputRef.current.value = ''
      return
    }

    setShowVideoOpts(false)
    await presignUpload(file, 'video', videoFormat, durationMs)
  }

  if (loading) return null

  const capReached = used >= cap

  const approvedItems = media.filter(m => m.status === 'approved')
  const hasApprovedVideos = approvedItems.some(m => m.mediaType === 'video')
  const hasApprovedImages = approvedItems.some(m => !m.mediaType || m.mediaType === 'image')
  const mixedMediaWarn   = hasApprovedVideos && hasApprovedImages

  return (
    <div className="space-y-5 pt-4 border-t border-gray-800 mt-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">Campaign Media</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Images or a single video for this campaign. Powered by Flux Schnell (images) or direct upload (video).
          </p>
        </div>
        <div className="text-right text-xs text-gray-500 space-y-0.5 flex-shrink-0">
          <p><span className={capReached ? 'text-red-400' : 'text-gray-400'}>{used}/{cap}</span> items</p>
          {Number(imageCostUsd) > 0 && (
            <p className="text-gray-600">${Number(imageCostUsd).toFixed(4)} image cost</p>
          )}
        </div>
      </div>

      {/* Not configured */}
      {configured === false && (
        <div className="bg-gray-900 border border-amber-800/50 rounded-xl p-5 space-y-2">
          <p className="text-amber-400 text-sm font-medium">Replicate not connected</p>
          <p className="text-gray-400 text-xs">Add these to your Vercel environment variables:</p>
          <div className="font-mono text-xs text-gray-300 bg-gray-950 rounded px-4 py-3 space-y-1">
            <p>REPLICATE_API_TOKEN=<span className="text-gray-500">from replicate.com/account/api-tokens</span></p>
            <p>SUPABASE_SERVICE_ROLE_KEY=<span className="text-gray-500">Supabase → Settings → API</span></p>
          </div>
          <p className="text-gray-500 text-xs">Also create an <strong className="text-gray-400">orbit-media</strong> bucket in Supabase Storage and set it to Public.</p>
        </div>
      )}

      {/* Cap error */}
      {capError && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">
          {capError}
        </div>
      )}

      {/* Mixed media warning */}
      {mixedMediaWarn && (
        <div className="bg-amber-950 border border-amber-700 text-amber-300 text-sm rounded-lg px-4 py-3">
          <strong>Cannot publish:</strong> approved list has both images and a video. Buffer requires one type per post.
          Reject the video or reject all images before publishing.
        </div>
      )}

      {configured && (
        <>
          {/* Format tabs (images only) */}
          <div className="flex flex-wrap gap-2 items-center">
            {Object.entries(FLUX_FORMATS).map(([key, fmt]) => (
              <button key={key} onClick={() => setFormat(key as FluxFormat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  format === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}>
                {fmt.label}
                {key === '1080x1920' && <span className="ml-1 text-[10px] text-yellow-400">★</span>}
              </button>
            ))}
            <span className="text-gray-600 text-xs ml-2">{FLUX_FORMATS[format].w}×{FLUX_FORMATS[format].h}</span>
          </div>

          {/* Library matches */}
          {library.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <p className="text-xs font-medium text-gray-400">
                Library matches for <span className="text-white">{campaignContext.destination}</span> · {FORMAT_LABELS[format] ?? format}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {library.map(item => (
                  <div key={item.id} className="group relative rounded-lg overflow-hidden border border-gray-700 bg-gray-950">
                    {item.publicUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.publicUrl} alt={item.altText || 'Library image'} className="w-full h-28 object-cover" />
                    ) : (
                      <div className="h-28 flex items-center justify-center text-gray-600 text-xs">No preview</div>
                    )}
                    <div className="p-2 space-y-1">
                      <p className="text-xs text-gray-500">{item.source === 'uploaded' ? 'Real photo' : 'Generated'}</p>
                      <button onClick={() => attachLibraryItem(item)}
                        disabled={capReached}
                        className="w-full bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs font-medium py-1 rounded transition-colors">
                        Use this
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action row */}
          {!showForm && (
            <div className="flex gap-2 flex-wrap items-center">
              <button onClick={() => setShowForm(true)} disabled={capReached}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                {capReached ? `Cap reached (${cap})` : 'Generate background'}
              </button>

              {/* Image upload */}
              <label className={`cursor-pointer ${capReached ? 'opacity-40 pointer-events-none' : ''}`}>
                <span className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors inline-block">
                  Upload photo
                </span>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                  onChange={handleImageChange} disabled={uploading || capReached} />
              </label>

              {/* Video upload */}
              <div className="relative">
                <button
                  disabled={capReached}
                  onClick={() => setShowVideoOpts(v => !v)}
                  className="bg-purple-900 hover:bg-purple-800 disabled:opacity-40 text-purple-200 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" />
                  Upload video
                </button>
                {showVideoOpts && (
                  <div className="absolute top-full left-0 mt-1 z-10 bg-gray-900 border border-gray-700 rounded-xl p-3 space-y-2 w-56 shadow-xl">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Video type</p>
                    {(Object.keys(VIDEO_FORMAT_LABELS) as Array<'reel' | 'story' | 'feed_video'>).map(vf => (
                      <label key={vf} className="flex items-center gap-2 cursor-pointer group">
                        <input type="radio" name="videoFmt" value={vf}
                          checked={videoFormat === vf}
                          onChange={() => setVideoFormat(vf)}
                          className="accent-purple-500" />
                        <span className={`text-xs ${videoFormat === vf ? 'text-purple-300 font-medium' : 'text-gray-400 group-hover:text-gray-200'}`}>
                          {VIDEO_FORMAT_LABELS[vf]}
                        </span>
                      </label>
                    ))}
                    <label className="block mt-2">
                      <span className="w-full bg-purple-700 hover:bg-purple-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
                        <Play className="w-3 h-3" /> Choose file…
                      </span>
                      <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime"
                        className="hidden"
                        onChange={handleVideoChange}
                        disabled={uploading} />
                    </label>
                  </div>
                )}
              </div>

              {uploadError && <p className="text-red-400 text-xs w-full mt-1">{uploadError}</p>}
            </div>
          )}

          {/* Upload progress */}
          {uploading && (
            <div className="space-y-1">
              <p className="text-xs text-gray-400">
                Uploading{uploadPct !== null ? ` ${uploadPct}%` : '…'} — uploading directly to storage, bypassing Vercel
              </p>
              {uploadPct !== null && (
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadPct}%` }} />
                </div>
              )}
            </div>
          )}

          {/* Generate form */}
          {showForm && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-medium text-white">New background — {FORMAT_LABELS[format] ?? format}</h3>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Prompt hint <span className="text-gray-600">(optional)</span></label>
                <input value={promptHint} onChange={e => setPromptHint(e.target.value)}
                  placeholder="e.g. golden hour cityscape, luxury travel aesthetic"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
              </div>

              {builtPrompt && (
                <div className="bg-gray-950 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Full prompt sent to Flux</p>
                  <p className="text-xs text-gray-400 leading-relaxed">{builtPrompt}</p>
                </div>
              )}

              <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg px-3 py-2 text-xs text-blue-300">
                Background only. The no-text suffix is appended server-side and cannot be removed. Overlay your headline and CTA in Canva or Figma.
              </div>

              <p className="text-xs text-gray-600">~$0.003 per image · counts toward cap ({used}/{cap} used)</p>

              {genError && <p className="text-red-400 text-sm">{genError}</p>}

              <div className="flex gap-2">
                <button onClick={generate} disabled={generating}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
                  {generating ? 'Generating…' : 'Generate'}
                </button>
                <button onClick={() => { setShowForm(false); setGenError(null) }}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Media list */}
          {media.length > 0 && (() => {
            const otherItems = media.filter(m => m.status !== 'approved')

            const orderedApproved: MediaItem[] = [
              ...mediaOrder.map(id => approvedItems.find(m => m.id === id)).filter((m): m is MediaItem => Boolean(m)),
              ...approvedItems.filter(m => !mediaOrder.includes(m.id)),
            ]

            async function handleDragEnd(event: DragEndEvent) {
              const { active, over } = event
              if (!over || active.id === over.id) return
              const oldIdx = orderedApproved.findIndex(m => m.id === String(active.id))
              const newIdx = orderedApproved.findIndex(m => m.id === String(over.id))
              const newOrder = arrayMove(orderedApproved, oldIdx, newIdx).map(m => m.id)
              setMediaOrder(newOrder)
              await fetch(`/api/admin/orbit/campaigns/${campaignId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reorder', mediaOrder: newOrder }),
              })
            }

            return (
              <div className="space-y-4">
                {/* Approved — sortable */}
                {orderedApproved.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Approved · post order
                      <span className="ml-2 font-normal text-gray-600 normal-case tracking-normal">drag to reorder</span>
                    </p>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={orderedApproved.map(m => m.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {orderedApproved.map((item, idx) => (
                            <SortableMediaCard
                              key={item.id}
                              item={item}
                              position={idx + 1}
                              onReject={() => mediaAction(item.id, 'reject')}
                              onRemove={() => removeMedia(item.id)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                )}

                {/* Draft / rejected */}
                {otherItems.length > 0 && (
                  <div className="space-y-2">
                    {orderedApproved.length > 0 && (
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Pending review</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {otherItems.map(item => {
                        const isVideo = item.mediaType === 'video'
                        return (
                          <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                            {item.publicUrl ? (
                              <div className="bg-gray-950">
                                {isVideo ? (
                                  // eslint-disable-next-line jsx-a11y/media-has-caption
                                  <video
                                    src={item.publicUrl}
                                    controls
                                    className="w-full max-h-64 object-contain"
                                  />
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={item.publicUrl} alt={item.altText || 'Campaign image'} className="w-full max-h-64 object-contain" />
                                )}
                              </div>
                            ) : (
                              <div className="h-40 bg-gray-950 flex items-center justify-center text-gray-600 text-xs">Processing…</div>
                            )}
                            <div className="p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-gray-400">
                                    {isVideo && <span className="text-purple-400 mr-1">▶</span>}
                                    {FORMAT_LABELS[item.format] ?? item.format}
                                    {item.durationMs ? <span className="text-gray-600 ml-1">· {fmtDuration(item.durationMs)}</span> : ''}
                                  </p>
                                  <p className="text-xs text-gray-600 mt-0.5">
                                    {item.source === 'uploaded'
                                      ? (isVideo ? 'Uploaded video' : 'Real photo')
                                      : `Generated · $${Number(item.costUsd).toFixed(4)}`}
                                    {' · '}{new Date(item.createdAt).toLocaleDateString('en-GB')}
                                  </p>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_CHIP[item.status] ?? 'bg-gray-700 text-gray-300'}`}>
                                  {item.status}
                                </span>
                              </div>
                              {item.prompt && (
                                <details>
                                  <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400 list-none">Prompt ▸</summary>
                                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.prompt}</p>
                                </details>
                              )}
                              <div className="flex gap-2 flex-wrap pt-1">
                                {item.publicUrl && (
                                  <a href={item.publicUrl} download target="_blank" rel="noopener noreferrer"
                                    className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors">
                                    Download
                                  </a>
                                )}
                                {item.status === 'draft' && (
                                  <button onClick={() => mediaAction(item.id, 'approve')}
                                    className="text-xs bg-green-900 hover:bg-green-800 text-green-300 px-3 py-1.5 rounded transition-colors">
                                    Approve
                                  </button>
                                )}
                                {item.status !== 'rejected' && (
                                  <button onClick={() => mediaAction(item.id, 'reject')}
                                    className="text-xs bg-red-950 hover:bg-red-900 text-red-400 px-3 py-1.5 rounded transition-colors">
                                    Reject
                                  </button>
                                )}
                                <button onClick={() => removeMedia(item.id)}
                                  className="text-xs text-gray-600 hover:text-red-400 px-2 py-1.5 transition-colors">
                                  {item.source === 'uploaded' ? 'Detach' : 'Delete'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {media.length === 0 && !showForm && (
            <div className="bg-gray-900 border border-gray-800 border-dashed rounded-xl py-10 text-center space-y-1">
              <p className="text-gray-500 text-sm">No media yet for this campaign.</p>
              <p className="text-gray-600 text-xs">Generate a background, upload a photo, or upload a video.</p>
            </div>
          )}

          {!capReached && media.length > 0 && !showForm && (
            <div className="flex gap-2 flex-wrap items-center">
              <button onClick={() => setShowForm(true)}
                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                + Generate another
              </button>
              <label className="cursor-pointer">
                <span className="text-sm text-gray-500 hover:text-gray-300 transition-colors">/ Upload photo</span>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                  onChange={handleImageChange} disabled={uploading} />
              </label>
            </div>
          )}
        </>
      )}
    </div>
  )
}
