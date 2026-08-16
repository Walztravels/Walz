'use client'

import { useEffect, useRef, useState } from 'react'
import { FLUX_FORMATS, type FluxFormat } from '@/lib/orbit/replicate-adapter'

interface MediaItem {
  id: string
  source: string
  publicUrl: string | null
  format: string
  destination: string | null
  prompt: string | null
  altText: string
  costUsd: string
  status: string
  approvedBy: string | null
  createdAt: string
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
}

export function ImagesSection({ campaignId, campaignContext }: Props) {
  const [media, setMedia]               = useState<MediaItem[]>([])
  const [library, setLibrary]           = useState<MediaItem[]>([])
  const [cap, setCap]                   = useState(8)
  const [used, setUsed]                 = useState(0)
  const [imageCostUsd, setImageCostUsd] = useState('0')
  const [configured, setConfigured]     = useState<boolean | null>(null)
  const [loading, setLoading]           = useState(true)

  const [format, setFormat]       = useState<FluxFormat>('1080x1920')
  const [promptHint, setPromptHint] = useState(campaignContext.promotionDetails.slice(0, 120))
  const [builtPrompt, setBuiltPrompt] = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError]   = useState<string | null>(null)
  const [capError, setCapError]   = useState<string | null>(null)

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function load(fmt?: string) {
    try {
      const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/images${fmt ? `?format=${fmt}` : ''}`)
      const data = await res.json()
      if (data.media)          setMedia(data.media)
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

  // Refresh library matches when format changes
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

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('format', format)
      fd.append('destination', campaignContext.destination)
      fd.append('campaignId', campaignId)
      const res  = await fetch('/api/admin/orbit/media', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      await load(format)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) return null

  const capReached = used >= cap

  return (
    <div className="space-y-5 pt-4 border-t border-gray-800 mt-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">Campaign Images</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Background visuals only — text overlaid separately. Powered by Flux Schnell via Replicate.
          </p>
        </div>
        <div className="text-right text-xs text-gray-500 space-y-0.5 flex-shrink-0">
          <p><span className={capReached ? 'text-red-400' : 'text-gray-400'}>{used}/{cap}</span> images</p>
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

      {configured && (
        <>
          {/* Format + controls */}
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

          {/* Generate form */}
          {!showForm ? (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setShowForm(true)} disabled={capReached}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                {capReached ? `Cap reached (${cap})` : 'Generate background'}
              </button>
              <label className={`cursor-pointer ${capReached ? 'opacity-40 pointer-events-none' : ''}`}>
                <span className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors inline-block">
                  {uploading ? 'Uploading…' : 'Upload real photo'}
                </span>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={uploadPhoto} disabled={uploading || capReached} />
              </label>
              {uploadError && <p className="text-red-400 text-xs self-center">{uploadError}</p>}
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-medium text-white">New background — {FORMAT_LABELS[format] ?? format}</h3>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Prompt hint <span className="text-gray-600">(optional — describe what you want in the scene)</span></label>
                <input value={promptHint} onChange={e => setPromptHint(e.target.value)}
                  placeholder={`e.g. golden hour cityscape, luxury travel aesthetic`}
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

          {/* Campaign images gallery */}
          {media.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {media.map(item => (
                <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  {item.publicUrl ? (
                    <div className="bg-gray-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.publicUrl} alt={item.altText || 'Campaign image'} className="w-full max-h-64 object-contain" />
                    </div>
                  ) : (
                    <div className="h-40 bg-gray-950 flex items-center justify-center text-gray-600 text-xs">Processing…</div>
                  )}

                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400">{FORMAT_LABELS[item.format] ?? item.format}</p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {item.source === 'uploaded' ? 'Real photo' : `Generated · $${Number(item.costUsd).toFixed(4)}`}
                          {' · '}{new Date(item.createdAt).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_CHIP[item.status] ?? 'bg-gray-700 text-gray-300'}`}>
                        {item.status}
                      </span>
                    </div>

                    {item.altText && (
                      <p className="text-xs text-gray-500 italic truncate" title={item.altText}>Alt: {item.altText}</p>
                    )}

                    {item.prompt && (
                      <details className="group">
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
              ))}
            </div>
          )}

          {media.length === 0 && !showForm && (
            <div className="bg-gray-900 border border-gray-800 border-dashed rounded-xl py-10 text-center space-y-1">
              <p className="text-gray-500 text-sm">No images yet for this campaign.</p>
              <p className="text-gray-600 text-xs">Generate a background or upload a real photo.</p>
            </div>
          )}

          {!capReached && media.length > 0 && !showForm && (
            <div className="flex gap-2">
              <button onClick={() => setShowForm(true)}
                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                + Generate another
              </button>
              <label className="cursor-pointer">
                <span className="text-sm text-gray-500 hover:text-gray-300 transition-colors">/ Upload real photo</span>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={uploadPhoto} disabled={uploading} />
              </label>
            </div>
          )}
        </>
      )}
    </div>
  )
}
