'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, RefreshCw, Download, Loader2, Filter,
  ChevronLeft, ChevronRight, LogIn, Activity,
  Users, FileText, Monitor,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ActivityLog {
  id: string
  staffId:   string | null
  staffName: string | null
  action:    string
  detail:    string | null
  createdAt: string
}

interface LoginLog {
  id:              string
  staffId:         string | null
  staffName:       string | null
  staffEmail:      string | null
  staffRole:       string | null
  ipAddress:       string | null
  browser:         string | null
  operatingSystem: string | null
  loginAt:         string
}

interface StatsRow {
  actionsToday: number
  loginsToday:  number
  appsToday:    number
  docsToday:    number
}

interface StaffOption { staffId: string | null; staffName: string | null }

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function rowBg(action: string) {
  const a = action.toLowerCase()
  if (a.includes('login'))                              return 'bg-blue-50'
  if (a.includes('error') || a.includes('fail') || a.includes('issue') || a.includes('complaint'))
                                                        return 'bg-red-50'
  if (a.includes('approved') || a.includes('approval')) return 'bg-green-50'
  if (a.includes('refused') || a.includes('refusal'))   return 'bg-orange-50'
  return ''
}

function actionDot(action: string) {
  const a = action.toLowerCase()
  if (a.includes('login'))                              return 'bg-blue-500'
  if (a.includes('error') || a.includes('fail') || a.includes('issue'))
                                                        return 'bg-red-500'
  if (a.includes('approved') || a.includes('approval')) return 'bg-green-500'
  if (a.includes('refused') || a.includes('refusal'))   return 'bg-orange-500'
  if (a.includes('created') || a.includes('submitted')) return 'bg-[#C9A84C]'
  return 'bg-gray-400'
}

function roleBadge(role: string | null) {
  const r = role ?? ''
  const map: Record<string, string> = {
    Admin:       'bg-[#0B1F3A] text-white',
    Manager:     'bg-purple-100 text-purple-700',
    Coordinator: 'bg-blue-100 text-blue-700',
    Sales:       'bg-green-100 text-green-700',
  }
  const cls = map[r] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {r || '—'}
    </span>
  )
}

const ACTION_TYPES = [
  'Staff Login',
  'Client Created', 'Client Updated',
  'Application Created', 'Application Updated', 'Status Changed',
  'Document Reviewed', 'Email Sent',
  'Booking Updated', 'Booking Confirmed', 'Booking Cancelled',
  'Report Submitted', 'Settings Changed', 'Staff Created', 'Payment Recorded',
]

const LIMIT = 50

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number | string; color: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-[#0B1F3A] leading-tight">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ActivityPage() {
  const [tab, setTab] = useState<'all' | 'logins'>('all')

  // Activity tab state
  const [logs, setLogs]           = useState<ActivityLog[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [staffList, setStaffList] = useState<StaffOption[]>([])
  const [actionTypes, setActionTypes] = useState<string[]>(ACTION_TYPES)

  const [search, setSearch]       = useState('')
  const [staffFilter, setStaff]   = useState('')
  const [actionFilter, setAction] = useState('')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [showFilters, setFilters] = useState(false)

  // Logins tab state
  const [loginLogs, setLoginLogs]     = useState<LoginLog[]>([])
  const [loginTotal, setLoginTotal]   = useState(0)
  const [loginPage, setLoginPage]     = useState(1)
  const [loginLoading, setLoginLoading] = useState(false)

  // Stats
  const [stats, setStats] = useState<StatsRow>({
    actionsToday: 0, loginsToday: 0, appsToday: 0, docsToday: 0,
  })

  // ── Load stats ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    const params = new URLSearchParams({ dateFrom: today, limit: '200' })
    fetch(`/api/admin/activity?${params}`)
      .then(r => r.json())
      .then(d => {
        const all: ActivityLog[] = d.logs ?? []
        setStats({
          actionsToday: all.length,
          loginsToday:  all.filter(l => l.action.toLowerCase().includes('login')).length,
          appsToday:    all.filter(l => l.action.toLowerCase().includes('application')).length,
          docsToday:    all.filter(l => l.action.toLowerCase().includes('document')).length,
        })
      })
      .catch(() => {})
  }, [])

  // ── Load activity logs ──────────────────────────────────────────────────────
  const loadLogs = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({
      page:  String(page),
      limit: String(LIMIT),
      ...(search      ? { search }               : {}),
      ...(staffFilter ? { staffId: staffFilter } : {}),
      ...(actionFilter ? { action: actionFilter } : {}),
      ...(dateFrom    ? { startDate: dateFrom }  : {}),
      ...(dateTo      ? { endDate: dateTo }       : {}),
    })
    fetch(`/api/admin/activity?${params}`)
      .then(r => r.json())
      .then(d => {
        setLogs(d.logs ?? [])
        setTotal(d.total ?? 0)
        if (d.staff)       setStaffList(d.staff)
        if (d.actionTypes) setActionTypes(d.actionTypes)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, search, staffFilter, actionFilter, dateFrom, dateTo])

  useEffect(() => { loadLogs() }, [loadLogs])

  // ── Load login logs ─────────────────────────────────────────────────────────
  const loadLoginLogs = useCallback(() => {
    if (tab !== 'logins') return
    setLoginLoading(true)
    const params = new URLSearchParams({
      page:  String(loginPage),
      limit: String(LIMIT),
    })
    fetch(`/api/admin/activity/logins?${params}`)
      .then(r => r.json())
      .then(d => {
        setLoginLogs(d.logs ?? [])
        setLoginTotal(d.total ?? 0)
      })
      .catch(() => {})
      .finally(() => setLoginLoading(false))
  }, [tab, loginPage])

  useEffect(() => { loadLoginLogs() }, [loadLoginLogs])

  // ── CSV export ──────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['Time', 'Staff', 'Action', 'Detail'],
      ...logs.map(l => [
        fmtDateTime(l.createdAt),
        l.staffName ?? '',
        l.action,
        l.detail ?? '',
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a   = Object.assign(document.createElement('a'), { href: url, download: 'activity-log.csv' })
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages      = Math.ceil(total / LIMIT)
  const loginTotalPages = Math.ceil(loginTotal / LIMIT)

  return (
    <div className="space-y-6">

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Actions Today"       value={stats.actionsToday} color="bg-[#0B1F3A] text-[#C9A84C]" />
        <StatCard icon={LogIn}    label="Staff Logins Today"  value={stats.loginsToday}  color="bg-blue-100 text-blue-600"    />
        <StatCard icon={FileText} label="App Updates Today"   value={stats.appsToday}    color="bg-amber-100 text-amber-600"  />
        <StatCard icon={Monitor}  label="Doc Reviews Today"   value={stats.docsToday}    color="bg-green-100 text-green-600"  />
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-2xl p-1 w-fit shadow-sm">
        {([
          { key: 'all',    label: 'All Activity', icon: Activity },
          { key: 'logins', label: 'Logins Only',  icon: LogIn    },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === key
                ? 'bg-[#0B1F3A] text-white'
                : 'text-gray-500 hover:text-[#0B1F3A] hover:bg-gray-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── ALL ACTIVITY TAB ──────────────────────────────────────────────── */}
      {tab === 'all' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Toolbar */}
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search staff or action…"
                className="w-full pl-9 pr-3 h-9 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white"
              />
            </div>
            <button
              onClick={() => setFilters(f => !f)}
              className={`flex items-center gap-2 px-3 h-9 border rounded-xl text-sm font-medium transition-colors ${showFilters ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]' : 'border-gray-200 text-gray-600 hover:border-[#C9A84C]'}`}
            >
              <Filter className="w-4 h-4" /> Filters
            </button>
            <button onClick={loadLogs} className="flex items-center gap-1.5 px-3 h-9 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-[#C9A84C] transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 h-9 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-[#C9A84C] transition-colors">
              <Download className="w-4 h-4" /> CSV
            </button>
            <span className="text-xs text-gray-400 ml-auto">{total.toLocaleString()} records</span>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="px-5 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-gray-100 pt-3">
              <select value={staffFilter} onChange={e => { setStaff(e.target.value); setPage(1) }}
                className="h-9 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white">
                <option value="">All Staff</option>
                {staffList.map((s, i) => (
                  <option key={i} value={s.staffId ?? ''}>{s.staffName ?? 'Unknown'}</option>
                ))}
              </select>
              <select value={actionFilter} onChange={e => { setAction(e.target.value); setPage(1) }}
                className="h-9 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white">
                <option value="">All Actions</option>
                {actionTypes.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                className="h-9 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white" />
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
                className="h-9 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white" />
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No activity found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map(log => (
                    <tr key={log.id} className={`${rowBg(log.action)} hover:bg-opacity-80 transition-colors`}>
                      <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap font-mono">
                        {fmtDateTime(log.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-sm font-medium text-[#0B1F3A]">{log.staffName ?? '—'}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${actionDot(log.action)}`} />
                          <span className="text-sm text-gray-700 font-medium">{log.action}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500 max-w-xs truncate">
                        {log.detail ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40 hover:border-[#C9A84C] transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40 hover:border-[#C9A84C] transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LOGINS TAB ───────────────────────────────────────────────────────── */}
      {tab === 'logins' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#C9A84C]" />
              <span className="text-sm font-bold text-[#0B1F3A]">Staff Login History</span>
            </div>
            <span className="text-xs text-gray-400">{loginTotal.toLocaleString()} total logins</span>
          </div>

          {loginLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
            </div>
          ) : loginLogs.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No login records found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Login Time</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">IP Address</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Browser</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Device / OS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loginLogs.map(log => (
                    <tr key={log.id} className="bg-blue-50/40 hover:bg-blue-50 transition-colors">
                      <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap font-mono">
                        {fmtDateTime(log.loginAt)}
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-sm font-semibold text-[#0B1F3A]">{log.staffName ?? '—'}</p>
                        <p className="text-xs text-gray-400">{log.staffEmail ?? ''}</p>
                      </td>
                      <td className="px-5 py-3">
                        {roleBadge(log.staffRole)}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-600 font-mono">
                        {log.ipAddress || '—'}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {log.browser || '—'}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {log.operatingSystem || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {loginTotalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">Page {loginPage} of {loginTotalPages}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setLoginPage(p => Math.max(1, p - 1))} disabled={loginPage === 1}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40 hover:border-[#C9A84C] transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setLoginPage(p => Math.min(loginTotalPages, p + 1))} disabled={loginPage === loginTotalPages}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40 hover:border-[#C9A84C] transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
