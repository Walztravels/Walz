'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Mail, Phone, Globe, FileText, StickyNote, History } from 'lucide-react'
import InterviewsSection from '@/components/admin/recruitment/InterviewsSection'
import AiScreeningSection from '@/components/admin/recruitment/AiScreeningSection'
import AiInterviewSection from '@/components/admin/recruitment/AiInterviewSection'

interface Stage { key: string; label: string }
interface Detail {
  id: string; reference: string; stageKey: string; status: string; createdAt: string
  coverLetter: string | null; howHeard: string | null; referral: string | null
  workAuthorization: string | null; accommodation: string | null
  candidate: {
    id: string; firstName: string; lastName: string; email: string; phone: string | null
    country: string | null; city: string | null; linkedinUrl: string | null; portfolioUrl: string | null
  }
  answers: Array<{ id: string; question: string; answer: string }>
  documents: Array<{ id: string; kind: string; filename: string; size: number }>
  stageHistory: Array<{ id: string; fromKey: string | null; toKey: string; movedBy: string | null; note: string | null; createdAt: string }>
  notes: Array<{ id: string; authorName: string | null; authorEmail: string; body: string; createdAt: string }>
}

const DECISION_KEYS = ['offer', 'hired', 'rejected']

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>()
  const [app,     setApp]     = useState<Detail | null>(null)
  const [job,     setJob]     = useState<{ id: string; title: string; pipelineStages: Stage[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [moveNote, setMoveNote] = useState('')
  const [noteText, setNoteText] = useState('')

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/admin/recruitment/applications/${params.id}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setApp(data.application)
      setJob(data.job)
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }, [params.id])
  useEffect(() => { void load() }, [load])

  async function move(toStage: string) {
    if (!app || !toStage || toStage === app.stageKey) return
    const label = job?.pipelineStages.find(s => s.key === toStage)?.label ?? toStage
    if (DECISION_KEYS.includes(toStage) &&
        !confirm(`Move ${app.candidate.firstName} ${app.candidate.lastName} to "${label}"? This is recorded as a hiring decision under your name.`)) return
    setBusy(true); setError('')
    const res  = await fetch(`/api/admin/recruitment/applications/${app.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'move', toStage, note: moveNote || undefined }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Move failed'); return }
    setMoveNote(''); await load()
  }

  async function addNote() {
    if (!app || !noteText.trim()) return
    setBusy(true); setError('')
    const res  = await fetch(`/api/admin/recruitment/applications/${app.id}/notes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: noteText }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Could not add note'); return }
    setNoteText(''); await load()
  }

  const stageLabel = (key: string | null) =>
    key ? (job?.pipelineStages.find(s => s.key === key)?.label ?? key) : '—'
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" /></div>
  if (!app) return <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error || 'Application not found'}</p>

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-gray-400 mb-1">
          <Link href="/admin/recruitment/jobs" className="hover:underline">Job Openings</Link>
          {job && <> › <Link href={`/admin/recruitment/jobs/${job.id}/pipeline`} className="hover:underline">{job.title}</Link></>}
          {' '}› {app.reference}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-[#0B1F3A]">{app.candidate.firstName} {app.candidate.lastName}</h1>
          <span className="text-[10px] font-semibold text-[#C9A84C] bg-[#C9A84C]/10 px-2 py-0.5 rounded-full">{stageLabel(app.stageKey)}</span>
          {app.status !== 'active' && (
            <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{app.status}</span>
          )}
        </div>
        <p className="text-gray-400 text-sm mt-0.5">
          <span className="font-mono">{app.reference}</span> · applied {fmt(app.createdAt)}
          {job ? ` · ${job.title}` : ''} ·{' '}
          <Link href={`/admin/recruitment/candidates/${app.candidate.id}`} className="text-[#C9A84C] hover:underline">full candidate profile</Link>
        </p>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Contact + application facts */}
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-2">
            <h2 className="text-sm font-bold text-[#0B1F3A]">Candidate</h2>
            <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{app.candidate.email}</span>
              {app.candidate.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{app.candidate.phone}</span>}
              {(app.candidate.city || app.candidate.country) && (
                <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{[app.candidate.city, app.candidate.country].filter(Boolean).join(', ')}</span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs flex-wrap">
              {app.candidate.linkedinUrl && <a href={app.candidate.linkedinUrl} target="_blank" rel="noreferrer" className="text-[#C9A84C] hover:underline">LinkedIn</a>}
              {app.candidate.portfolioUrl && <a href={app.candidate.portfolioUrl} target="_blank" rel="noreferrer" className="text-[#C9A84C] hover:underline">Portfolio</a>}
              {app.documents.map(doc => (
                <a key={doc.id} href={`/api/admin/recruitment/documents/${doc.id}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#0B1F3A] font-semibold bg-[#F5F0E8] hover:bg-[#C9A84C]/20 px-2.5 py-1 rounded-lg">
                  <FileText className="w-3 h-3 text-[#C9A84C]" />{doc.kind === 'cv' ? 'CV' : doc.kind} · {doc.filename}
                </a>
              ))}
            </div>
            <div className="text-xs text-gray-500 space-y-1 pt-1">
              {app.workAuthorization && <p><span className="font-semibold text-gray-600">Work authorization:</span> {app.workAuthorization}</p>}
              {app.howHeard && <p><span className="font-semibold text-gray-600">Heard via:</span> {app.howHeard}{app.referral ? ` (${app.referral})` : ''}</p>}
              {app.accommodation && (
                <p className="text-blue-700 bg-blue-50 rounded-lg px-3 py-2"><span className="font-semibold">Accommodation requested:</span> {app.accommodation}</p>
              )}
            </div>
          </div>

          {app.coverLetter && (
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-bold text-[#0B1F3A] mb-2">Cover letter</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{app.coverLetter}</p>
            </div>
          )}

          {app.answers.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h2 className="text-sm font-bold text-[#0B1F3A]">Screening answers</h2>
              {app.answers.map(a => (
                <div key={a.id}>
                  <p className="text-xs font-semibold text-gray-600">{a.question}</p>
                  <p className="text-sm text-gray-500 whitespace-pre-wrap mt-0.5">{a.answer}</p>
                </div>
              ))}
            </div>
          )}

          {/* Advisory AI screening — human-triggered, human-reviewed */}
          <AiScreeningSection applicationId={app.id} />

          {/* AI screening interview — invited by staff, reviewed by staff */}
          <AiInterviewSection applicationId={app.id} />

          {/* Interviews & scorecards */}
          <InterviewsSection applicationId={app.id} jobId={job?.id ?? null} />

          {/* Internal notes */}
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-1.5"><StickyNote className="w-4 h-4 text-[#C9A84C]" /> Internal notes</h2>
            <p className="text-[11px] text-gray-400">Visible to staff only — never shown to the candidate.</p>
            <div className="flex gap-2">
              <input value={noteText} onChange={e => setNoteText(e.target.value)} maxLength={5000}
                placeholder="Add a note…" aria-label="Add internal note"
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2"
                onKeyDown={e => { if (e.key === 'Enter') void addNote() }} />
              <button onClick={() => void addNote()} disabled={busy || !noteText.trim()}
                className="text-sm font-bold bg-[#C9A84C] text-[#0B1F3A] px-4 py-2 rounded-xl disabled:opacity-40">Add</button>
            </div>
            {app.notes.length === 0 ? (
              <p className="text-xs text-gray-300">No notes yet.</p>
            ) : app.notes.map(n => (
              <div key={n.id} className="border-l-2 border-[#C9A84C]/40 pl-3">
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{n.body}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{n.authorName ?? n.authorEmail} · {fmt(n.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          {/* Stage control */}
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <h2 className="text-sm font-bold text-[#0B1F3A]">Move stage</h2>
            <select value={app.stageKey} disabled={busy || app.status === 'withdrawn'}
              onChange={e => void move(e.target.value)} aria-label="Move to pipeline stage"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white disabled:opacity-50">
              {(job?.pipelineStages ?? []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <input value={moveNote} onChange={e => setMoveNote(e.target.value)} maxLength={2000}
              placeholder="Optional note for the move…" aria-label="Note attached to the stage move"
              className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2" />
            <p className="text-[10px] text-gray-400">
              Offer, Hired and Rejected are hiring decisions — they are made only by staff and logged under your name. AI never decides.
            </p>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-1.5 mb-3"><History className="w-4 h-4 text-[#C9A84C]" /> Stage timeline</h2>
            <div className="space-y-2.5">
              {app.stageHistory.map(h => (
                <div key={h.id} className="text-xs">
                  <p className="text-gray-600 font-semibold">
                    {h.fromKey ? `${stageLabel(h.fromKey)} → ` : ''}{stageLabel(h.toKey)}
                  </p>
                  <p className="text-gray-400">{h.movedBy ?? 'system'} · {fmt(h.createdAt)}</p>
                  {h.note && <p className="text-gray-500 mt-0.5">{h.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
