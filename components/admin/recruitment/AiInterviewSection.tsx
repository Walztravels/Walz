'use client'
import { useState, useEffect, useCallback } from 'react'
import { MessageSquareText, CheckCircle2, Send } from 'lucide-react'

/**
 * Staff view of AI screening interviews for one application: invite,
 * cancel, read the transcript and the advisory summary, and record the
 * human review. The interview link is emailed to the candidate; the raw
 * token is never shown here because it is never stored.
 */

interface AiInterviewRow {
  id: string; status: string; tokenExpiresAt: string; currentIndex: number
  questions: Array<{ key: string; question: string }>
  transcript: Array<{ question: string; answer: string; answeredAt?: string }>
  aiSummary: string | null; aiHighlights: string[]
  reviewedBy: string | null; reviewedAt: string | null
  invitedBy: string; startedAt: string | null; completedAt: string | null; createdAt: string
}

const STATUS_STYLE: Record<string, string> = {
  invited:     'bg-blue-50 text-blue-600',
  in_progress: 'bg-amber-50 text-amber-700',
  completed:   'bg-green-50 text-green-700',
  cancelled:   'bg-gray-100 text-gray-400',
  expired:     'bg-gray-100 text-gray-400',
}

export default function AiInterviewSection({ applicationId }: { applicationId: string }) {
  const [interviews, setInterviews] = useState<AiInterviewRow[]>([])
  const [error,      setError]      = useState('')
  const [notice,     setNotice]     = useState('')
  const [busy,       setBusy]       = useState(false)
  const [open,       setOpen]       = useState<string | null>(null)   // transcript toggle

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/admin/recruitment/applications/${applicationId}/ai-interview`)
      const data = await res.json()
      if (res.ok) setInterviews(data.interviews ?? [])
    } catch { /* section stays empty on network failure */ }
  }, [applicationId])
  useEffect(() => { void load() }, [load])

  async function invite() {
    if (!confirm('Invite this candidate to a written AI screening interview? They will receive an email with a personal link.')) return
    setBusy(true); setError(''); setNotice('')
    const res  = await fetch(`/api/admin/recruitment/applications/${applicationId}/ai-interview`, { method: 'POST' })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Invite failed'); return }
    setNotice(data.emailed
      ? 'Invitation created and email sent to the candidate.'
      : 'Invitation created, but the email could not be sent — contact the candidate manually.')
    await load()
  }

  async function act(interviewId: string, action: 'cancel' | 'review') {
    if (action === 'cancel' && !confirm('Cancel this AI interview? The candidate link stops working.')) return
    setBusy(true); setError('')
    const res  = await fetch(`/api/admin/recruitment/applications/${applicationId}/ai-interview`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewId, action }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Action failed'); return }
    await load()
  }

  const fmt = (iso: string | null) => iso
    ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : '—'

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-1.5">
          <MessageSquareText className="w-4 h-4 text-[#C9A84C]" /> AI screening interview
          <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">written · human-reviewed</span>
        </h2>
        <button onClick={() => void invite()} disabled={busy}
          className="inline-flex items-center gap-1 text-xs font-bold text-[#0B1F3A] bg-[#C9A84C] px-3 py-1.5 rounded-lg disabled:opacity-40">
          <Send className="w-3.5 h-3.5" /> Invite candidate
        </button>
      </div>
      <p className="text-[10px] text-gray-400">
        Text answers to staff-approved questions, summarized by AI for human review. No audio or video; AI never
        scores candidates into a decision — staff review every transcript and make all hiring decisions.
      </p>
      {error  && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {notice && <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{notice}</p>}

      {interviews.map(iv => (
        <div key={iv.id} className="border border-gray-100 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[iv.status] ?? STATUS_STYLE.invited}`}>{iv.status}</span>
            <span className="text-gray-400">
              invited {fmt(iv.createdAt)} by {iv.invitedBy} · {iv.currentIndex}/{iv.questions.length} answered
              {iv.status === 'invited' ? ` · link expires ${fmt(iv.tokenExpiresAt)}` : ''}
            </span>
            {iv.reviewedBy ? (
              <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-semibold">
                <CheckCircle2 className="w-3 h-3" /> reviewed by {iv.reviewedBy}
              </span>
            ) : iv.status === 'completed' && (
              <button onClick={() => void act(iv.id, 'review')} disabled={busy}
                className="font-semibold text-[#C9A84C] hover:underline disabled:opacity-40">
                Mark as reviewed by me
              </button>
            )}
            {(iv.status === 'invited' || iv.status === 'in_progress') && (
              <button onClick={() => void act(iv.id, 'cancel')} disabled={busy}
                className="font-semibold text-gray-400 hover:text-red-500 hover:underline disabled:opacity-40">
                Cancel
              </button>
            )}
          </div>

          {iv.aiSummary && (
            <div className="bg-[#F5F0E8]/60 rounded-lg p-3">
              <p className="text-[11px] font-bold text-[#0B1F3A]">AI summary — advisory only</p>
              <p className="text-xs text-gray-600 whitespace-pre-wrap mt-1">{iv.aiSummary}</p>
              {iv.aiHighlights.length > 0 && (
                <ul className="text-[11px] text-gray-500 list-disc pl-4 mt-1.5 space-y-0.5">
                  {iv.aiHighlights.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              )}
            </div>
          )}

          {iv.transcript.length > 0 && (
            <div>
              <button onClick={() => setOpen(open === iv.id ? null : iv.id)}
                className="text-[11px] font-semibold text-[#C9A84C] hover:underline">
                {open === iv.id ? 'Hide transcript' : `Read full transcript (${iv.transcript.length} answers)`}
              </button>
              {open === iv.id && (
                <div className="space-y-2 mt-2">
                  {iv.transcript.map((t, i) => (
                    <div key={i} className="border-l-2 border-[#C9A84C]/40 pl-3">
                      <p className="text-[11px] font-semibold text-gray-600">{t.question}</p>
                      <p className="text-xs text-gray-500 whitespace-pre-wrap mt-0.5">{t.answer}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
