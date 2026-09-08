'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, ShieldCheck } from 'lucide-react'

interface ReportCandidate {
  id: string; email: string; firstName: string; lastName: string; createdAt: string
  applications: Array<{ reference: string; status: string; updatedAt: string; consentPrivacyVersion: string | null }>
}

export default function RecruitmentCompliancePage() {
  const [months,     setMonths]     = useState<number | null>(null)
  const [cutoff,     setCutoff]     = useState('')
  const [candidates, setCandidates] = useState<ReportCandidate[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [notice,     setNotice]     = useState('')
  const [busy,       setBusy]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/recruitment/compliance')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setMonths(data.retentionMonths)
      setCutoff(data.cutoff)
      setCandidates(data.candidates ?? [])
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function erase(c: ReportCandidate) {
    const typed = prompt(
      `This permanently erases ${c.firstName} ${c.lastName}'s personal data:\n` +
      `identity fields, CV files, notes, screening answers, AI records.\n` +
      `Anonymous application records (references, stages, dates) are kept for statistics.\n\n` +
      `This cannot be undone. Type ERASE to continue.`)
    if (typed !== 'ERASE') return
    setBusy(c.id); setError(''); setNotice('')
    const res  = await fetch('/api/admin/recruitment/compliance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'anonymize', candidateId: c.id, confirm: 'ERASE' }),
    })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) { setError(data.error ?? 'Erasure failed'); return }
    setNotice(`${c.firstName} ${c.lastName} anonymized (${data.erasedDocuments} document(s) removed).`)
    await load()
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'medium' })

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-gray-400 mb-1">
          <Link href="/admin/recruitment" className="hover:underline">Recruitment</Link> › Retention & Compliance
        </p>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Retention & Compliance</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          {months !== null ? `Closed applications are kept ${months} months` : 'Retention report'}
          {cutoff ? ` — this report lists candidates whose applications all closed before ${fmt(cutoff)}` : ''}.
          Nothing is deleted automatically; every erasure below is an explicit, audited staff action.
        </p>
      </div>

      {error  && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}
      {notice && <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-2.5">{notice}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" /></div>
      ) : candidates.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <ShieldCheck className="w-12 h-12 text-green-200 mx-auto mb-3" />
          <p className="text-gray-400">No candidates are past the retention window. Nothing to do.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map(c => (
            <div key={c.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Link href={`/admin/recruitment/candidates/${c.id}`}
                  className="font-bold text-[#0B1F3A] text-sm hover:underline">
                  {c.firstName} {c.lastName}
                </Link>
                <p className="text-xs text-gray-400 mt-0.5">
                  {c.email} · first seen {fmt(c.createdAt)} ·{' '}
                  {c.applications.map(a => `${a.reference} (${a.status}, closed ${fmt(a.updatedAt)})`).join(' · ')}
                </p>
              </div>
              <button onClick={() => void erase(c)} disabled={busy === c.id}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40">
                {busy === c.id ? 'Erasing…' : 'Erase personal data'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
