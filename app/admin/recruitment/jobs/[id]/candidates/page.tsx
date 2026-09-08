'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Users, FileText, Mail, Phone } from 'lucide-react'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/recruitment/core'

interface AppRow {
  id: string; reference: string; stageKey: string; status: string; createdAt: string
  howHeard: string | null; accommodation: string | null
  candidate: { id: string; firstName: string; lastName: string; email: string; phone: string | null; country: string | null }
  documents: Array<{ id: string; kind: string; filename: string; size: number }>
  _count: { answers: number }
}

const STAGE_LABEL = Object.fromEntries(DEFAULT_PIPELINE_STAGES.map(s => [s.key, s.label]))

export default function JobCandidatesPage() {
  const params = useParams<{ id: string }>()
  const [apps,    setApps]    = useState<AppRow[]>([])
  const [job,     setJob]     = useState<{ title: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [aRes, jRes] = await Promise.all([
        fetch(`/api/admin/recruitment/jobs/${params.id}/applications`),
        fetch(`/api/admin/recruitment/jobs/${params.id}`),
      ])
      const aData = await aRes.json()
      const jData = await jRes.json()
      if (!aRes.ok) { setError(aData.error ?? 'Failed to load'); return }
      setApps(aData.applications ?? [])
      setJob(jData.job ?? null)
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }, [params.id])
  useEffect(() => { void load() }, [load])

  const ageDays = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-gray-400 mb-1">
          <Link href="/admin/recruitment/jobs" className="hover:underline">Job Openings</Link> ›{' '}
          <Link href={`/admin/recruitment/jobs/${params.id}`} className="hover:underline">{job?.title ?? 'Job'}</Link> › Candidates
        </p>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Applications{job ? ` — ${job.title}` : ''}</h1>
        <p className="text-gray-400 text-sm mt-0.5">{apps.length} application{apps.length !== 1 ? 's' : ''}</p>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" /></div>
      ) : apps.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No applications yet for this role.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {apps.map(app => (
            <div key={app.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-[#0B1F3A] text-sm">
                      {app.candidate.firstName} {app.candidate.lastName}
                    </p>
                    <span className="text-[10px] font-semibold text-[#C9A84C] bg-[#C9A84C]/10 px-2 py-0.5 rounded-full">
                      {STAGE_LABEL[app.stageKey] ?? app.stageKey}
                    </span>
                    {app.accommodation && (
                      <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full" title={app.accommodation}>
                        Accommodation requested
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{app.candidate.email}</span>
                    {app.candidate.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{app.candidate.phone}</span>}
                    {app.candidate.country && <span>{app.candidate.country}</span>}
                    <span className="font-mono">{app.reference}</span>
                    <span>{ageDays(app.createdAt)}d ago</span>
                    {app._count.answers > 0 && <span>{app._count.answers} screening answers</span>}
                    {app.howHeard && <span>via {app.howHeard}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {app.documents.map(doc => (
                    <a key={doc.id} href={`/api/admin/recruitment/documents/${doc.id}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B1F3A] bg-[#F5F0E8] hover:bg-[#C9A84C]/20 px-3 py-1.5 rounded-lg"
                      title={`${doc.filename} (${Math.round(doc.size / 1024)}KB)`}>
                      <FileText className="w-3.5 h-3.5 text-[#C9A84C]" />
                      {doc.kind === 'cv' ? 'CV' : doc.kind}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
