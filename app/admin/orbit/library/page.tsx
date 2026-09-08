'use client'

/**
 * Orbit Media Library — the shared home of every creative asset.
 * Grid/list views, search, filters, previews/playback, asset details,
 * rename/tag, download, open-project-in-Studio, versioning, usage,
 * retry-save recovery and safe archiving.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface LibAsset {
  id: string; title: string | null; mediaType: string; format: string
  publicUrl: string | null; readiness: string; saveError: string | null
  provider: string | null; model: string | null
  width: number | null; height: number | null; durationMs: number | null
  sizeBytes: number | null; mimeType: string | null
  tags: string[]; version: number; assetGroupId: string | null
  designProjectId: string | null; createdBy: string | null; createdAt: string
  campaignId: string | null; status: string; generationStatus: string | null
  _count: { campaignLinks: number }
}

interface Usage { id: string; objective: string; status: string }
interface Version { id: string; version: number; readiness: string; publicUrl: string | null; createdAt: string; createdBy: string | null }

const READINESS_STYLE: Record<string, string> = {
  ready:          'bg-green-900/60 text-green-300',
  draft:          'bg-gray-800 text-gray-400',
  saving:         'bg-blue-900/60 text-blue-300',
  save_failed:    'bg-red-900/60 text-red-300',
  missing_source: 'bg-amber-900/60 text-amber-300',
  archived:       'bg-gray-800 text-gray-500',
}

export default function MediaLibraryPage() {
  const [assets,   setAssets]   = useState<LibAsset[]>([])
  const [creators, setCreators] = useState<string[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [view,     setView]     = useState<'grid' | 'list'>('grid')
  const [q,        setQ]        = useState('')
  const [fType,    setFType]    = useState('')
  const [fKind,    setFKind]    = useState('')
  const [fReady,   setFReady]   = useState('')
  const [fFormat,  setFFormat]  = useState('')
  const [fCreator, setFCreator] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  // Detail drawer
  const [selected, setSelected] = useState<LibAsset | null>(null)
  const [usage,    setUsage]    = useState<Usage[]>([])
  const [versions, setVersions] = useState<Version[]>([])
  const [fileCheck, setFileCheck] = useState<{ reachable: boolean; note: string } | null>(null)
  const [busy,     setBusy]     = useState(false)
  const [notice,   setNotice]   = useState('')
  const [renaming, setRenaming] = useState('')
  const [tagsDraft, setTagsDraft] = useState('')
  // Use-in-campaign
  const [campaigns, setCampaigns] = useState<Array<{ id: string; objective: string; status: string }>>([])
  const [attachTarget, setAttachTarget] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const sp = new URLSearchParams()
      if (q)        sp.set('q', q)
      if (fType)    sp.set('mediaType', fType)
      if (fKind)    sp.set('kind', fKind)
      if (fReady)   sp.set('readiness', fReady)
      if (fFormat)  sp.set('format', fFormat)
      if (fCreator) sp.set('creator', fCreator)
      if (showArchived) sp.set('includeArchived', '1')
      const res  = await fetch(`/api/admin/orbit/library?${sp}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setAssets(data.assets ?? [])
      setCreators(data.creators ?? [])
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }, [q, fType, fKind, fReady, fFormat, fCreator, showArchived])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    fetch('/api/admin/orbit/campaigns').then(r => r.json())
      .then(d => setCampaigns((d.campaigns ?? []).map((c: { id: string; objective: string; status: string }) =>
        ({ id: c.id, objective: c.objective, status: c.status }))))
      .catch(() => {})
  }, [])

  async function openDetail(asset: LibAsset) {
    setSelected(asset); setUsage([]); setVersions([]); setNotice(''); setFileCheck(null)
    setRenaming(asset.title ?? ''); setTagsDraft((asset.tags ?? []).join(', '))
    try {
      const res  = await fetch(`/api/admin/orbit/library/${asset.id}`)
      const data = await res.json()
      if (res.ok) { setUsage(data.usage ?? []); setVersions(data.versions ?? []); setFileCheck(data.fileCheck ?? null) }
    } catch { /* detail extras are non-fatal */ }
  }

  async function saveMeta() {
    if (!selected) return
    setBusy(true); setNotice('')
    const res  = await fetch(`/api/admin/orbit/library/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: renaming, tags: tagsDraft.split(',').map(t => t.trim()).filter(Boolean) }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setNotice(data.error ?? 'Update failed'); return }
    setNotice('Saved ✓'); await load()
  }

  async function action(act: string) {
    if (!selected) return
    if (act === 'archive' && !confirm('Archive this asset? It stays stored and can be restored, but disappears from pickers.')) return
    setBusy(true); setNotice('')
    const res  = await fetch(`/api/admin/orbit/library/${selected.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: act }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setNotice(data.error ?? 'Action failed'); return }
    setNotice(act === 'new_version' ? `Version ${data.version} created` : 'Done ✓')
    await load()
  }

  async function retrySaveAsset() {
    if (!selected) return
    setBusy(true); setNotice('Retrying save (no regeneration)…')
    const res  = await fetch(`/api/admin/orbit/media/${selected.id}/retry-save`, { method: 'POST' })
    const data = await res.json()
    setBusy(false)
    setNotice(res.ok ? 'Saved to Walz storage ✓' : (data.error ?? 'Retry failed'))
    await load()
  }

  async function useInCampaign() {
    if (!selected || !attachTarget) return
    setBusy(true); setNotice('')
    const res  = await fetch(`/api/admin/orbit/campaigns/${attachTarget}/attachments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaIds: [selected.id] }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setNotice(data.error ?? 'Attach failed'); return }
    if (data.failed?.length) { setNotice(`Could not attach: ${data.failed[0].error}`); return }
    setNotice('Attached to campaign ✓ (referenced — file not copied)')
  }

  const fmtSize = (b: number | null) => b == null ? '—' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`
  const fmtDur  = (ms: number | null) => ms == null ? null : `${(ms / 1000).toFixed(1)}s`

  function Preview({ a, className }: { a: LibAsset; className: string }) {
    if (!a.publicUrl) return <div className={`${className} bg-gray-800 flex items-center justify-center text-xs text-gray-600`}>no file</div>
    if (a.mediaType === 'video') return <video src={a.publicUrl} className={className} controls muted preload="metadata" />
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.publicUrl} alt={a.title ?? ''} className={className} loading="lazy" />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Media Library</h1>
          <p className="text-xs text-gray-500 mt-0.5">Every creative asset — generated, uploaded and exported — in one shared, versioned library.</p>
        </div>
        <Link href="/admin/orbit/studio" className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors">
          + Create in Studio
        </Link>
      </div>

      {/* Search + filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title or tag…"
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-56" />
        <select value={fType} onChange={e => setFType(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white">
          <option value="">All types</option><option value="image">Images</option><option value="video">Videos</option>
        </select>
        <select value={fKind} onChange={e => setFKind(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white">
          <option value="">All kinds</option><option value="generated">Generated</option>
          <option value="export">Design exports</option><option value="uploaded">Uploaded</option>
        </select>
        <select value={fReady} onChange={e => setFReady(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white">
          <option value="">All states</option><option value="ready">Ready</option><option value="draft">Draft</option>
          <option value="save_failed">Save failed</option><option value="missing_source">Missing source</option>
        </select>
        <select value={fFormat} onChange={e => setFFormat(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white">
          <option value="">All aspects</option>
          {['1080x1350', '1080x1920', '1080x1080', '1024x1024', '1200x628', 'reel', 'story', 'feed_video'].map(f =>
            <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={fCreator} onChange={e => setFCreator(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white">
          <option value="">All creators</option>
          {creators.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="text-xs text-gray-500 flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Archived
        </label>
        <div className="ml-auto flex gap-1">
          {(['grid', 'list'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-2.5 py-1 rounded text-xs ${view === v ? 'bg-indigo-700 text-white' : 'bg-gray-800 text-gray-400'}`}>
              {v === 'grid' ? '▦ Grid' : '☰ List'}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-gray-500 text-sm">Loading library…</p>
      ) : assets.length === 0 ? (
        <p className="py-16 text-center text-gray-500 text-sm">No assets match. Create something in the Studio.</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {assets.map(a => (
            <button key={a.id} onClick={() => void openDetail(a)}
              className="bg-gray-900 border border-gray-800 hover:border-indigo-700 rounded-xl overflow-hidden text-left transition-colors">
              <Preview a={a} className="w-full h-36 object-cover" />
              <div className="p-2">
                <p className="text-xs text-white truncate">{a.title ?? 'Untitled'}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${READINESS_STYLE[a.readiness] ?? READINESS_STYLE.draft}`}>{a.readiness.replace('_', ' ')}</span>
                  <span className="text-[10px] text-gray-500">{a.mediaType} · {a.format} · v{a.version}</span>
                  {a.designProjectId && <span className="text-[10px] text-indigo-400">design</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {assets.map(a => (
            <button key={a.id} onClick={() => void openDetail(a)}
              className="w-full flex items-center gap-3 bg-gray-900 border border-gray-800 hover:border-indigo-700 rounded-lg px-3 py-2 text-left transition-colors">
              <Preview a={a} className="w-14 h-14 object-cover rounded" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white truncate">{a.title ?? 'Untitled'}</p>
                <p className="text-[10px] text-gray-500">
                  {a.mediaType} · {a.format} · v{a.version} · {fmtSize(a.sizeBytes)} · {a.createdBy ?? '—'}
                  {a._count.campaignLinks > 0 && ` · used in ${a._count.campaignLinks} campaign(s)`}
                </p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${READINESS_STYLE[a.readiness] ?? READINESS_STYLE.draft}`}>{a.readiness.replace('_', ' ')}</span>
            </button>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelected(null)}>
          <div className="flex-1 bg-black/60" />
          <div className="w-full max-w-md bg-gray-950 border-l border-gray-800 p-5 overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-white truncate">{selected.title ?? 'Untitled'}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white text-sm">✕</button>
            </div>
            <Preview a={selected} className="w-full max-h-72 object-contain rounded-lg bg-gray-900" />

            {fileCheck && (
              <p className={`text-[11px] px-3 py-1.5 rounded-lg border ${fileCheck.reachable
                ? 'text-green-300 bg-green-950/40 border-green-900'
                : 'text-red-300 bg-red-950/40 border-red-900'}`}>
                Storage check: {fileCheck.note}
              </p>
            )}
            {notice && <p className="text-xs text-indigo-300 bg-indigo-950/40 border border-indigo-900 rounded-lg px-3 py-2">{notice}</p>}
            {selected.saveError && (
              <p className="text-xs text-red-300 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">{selected.saveError}</p>
            )}

            <div className="text-[11px] text-gray-400 grid grid-cols-2 gap-y-1">
              <span>State</span><span className="text-gray-200">{selected.readiness.replace('_', ' ')} {selected.status === 'approved' ? '· approved' : ''}</span>
              <span>Type</span><span className="text-gray-200">{selected.mediaType} ({selected.mimeType ?? '—'})</span>
              <span>Dimensions</span><span className="text-gray-200">{selected.width && selected.height ? `${selected.width}×${selected.height}` : selected.format}</span>
              {selected.durationMs != null && (<><span>Duration</span><span className="text-gray-200">{fmtDur(selected.durationMs)}</span></>)}
              <span>Size</span><span className="text-gray-200">{fmtSize(selected.sizeBytes)}</span>
              <span>Version</span><span className="text-gray-200">v{selected.version}</span>
              {selected.provider && (<><span>Provider</span><span className="text-gray-200">{selected.provider}{selected.model ? ` · ${selected.model}` : ''}</span></>)}
              <span>Creator</span><span className="text-gray-200">{selected.createdBy ?? '—'}</span>
              <span>Created</span><span className="text-gray-200">{new Date(selected.createdAt).toLocaleString('en-GB')}</span>
            </div>

            {/* Rename + tags */}
            <div className="space-y-2">
              <input value={renaming} onChange={e => setRenaming(e.target.value)} placeholder="Title"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white" />
              <input value={tagsDraft} onChange={e => setTagsDraft(e.target.value)} placeholder="Tags, comma separated"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white" />
              <button onClick={() => void saveMeta()} disabled={busy}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg disabled:opacity-50">Save details</button>
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              {selected.publicUrl && (
                <a href={selected.publicUrl} download target="_blank" rel="noreferrer"
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg">Download</a>
              )}
              {selected.designProjectId && (
                <Link href={`/admin/orbit/studio?project=${selected.designProjectId}`}
                  className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg">Open project in Studio</Link>
              )}
              <button onClick={() => void action('new_version')} disabled={busy}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg disabled:opacity-50">New version</button>
              {(selected.readiness === 'save_failed' || selected.readiness === 'missing_source') && (
                <button onClick={() => void retrySaveAsset()} disabled={busy}
                  className="text-xs bg-amber-800 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">Retry save</button>
              )}
              {selected.readiness !== 'archived' ? (
                <button onClick={() => void action('archive')} disabled={busy}
                  className="text-xs bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300 px-3 py-1.5 rounded-lg disabled:opacity-50">Archive</button>
              ) : (
                <button onClick={() => void action('unarchive')} disabled={busy}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg disabled:opacity-50">Restore</button>
              )}
            </div>

            {/* Use in campaign */}
            <div className="border-t border-gray-800 pt-3 space-y-2">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Use in campaign</p>
              <div className="flex gap-2">
                <select value={attachTarget} onChange={e => setAttachTarget(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white">
                  <option value="">Choose campaign…</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.objective} ({c.status})</option>)}
                </select>
                <button onClick={() => void useInCampaign()} disabled={busy || !attachTarget}
                  className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">Attach</button>
              </div>
            </div>

            {/* Usage */}
            <div className="border-t border-gray-800 pt-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1.5">Used by</p>
              {usage.length === 0 ? <p className="text-xs text-gray-600">No campaigns use this asset.</p> : (
                <ul className="space-y-1">
                  {usage.map(u => (
                    <li key={u.id} className="text-xs text-gray-300">
                      <Link href={`/admin/orbit/campaigns/${u.id}`} className="hover:text-indigo-400">{u.objective}</Link>
                      <span className="text-gray-600"> · {u.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Versions */}
            {versions.length > 1 && (
              <div className="border-t border-gray-800 pt-3">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1.5">Versions</p>
                <ul className="space-y-1">
                  {versions.map(v => (
                    <li key={v.id} className="text-xs text-gray-400">
                      v{v.version} · {v.readiness.replace('_', ' ')} · {new Date(v.createdAt).toLocaleDateString('en-GB')} · {v.createdBy ?? '—'}
                      {v.id === selected.id && <span className="text-indigo-400"> (viewing)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
