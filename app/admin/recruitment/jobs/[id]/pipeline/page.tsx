'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Users } from 'lucide-react'

interface Stage { key: string; label: string }
interface AppCard {
  id: string; reference: string; stageKey: string; status: string; createdAt: string
  accommodation: string | null
  candidate: { id: string; firstName: string; lastName: string; email: string }
}

export default function JobPipelinePage() {
  const params = useParams<{ id: string }>()
  const [stages,  setStages]  = useState<Stage[]>([])
  const [apps,    setApps]    = useState<AppCard[]>([])
  const [job,     setJob]     = useState<{ title: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [busy,    setBusy]    = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [jRes, aRes] = await Promise.all([
        fetch(`/api/admin/recruitment/jobs/${params.id}`),
        fetch(`/api/admin/recruitment/jobs/${params.id}/applications`),
      ])
      const jData = await jRes.json()
      const aData = await aRes.json()
      if (!jRes.ok) { setError(jData.error ?? 'Failed to load job'); return }
      setJob(jData.job ?? null)
      setStages(jData.job?.pipelineStages ?? [])
      setApps(aData.applications ?? [])
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }, [params.id])
  useEffect(() => { void load() }, [load])

  async function move(app: AppCard, toStage: string) {
    if (!toStage || toStage === app.stageKey) return
    if (['offer', 'hired', 'rejected'].includes(toStage) &&
        !confirm(`Move ${app.candidate.firstName} ${app.candidate.lastName} to "${stages.find(s => s.key === toStage)?.label ?? toStage}"? This is recorded as a hiring decision under your name.`)) return
    setBusy(app.id); setError('')
    const res  = await fetch(`/api/admin/recruitment/applications/${app.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'move', toStage }),
    })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) { setError(data.error ?? 'Move failed'); return }
    await load()
  }

  const ageDays = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-gray-400 mb-1">
          <Link href="/admin/recruitment/jobs" className="hover:underline">Job Openings</Link> ›{' '}
          <Link href={`/admin/recruitment/jobs/${params.id}`} className="hover:underline">{job?.title ?? 'Job'}</Link> › Pipeline
        </p>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Pipeline{job ? ` — ${job.title}` : ''}</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          {apps.length} candidate{apps.length !== 1 ? 's' : ''} · every move is logged; offer, hired and rejected are human hiring decisions
        </p>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" /></div>
      ) : (
        <div className="overflow-x-auto pb-3">
          <div className="flex gap-3 min-w-max">
            {stages.map(stage => {
              const inStage = apps.filter(a => a.stageKey === stage.key)
              return (
                <div key={stage.key} className="w-64 flex-shrink-0 bg-gray-50 rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <p className="text-xs font-bold text-[#0B1F3A] uppercase tracking-wide">{stage.label}</p>
                    <span className="text-[10px] font-semibold text-gray-400 bg-white px-1.5 py-0.5 rounded-full">{inStage.length}</span>
                  </div>
                  <div className="space-y-2">
                    {inStage.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center">
                        <Users className="w-4 h-4 text-gray-200 mx-auto" />
                      </div>
                    ) : inStage.map(app => (
                      <div key={app.id} className="bg-white rounded-xl shadow-sm p-3">
                        <Link href={`/admin/recruitment/applications/${app.id}`}
                          className="font-semibold text-[#0B1F3A] text-sm hover:underline block truncate">
                          {app.candidate.firstName} {app.candidate.lastName}
                        </Link>
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">{app.candidate.email}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          <span className="font-mono">{app.reference}</span> · {ageDays(app.createdAt)}d
                          {app.accommodation ? ' · accommodation' : ''}
                        </p>
                        <select
                          value={app.stageKey}
                          disabled={busy === app.id || app.status === 'withdrawn'}
                          onChange={e => void move(app, e.target.value)}
                          aria-label={`Move ${app.candidate.firstName} ${app.candidate.lastName} to another stage`}
                          className="mt-2 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-500 bg-white disabled:opacity-50">
                          {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
