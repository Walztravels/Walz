'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface DocumentDetail {
  id: string
  caseId: string
  status: 'DRAFT' | 'APPROVED' | 'ISSUED' | 'ACKNOWLEDGED' | 'SUPERSEDED'
  warningType: string
  employeeNameSnapshot: string
  jobTitleSnapshot: string
  departmentSnapshot: string
  reviewDate: string
  draftContent: string
  requiredImprovement: string
  pipDurationDays: number | null
  additionalNotes: string | null
  deliveredAt: string | null
  acknowledgedAt: string | null
  emailDeliveryStatus: 'NOT_SENT' | 'QUEUED' | 'SENT' | 'FAILED'
  emailDeliveryError: string | null
}

const DELIVERY_LABEL: Record<DocumentDetail['emailDeliveryStatus'], string> = {
  NOT_SENT: 'EMAIL PENDING',
  QUEUED:   'EMAIL PENDING',
  SENT:     'EMAIL SENT',
  FAILED:   'EMAIL FAILED',
}
const DELIVERY_STYLE: Record<DocumentDetail['emailDeliveryStatus'], string> = {
  NOT_SENT: 'bg-amber-100 text-amber-800',
  QUEUED:   'bg-amber-100 text-amber-800',
  SENT:     'bg-green-100 text-green-800',
  FAILED:   'bg-red-100 text-red-800',
}

const JADE_ACTIONS: { key: string; label: string }[] = [
  { key: 'REWRITE_PROFESSIONALLY', label: 'Rewrite Professionally' },
  { key: 'MAKE_CONCISE', label: 'Make More Concise' },
  { key: 'CREATE_IMPROVEMENT_PLAN', label: 'Create Improvement Plan' },
  { key: 'SUMMARIZE_EVIDENCE', label: 'Summarize Performance Evidence' },
]

function fmt(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default function PerformanceDocumentPage() {
  const params = useParams<{ docId: string }>()
  const docId = params.docId

  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [staffEmail, setStaffEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [draftText, setDraftText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveNote, setSaveNote] = useState('')

  const [jadeBusy, setJadeBusy] = useState<string | null>(null)
  const [jadeSuggestion, setJadeSuggestion] = useState<{ action: string; text: string; factsCheckOk: boolean; missing: string[] } | null>(null)
  const [jadeError, setJadeError] = useState('')

  const [showConfirm, setShowConfirm] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [issueError, setIssueError] = useState('')

  const [retrying, setRetrying] = useState(false)
  const [retryNote, setRetryNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/performance/documents/${docId}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Failed to load document.'); return }
      setDoc(json.document)
      setStaffEmail(json.staffEmail)
      setDraftText(json.document.draftContent)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }, [docId])

  useEffect(() => { load() }, [load])

  async function saveDraft() {
    setSaving(true)
    setSaveNote('')
    try {
      const res = await fetch(`/api/admin/performance/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftContent: draftText }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setSaveNote(json.error ?? 'Failed to save.'); return }
      setSaveNote('Draft saved.')
      setDoc(json.document)
    } catch {
      setSaveNote('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function runJade(action: string) {
    setJadeBusy(action)
    setJadeError('')
    setJadeSuggestion(null)
    try {
      const res = await fetch(`/api/admin/performance/documents/${docId}/jade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setJadeError(json.error ?? 'Jade failed to respond.'); return }
      setJadeSuggestion({ action, text: json.text, factsCheckOk: json.factsCheck?.ok ?? true, missing: json.factsCheck?.missing ?? [] })
    } catch {
      setJadeError('Network error — please try again.')
    } finally {
      setJadeBusy(null)
    }
  }

  function acceptJadeSuggestion() {
    if (!jadeSuggestion) return
    setDraftText(jadeSuggestion.text)
    setJadeSuggestion(null)
  }

  async function approveAndIssue() {
    setIssuing(true)
    setIssueError('')
    try {
      // Save any pending edits first, so what is issued matches what was reviewed.
      const saveRes = await fetch(`/api/admin/performance/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftContent: draftText }),
      })
      if (!saveRes.ok) {
        const j = await saveRes.json().catch(() => ({}))
        throw new Error(j.error ?? 'Failed to save the final draft before issuing.')
      }
      const res = await fetch(`/api/admin/performance/documents/${docId}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Failed to issue the document.')
      setShowConfirm(false)
      // Issuance itself succeeded (res.ok) regardless of json.delivery —
      // the document is now ISSUED and immutable either way. The delivery
      // state is read back via load() and surfaced in its own banner
      // below, never folded into issueError (which is reserved for
      // issuance failing outright).
      await load()
    } catch (e) {
      setIssueError(e instanceof Error ? e.message : 'Failed to issue the document.')
    } finally {
      setIssuing(false)
    }
  }

  async function retryEmail() {
    setRetrying(true)
    setRetryNote('')
    try {
      const res = await fetch(`/api/admin/performance/documents/${docId}/resend-email`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setRetryNote(json.error ?? 'Failed to retry.'); return }
      setRetryNote(
        json.delivery?.status === 'SENT'
          ? (json.noop ? 'Email was already sent — nothing to retry.' : 'Email sent successfully.')
          : `Retry failed: ${json.delivery?.error ?? 'unknown error'}`,
      )
      await load()
    } catch {
      setRetryNote('Network error — please try again.')
    } finally {
      setRetrying(false)
    }
  }

  if (loading) return <div className="p-12 text-center"><div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" /></div>
  if (error || !doc) return <div className="p-8 text-center text-sm text-red-600">{error || 'Not found'}</div>

  const isDraft = doc.status === 'DRAFT'
  const isIssued = doc.status === 'ISSUED' || doc.status === 'ACKNOWLEDGED'

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <Link href={`/admin/intelligence/staff-performance`} className="text-xs text-gray-400 hover:text-gray-600">← Back to Performance Management</Link>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-2xl font-bold text-[#0B1F3A]">{doc.warningType.replace(/_/g, ' ')}</h1>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${isIssued ? 'bg-green-100 text-green-800' : doc.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>{doc.status}</span>
          {isIssued && (
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${DELIVERY_STYLE[doc.emailDeliveryStatus]}`}>
              {DELIVERY_LABEL[doc.emailDeliveryStatus]}
            </span>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-6">{doc.employeeNameSnapshot} — {doc.jobTitleSnapshot}, {doc.departmentSnapshot} · Review date {fmt(doc.reviewDate)}</p>

      {isIssued && doc.emailDeliveryStatus === 'FAILED' && (
        <div className="mb-5 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3">
          <p className="text-sm font-bold mb-1">Warning issued successfully, but email delivery failed.</p>
          <p className="text-xs text-red-700 mb-2">The notice is issued and the employee can still access it via My Performance Notices — only the email notification did not go through.</p>
          <div className="flex items-center gap-2">
            <button disabled={retrying} onClick={retryEmail} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
              {retrying ? 'Retrying…' : 'Retry Email'}
            </button>
            {retryNote && <span className="text-xs text-red-700">{retryNote}</span>}
          </div>
        </div>
      )}

      {isIssued && (doc.emailDeliveryStatus === 'NOT_SENT' || doc.emailDeliveryStatus === 'QUEUED') && (
        <div className="mb-5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3">
          <p className="text-sm font-bold mb-1">Warning issued — email delivery still pending.</p>
          <div className="flex items-center gap-2">
            <button disabled={retrying} onClick={retryEmail} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
              {retrying ? 'Retrying…' : 'Retry Email'}
            </button>
            {retryNote && <span className="text-xs text-amber-700">{retryNote}</span>}
          </div>
        </div>
      )}

      {isIssued && doc.emailDeliveryStatus === 'SENT' && (
        <div className="mb-5 text-xs bg-green-50 border border-green-100 text-green-800 rounded-lg px-3 py-2">
          This document was issued and is now immutable. Notification email delivered. {doc.acknowledgedAt ? `Acknowledged by the employee on ${fmt(doc.acknowledgedAt)}.` : 'Not yet acknowledged by the employee.'}
        </div>
      )}

      {isDraft && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-5">
          <h2 className="text-sm font-bold text-[#0B1F3A] mb-3">Jade Assistance</h2>
          <p className="text-xs text-gray-400 mb-3">Jade may draft, rewrite, or summarize text. Protected facts (dates, sales figures, identity) are supplied separately and cannot be changed by Jade. Jade never sends, approves, or selects a disciplinary outcome.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {JADE_ACTIONS.map((a) => (
              <button key={a.key} disabled={jadeBusy !== null} onClick={() => runJade(a.key)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
                {jadeBusy === a.key ? 'Working…' : a.label}
              </button>
            ))}
          </div>
          {jadeError && <p className="text-xs text-red-600 mb-2">{jadeError}</p>}
          {jadeSuggestion && (
            <div className="border border-indigo-100 bg-indigo-50/50 rounded-lg p-3 mt-2">
              <p className="text-xs font-semibold text-indigo-800 mb-1">Jade suggestion ({jadeSuggestion.action.replace(/_/g, ' ').toLowerCase()})</p>
              {!jadeSuggestion.factsCheckOk && (
                <p className="text-xs text-amber-700 mb-1">Note: this suggestion may be missing: {jadeSuggestion.missing.join(', ')}. Review carefully before accepting.</p>
              )}
              <pre className="text-xs whitespace-pre-wrap text-gray-700 mb-2">{jadeSuggestion.text}</pre>
              <div className="flex gap-2">
                <button onClick={acceptJadeSuggestion} className="px-3 py-1 text-xs font-semibold rounded-lg bg-[#0B1F3A] text-white">Accept into draft</button>
                <button onClick={() => setJadeSuggestion(null)} className="px-3 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600">Discard</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-5">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-3">Letter Content</h2>
        {isDraft ? (
          <textarea className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-[#C9A84C] font-mono" rows={18} value={draftText} onChange={e => setDraftText(e.target.value)} />
        ) : (
          <pre className="text-sm whitespace-pre-wrap text-gray-700">{doc.draftContent}</pre>
        )}
        {saveNote && <p className="text-xs text-gray-500 mt-2">{saveNote}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={`/api/admin/performance/documents/${docId}/pdf`} target="_blank" rel="noreferrer" className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Preview PDF</a>
        <a href={`/api/admin/performance/documents/${docId}/pdf`} download={`performance-notice-${docId}.pdf`} className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Download PDF</a>
        {isDraft && (
          <>
            <button disabled={saving} onClick={saveDraft} className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">{saving ? 'Saving…' : 'Save Draft'}</button>
            <button onClick={() => setShowConfirm(true)} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0B1F3A] text-white hover:bg-[#0d2345]">Approve &amp; Issue</button>
          </>
        )}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-[#0B1F3A] mb-3">Confirm Issue</h3>
            <p className="text-sm text-gray-700 mb-3">You are about to issue a formal performance warning to:</p>
            <div className="bg-gray-50 rounded-lg p-3 text-sm mb-4 space-y-1">
              <div><span className="text-gray-400">Employee:</span> <strong>{doc.employeeNameSnapshot}</strong></div>
              <div><span className="text-gray-400">Email:</span> <strong>{staffEmail ?? 'unknown'}</strong></div>
              <div><span className="text-gray-400">Warning:</span> <strong>{doc.warningType.replace(/_/g, ' ')}</strong></div>
              <div><span className="text-gray-400">Review Date:</span> <strong>{fmt(doc.reviewDate)}</strong></div>
            </div>
            {issueError && <p className="text-xs text-red-600 mb-2">{issueError}</p>}
            <div className="flex gap-2 justify-end">
              <button disabled={issuing} onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">Cancel</button>
              <button disabled={issuing} onClick={approveAndIssue} className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{issuing ? 'Sending…' : 'Approve & Send'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
