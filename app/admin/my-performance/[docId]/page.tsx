'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface NoticeDetail {
  id: string
  warningType: string
  status: string
  reviewDate: string
  content: string
  deliveredAt: string | null
  openedAt: string | null
  acknowledgedAt: string | null
  acknowledgementText: string | null
  employeeResponse: string | null
  employeeResponseAt: string | null
}

function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default function MyPerformanceNoticeDetail() {
  const params = useParams<{ docId: string }>()
  const docId = params.docId

  const [notice, setNotice] = useState<NoticeDetail | null>(null)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [acking, setAcking] = useState(false)
  const [response, setResponse] = useState('')
  const [sendingResponse, setSendingResponse] = useState(false)
  const [responseNote, setResponseNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/performance/my-notices/${docId}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Notice not found.'); return }
      setNotice(json.document)
      setPrompt(json.acknowledgementPromptText)
      setResponse(json.document.employeeResponse ?? '')
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }, [docId])

  useEffect(() => { load() }, [load])

  async function acknowledge() {
    setAcking(true)
    try {
      const res = await fetch(`/api/admin/performance/my-notices/${docId}/acknowledge`, { method: 'POST' })
      if (res.ok) await load()
    } finally {
      setAcking(false)
    }
  }

  async function submitResponse() {
    if (!response.trim()) return
    setSendingResponse(true)
    setResponseNote('')
    try {
      const res = await fetch(`/api/admin/performance/my-notices/${docId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setResponseNote(json.error ?? 'Failed to submit your response.'); return }
      setResponseNote('Your response has been recorded.')
      await load()
    } catch {
      setResponseNote('Network error — please try again.')
    } finally {
      setSendingResponse(false)
    }
  }

  if (loading) return <div className="p-12 text-center"><div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" /></div>
  if (error || !notice) return <div className="p-8 text-center text-sm text-red-600">{error || 'Not found'}</div>

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <Link href="/admin/my-performance" className="text-xs text-gray-400 hover:text-gray-600">← My Performance Notices</Link>
      <h1 className="text-2xl font-bold text-[#0B1F3A] mt-2 mb-1">{notice.warningType.replace(/_/g, ' ')}</h1>
      <p className="text-sm text-gray-500 mb-6">Review date: {fmt(notice.reviewDate)}</p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-5">
        <pre className="text-sm whitespace-pre-wrap text-gray-700 font-sans">{notice.content}</pre>
      </div>

      <div className="flex gap-2 mb-5">
        <a href={`/api/admin/performance/documents/${docId}/pdf`} target="_blank" rel="noreferrer" className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">View PDF</a>
        <a href={`/api/admin/performance/documents/${docId}/pdf`} download={`performance-notice-${docId}.pdf`} className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Download PDF</a>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-5">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-2">Acknowledgement</h2>
        <p className="text-xs text-gray-500 mb-3">Acknowledging only confirms you have received and reviewed this notice. It does not mean you agree with it.</p>
        {notice.acknowledgedAt ? (
          <p className="text-sm text-green-700">{notice.acknowledgementText} (acknowledged {fmt(notice.acknowledgedAt)})</p>
        ) : (
          <button disabled={acking} onClick={acknowledge} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0B1F3A] text-white hover:bg-[#0d2345] disabled:opacity-50">
            {acking ? 'Submitting…' : prompt}
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-2">Your Response (optional)</h2>
        <p className="text-xs text-gray-500 mb-3">If you believe any information is inaccurate, or there are circumstances management should consider, you can add a written response here.</p>
        <textarea className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-[#C9A84C]" rows={4} value={response} onChange={e => setResponse(e.target.value)} maxLength={4000} />
        {responseNote && <p className="text-xs text-gray-500 mt-2">{responseNote}</p>}
        <button disabled={sendingResponse || !response.trim()} onClick={submitResponse} className="mt-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
          {sendingResponse ? 'Submitting…' : 'Submit Response'}
        </button>
        {notice.employeeResponseAt && <p className="text-xs text-gray-400 mt-2">Last submitted {fmt(notice.employeeResponseAt)}</p>}
      </div>
    </div>
  )
}
