'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Search, Filter, Globe, Clock, ChevronRight,
  AlertCircle, CheckCircle, Loader2, RefreshCw,
  Users, FileText,
} from 'lucide-react'
import { STATUS_CONFIG, VISA_AGENTS, VISA_CONFIGS, ISO2_TO_SLUG } from '@/lib/visa-config'

interface VisaApp {
  id: string; referenceNumber: string; destinationIso2: string; visaType: string
  firstName: string | null; lastName: string | null; email: string | null; phone: string | null
  status: string; serviceFeePaid: boolean; assignedTo: string | null
  createdAt: string; updatedAt: string
  user: { name: string | null; email: string | null } | null
  notes: { content: string; createdAt: string }[]
}

const ALL_STATUSES = [
  'all', 'received', 'documents_pending', 'under_review',
  'ready_to_submit', 'submitted_to_embassy', 'decision_pending', 'approved', 'refused',
]

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.received
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color} whitespace-nowrap`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export default function AdminVisaApplicationsPage() {
  const [apps, setApps] = useState<VisaApp[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [destFilter, setDestFilter]     = useState('all')
  const [agentFilter, setAgentFilter]   = useState('all')
  const [search, setSearch]             = useState('')

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (destFilter  !== 'all') params.set('destination', destFilter)
    if (agentFilter !== 'all') params.set('assignedTo', agentFilter)
    if (search.trim()) params.set('search', search.trim())
    const res = await fetch(`/api/admin/visa-applications?${params}`)
    const d = await res.json()
    setApps(d.applications ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [statusFilter, destFilter, agentFilter]) // eslint-disable-line

  function handleSearch(e: React.FormEvent) { e.preventDefault(); load() }

  const statCounts = ALL_STATUSES.slice(1).reduce<Record<string, number>>((acc, s) => {
    acc[s] = apps.filter(a => a.status === s).length
    return acc
  }, {})

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Visa Applications</h1>
          <p className="text-gray-500 text-sm mt-0.5">{apps.length} application{apps.length !== 1 ? 's' : ''} · Manage, track and submit</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#C9A84C]' : 'text-gray-500'}`} />
          Refresh
        </button>
      </div>

      {/* Status count pills */}
      <div className="flex gap-2 flex-wrap mb-6">
        {[
          { key: 'all', label: 'All', count: apps.length },
          ...ALL_STATUSES.slice(1).map(s => ({ key: s, label: STATUS_CONFIG[s]?.label ?? s, count: statCounts[s] ?? 0 })),
        ].map(({ key, label, count }) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              statusFilter === key
                ? 'bg-[#0B1F3A] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            {label}
            {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusFilter === key ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, reference…"
            className="w-full pl-10 pr-4 h-10 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
        </form>

        <select value={destFilter} onChange={e => setDestFilter(e.target.value)}
          className="h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white min-w-[160px]">
          <option value="all">All Destinations</option>
          {Object.values(VISA_CONFIGS).map(c => (
            <option key={c.destinationIso2} value={c.destinationIso2}>{c.flag} {c.name}</option>
          ))}
        </select>

        <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
          className="h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white min-w-[160px]">
          <option value="all">All Agents</option>
          {VISA_AGENTS.map(a => (
            <option key={a.id} value={a.id === 'unassigned' ? 'unassigned' : a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      ) : apps.length === 0 ? (
        <div className="text-center py-20">
          <Globe className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No applications found</p>
          <p className="text-gray-300 text-sm mt-1">Adjust filters or wait for clients to submit</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['Reference', 'Client', 'Destination', 'Visa Type', 'Status', 'Assigned', 'Date', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apps.map(app => {
                  const cfg = VISA_CONFIGS[app.destinationIso2]
                  const agent = VISA_AGENTS.find(a => a.id === app.assignedTo)
                  return (
                    <tr key={app.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-[#C9A84C]">{app.referenceNumber}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#0B1F3A] text-sm">{[app.firstName, app.lastName].filter(Boolean).join(' ') || app.user?.name || '—'}</p>
                        <p className="text-gray-400 text-xs truncate max-w-[160px]">{app.email || app.user?.email || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">{cfg?.flag ?? '🌍'} {cfg?.name ?? app.destinationIso2}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-600">{app.visaType}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <StatusBadge status={app.status} />
                          {app.serviceFeePaid && <p className="text-xs text-green-600 font-medium">💰 Paid</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">{agent?.name ?? <span className="text-orange-500">Unassigned</span>}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-400">{new Date(app.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/visa-applications/${app.id}`}
                          className="flex items-center gap-1 text-xs text-[#C9A84C] font-semibold hover:underline whitespace-nowrap">
                          Open <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-gray-50">
            {apps.map(app => {
              const cfg = VISA_CONFIGS[app.destinationIso2]
              const agent = VISA_AGENTS.find(a => a.id === app.assignedTo)
              return (
                <Link key={app.id} href={`/admin/visa-applications/${app.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
                  <div className="text-3xl">{cfg?.flag ?? '🌍'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <StatusBadge status={app.status} />
                      <span className="font-mono text-xs text-[#C9A84C]">{app.referenceNumber}</span>
                    </div>
                    <p className="font-semibold text-[#0B1F3A] text-sm">{[app.firstName, app.lastName].filter(Boolean).join(' ') || '—'}</p>
                    <p className="text-gray-400 text-xs">{cfg?.name ?? app.destinationIso2} · {agent?.name ?? 'Unassigned'}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
