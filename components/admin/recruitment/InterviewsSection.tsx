'use client'
import { useState, useEffect, useCallback } from 'react'
import { CalendarClock, Plus, ClipboardCheck } from 'lucide-react'
import { RECOMMENDATION_LABELS } from '@/lib/recruitment/interviews'

/**
 * Interview plans, scheduling and scorecards for one application
 * (embedded in the admin application detail page).
 */

interface Criterion { key: string; label: string; weight: number }
interface Scorecard {
  id: string; reviewerEmail: string; reviewerName: string | null
  scores: Array<Criterion & { score: number; comment?: string }>
  overallScore: number; recommendation: string; comment: string | null; submittedAt: string
}
interface Interview {
  id: string; kind: string; status: string; scheduledAt: string | null
  durationMins: number; location: string | null; meetingUrl: string | null
  interviewers: string[]; notes: string | null; createdBy: string | null
  scorecardTemplate: { id: string; name: string; criteria: Criterion[] } | null
  scorecards: Scorecard[]
}
interface Template { id: string; name: string; criteria: Criterion[] }

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-600',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-gray-400',
  no_show:   'bg-amber-50 text-amber-700',
}

export default function InterviewsSection({ applicationId, jobId }: { applicationId: string; jobId: string | null }) {
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [templates,  setTemplates]  = useState<Template[]>([])
  const [error,      setError]      = useState('')
  const [busy,       setBusy]       = useState(false)
  const [showForm,   setShowForm]   = useState(false)
  const [scoring,    setScoring]    = useState<string | null>(null)   // interview id being scored

  const [form, setForm] = useState({
    kind: 'video', scheduledAt: '', durationMins: 45, meetingUrl: '',
    location: '', interviewers: '', scorecardTemplateId: '', notifyCandidate: true,
  })
  const [scoreDraft, setScoreDraft] = useState<Record<string, { score: number; comment: string }>>({})
  const [recommendation, setRecommendation] = useState('yes')
  const [scoreComment,   setScoreComment]   = useState('')

  const load = useCallback(async () => {
    try {
      const [iRes, tRes] = await Promise.all([
        fetch(`/api/admin/recruitment/applications/${applicationId}/interviews`),
        fetch(`/api/admin/recruitment/scorecard-templates${jobId ? `?jobId=${jobId}` : ''}`),
      ])
      const iData = await iRes.json()
      const tData = await tRes.json()
      if (iRes.ok) setInterviews(iData.interviews ?? [])
      if (tRes.ok) setTemplates(tData.templates ?? [])
    } catch { setError('Network error') }
  }, [applicationId, jobId])
  useEffect(() => { void load() }, [load])

  async function schedule() {
    setBusy(true); setError('')
    const res = await fetch(`/api/admin/recruitment/applications/${applicationId}/interviews`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: form.kind,
        scheduledAt: form.scheduledAt || undefined,
        durationMins: Number(form.durationMins),
        meetingUrl: form.meetingUrl || undefined,
        location: form.location || undefined,
        interviewers: form.interviewers.split(',').map(s => s.trim()).filter(Boolean),
        scorecardTemplateId: form.scorecardTemplateId || undefined,
        notifyCandidate: form.notifyCandidate,
      }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Failed to schedule'); return }
    setShowForm(false)
    setForm(f => ({ ...f, scheduledAt: '', meetingUrl: '', location: '', interviewers: '' }))
    await load()
  }

  async function setStatus(id: string, status: string) {
    if (status === 'cancelled' && !confirm('Cancel this interview?')) return
    setBusy(true); setError('')
    const res = await fetch(`/api/admin/recruitment/interviews/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Update failed'); return }
    await load()
  }

  function startScoring(iv: Interview) {
    setScoring(iv.id)
    const draft: Record<string, { score: number; comment: string }> = {}
    for (const c of iv.scorecardTemplate?.criteria ?? []) draft[c.key] = { score: 3, comment: '' }
    setScoreDraft(draft); setRecommendation('yes'); setScoreComment('')
  }

  async function submitScorecard(iv: Interview) {
    setBusy(true); setError('')
    const res = await fetch(`/api/admin/recruitment/interviews/${iv.id}/scorecards`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scores: (iv.scorecardTemplate?.criteria ?? []).map(c => ({
          key: c.key, score: scoreDraft[c.key]?.score ?? 3, comment: scoreDraft[c.key]?.comment || undefined,
        })),
        recommendation,
        comment: scoreComment || undefined,
      }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Failed to submit scorecard'); return }
    setScoring(null); await load()
  }

  const fmt = (iso: string | null) => iso
    ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : 'not scheduled'

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4 text-[#C9A84C]" /> Interviews
        </h2>
        <button onClick={() => setShowForm(v => !v)}
          className="inline-flex items-center gap-1 text-xs font-bold text-[#0B1F3A] bg-[#C9A84C] px-3 py-1.5 rounded-lg">
          <Plus className="w-3.5 h-3.5" /> Schedule
        </button>
      </div>
      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {showForm && (
        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">Type
              <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
                <option value="video">Video</option><option value="phone">Phone</option><option value="onsite">On-site</option>
              </select>
            </label>
            <label className="text-xs text-gray-500">Date & time
              <input type="datetime-local" value={form.scheduledAt}
                onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
            </label>
            <label className="text-xs text-gray-500">Duration (minutes)
              <input type="number" min={5} max={480} value={form.durationMins}
                onChange={e => setForm(f => ({ ...f, durationMins: Number(e.target.value) }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
            </label>
            <label className="text-xs text-gray-500">Scorecard template
              <select value={form.scorecardTemplateId}
                onChange={e => setForm(f => ({ ...f, scorecardTemplateId: e.target.value }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
                <option value="">None</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500">Meeting link
              <input value={form.meetingUrl} placeholder="https://…"
                onChange={e => setForm(f => ({ ...f, meetingUrl: e.target.value }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
            </label>
            <label className="text-xs text-gray-500">Interviewers (emails, comma-separated)
              <input value={form.interviewers} placeholder="staff@walztravels.com"
                onChange={e => setForm(f => ({ ...f, interviewers: e.target.value }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={form.notifyCandidate}
              onChange={e => setForm(f => ({ ...f, notifyCandidate: e.target.checked }))} />
            Email the candidate the interview details (only sent when a date is set)
          </label>
          <button onClick={() => void schedule()} disabled={busy}
            className="text-sm font-bold bg-[#0B1F3A] text-white px-4 py-2 rounded-xl disabled:opacity-40">
            {busy ? 'Scheduling…' : 'Schedule interview'}
          </button>
        </div>
      )}

      {interviews.length === 0 && !showForm && (
        <p className="text-xs text-gray-300">No interviews yet.</p>
      )}

      {interviews.map(iv => (
        <div key={iv.id} className="border border-gray-100 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#0B1F3A] capitalize">{iv.kind} interview</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[iv.status] ?? STATUS_STYLE.scheduled}`}>{iv.status}</span>
            <span className="text-xs text-gray-400">{fmt(iv.scheduledAt)} · {iv.durationMins} min</span>
          </div>
          <div className="text-xs text-gray-400 flex items-center gap-3 flex-wrap">
            {iv.meetingUrl && <a href={iv.meetingUrl} target="_blank" rel="noreferrer" className="text-[#C9A84C] hover:underline">Meeting link</a>}
            {iv.location && <span>{iv.location}</span>}
            {iv.interviewers.length > 0 && <span>with {iv.interviewers.join(', ')}</span>}
            {iv.scorecardTemplate && <span>scorecard: {iv.scorecardTemplate.name}</span>}
          </div>
          {iv.status === 'scheduled' && (
            <div className="flex gap-1.5">
              {(['completed', 'no_show', 'cancelled'] as const).map(s => (
                <button key={s} onClick={() => void setStatus(iv.id, s)} disabled={busy}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-[#C9A84C] hover:text-[#0B1F3A] disabled:opacity-40">
                  {s === 'completed' ? 'Mark completed' : s === 'no_show' ? 'No-show' : 'Cancel'}
                </button>
              ))}
            </div>
          )}

          {/* Submitted scorecards */}
          {iv.scorecards.map(sc => (
            <div key={sc.id} className="bg-[#F5F0E8]/60 rounded-lg p-3">
              <p className="text-xs font-semibold text-[#0B1F3A] flex items-center gap-1.5">
                <ClipboardCheck className="w-3.5 h-3.5 text-[#C9A84C]" />
                {sc.reviewerName ?? sc.reviewerEmail} · {sc.overallScore}/100 · {RECOMMENDATION_LABELS[sc.recommendation] ?? sc.recommendation}
              </p>
              <div className="grid sm:grid-cols-2 gap-x-4 mt-1.5">
                {sc.scores.map(s => (
                  <p key={s.key} className="text-[11px] text-gray-500">
                    {s.label}: <span className="font-semibold">{s.score}/5</span>{s.comment ? ` — ${s.comment}` : ''}
                  </p>
                ))}
              </div>
              {sc.comment && <p className="text-[11px] text-gray-500 mt-1 whitespace-pre-wrap">{sc.comment}</p>}
            </div>
          ))}

          {/* Scorecard form */}
          {iv.scorecardTemplate && iv.status !== 'cancelled' && scoring !== iv.id && (
            <button onClick={() => startScoring(iv)}
              className="text-[11px] font-semibold text-[#C9A84C] hover:underline">Fill in scorecard</button>
          )}
          {scoring === iv.id && iv.scorecardTemplate && (
            <div className="border-t border-gray-100 pt-3 space-y-2">
              {iv.scorecardTemplate.criteria.map(c => (
                <div key={c.key} className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-600 w-56">{c.label} <span className="text-gray-300">({c.weight}%)</span></span>
                  <div className="flex gap-1" role="radiogroup" aria-label={`Score for ${c.label}`}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setScoreDraft(d => ({ ...d, [c.key]: { ...d[c.key], score: n } }))}
                        aria-pressed={scoreDraft[c.key]?.score === n}
                        className={`w-7 h-7 rounded-lg text-xs font-bold ${scoreDraft[c.key]?.score === n ? 'bg-[#C9A84C] text-[#0B1F3A]' : 'bg-gray-100 text-gray-400'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <input value={scoreDraft[c.key]?.comment ?? ''} placeholder="Comment (optional)"
                    onChange={e => setScoreDraft(d => ({ ...d, [c.key]: { ...d[c.key], comment: e.target.value } }))}
                    className="flex-1 min-w-[140px] text-[11px] border border-gray-200 rounded-lg px-2 py-1" />
                </div>
              ))}
              <div className="flex items-center gap-2 flex-wrap">
                <select value={recommendation} onChange={e => setRecommendation(e.target.value)}
                  aria-label="Overall recommendation"
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
                  {Object.entries(RECOMMENDATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input value={scoreComment} onChange={e => setScoreComment(e.target.value)}
                  placeholder="Overall comment (optional)"
                  className="flex-1 min-w-[160px] text-xs border border-gray-200 rounded-lg px-2.5 py-1.5" />
                <button onClick={() => void submitScorecard(iv)} disabled={busy}
                  className="text-xs font-bold bg-[#0B1F3A] text-white px-3 py-1.5 rounded-lg disabled:opacity-40">Submit</button>
                <button onClick={() => setScoring(null)} className="text-xs text-gray-400 hover:underline">Discard</button>
              </div>
              <p className="text-[10px] text-gray-400">
                Scorecards rate job-relevant criteria only and inform — never replace — the human hiring decision.
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
