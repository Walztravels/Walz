'use client'

import { useEffect, useState } from 'react'
import { CANVA_FORMATS, type CanvaFormat } from '@/lib/orbit/canva-adapter'

interface CampaignImage {
  id: string
  format: string
  status: string
  canvaDesignId: string | null
  exportUrl: string | null
  thumbnailUrl: string | null
  altText: string
  textLayers: Record<string, string>
  version: number
  approvedBy: string | null
  approvedAt: string | null
  createdAt: string
}

interface CampaignContext {
  destination: string
  objective: string
  cta: string
  promotionDetails: string
}

const FORMAT_LABELS: Record<string, string> = {
  square_1024:     'Square (1024×1024)',
  feed_1080x1350:  'Portrait Feed (1080×1350)',
  story_1080x1920: 'Story / WhatsApp Status (1080×1920)',
  ad_1200x628:     'Landscape Ad (1200×628)',
}

const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-700 text-gray-300',
  approved: 'bg-green-900 text-green-300',
  rejected: 'bg-red-900 text-red-300',
}

export function ImagesSection({ campaignId, campaignContext }: {
  campaignId: string
  campaignContext: CampaignContext
}) {
  const [images, setImages] = useState<CampaignImage[]>([])
  const [canvaConfigured, setCanvaConfigured] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    format: 'story_1080x1920' as CanvaFormat,
    headline: campaignContext.destination ? `Fly to ${campaignContext.destination}` : '',
    subheadline: campaignContext.promotionDetails.slice(0, 60),
    cta: campaignContext.cta || 'Book Now',
    destination: campaignContext.destination,
    offer: '',
    altText: '',
  })

  async function fetchImages() {
    try {
      const res = await fetch(`/api/admin/orbit/campaigns/${campaignId}/images`)
      const data = await res.json()
      if (data.images) setImages(data.images)
      if (typeof data.canvaConfigured === 'boolean') setCanvaConfigured(data.canvaConfigured)
    } catch { /* non-fatal */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchImages() }, [campaignId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setGenerating(true); setGenError(null)
    try {
      const res = await fetch(`/api/admin/orbit/campaigns/${campaignId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: form.format,
          altText: form.altText,
          textLayers: {
            headline: form.headline,
            subheadline: form.subheadline,
            cta: form.cta,
            destination: form.destination,
            offer: form.offer,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setShowForm(false)
      await fetchImages()
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  async function imageAction(imageId: string, action: string) {
    await fetch(`/api/admin/orbit/campaigns/${campaignId}/images/${imageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    await fetchImages()
  }

  async function deleteImage(imageId: string) {
    await fetch(`/api/admin/orbit/campaigns/${campaignId}/images/${imageId}`, { method: 'DELETE' })
    await fetchImages()
  }

  return (
    <div className="space-y-4 pt-4 border-t border-gray-800 mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">Campaign Images</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Brand colours: Navy <span className="text-blue-300">#0B1F3A</span> · Gold <span className="text-yellow-300">#C9A84C</span> · Cream <span className="text-amber-100">#F5F0E8</span>
          </p>
        </div>
        {canvaConfigured && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Generate Image
          </button>
        )}
      </div>

      {/* Canva not configured state */}
      {canvaConfigured === false && (
        <div className="bg-gray-900 border border-amber-800/50 rounded-xl p-5 space-y-2">
          <p className="text-amber-400 text-sm font-medium">Canva not connected</p>
          <p className="text-gray-400 text-xs">Add these environment variables to enable image generation from your brand template:</p>
          <div className="font-mono text-xs text-gray-300 bg-gray-950 rounded px-4 py-3 space-y-1">
            <p>CANVA_CLIENT_ID=<span className="text-gray-500">from Canva Developer Portal</span></p>
            <p>CANVA_CLIENT_SECRET=<span className="text-gray-500">from Canva Developer Portal</span></p>
            <p>CANVA_BRAND_TEMPLATE_ID=<span className="text-gray-500">ID of your brand template</span></p>
          </div>
          <p className="text-gray-500 text-xs">Your brand template must have text layers named: <code className="text-gray-400">headline</code>, <code className="text-gray-400">subheadline</code>, <code className="text-gray-400">cta</code>, <code className="text-gray-400">destination</code>, <code className="text-gray-400">offer</code></p>
        </div>
      )}

      {/* Format reference */}
      {canvaConfigured && !showForm && images.length === 0 && !loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-3">Available formats</p>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(CANVA_FORMATS).map(([key, fmt]) => (
              <div key={key} className="border border-gray-800 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-200">{fmt.label}</p>
                <p className="text-xs text-gray-500">{fmt.w}×{fmt.h}</p>
                <p className="text-xs text-gray-600 mt-0.5">{fmt.desc}</p>
              </div>
            ))}
          </div>
          <button onClick={() => setShowForm(true)}
            className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Generate first image
          </button>
        </div>
      )}

      {/* Generation form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h3 className="font-medium text-white text-sm">New Image</h3>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Format</label>
            <select value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value as CanvaFormat }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              {Object.entries(CANVA_FORMATS).map(([key, fmt]) => (
                <option key={key} value={key}>{fmt.label} — {fmt.desc}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Headline</label>
              <input value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
                placeholder="e.g. Fly to Dubai"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Destination</label>
              <input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
                placeholder="e.g. Dubai, UAE"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Subheadline</label>
              <input value={form.subheadline} onChange={e => setForm(f => ({ ...f, subheadline: e.target.value }))}
                placeholder="e.g. From £499 return"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Offer / Promotion</label>
              <input value={form.offer} onChange={e => setForm(f => ({ ...f, offer: e.target.value }))}
                placeholder="e.g. 15% off group bookings"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">CTA Button Text</label>
              <input value={form.cta} onChange={e => setForm(f => ({ ...f, cta: e.target.value }))}
                placeholder="e.g. Book Now"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Alt Text (accessibility)</label>
              <input value={form.altText} onChange={e => setForm(f => ({ ...f, altText: e.target.value }))}
                placeholder="e.g. WalzTravels Dubai flight deal"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2 text-xs text-amber-300">
            Images use your brand template colours. Do not request real-looking destination photography — use branded graphic assets only.
          </div>

          {genError && <p className="text-red-400 text-sm">{genError}</p>}

          <div className="flex gap-2">
            <button onClick={generate} disabled={generating}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              {generating ? 'Creating in Canva…' : 'Generate'}
            </button>
            <button onClick={() => { setShowForm(false); setGenError(null) }}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Image list */}
      {images.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {images.map(img => (
            <div key={img.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {/* Image preview */}
              {img.exportUrl ? (
                <div className="bg-gray-950 flex items-center justify-center" style={{ minHeight: 180 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.exportUrl}
                    alt={img.altText || 'Campaign image'}
                    className="max-w-full max-h-64 object-contain"
                  />
                </div>
              ) : (
                <div className="bg-gray-950 flex items-center justify-center h-40">
                  <p className="text-gray-600 text-xs">Processing…</p>
                </div>
              )}

              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">{FORMAT_LABELS[img.format] ?? img.format}</p>
                    <p className="text-xs text-gray-600 mt-0.5">v{img.version} · {new Date(img.createdAt).toLocaleDateString('en-GB')}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLORS[img.status] ?? 'bg-gray-700 text-gray-300'}`}>
                    {img.status}
                  </span>
                </div>

                {img.altText && (
                  <p className="text-xs text-gray-500 italic">Alt: {img.altText}</p>
                )}

                {img.approvedBy && (
                  <p className="text-xs text-gray-600">Approved by {img.approvedBy}</p>
                )}

                <div className="flex gap-2 flex-wrap">
                  {img.exportUrl && (
                    <a href={img.exportUrl} download target="_blank" rel="noopener noreferrer"
                      className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors">
                      Download
                    </a>
                  )}
                  {img.canvaDesignId && (
                    <a href={`https://www.canva.com/design/${img.canvaDesignId}/edit`} target="_blank" rel="noopener noreferrer"
                      className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors">
                      Edit in Canva
                    </a>
                  )}
                  {img.status === 'draft' && (
                    <button onClick={() => imageAction(img.id, 'approve')}
                      className="text-xs bg-green-900 hover:bg-green-800 text-green-300 px-3 py-1.5 rounded transition-colors">
                      Approve
                    </button>
                  )}
                  {img.status !== 'rejected' && (
                    <button onClick={() => imageAction(img.id, 'reject')}
                      className="text-xs bg-red-950 hover:bg-red-900 text-red-400 px-3 py-1.5 rounded transition-colors">
                      Reject
                    </button>
                  )}
                  <button onClick={() => deleteImage(img.id)}
                    className="text-xs text-gray-600 hover:text-red-400 px-2 py-1.5 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add another image button */}
      {canvaConfigured && images.length > 0 && !showForm && (
        <button onClick={() => setShowForm(true)}
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
          + Generate another format
        </button>
      )}
    </div>
  )
}
