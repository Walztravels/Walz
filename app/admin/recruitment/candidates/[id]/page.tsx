'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Mail, Phone, Globe, FileText, StickyNote, Star } from 'lucide-react'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/recruitment/core'

interface CandidateDetail {
  id: string; email: string; firstName: string; lastName: string
  phone: string | null; country: string | null; city: string | null
  linkedinUrl: string | null; portfolioUrl: string | null; createdAt: string
  applications: Array<{ id: string; reference: string; jobId: string; stageKey: string; status: string; createdAt: string }>
  documents: Array<{ id: string; kind: string; filename: string; size: number; createdAt: string }>
  notes: Array<{ id: string; authorName: string | null; authorEmail: string; body: string; createdAt: string }>
}
interface JobRef { id: string; title: string; department: string | null }

const STAGE_LABEL = Object.fromEntries(DEFAULT_PIPELINE_STAGES.map(s => [s.key, s.label]))

export default function CandidateProfilePage() {
  const params = useParams<{ id: string }>()
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [jobs,      setJobs]      = useState<JobRef[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [poolBusy,  setPoolBusy]  = useState(false)
  const [poolMsg,   setPoolMsg]   = useState('')

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/admin/recruitment/candidates/${params.id}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setCandidate(data.candidate)
      setJobs(data.jobs ?? [])
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }, [params.id])
  useEffect(() => { void load() }, [load])

  async function addToPool() {
    if (!candidate) return
    if (!confirm(`Add ${candidate.firstName} ${candidate.lastName} to the talent pool for future roles?`)) return
    setPoolBusy(true); setPoolMsg('')
    const res  = await fetch('/api/admin/recruitment/talent-pool', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: candidate.id }),
    })
    const data = await res.json()
    setPoolBusy(false)
    setPoolMsg(res.ok ? 'Added to the talent pool.' : (data.error ?? 'Failed to add'))
  }

  const jobTitle = (id: string) => jobs.find(j => j.id === id)?.title ?? 'Unknown role'
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'medium' })

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" /></div>
  if (!candidate) return <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error || 'Candidate not found'}</p>

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-gray-400 mb-1">
          <Link href="/admin/recruitment" className="hover:underline">Recruitment</Link> › Candidate
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-[#0B1F3A]">{candidate.firstName} {candidate.lastName}</h1>
          <button onClick={() => void addToPool()} disabled={poolBusy}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#0B1F3A] bg-[#C9A84C]/20 hover:bg-[#C9A84C]/40 px-3 py-1.5 rounded-lg disabled:opacity-40">
            <Star className="w-3.5 h-3.5 text-[#C9A84C]" /> Add to talent pool
          </button>
          {poolMsg && <span className="text-xs text-gray-500">{poolMsg}</span>}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400 mt-1 flex-wrap">
          <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{candidate.email}</span>
          {candidate.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{candidate.phone}</span>}
          {(candidate.city || candidate.country) && (
            <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{[candidate.city, candidate.country].filter(Boolean).join(', ')}</span>
          )}
          {candidate.linkedinUrl && <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer" className="text-[#C9A84C] hover:underline">LinkedIn</a>}
          {candidate.portfolioUrl && <a href={candidate.portfolioUrl} target="_blank" rel="noreferrer" className="text-[#C9A84C] hover:underline">Portfolio</a>}
          <span>first seen {fmt(candidate.createdAt)}</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-3">Applications ({candidate.applications.length})</h2>
        <div className="space-y-2">
          {candidate.applications.map(app => (
            <Link key={app.id} href={`/admin/recruitment/applications/${app.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 hover:border-[#C9A84C]/50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0B1F3A] truncate">{jobTitle(app.jobId)}</p>
                <p className="text-[11px] text-gray-400"><span className="font-mono">{app.reference}</span> · applied {fmt(app.createdAt)}</p>
              </div>
              <span className="text-[10px] font-semibold text-[#C9A84C] bg-[#C9A84C]/10 px-2 py-0.5 rounded-full flex-shrink-0">
                {STAGE_LABEL[app.stageKey] ?? app.stageKey}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {candidate.documents.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="text-sm font-bold text-[#0B1F3A] mb-3">Documents</h2>
          <div className="flex gap-2 flex-wrap">
            {candidate.documents.map(doc => (
              <a key={doc.id} href={`/api/admin/recruitment/documents/${doc.id}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B1F3A] bg-[#F5F0E8] hover:bg-[#C9A84C]/20 px-3 py-1.5 rounded-lg"
                title={`${Math.round(doc.size / 1024)}KB · ${fmt(doc.createdAt)}`}>
                <FileText className="w-3.5 h-3.5 text-[#C9A84C]" />{doc.filename}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-1.5 mb-3"><StickyNote className="w-4 h-4 text-[#C9A84C]" /> Internal notes</h2>
        {candidate.notes.length === 0 ? (
          <p className="text-xs text-gray-300">No notes yet. Add notes from an application page.</p>
        ) : (
          <div className="space-y-3">
            {candidate.notes.map(n => (
              <div key={n.id} className="border-l-2 border-[#C9A84C]/40 pl-3">
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{n.body}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{n.authorName ?? n.authorEmail} · {fmt(n.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
