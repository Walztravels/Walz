'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Search, Filter, Download, CheckCircle, X, ChevronLeft, ChevronRight,
  TrendingUp, AlertCircle, ClipboardList, Users,
} from 'lucide-react'

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

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })

const fmtFull = (d: string) =>
  new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// ── View / Review Modal ───────────────────────────────────────────────────────
function ReviewModal({ report, onClose, onReviewed }: {
  report: StaffReport; onClose: () => void; onReviewed: (id: string) => void
}) {
  const [marking, setMarking] = useState(false)
  const [comment, setComment] = useState('')

  async function markReviewed() {
    setMarking(true)
    await fetch('/api/admin/reports', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: report.id, adminComment: comment || undefined }),
    })
    onReviewed(report.id)
    onClose()
  }

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
            <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_COLOURS[report.reportType] ?? 'bg-gray-100'}`}>
              {report.reportType}
            </span>
            <p className="text-sm font-bold text-[#0B1F3A] mt-1">{report.staffName} <span className="text-gray-400 font-normal">· {report.staffRole}</span></p>
            <p className="text-xs text-gray-400">{fmtFull(report.createdAt)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4">
            {row('Period', `${fmtDate(report.periodFrom)} — ${fmtDate(report.periodTo)}`)}
            {row('Status', report.reviewedByAdmin ? `Reviewed by ${report.reviewedBy}` : 'Pending Review')}
          </div>

          {block('Summary', report.summary)}

          <div className="grid grid-cols-2 gap-1">
            <div><p className="text-xs font-bold text-gray-500 uppercase mb-1">Client Activity</p>
              {row('Clients Contacted', report.clientsContacted)}
              {row('Follow Ups', report.followUps)}
              {row('Deposits', report.depositsCollected)}
              {row('Apps Submitted', report.applicationsSubmitted)}
            </div>
            <div><p className="text-xs font-bold text-gray-500 uppercase mb-1">Visa</p>
              {row('Received', report.visaReceived)}
              {row('Submitted', report.visaSubmitted)}
              {row('Approvals', report.approvals)}
              {row('Refusals', report.refusals)}
              {row('Pending', report.pendingApplications)}
            </div>
          </div>

          <div><p className="text-xs font-bold text-gray-500 uppercase mb-1">Bookings</p>
            <div className="grid grid-cols-2 gap-1">
              {row('Flights', report.flightBookings)}
              {row('Hotels', report.hotelBookings)}
              {row('Tours', report.tourBookings)}
              {row('Revenue', `${report.revenueCurrency} ${report.totalRevenue.toLocaleString()}`)}
            </div>
          </div>

          {block('Issues & Challenges', report.issuesChallenges)}
          {block('Goals for Next Period', report.nextPeriodGoals)}
          {block('Additional Notes', report.additionalNotes)}

          {!report.reviewedByAdmin && (
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700">Admin Comment (optional)</p>
              <textarea rows={3} value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Add a note before marking as reviewed..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none bg-white" />
              <button onClick={markReviewed} disabled={marking}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm rounded-xl hover:bg-[#b8943d] transition-colors disabled:opacity-60">
                {marking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Mark as Reviewed
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const LIMIT = 25

export default function AllReportsPage() {
  const [reports, setReports]     = useState<StaffReport[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [accessDenied, setDenied] = useState(false)
  const [viewing, setViewing]     = useState<StaffReport | null>(null)
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [bulkMarking, setBulk]    = useState(false)
  const [showFilters, setShowF]   = useState(false)

  const [staffFilter, setStaff]    = useState('')
  const [typeFilter, setType]      = useState('')
  const [dateFrom, setDateFrom]    = useState('')
  const [dateTo, setDateTo]        = useState('')
  const [reviewFilter, setReview]  = useState('')
  const [search, setSearch]        = useState('')

  const totalPages = Math.ceil(total / LIMIT)

  const load = useCallback(async (pg = page) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) })
    if (staffFilter)   params.set('staffEmail', staffFilter)
    if (typeFilter)    params.set('type', typeFilter)
    if (dateFrom)      params.set('dateFrom', dateFrom)
    if (dateTo)        params.set('dateTo', dateTo)
    if (reviewFilter)  params.set('reviewed', reviewFilter)

    const res = await fetch(`/api/admin/reports?${params}`)
    if (res.status === 401) { setDenied(true); setLoading(false); return }
    const d = await res.json()
    setReports(d.reports ?? [])
    setTotal(d.total ?? 0)
    setLoading(false)
  }, [page, staffFilter, typeFilter, dateFrom, dateTo, reviewFilter])

  useEffect(() => { load(1); setPage(1) }, [staffFilter, typeFilter, dateFrom, dateTo, reviewFilter]) // eslint-disable-line
  useEffect(() => { load(page) }, [page]) // eslint-disable-line

  function handleReviewed(id: string) {
    setReports(rs => rs.map(r => r.id === id ? { ...r, reviewedByAdmin: true, reviewedAt: new Date().toISOString() } : r))
  }

  async function bulkReview() {
    setBulk(true)
    await Promise.all(
      Array.from(selected).map(id =>
        fetch('/api/admin/reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      )
    )
    setReports(rs => rs.map(r => selected.has(r.id) ? { ...r, reviewedByAdmin: true } : r))
    setSelected(new Set())
    setBulk(false)
  }

  function exportCSV() {
    const rows = [
      ['Staff', 'Role', 'Type', 'Period From', 'Period To', 'Clients', 'Apps', 'Revenue', 'Status', 'Submitted'].join(','),
      ...reports.map(r => [
        r.staffName, r.staffRole ?? '', r.reportType,
        fmtDate(r.periodFrom), fmtDate(r.periodTo),
        r.clientsContacted, r.applicationsSubmitted,
        `${r.revenueCurrency} ${r.totalRevenue}`,
        r.reviewedByAdmin ? 'Reviewed' : 'Pending',
        fmtDate(r.createdAt),
      ].map(v => `"${v}"`).join(',')),
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `staff-reports-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // Stats
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonth = reports.filter(r => new Date(r.createdAt) >= thisMonthStart)
  const pending = reports.filter(r => !r.reviewedByAdmin)

  const staffCounts: Record<string, number> = {}
  for (const r of reports) staffCounts[r.staffName] = (staffCounts[r.staffName] ?? 0) + 1
  const topReporter = Object.entries(staffCounts).sort((a, b) => b[1] - a[1])[0]

  const uniqueStaff = Array.from(new Set(reports.map(r => r.staffEmail + '|' + r.staffName)))

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-gray-600 font-semibold">You do not have permission to view all staff reports.</p>
        <a href="/admin/reports" className="text-sm text-[#C9A84C] hover:underline">← Go to My Reports</a>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Reports This Month', value: thisMonth.length, icon: TrendingUp, col: 'bg-[#0B1F3A]' },
          { label: 'Pending Review', value: pending.length, icon: AlertCircle, col: pending.length > 5 ? 'bg-red-500' : 'bg-amber-500' },
          { label: 'Total Reports', value: total, icon: ClipboardList, col: 'bg-violet-500' },
          { label: 'Most Active', value: topReporter ? topReporter[0].split(' ')[0] : '—', icon: Users, col: 'bg-emerald-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.col}`}>
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold text-[#0B1F3A]">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <form onSubmit={e => { e.preventDefault(); load(1) }} className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by staff or content…"
            className="w-full pl-10 pr-4 h-10 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white" />
        </form>

        <button onClick={() => setShowF(f => !f)}
          className={`flex items-center gap-2 h-10 px-4 border rounded-xl text-sm font-medium transition-colors ${showFilters ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]' : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'}`}>
          <Filter className="w-4 h-4" /> Filters
        </button>

        {selected.size > 0 && (
          <button onClick={bulkReview} disabled={bulkMarking}
            className="flex items-center gap-2 h-10 px-4 bg-green-500 text-white font-semibold text-sm rounded-xl hover:bg-green-600 transition-colors disabled:opacity-60">
            {bulkMarking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Mark {selected.size} Reviewed
          </button>
        )}

        <button onClick={exportCSV} className="flex items-center gap-2 h-10 px-4 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Staff Member</label>
            <select value={staffFilter} onChange={e => setStaff(e.target.value)}
              className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white">
              <option value="">All Staff</option>
              {uniqueStaff.map(s => { const [email, name] = s.split('|'); return <option key={email} value={email}>{name}</option> })}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Report Type</label>
            <select value={typeFilter} onChange={e => setType(e.target.value)}
              className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white">
              <option value="">All Types</option>
              {REPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
            <select value={reviewFilter} onChange={e => setReview(e.target.value)}
              className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white">
              <option value="">All</option>
              <option value="false">Pending Review</option>
              <option value="true">Reviewed</option>
            </select>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-[#C9A84C] animate-spin" /></div>
        ) : reports.length === 0 ? (
          <div className="text-center py-20">
            <ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No reports found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-left">
                    <input type="checkbox"
                      checked={selected.size === reports.filter(r => !r.reviewedByAdmin).length && selected.size > 0}
                      onChange={e => {
                        if (e.target.checked) setSelected(new Set(reports.filter(r => !r.reviewedByAdmin).map(r => r.id)))
                        else setSelected(new Set())
                      }}
                      className="rounded border-gray-300" />
                  </th>
                  {['Staff', 'Type', 'Period', 'Metrics', 'Submitted', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${r.reportType === 'Issue or Complaint Report' ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      {!r.reviewedByAdmin && (
                        <input type="checkbox" checked={selected.has(r.id)}
                          onChange={e => setSelected(s => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n })}
                          className="rounded border-gray-300" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-[#0B1F3A]">{r.staffName}</p>
                      <p className="text-xs text-gray-400">{r.staffRole}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLOURS[r.reportType] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.reportType.replace(' Report', '').replace(' Summary', '')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {fmtDate(r.periodFrom)} — {fmtDate(r.periodTo)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <span className="font-medium">{r.clientsContacted}</span> clients ·{' '}
                      <span className="font-medium">{r.applicationsSubmitted}</span> apps ·{' '}
                      <span className="font-medium">{r.revenueCurrency} {r.totalRevenue.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      {r.reviewedByAdmin
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> Reviewed</span>
                        : <span className="inline-flex text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewing(r)}
                        className="text-xs text-[#C9A84C] font-semibold hover:underline whitespace-nowrap">
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 bg-white">
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 bg-white">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {viewing && <ReviewModal report={viewing} onClose={() => setViewing(null)} onReviewed={handleReviewed} />}
    </div>
  )
}
