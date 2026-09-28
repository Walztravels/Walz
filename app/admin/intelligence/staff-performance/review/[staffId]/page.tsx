'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

interface EvidenceBundle {
  staff: {
    id: string; name: string; email: string; jobTitle: string; role: string
    department: string; branch: string; isActive: boolean; hireDate: string | null
    performanceReviewExempt: boolean; performanceReviewExemptReason: string | null
  }
  eligibility: { eligible: boolean; reasons: string[]; tenureUnknown: boolean }
  signal: string
  sales: {
    lastCompletedSaleAt: string | null; daysSinceLastSale: number | null
    salesLast30: number; salesLast90: number; salesLast120: number; salesCurrentYear: number
    revenueByCurrency: Record<string, number>; hasAnyBookingEver: boolean
  }
  activity: { quotesCreated: number; quotesAccepted: number; leadsAssigned: number }
  cases: Array<{
    id: string; status: string; openedAt: string; managementAction: string | null
    nextReviewDate: string | null
    documents: Array<{ id: string; warningType: string; status: string; createdAt: string; reviewDate: string; acknowledgedAt: string | null }>
  }>
  previousWarningsCount: number
  dataQualityNote: string | null
}

const SIGNAL_LABEL: Record<string, string> = {
  NONE: 'No signal',
  MONITOR_30: 'No completed sale for 30 days',
  MONITOR_60: 'No completed sale for 60 days',
  MONITOR_90: 'No completed sale for 90 days',
  REVIEW_RECOMMENDED_120: 'PERFORMANCE REVIEW RECOMMENDED',
}

const INPUT = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white'
const LABEL = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block'

function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

const WARNING_ACTIONS = ['PIP_STARTED', 'FIRST_WARNING_ISSUED', 'FINAL_WARNING_ISSUED'] as const
const SIMPLE_ACTIONS = ['NO_ACTION', 'MONITOR', 'COACHING_REQUIRED'] as const

export default function StaffPerformanceReviewPage() {
  const router = useRouter()
  const params = useParams<{ staffId: string }>()
  const staffId = params.staffId

  const [data, setData] = useState<EvidenceBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [notes, setNotes] = useState('')
  const [mitigating, setMitigating] = useState('')
  const [periodStart, setPeriodStart] = useState(isoDaysAgo(120))
  const [periodEnd, setPeriodEnd] = useState(isoDaysAgo(0))
  const [nextReviewDate, setNextReviewDate] = useState(isoDaysAgo(-30).slice(0, 10))

  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Warning-modal-only fields
  const [requiredImprovement, setRequiredImprovement] = useState('')
  const [pipDurationDays, setPipDurationDays] = useState(30)
  const [reviewDate, setReviewDate] = useState(isoDaysAgo(-30).slice(0, 10))
  const [additionalNotes, setAdditionalNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/performance/staff/${staffId}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Failed to load staff performance review.'); return }
      setData(json)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }, [staffId])

  useEffect(() => { load() }, [load])

  async function createCase(managementAction: string) {
    const res = await fetch('/api/admin/performance/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId,
        managementAction,
        reviewPeriodStart: periodStart,
        reviewPeriodEnd: periodEnd,
        notes,
        mitigatingCircumstances: mitigating,
        nextReviewDate: SIMPLE_ACTIONS.includes(managementAction as typeof SIMPLE_ACTIONS[number]) && managementAction === 'NO_ACTION' ? null : nextReviewDate,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error ?? 'Failed to record the management action.')
    return json.case as { id: string }
  }

  async function submitSimpleAction(action: string) {
    setSubmitting(true)
    setSubmitError('')
    try {
      await createCase(action)
      setPendingAction(null)
      await load()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to record the management action.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitWarningAction(action: string) {
    if (!requiredImprovement.trim()) { setSubmitError('Required improvement is mandatory.'); return }
    setSubmitting(true)
    setSubmitError('')
    try {
      const performanceCase = await createCase(action)
      const warningType = action === 'PIP_STARTED' ? 'PERFORMANCE_IMPROVEMENT_PLAN' : action === 'FINAL_WARNING_ISSUED' ? 'FINAL_WARNING' : 'FIRST_WRITTEN_WARNING'
      const docRes = await fetch(`/api/admin/performance/cases/${performanceCase.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warningType, requiredImprovement, pipDurationDays, reviewDate, additionalNotes }),
      })
      const docJson = await docRes.json().catch(() => ({}))
      if (!docRes.ok) throw new Error(docJson.error ?? 'Failed to generate the document.')
      router.push(`/admin/intelligence/staff-performance/document/${docJson.document.id}`)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to generate the document.')
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-12 text-center"><div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" /></div>
  if (error || !data) return <div className="p-8 text-center text-sm text-red-600">{error || 'Not found'}</div>

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <Link href="/admin/intelligence/staff-performance" className="text-xs text-gray-400 hover:text-gray-600">← Back to Performance Management</Link>
      <h1 className="text-2xl font-bold text-[#0B1F3A] mt-2 mb-1">STAFF PERFORMANCE REVIEW</h1>
      <p className="text-sm text-gray-500 mb-6">This is a management review screen. It presents a data signal only — the decision below is made by a human Super Admin.</p>

      {/* A. Staff details */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-5">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-3">A. Staff Details</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><div className={LABEL}>Name</div>{data.staff.name}</div>
          <div><div className={LABEL}>Role</div>{data.staff.jobTitle}</div>
          <div><div className={LABEL}>Department</div>{data.staff.department}</div>
          <div><div className={LABEL}>Status</div>{data.staff.isActive ? 'Active' : 'Inactive'}</div>
        </div>
        {!data.eligibility.eligible && (
          <div className="mt-3 text-xs bg-amber-50 border border-amber-100 text-amber-800 rounded-lg px-3 py-2">
            Not in the automatic queue: {data.eligibility.reasons.join('; ')}
          </div>
        )}
        {data.staff.performanceReviewExempt && (
          <div className="mt-2 text-xs bg-blue-50 border border-blue-100 text-blue-800 rounded-lg px-3 py-2">
            Marked exempt from performance review{data.staff.performanceReviewExemptReason ? `: ${data.staff.performanceReviewExemptReason}` : ''}
          </div>
        )}
      </section>

      {/* B. Performance period */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-5">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-3">B. Performance Period</h2>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div><div className={LABEL}>From</div><input type="date" className={INPUT} value={periodStart} onChange={e => setPeriodStart(e.target.value)} /></div>
          <div><div className={LABEL}>To</div><input type="date" className={INPUT} value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} /></div>
        </div>
      </section>

      {/* C. Sales/revenue evidence */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-5">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-3">C. Sales / Revenue Evidence</h2>
        {data.signal === 'REVIEW_RECOMMENDED_120' && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-100 text-red-800 text-xs font-bold inline-block">PERFORMANCE REVIEW RECOMMENDED</div>
        )}
        {data.dataQualityNote && (
          <div className="mb-3 text-xs bg-amber-50 border border-amber-100 text-amber-800 rounded-lg px-3 py-2">{data.dataQualityNote}</div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><div className={LABEL}>Last Completed Sale</div>{fmt(data.sales.lastCompletedSaleAt)}</div>
          <div><div className={LABEL}>Days Since</div>{data.sales.daysSinceLastSale ?? '—'}</div>
          <div><div className={LABEL}>Sales (30d)</div>{data.sales.salesLast30}</div>
          <div><div className={LABEL}>Sales (90d)</div>{data.sales.salesLast90}</div>
          <div><div className={LABEL}>Sales (120d)</div>{data.sales.salesLast120}</div>
          <div><div className={LABEL}>Sales (Current Year)</div>{data.sales.salesCurrentYear}</div>
          <div className="col-span-2"><div className={LABEL}>Revenue Generated (120d)</div>{Object.entries(data.sales.revenueByCurrency).map(([c, a]) => `${c} ${a.toLocaleString()}`).join(' · ') || '—'}</div>
        </div>
      </section>

      {/* D. Activity evidence */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-5">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-3">D. Activity Evidence</h2>
        <p className="text-xs text-gray-400 mb-3">
          Non-authoritative context only. Quote attribution in this codebase is matched by staff email and may
          undercount quotes logged under a staff ID instead — do not treat these figures as a complete record.
          The sales-eligibility signal above (section C) never uses this data.
        </p>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><div className={LABEL}>Quotes Created</div>{data.activity.quotesCreated}</div>
          <div><div className={LABEL}>Quotes Accepted</div>{data.activity.quotesAccepted}</div>
          <div><div className={LABEL}>Leads Assigned</div>{data.activity.leadsAssigned}</div>
        </div>
      </section>

      {/* E. Previous performance actions */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-5">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-3">E. Previous Performance Actions ({data.previousWarningsCount})</h2>
        {data.cases.length === 0 ? (
          <p className="text-sm text-gray-400">No previous performance cases on record.</p>
        ) : (
          <ul className="space-y-2">
            {data.cases.map((c) => (
              <li key={c.id} className="text-sm border border-gray-100 rounded-lg p-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-[#0B1F3A]">{c.status}</span>
                  <span className="text-xs text-gray-400">Opened {fmt(c.openedAt)}</span>
                </div>
                {c.documents.map((d) => (
                  <div key={d.id} className="text-xs text-gray-500 mt-1">
                    {d.warningType.replace(/_/g, ' ')} — {d.status} {d.acknowledgedAt ? `(acknowledged ${fmt(d.acknowledgedAt)})` : ''}{' '}
                    <Link href={`/admin/intelligence/staff-performance/document/${d.id}`} className="text-[#C9A84C] hover:underline">View</Link>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* F. Manager/Super Admin notes */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-5">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-3">F. Manager / Super Admin Notes</h2>
        <textarea className={INPUT} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes about this review..." />
      </section>

      {/* G. Mitigating circumstances */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-5">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-3">G. Mitigating Circumstances</h2>
        <textarea className={INPUT} rows={3} value={mitigating} onChange={e => setMitigating(e.target.value)} placeholder="Any circumstances that should be considered (leave, role change, data gaps, etc.)..." />
      </section>

      {/* H. Recommended management action */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-1">H. Recommended Management Action</h2>
        <p className="text-xs text-gray-400 mb-4">Jade never selects this. This decision is made only by a human Super Admin.</p>

        {submitError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{submitError}</p>}

        <div className="flex flex-wrap gap-2 mb-4">
          <button disabled={submitting} onClick={() => submitSimpleAction('NO_ACTION')} className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">No Action</button>
          <button disabled={submitting} onClick={() => submitSimpleAction('MONITOR')} className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">Monitor</button>
          <button disabled={submitting} onClick={() => submitSimpleAction('COACHING_REQUIRED')} className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">Coaching Required</button>
          <button disabled={submitting} onClick={() => setPendingAction('PIP_STARTED')} className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50">Start Performance Improvement Plan</button>
          <button disabled={submitting} onClick={() => setPendingAction('FIRST_WARNING_ISSUED')} className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-100 text-orange-800 hover:bg-orange-200 disabled:opacity-50">Generate First Written Warning</button>
          <button disabled={submitting} onClick={() => setPendingAction('FINAL_WARNING_ISSUED')} className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-100 text-red-800 hover:bg-red-200 disabled:opacity-50">Generate Final Warning</button>
        </div>

        {pendingAction && WARNING_ACTIONS.includes(pendingAction as typeof WARNING_ACTIONS[number]) && (
          <div className="border border-gray-200 rounded-xl p-5 mt-2 bg-gray-50/50">
            <h3 className="text-sm font-bold text-[#0B1F3A] mb-3">Generate Warning — {pendingAction.replace(/_/g, ' ')}</h3>
            <div className="space-y-3">
              <div>
                <div className={LABEL}>Required Improvement</div>
                <textarea className={INPUT} rows={3} value={requiredImprovement} onChange={e => setRequiredImprovement(e.target.value)} placeholder="What is required to meet the expected standard..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><div className={LABEL}>PIP Duration (days)</div><input type="number" min={1} className={INPUT} value={pipDurationDays} onChange={e => setPipDurationDays(Number(e.target.value))} /></div>
                <div><div className={LABEL}>Review Date</div><input type="date" className={INPUT} value={reviewDate} onChange={e => setReviewDate(e.target.value)} /></div>
              </div>
              <div>
                <div className={LABEL}>Additional Management Notes (optional)</div>
                <textarea className={INPUT} rows={2} value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} />
              </div>
              <div className="flex gap-2 pt-2">
                <button disabled={submitting} onClick={() => setPendingAction(null)} className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">Cancel</button>
                <button disabled={submitting} onClick={() => submitWarningAction(pendingAction)} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0B1F3A] text-white hover:bg-[#0d2345] disabled:opacity-50">
                  {submitting ? 'Generating…' : 'Generate Draft'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
