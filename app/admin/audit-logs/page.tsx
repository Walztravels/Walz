'use client'

import { useEffect, useState, useCallback } from 'react'
import { Activity, Search, RefreshCw, Loader2, Filter } from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

interface Log {
  id: string
  staffId: string | null
  staffName: string | null
  staffRole: string | null
  action: string
  module: string | null
  entityId: string | null
  entityType: string | null
  detail: string | null
  ipAddress: string | null
  createdAt: string
}

const ACTION_STYLE: Record<string, string> = {
  created:         'bg-green-100 text-green-700',
  create:          'bg-green-100 text-green-700',
  updated:         'bg-amber-100 text-amber-700',
  update:          'bg-amber-100 text-amber-700',
  deleted:         'bg-red-100 text-red-700',
  delete:          'bg-red-100 text-red-700',
  login:           'bg-blue-100 text-blue-700',
  staff_login:     'bg-blue-100 text-blue-700',
  visa_email_sent: 'bg-purple-100 text-purple-700',
}

function actionStyle(action: string) {
  for (const [k, v] of Object.entries(ACTION_STYLE)) {
    if (action.toLowerCase().includes(k)) return v
  }
  return 'bg-gray-100 text-gray-600'
}

const MODULES = ['', 'bookings', 'visa', 'clients', 'staff', 'settings', 'content', 'approvals']

export default function AuditLogsPage() {
  const { can } = useStaffPermissions()
  const [logs, setLogs]       = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [module, setModule]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (module) params.set('module', module)
    const res = await fetch(`/api/admin/audit-logs?${params}`)
    const d   = await res.json()
    setLogs(d.logs ?? [])
    setLoading(false)
  }, [module])

  useEffect(() => { load() }, [load])

  if (!can('staff_view')) {
    return (
      <div className="p-8 text-center text-gray-400">
        You don&apos;t have permission to view audit logs.
      </div>
    )
  }

  const filtered = logs.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${l.staffName ?? ''} ${l.action} ${l.module ?? ''} ${l.detail ?? ''}`.toLowerCase().includes(q)
  })

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Audit Logs</h1>
          <p className="text-sm text-gray-400 mt-0.5">System activity and staff action history</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-[#C9A84C] transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search staff, action, or detail…"
            className="w-full pl-9 pr-4 h-10 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white" />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select value={module} onChange={e => setModule(e.target.value)}
            className="pl-9 pr-4 h-10 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white appearance-none">
            <option value="">All modules</option>
            {MODULES.filter(Boolean).map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-3 text-gray-400">
          <Activity className="w-10 h-10 text-gray-200" />
          <p className="text-sm">No audit logs found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Date / Time', 'Staff', 'Action', 'Module', 'Detail', 'IP'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs font-semibold text-[#0B1F3A]">
                        {new Date(log.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(log.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#0B1F3A] text-sm">{log.staffName ?? 'System'}</p>
                      <p className="text-xs text-gray-400 capitalize">{log.staffRole ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${actionStyle(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {log.module && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{log.module}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-xs text-gray-600 truncate">{log.detail ?? '—'}</p>
                      {log.entityId && (
                        <p className="text-[10px] font-mono text-gray-400 truncate">{log.entityId}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {log.ipAddress ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
