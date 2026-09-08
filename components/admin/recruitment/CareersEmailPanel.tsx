'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { UserCheck, UserPlus, Loader2 } from 'lucide-react'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/recruitment/core'

/**
 * Recruitment context strip for a careers thread in the Email Hub:
 * shows the matched candidate + their applications, or offers a one-click
 * "create candidate" for unmatched senders.
 */

interface AppRef { id: string; reference: string; jobId: string; stageKey: string }
interface CandidateRef { id: string; email: string; firstName: string; lastName: string; applications: AppRef[] }

const STAGE_LABEL = Object.fromEntries(DEFAULT_PIPELINE_STAGES.map(s => [s.key, s.label]))

export default function CareersEmailPanel({ threadId }: { threadId: string }) {
  const [candidate, setCandidate] = useState<CandidateRef | null>(null)
  const [jobs,      setJobs]      = useState<Array<{ id: string; title: string }>>([])
  const [sender,    setSender]    = useState<{ email?: string; name?: string | null } | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/admin/email/threads/${threadId}/candidate`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setCandidate(data.candidate ?? null)
      setJobs(data.jobs ?? [])
      setSender(data.sender ?? null)
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }, [threadId])
  useEffect(() => { void load() }, [load])

  async function createCandidate() {
    setBusy(true); setError('')
    const res  = await fetch(`/api/admin/email/threads/${threadId}/candidate`, { method: 'POST' })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Could not create candidate'); return }
    await load()
  }

  if (loading) return <div className="px-6 py-2 text-xs text-gray-500 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Checking recruitment records…</div>

  return (
    <div className="px-6 py-2.5 border-b border-gray-800 bg-gray-900/70 flex items-center gap-3 flex-wrap">
      {error && <span className="text-xs text-red-400">{error}</span>}
      {candidate ? (
        <>
          <Link href={`/admin/recruitment/candidates/${candidate.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C9A84C] bg-[#C9A84C]/10 hover:bg-[#C9A84C]/20 px-2.5 py-1 rounded-full">
            <UserCheck size={12} /> {candidate.firstName} {candidate.lastName} — candidate profile
          </Link>
          {candidate.applications.slice(0, 3).map(app => (
            <Link key={app.id} href={`/admin/recruitment/applications/${app.id}`}
              className="text-xs text-gray-300 bg-gray-800 hover:bg-gray-700 px-2.5 py-1 rounded-full">
              {jobs.find(j => j.id === app.jobId)?.title ?? app.reference} · {STAGE_LABEL[app.stageKey] ?? app.stageKey}
            </Link>
          ))}
        </>
      ) : sender?.email ? (
        <button onClick={() => void createCandidate()} disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B1F3A] bg-[#C9A84C] hover:bg-[#d9b85c] px-3 py-1.5 rounded-lg disabled:opacity-50">
          <UserPlus size={12} /> {busy ? 'Creating…' : `Create candidate from ${sender.email}`}
        </button>
      ) : (
        <span className="text-xs text-gray-500">No sender identified for recruitment matching</span>
      )}
    </div>
  )
}
