'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Send, CheckCircle, AlertCircle, X, ChevronDown, ClipboardList } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface StaffReport {
  id: string
  staffName: string; staffEmail: string; staffRole: string | null
  reportType: string
  periodFrom: string; periodTo: string
  summary: string | null
  clientsContacted: number; followUps: number; depositsCollected: number; applicationsSubmitted: number
  visaReceived: number; visaSubmitted: number; approvals: number; refusals: number; pendingApplications: number
  flightBookings: number; hotelBookings: number; tourBookings: number
  totalRevenue: number; revenueCurrency: string
  issuesChallenges: string | null; nextPeriodGoals: string | null; additionalNotes: string | null
  reviewedByAdmin: boolean; reviewedAt: string | null; reviewedBy: string | null
  createdAt: string
}

const REPORT_TYPES = [
  'Daily Activity Report', 'Weekly Summary Report', 'Monthly Performance Report',
  'Client Feedback Report', 'Issue or Complaint Report', 'Custom Report',
]

const TYPE_COLOURS: Record<string, string> = {
  'Daily Activity Report':      'bg-blue-50 text-blue-700',
  'Weekly Summary Report':      'bg-violet-50 text-violet-700',
  'Monthly Performance Report': 'bg-indigo-50 text-indigo-700',
  'Client Feedback Report':     'bg-teal-50 text-teal-700',
  'Issue or Complaint Report':  'bg-red-50 text-red-700',
  'Custom Report':              'bg-gray-100 text-gray-600',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })

const fmtFull = (d: string) =>
  new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// ── Sub-components ────────────────────────────────────────────────────────────
const INPUT = 'w-full px-3 h-10 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white transition-colors'
const TA    = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white resize-none transition-colors leading-relaxed'

function NumInput({ label, name, value, onChange }: { label: string; name: string; value: number; onChange: (n: string, v: number) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type="number" min="0" value={value}
        onChange={e => onChange(name, parseInt(e.target.value) || 0)}
        className={`${INPUT} text-center`} />
    </div>
  )
}

function SectionHead({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
      <h3 className="text-xs font-bold text-[#0B1F3A] uppercase tracking-wider">{label}</h3>
    </div>
  )
}

// ── View Modal ────────────────────────────────────────────────────────────────
function ViewModal({ report, onClose }: { report: StaffReport; onClose: () => void }) {
  const row = (label: string, val: string | number) => (
    <div key={label} className="flex justify-between py-1.5 border-b border-gray-50">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-semibold text-[#0B1F3A]">{val}</span>
    </div>
  )
  const block = (label: string, val: string | null) => val ? (
    <div key={label} className="mb-4">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{val}</p>
    </div>
  ) : null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between rounded-t-2xl z-10">
          <div>
            <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_COLOURS[report.reportType] ?? 'bg-gray-100 text-gray-600'}`}>
              {report.reportType}
            </span>
            <p className="text-sm font-bold text-[#0B1F3A] mt-1">{report.staffName}</p>
            <p className="text-xs text-gray-400">{fmtFull(report.createdAt)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors mt-1">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4">
            {row('Period', `${fmtDate(report.periodFrom)} — ${fmtDate(report.periodTo)}`)}
            {row('Role', report.staffRole ?? '—')}
            {row('Status', report.reviewedByAdmin ? `Reviewed by ${report.reviewedBy} on ${fmtDate(report.reviewedAt!)}` : 'Pending Review')}
          </div>
          {block('Summary', report.summary)}
          <div>
            <SectionHead label="Client Activity" />
            <div className="grid grid-cols-2 gap-2">
              {row('Clients Contacted', report.clientsContacted)}
              {row('Follow Ups', report.followUps)}
              {row('Deposits Collected', report.depositsCollected)}
              {row('Applications Submitted', report.applicationsSubmitted)}
            </div>
          </div>
          <div>
            <SectionHead label="Visa Applications" />
            <div className="grid grid-cols-2 gap-2">
              {row('Received', report.visaReceived)}
              {row('Submitted to Embassy', report.visaSubmitted)}
              {row('Approvals', report.approvals)}
              {row('Refusals', report.refusals)}
              {row('Pending', report.pendingApplications)}
            </div>
          </div>
          <div>
            <SectionHead label="Bookings" />
            <div className="grid grid-cols-2 gap-2">
              {row('Flights', report.flightBookings)}
              {row('Hotels', report.hotelBookings)}
              {row('Tours', report.tourBookings)}
              {row('Total Revenue', `${report.revenueCurrency} ${report.totalRevenue.toLocaleString()}`)}
            </div>
          </div>
          {block('Issues & Challenges', report.issuesChallenges)}
          {block('Goals for Next Period', report.nextPeriodGoals)}
          {block('Additional Notes', report.additionalNotes)}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  reportType: 'Daily Activity Report',
  periodFrom: new Date().toISOString().slice(0, 10),
  periodTo:   new Date().toISOString().slice(0, 10),
  summary: '', issuesChallenges: '', nextPeriodGoals: '', additionalNotes: '',
  clientsContacted: 0, followUps: 0, depositsCollected: 0, applicationsSubmitted: 0,
  visaReceived: 0, visaSubmitted: 0, approvals: 0, refusals: 0, pendingApplications: 0,
  flightBookings: 0, hotelBookings: 0, tourBookings: 0,
  totalRevenue: 0, revenueCurrency: 'USD',
}

export default function MyReportsPage() {
  const [form, setForm]       = useState({ ...EMPTY_FORM })
  const [submitting, setSub]  = useState(false)
  const [toast, setToast]     = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [reports, setReports] = useState<StaffReport[]>([])
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState<StaffReport | null>(null)
  const [formOpen, setFormOpen] = useState(true)

  const loadReports = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/reports?ownOnly=true&limit=50')
    const d   = await res.json()
    setReports(d.reports ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadReports() }, [loadReports])

  function setField(name: string, value: string | number) {
    setForm(f => ({ ...f, [name]: value }))
  }

  async function submit() {
    if (!form.summary.trim()) {
      setToast({ type: 'error', msg: 'Please write a summary of what you accomplished this period.' })
      return
    }
    setSub(true)
    try {
      const res = await fetch('/api/admin/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) { setToast({ type: 'error', msg: d.error ?? 'Submission failed' }); return }
      setToast({ type: 'success', msg: 'Report submitted successfully. Your manager has been notified.' })
      setForm({ ...EMPTY_FORM })
      setFormOpen(false)
      loadReports()
    } finally {
      setSub(false)
      setTimeout(() => setToast(null), 5000)
    }
  }

  const canSubmit = form.summary.trim().length >= 20

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-start gap-3 px-5 py-3.5 rounded-xl shadow-lg border max-w-sm ${
          toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <p className="text-sm font-medium flex-1">{toast.msg}</p>
          <button onClick={() => setToast(null)} className="flex-shrink-0"><X className="w-4 h-4 opacity-60" /></button>
        </div>
      )}

      {/* ── Submit Form ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setFormOpen(f => !f)}
          className="w-full flex items-center justify-between px-6 py-4 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center">
              <Send className="w-4 h-4 text-[#C9A84C]" />
            </div>
            <h2 className="text-base font-bold text-[#0B1F3A]">Submit Report</h2>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${formOpen ? 'rotate-180' : ''}`} />
        </button>

        {formOpen && (
          <div className="border-t border-gray-100 px-6 py-5 space-y-5">

            {/* Row 1 — type + dates */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Report Type <span className="text-red-400">*</span></label>
                <select value={form.reportType} onChange={e => setField('reportType', e.target.value)} className={INPUT}>
                  {REPORT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Period From <span className="text-red-400">*</span></label>
                <input type="date" value={form.periodFrom} onChange={e => setField('periodFrom', e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Period To <span className="text-red-400">*</span></label>
                <input type="date" value={form.periodTo} onChange={e => setField('periodTo', e.target.value)} className={INPUT} />
              </div>
            </div>

            {/* Summary */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                What did you accomplish this period? <span className="text-red-400">*</span>
              </label>
              <textarea rows={4} value={form.summary}
                onChange={e => setField('summary', e.target.value)}
                placeholder="Describe your main activities and achievements..."
                className={TA} />
              <p className="text-xs text-gray-400 mt-1">{form.summary.length} chars (min 20)</p>
            </div>

            {/* Client Activity */}
            <div>
              <SectionHead label="Client Activity" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <NumInput label="New Clients Contacted" name="clientsContacted" value={form.clientsContacted} onChange={setField} />
                <NumInput label="Follow Ups Completed"  name="followUps"         value={form.followUps}         onChange={setField} />
                <NumInput label="Deposits Collected"    name="depositsCollected" value={form.depositsCollected} onChange={setField} />
                <NumInput label="Applications Submitted" name="applicationsSubmitted" value={form.applicationsSubmitted} onChange={setField} />
              </div>
            </div>

            {/* Visa */}
            <div>
              <SectionHead label="Visa Applications" />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <NumInput label="Received"            name="visaReceived"        value={form.visaReceived}        onChange={setField} />
                <NumInput label="Submitted to Embassy" name="visaSubmitted"      value={form.visaSubmitted}      onChange={setField} />
                <NumInput label="Approvals"           name="approvals"           value={form.approvals}           onChange={setField} />
                <NumInput label="Refusals"            name="refusals"            value={form.refusals}            onChange={setField} />
                <NumInput label="Currently Pending"   name="pendingApplications" value={form.pendingApplications} onChange={setField} />
              </div>
            </div>

            {/* Bookings */}
            <div>
              <SectionHead label="Bookings Processed" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <NumInput label="Flight Bookings" name="flightBookings" value={form.flightBookings} onChange={setField} />
                <NumInput label="Hotel Bookings"  name="hotelBookings"  value={form.hotelBookings}  onChange={setField} />
                <NumInput label="Tour Bookings"   name="tourBookings"   value={form.tourBookings}   onChange={setField} />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Total Revenue</label>
                  <div className="flex gap-1.5">
                    <select value={form.revenueCurrency} onChange={e => setField('revenueCurrency', e.target.value)}
                      className="h-10 w-20 px-2 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#C9A84C] bg-white flex-shrink-0">
                      {['USD','GBP','CAD','NGN'].map(c => <option key={c}>{c}</option>)}
                    </select>
                    <input type="number" min="0" step="0.01" value={form.totalRevenue}
                      onChange={e => setField('totalRevenue', parseFloat(e.target.value) || 0)}
                      className={`${INPUT} flex-1`} />
                  </div>
                </div>
              </div>
            </div>

            {/* Issues */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Any issues, challenges or complaints this period?
              </label>
              <textarea rows={3} value={form.issuesChallenges}
                onChange={e => setField('issuesChallenges', e.target.value)}
                placeholder="Describe any problems encountered, client complaints or system issues..."
                className={TA} />
            </div>

            {/* Goals */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                What are your goals for the next period?
              </label>
              <textarea rows={3} value={form.nextPeriodGoals}
                onChange={e => setField('nextPeriodGoals', e.target.value)}
                placeholder="List your targets and focus areas for the coming days..."
                className={TA} />
            </div>

            {/* Additional notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Anything else to report?</label>
              <textarea rows={2} value={form.additionalNotes}
                onChange={e => setField('additionalNotes', e.target.value)}
                placeholder="Any additional information..."
                className={TA} />
            </div>

            <button onClick={submit} disabled={submitting || !canSubmit}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><Send className="w-4 h-4" /> Submit Report</>}
            </button>
          </div>
        )}
      </div>

      {/* ── History ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center">
            <ClipboardList className="w-4 h-4 text-[#C9A84C]" />
          </div>
          <h2 className="text-base font-bold text-[#0B1F3A]">My Previous Reports</h2>
          {!loading && <span className="text-xs text-gray-400 ml-auto">{reports.length} report{reports.length !== 1 ? 's' : ''}</span>}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-[#C9A84C] animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-14">
            <ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium text-sm">No reports submitted yet</p>
            <p className="text-gray-300 text-xs mt-1">Submit your first report above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['Date Submitted', 'Report Type', 'Period', 'Key Numbers', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLOURS[r.reportType] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.reportType.replace(' Report', '').replace(' Summary', '')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {fmtDate(r.periodFrom)} — {fmtDate(r.periodTo)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {r.clientsContacted} clients · {r.applicationsSubmitted} apps · {r.revenueCurrency} {r.totalRevenue.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {r.reviewedByAdmin
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> Reviewed</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewing(r)}
                        className="text-xs text-[#C9A84C] font-semibold hover:underline">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && <ViewModal report={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
