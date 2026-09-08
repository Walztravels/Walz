'use client'

/**
 * Orbit Creative OS — staff studios.
 *
 * Tabs: Creative Director · Image · Video · Motion · Audio · Lip Sync ·
 * Clipping · Enhance · Workflow · Jobs.
 * Staff pick a cost lane / router mode — never raw model IDs. Everything
 * executes server-side through the capability router with RBAC + audit.
 */

import { useState, useEffect, useCallback } from 'react'
import type { CapabilityKind } from '@/lib/orbit/creative-os/types'

type Lane = 'AUTO' | 'LOCAL' | 'STANDARD' | 'PREMIUM'
const LANES: Lane[] = ['AUTO', 'LOCAL', 'STANDARD', 'PREMIUM']
const MODES = ['AUTO', 'BEST_VALUE', 'BEST_QUALITY', 'BEST_TYPOGRAPHY', 'CINEMATIC', 'FAST', 'LOCAL_ONLY']

const TABS = [
  'Director', 'Image', 'Video', 'Motion', 'Audio', 'Lip Sync', 'Clipping', 'Enhance', 'Workflow', 'Jobs',
] as const
type Tab = typeof TABS[number]

interface Job {
  id: string; capability: string; provider: string; modelKey: string
  lane: string; status: string; outputUrl: string | null; error: string | null
  createdAt: string; retryCount: number
}

const card  = 'bg-[#112240] ring-1 ring-white/5 rounded-2xl p-5'
const inp   = 'w-full bg-[#0a1929] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-[#C9A84C]/60'
const btn   = 'px-4 py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold hover:bg-[#e0b85c] disabled:opacity-40'
const label = 'text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1.5'

function LaneModePicker({ lane, setLane, mode, setMode }: {
  lane: Lane; setLane: (l: Lane) => void; mode: string; setMode: (m: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <span className={label}>Cost lane</span>
        <select value={lane} onChange={e => setLane(e.target.value as Lane)} className={inp}>
          {LANES.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div>
        <span className={label}>Mode</span>
        <select value={mode} onChange={e => setMode(e.target.value)} className={inp}>
          {MODES.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
    </div>
  )
}

function StudioForm({ capability, fields, format }: {
  capability: CapabilityKind
  fields: Array<'prompt' | 'imageUrl' | 'videoUrl' | 'audioUrl' | 'durationSec'>
  format?: string
}) {
  const [lane, setLane] = useState<Lane>('AUTO')
  const [mode, setMode] = useState('AUTO')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ label: string; cost: number | null } | null>(null)
  const [routeBlock, setRouteBlock] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/orbit/creative-os', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capability, lane: lane === 'AUTO' ? undefined : lane, mode }),
    }).then(r => r.json()).then(d => {
      setPreview(d.ok ? { label: d.choice.label, cost: d.choice.costUsd } : null)
      // LOCAL_ONLY with local unavailable → actionable block, Generate disabled
      setRouteBlock(d.ok ? null : (d.error ?? 'No provider available for this mode.'))
    }).catch(() => { setPreview(null); setRouteBlock(null) })
  }, [capability, lane, mode])

  async function submit() {
    setBusy(true); setResult(null)
    try {
      const res = await fetch('/api/admin/orbit/creative-os/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capability,
          lane: lane === 'AUTO' ? undefined : lane,
          mode,
          format,
          prompt: vals.prompt, imageUrl: vals.imageUrl, videoUrl: vals.videoUrl,
          audioUrl: vals.audioUrl, durationSec: vals.durationSec ? Number(vals.durationSec) : undefined,
        }),
      })
      const d = await res.json()
      setResult(d.ok
        ? (d.outputUrl ? `✓ Done — ${d.outputUrl}` : `✓ Job submitted (${d.jobId ?? 'async'}) — track in Jobs tab`)
        : `✕ ${d.error}`)
    } catch { setResult('✕ Network error') } finally { setBusy(false) }
  }

  return (
    <div className={`${card} space-y-4`}>
      <LaneModePicker lane={lane} setLane={setLane} mode={mode} setMode={setMode} />
      {preview && (
        <p className="text-[11px] text-white/40">
          Will use: <span className="text-[#C9A84C] font-semibold">{preview.label}</span>
          {preview.cost != null && <span> · ~${preview.cost}</span>}
        </p>
      )}
      {fields.includes('prompt') && (
        <div><span className={label}>Prompt (visual direction — no prices/routes/contacts)</span>
          <textarea rows={3} className={inp} value={vals.prompt ?? ''} onChange={e => setVals(v => ({ ...v, prompt: e.target.value }))} /></div>
      )}
      {fields.includes('imageUrl') && (
        <div><span className={label}>Image URL</span>
          <input className={inp} value={vals.imageUrl ?? ''} onChange={e => setVals(v => ({ ...v, imageUrl: e.target.value }))} placeholder="https://…" /></div>
      )}
      {fields.includes('videoUrl') && (
        <div><span className={label}>Video URL</span>
          <input className={inp} value={vals.videoUrl ?? ''} onChange={e => setVals(v => ({ ...v, videoUrl: e.target.value }))} placeholder="https://…" /></div>
      )}
      {fields.includes('audioUrl') && (
        <div><span className={label}>Audio URL</span>
          <input className={inp} value={vals.audioUrl ?? ''} onChange={e => setVals(v => ({ ...v, audioUrl: e.target.value }))} placeholder="https://…" /></div>
      )}
      {fields.includes('durationSec') && (
        <div><span className={label}>Duration (seconds)</span>
          <input className={inp} value={vals.durationSec ?? ''} onChange={e => setVals(v => ({ ...v, durationSec: e.target.value }))} placeholder="5" /></div>
      )}
      {routeBlock && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2">{routeBlock}</p>
      )}
      <button onClick={() => void submit()} disabled={busy || !!routeBlock} className={btn}>{busy ? 'Submitting…' : 'Generate'}</button>
      {result && <p className={`text-xs ${result.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'} break-all`}>{result}</p>}
    </div>
  )
}

export default function CreativeOSPage() {
  const [tab, setTab] = useState<Tab>('Director')
  const [status, setStatus] = useState<{
    providers?: {
      local: { configured: boolean; status: string }
      note:  string | null
    }
  } | null>(null)

  // Director state
  const [brief, setBrief] = useState('')
  const [facts, setFacts] = useState<Record<string, string>>({ headline: '', price: '', route: '', cta: '' })
  const [plan, setPlan]   = useState<Record<string, unknown> | null>(null)
  const [kitResult, setKitResult] = useState<string | null>(null)
  const [dirBusy, setDirBusy] = useState(false)

  // Jobs
  const [jobs, setJobs] = useState<Job[]>([])
  const loadJobs = useCallback(() => {
    fetch('/api/admin/orbit/creative-os/generate').then(r => r.json()).then(d => setJobs(d.jobs ?? [])).catch(() => {})
  }, [])
  useEffect(() => { if (tab === 'Jobs') loadJobs() }, [tab, loadJobs])
  useEffect(() => {
    fetch('/api/admin/orbit/creative-os').then(r => r.json()).then(setStatus).catch(() => {})
  }, [])

  async function makePlan() {
    setDirBusy(true); setPlan(null); setKitResult(null)
    try {
      const res = await fetch('/api/admin/orbit/creative-os/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, commercialFacts: facts }),
      })
      const d = await res.json()
      setPlan(d.plan ?? null)
      if (d.error) setKitResult(`✕ ${d.error}`)
    } finally { setDirBusy(false) }
  }

  async function approveAndBuildKit() {
    if (!plan) return
    setDirBusy(true)
    try {
      const res = await fetch('/api/admin/orbit/creative-os/plan', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const d = await res.json()
      if (d.error) { setKitResult(`✕ ${d.error}`); return }
      const blocked = d.gate?.blocked
      setKitResult(`✓ Kit built: ${d.kit.statics.length} statics + ${d.kit.jobs.length} generation jobs · Quality gate: ${blocked ? 'BLOCKED — fix issues before publish' : 'clean'}`)
    } finally { setDirBusy(false) }
  }

  const deliverables = (plan?.deliverables ?? []) as Array<{ id: string; title: string; format: string; kind: string; lane: string; estCostUsd: number | null }>

  return (
    <div className="min-h-screen bg-[#0a1929] p-6 text-white">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-black">Orbit Creative OS</h1>
            <p className="text-xs text-white/40">Multimodal studios · cost-aware routing · deterministic commercial facts</p>
          </div>
          {status?.providers && (() => {
            const s = status.providers.local.status
            const label =
              s === 'healthy'               ? 'Ready' :
              s === 'missing_configuration' ? 'Not configured' :
              s === 'model_unavailable'     ? 'Capability unavailable' :
              s === 'timeout'               ? 'Starting' : 'Offline'
            const tone = s === 'healthy'
              ? 'border-emerald-400/40 text-emerald-300'
              : s === 'missing_configuration'
              ? 'border-white/15 text-white/40'
              : 'border-amber-400/40 text-amber-300'
            return (
              <div className="text-right">
                <span className={`text-[11px] px-2.5 py-1 rounded-full border ${tone}`}>Local AI: {label}</span>
                {status.providers.note && (
                  <p className="text-[10px] text-white/30 mt-1">{status.providers.note}</p>
                )}
              </div>
            )
          })()}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${tab === t ? 'bg-[#C9A84C] text-[#0B1F3A]' : 'bg-white/5 text-white/50 hover:text-white'}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Director' && (
          <div className="space-y-4">
            <div className={`${card} space-y-4`}>
              <div><span className={label}>Campaign brief</span>
                <textarea rows={3} className={inp} value={brief} onChange={e => setBrief(e.target.value)}
                  placeholder="December flights home campaign targeting the Nigerian diaspora in Canada…" /></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(['headline', 'price', 'route', 'cta'] as const).map(k => (
                  <div key={k}><span className={label}>{k} (staff fact)</span>
                    <input className={inp} value={facts[k]} onChange={e => setFacts(f => ({ ...f, [k]: e.target.value }))} /></div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => void makePlan()} disabled={dirBusy || !brief.trim()} className={btn}>
                  {dirBusy ? 'Working…' : 'Create Plan'}
                </button>
                {plan != null && (
                  <button onClick={() => void approveAndBuildKit()} disabled={dirBusy}
                    className="px-4 py-2.5 rounded-xl border border-emerald-400/40 text-emerald-300 text-sm font-bold hover:bg-emerald-500/10">
                    Approve Plan → Build Campaign Kit
                  </button>
                )}
              </div>
              {kitResult && <p className={`text-xs ${kitResult.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{kitResult}</p>}
            </div>
            {deliverables.length > 0 && (
              <div className={card}>
                <p className={label}>Plan deliverables (editable before approval)</p>
                <div className="space-y-2">
                  {deliverables.map(d => (
                    <div key={d.id} className="flex items-center justify-between text-sm bg-white/5 rounded-xl px-4 py-2.5">
                      <span className="text-white">{d.title}</span>
                      <span className="text-white/40 text-xs">{d.format} · {d.kind} · {d.lane}{d.estCostUsd != null ? ` · ~$${d.estCostUsd}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'Image'    && <StudioForm capability="text_to_image"    fields={['prompt', 'imageUrl']} format="1080x1350" />}
        {tab === 'Video'    && <StudioForm capability="image_to_video"  fields={['prompt', 'imageUrl', 'durationSec']} format="video_9x16" />}
        {tab === 'Motion'   && <StudioForm capability="motion"          fields={['prompt', 'imageUrl', 'durationSec']} format="video_9x16" />}
        {tab === 'Audio'    && <StudioForm capability="audio_voiceover" fields={['prompt']} />}
        {tab === 'Lip Sync' && <StudioForm capability="lip_sync_image"  fields={['imageUrl', 'audioUrl']} />}
        {tab === 'Clipping' && <StudioForm capability="clip"            fields={['videoUrl']} />}
        {tab === 'Enhance'  && (
          <div className="grid sm:grid-cols-3 gap-4">
            <div><p className={label}>Upscale</p><StudioForm capability="upscale" fields={['imageUrl']} /></div>
            <div><p className={label}>Remove Background</p><StudioForm capability="background_remove" fields={['imageUrl']} /></div>
            <div><p className={label}>Vectorize → SVG</p><StudioForm capability="vectorize" fields={['imageUrl']} /></div>
          </div>
        )}

        {tab === 'Workflow' && <WorkflowTab />}

        {tab === 'Jobs' && (
          <div className={card}>
            <div className="flex items-center justify-between mb-3">
              <p className={label}>Recent generation jobs</p>
              <button onClick={loadJobs} className="text-xs text-[#C9A84C] hover:underline">Refresh</button>
            </div>
            {jobs.length === 0 ? <p className="text-sm text-white/30">No jobs yet.</p> : (
              <div className="space-y-2">
                {jobs.map(j => (
                  <div key={j.id} className="flex items-center justify-between text-xs bg-white/5 rounded-xl px-4 py-2.5 gap-3">
                    <span className="text-white font-medium">{j.capability}</span>
                    <span className="text-white/40">{j.provider} · {j.lane}</span>
                    <span className={
                      j.status === 'completed' ? 'text-emerald-400' :
                      j.status === 'failed' ? 'text-red-400' : 'text-amber-400'}>{j.status}</span>
                    {j.outputUrl && <a href={j.outputUrl} target="_blank" rel="noreferrer" className="text-[#C9A84C] hover:underline">output</a>}
                    {j.status === 'failed' && j.retryCount < 2 && (
                      <button
                        onClick={() => void fetch('/api/admin/orbit/creative-os/generate', {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ jobId: j.id, action: 'retry' }),
                        }).then(loadJobs)}
                        className="text-amber-300 hover:underline">retry</button>
                    )}
                    {j.status === 'completed' && (
                      <button
                        onClick={() => void fetch('/api/admin/orbit/creative-os/generate', {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ jobId: j.id, action: 'handoff' }),
                        }).then(loadJobs)}
                        className="text-emerald-300 hover:underline">→ Campaign Media</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function WorkflowTab() {
  const [presets, setPresets] = useState<Array<{ key: string; label: string; nodes: Array<{ id: string; type: string; label: string }> }>>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/orbit/creative-os/workflow').then(r => r.json()).then(d => setPresets(d.presets ?? [])).catch(() => {})
  }, [])

  async function dryRun() {
    const graph = presets.find(p => p.key === selected)
    if (!graph) return
    setBusy(true); setRunResult(null)
    try {
      const res = await fetch('/api/admin/orbit/creative-os/workflow', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph, action: 'dry_run' }),
      })
      const d = await res.json() as { results: Array<{ nodeId: string; type: string; status: string; detail?: string }>; halted: boolean }
      setRunResult(d.results.map(r => `${r.type}: ${r.status}${r.detail ? ` — ${r.detail}` : ''}`).join('\n'))
    } finally { setBusy(false) }
  }

  return (
    <div className={`${card} space-y-4`}>
      <p className={label}>Walz workflow presets</p>
      <div className="flex flex-wrap gap-2">
        {presets.map(p => (
          <button key={p.key} onClick={() => setSelected(p.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${selected === p.key ? 'bg-[#C9A84C] text-[#0B1F3A]' : 'bg-white/5 text-white/50 hover:text-white'}`}>
            {p.label}
          </button>
        ))}
      </div>
      {selected && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/50">
            {presets.find(p => p.key === selected)?.nodes.map((n, i, arr) => (
              <span key={n.id} className="inline-flex items-center gap-1.5">
                <span className="bg-white/5 rounded-lg px-2 py-1">{n.label}</span>
                {i < arr.length - 1 && <span className="text-white/20">→</span>}
              </span>
            ))}
          </div>
          <button onClick={() => void dryRun()} disabled={busy} className={btn}>{busy ? 'Running…' : 'Dry Run'}</button>
        </>
      )}
      {runResult && <pre className="text-[11px] text-white/60 bg-black/20 rounded-xl p-4 whitespace-pre-wrap">{runResult}</pre>}
    </div>
  )
}
