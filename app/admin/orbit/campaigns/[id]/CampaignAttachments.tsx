'use client'

/**
 * Campaign media attachments — "Choose from Media Library" is the primary
 * media action. Assets attach by REFERENCE (a specific version; files are
 * never copied), can be previewed, reordered and detached without deleting
 * anything from the library, and show readiness/approval, resolution and
 * duration. "Create new asset" round-trips through the standalone Studio.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface AttachedMedia {
  linkId: string; position: number; addedBy: string; publishable: boolean
  media: {
    id: string; title: string | null; mediaType: string; format: string
    publicUrl: string | null; readiness: string; width: number | null
    height: number | null; durationMs: number | null; sizeBytes: number | null
    version: number; status: string
  }
}
interface LibAsset {
  id: string; title: string | null; mediaType: string; format: string
  publicUrl: string | null; readiness: string; version: number
  width: number | null; height: number | null; durationMs: number | null
}

export function CampaignAttachments({ campaignId, brief }: { campaignId: string; brief: string }) {
  const [attachments, setAttachments] = useState<AttachedMedia[]>([])
  const [error,       setError]       = useState('')
  const [busy,        setBusy]        = useState(false)
  const [pickerOpen,  setPickerOpen]  = useState(false)
  const [libAssets,   setLibAssets]   = useState<LibAsset[]>([])
  const [libLoading,  setLibLoading]  = useState(false)
  const [picked,      setPicked]      = useState<Set<string>>(new Set())
  const [preview,     setPreview]     = useState<LibAsset | null>(null)

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/attachments`)
      const data = await res.json()
      if (res.ok) setAttachments(data.attachments ?? [])
    } catch { /* non-fatal */ }
  }, [campaignId])
  useEffect(() => { void load() }, [load])

  async function openPicker() {
    setPickerOpen(true); setPicked(new Set()); setLibLoading(true)
    try {
      const res  = await fetch('/api/admin/orbit/library?readiness=ready')
      const data = await res.json()
      setLibAssets(res.ok ? (data.assets ?? []) : [])
    } catch { setLibAssets([]) }
    finally { setLibLoading(false) }
  }

  async function attachPicked() {
    if (picked.size === 0) return
    setBusy(true); setError('')
    const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/attachments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaIds: [...picked] }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Attach failed'); return }
    if (data.failed?.length) setError(`Some could not attach: ${data.failed.map((f: { error: string }) => f.error).join('; ')}`)
    setPickerOpen(false)
    await load()
  }

  async function detach(mediaId: string) {
    setBusy(true); setError('')
    await fetch(`/api/admin/orbit/campaigns/${campaignId}/attachments`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaId }),
    }).catch(() => {})
    setBusy(false)
    await load()
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...attachments]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    setAttachments(next)
    await fetch(`/api/admin/orbit/campaigns/${campaignId}/attachments`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: next.map(a => a.media.id) }),
    }).catch(() => {})
    await load()
  }

  const dims = (m: { width: number | null; height: number | null; format: string }) =>
    m.width && m.height ? `${m.width}×${m.height}` : m.format
  const dur = (ms: number | null) => ms != null ? ` · ${(ms / 1000).toFixed(1)}s` : ''

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-white">Campaign Media (shared library)</h3>
        <div className="flex gap-2">
          <button onClick={() => void openPicker()}
            className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors">
            Choose from Media Library
          </button>
          <Link
            href={`/admin/orbit/studio?returnTo=${encodeURIComponent(`/admin/orbit/campaigns/${campaignId}`)}&brief=${encodeURIComponent(brief.slice(0, 400))}`}
            className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
            Create new asset
          </Link>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {attachments.length === 0 ? (
        <p className="text-xs text-gray-600">No library assets attached yet. Attachments reference a specific asset version — editing the library design later never changes what is attached here.</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((a, i) => (
            <div key={a.linkId} className="flex items-center gap-3 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
              <div className="flex flex-col">
                <button onClick={() => void move(i, -1)} disabled={i === 0 || busy} className="text-[10px] text-gray-500 hover:text-white disabled:opacity-30">▲</button>
                <button onClick={() => void move(i, 1)} disabled={i === attachments.length - 1 || busy} className="text-[10px] text-gray-500 hover:text-white disabled:opacity-30">▼</button>
              </div>
              {a.media.publicUrl && (
                a.media.mediaType === 'video'
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <video src={a.media.publicUrl} className="w-12 h-12 object-cover rounded" muted preload="metadata" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={a.media.publicUrl} alt="" className="w-12 h-12 object-cover rounded" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white truncate">{a.media.title ?? 'Untitled'} <span className="text-gray-500">v{a.media.version}</span></p>
                <p className="text-[10px] text-gray-500">
                  {a.media.mediaType} · {dims(a.media)}{dur(a.media.durationMs)}
                  {' · '}{a.media.readiness === 'ready' ? (a.media.status === 'approved' ? 'ready · approved' : 'ready') : a.media.readiness.replace('_', ' ')}
                </p>
              </div>
              {!a.publishable && (
                <span className="text-[10px] text-amber-400 shrink-0" title="Not publishable until it is READY in owned storage">not publishable</span>
              )}
              <button onClick={() => void detach(a.media.id)} disabled={busy}
                className="text-[10px] text-gray-500 hover:text-red-400 shrink-0" title="Removes from this campaign only — stays in the library">
                Detach
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Library picker */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPickerOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-gray-950 border border-gray-800 rounded-xl w-full max-w-3xl max-h-[80vh] overflow-y-auto p-5 space-y-3"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white">Media Library — ready assets</h4>
              <button onClick={() => setPickerOpen(false)} className="text-gray-500 hover:text-white text-sm">✕</button>
            </div>
            {libLoading ? (
              <p className="text-xs text-gray-500 py-8 text-center">Loading…</p>
            ) : libAssets.length === 0 ? (
              <p className="text-xs text-gray-500 py-8 text-center">No ready assets. Create one in the Studio first.</p>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {libAssets.map(a => {
                  const on = picked.has(a.id)
                  return (
                    <div key={a.id} className={`rounded-lg overflow-hidden border ${on ? 'border-indigo-500' : 'border-gray-800'}`}>
                      <button onClick={() => {
                        const next = new Set(picked); if (on) next.delete(a.id); else next.add(a.id); setPicked(next)
                      }} className="block w-full">
                        {a.publicUrl && (a.mediaType === 'video'
                          ? <video src={a.publicUrl} className="w-full h-24 object-cover" muted preload="metadata" />
                          // eslint-disable-next-line @next/next/no-img-element
                          : <img src={a.publicUrl} alt="" className="w-full h-24 object-cover" loading="lazy" />)}
                        <p className="text-[10px] text-gray-300 px-1.5 py-1 truncate text-left">
                          {on ? '✓ ' : ''}{a.title ?? 'Untitled'} · {a.format} v{a.version}
                        </p>
                      </button>
                      <button onClick={() => setPreview(a)} className="w-full text-[10px] text-gray-500 hover:text-indigo-300 pb-1">Preview</button>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
              <span className="text-xs text-gray-500 mr-auto self-center">{picked.size} selected</span>
              <button onClick={() => setPickerOpen(false)} className="text-xs text-gray-400 hover:text-white px-3 py-1.5">Cancel</button>
              <button onClick={() => void attachPicked()} disabled={busy || picked.size === 0}
                className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-1.5 rounded-lg disabled:opacity-50">
                Attach {picked.size > 0 ? `(${picked.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview overlay */}
      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-8 bg-black/80" onClick={() => setPreview(null)}>
          {preview.mediaType === 'video'
            ? <video src={preview.publicUrl ?? undefined} className="max-h-full max-w-full" controls autoPlay muted />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={preview.publicUrl ?? ''} alt="" className="max-h-full max-w-full object-contain" />}
        </div>
      )}
    </div>
  )
}
