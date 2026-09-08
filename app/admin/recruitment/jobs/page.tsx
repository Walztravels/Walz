'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Loader2, Briefcase, ArrowUp, ArrowDown, Copy, ExternalLink, Users } from 'lucide-react'

interface JobRow {
  id: string; slug: string | null; title: string; department: string | null
  type: string; workplaceType: string; location: string; status: string
  deadline: string | null; sortOrder: number; positions: number
}

const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  published: 'bg-green-100 text-green-700',
  paused:    'bg-amber-100 text-amber-700',
  closed:    'bg-blue-100 text-blue-700',
  archived:  'bg-gray-100 text-gray-400',
}

const ACTIONS_FOR: Record<string, Array<[string, string]>> = {
  draft:     [['publish', 'Publish'], ['archive', 'Archive']],
  published: [['pause', 'Pause'], ['close', 'Close']],
  paused:    [['publish', 'Resume'], ['close', 'Close'], ['archive', 'Archive']],
  closed:    [['reopen', 'Reopen'], ['archive', 'Archive']],
  archived:  [['restore', 'Restore to draft']],
}

export default function RecruitmentJobsPage() {
  const [jobs,    setJobs]    = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [busy,    setBusy]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/recruitment/jobs')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setJobs(data.jobs ?? [])
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  function flash(m: string) { setSuccess(m); setTimeout(() => setSuccess(''), 2500) }

  async function act(job: JobRow, action: string) {
    if ((action === 'close' || action === 'archive') &&
        !confirm(`${action === 'close' ? 'Close' : 'Archive'} "${job.title}"? It will no longer appear publicly (application history is preserved).`)) return
    setBusy(job.id); setError('')
    const res  = await fetch(`/api/admin/recruitment/jobs/${job.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) { setError(data.error ?? 'Action failed'); return }
    flash(`${job.title}: ${action} ✓`); await load()
  }

  async function move(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= jobs.length) return
    const next = [...jobs]
    ;[next[index], next[j]] = [next[j], next[index]]
    setJobs(next.map((it, i) => ({ ...it, sortOrder: i + 1 })))
    await fetch('/api/admin/recruitment/jobs/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: next.map((it, i) => ({ id: it.id, sortOrder: i + 1 })) }),
    })
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Job Openings</h1>
          <p className="text-gray-400 text-sm mt-0.5">Recruitment Hub — create, publish and manage roles</p>
        </div>
        <Link href="/admin/recruitment/jobs/new"
          className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm">
          <Plus className="w-4 h-4" /> New Job
        </Link>
      </div>

      {error   && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 rounded-xl px-4 py-2.5">{success}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" /></div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <Briefcase className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No jobs yet. Create your first opening.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job, index) => (
            <div key={job.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button onClick={() => void move(index, -1)} disabled={index === 0} aria-label={`Move ${job.title} up`}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-[#0B1F3A] disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => void move(index, 1)} disabled={index === jobs.length - 1} aria-label={`Move ${job.title} down`}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-[#0B1F3A] disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/admin/recruitment/jobs/${job.id}`} className="font-bold text-[#0B1F3A] text-sm hover:underline">
                    {job.title}
                  </Link>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[job.status] ?? STATUS_STYLE.draft}`}>
                    {job.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {[job.department, job.type, job.workplaceType, job.location].filter(Boolean).join(' · ')}
                  {job.deadline ? ` · closes ${new Date(job.deadline).toLocaleDateString('en-GB')}` : ''}
                  {job.positions > 1 ? ` · ${job.positions} positions` : ''}
                </p>
              </div>
              <Link href={`/admin/recruitment/jobs/${job.id}/candidates`} title="View applications"
                aria-label={`View applications for ${job.title}`}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#0B1F3A]">
                <Users className="w-4 h-4" />
              </Link>
              {job.status === 'published' && job.slug && (
                <a href={`/careers/${job.slug}`} target="_blank" rel="noreferrer" title="View public page"
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#0B1F3A]">
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <button onClick={() => void act(job, 'duplicate')} disabled={busy === job.id} title="Duplicate"
                aria-label={`Duplicate ${job.title}`}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#0B1F3A] disabled:opacity-40">
                <Copy className="w-4 h-4" />
              </button>
              <div className="flex gap-1.5 flex-shrink-0">
                {(ACTIONS_FOR[job.status] ?? []).map(([action, lbl]) => (
                  <button key={action} onClick={() => void act(job, action)} disabled={busy === job.id}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-[#C9A84C] hover:text-[#0B1F3A] disabled:opacity-40">
                    {busy === job.id ? '…' : lbl}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
