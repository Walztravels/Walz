'use client'
import { useEffect, useState, useCallback } from 'react'

type RecoveryPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
type RecoveryStatus   = 'OPEN' | 'CONTACTED' | 'IN_PROGRESS' | 'RECOVERED' | 'LOST' | 'DISMISSED'
type RecoveryType     = 'ABANDONED_CART' | 'UNPAID_PROPOSAL' | 'FAILED_PAYMENT' | 'SUPPLIER_FAILURE' | 'INCOMPLETE_TRIP' | 'HOT_LEAD'

interface Opportunity {
  id:               string
  type:             RecoveryType
  status:           RecoveryStatus
  priority:         RecoveryPriority
  reason:           string
  amount:           number | null
  currency:         string | null
  assignedToId:     string | null
  assignedName:     string | null
  leadName:         string | null
  leadEmail:        string | null
  detectedAt:       string
  lastActivityAt:   string | null
  nextActionAt:     string | null
  recoveredAt:      string | null
  recoveredAmount:  number | null
  recoveredCurrency: string | null
  notes:            string | null
}

interface Summary {
  total:          number
  priorityCounts: { URGENT: number; HIGH: number; MEDIUM: number; LOW: number }
  openValue:      Record<string, number>
}

const PRIORITY_ORDER: RecoveryPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

const priorityStripe: Record<RecoveryPriority, string> = {
  URGENT: '#DC2626',
  HIGH:   '#EA580C',
  MEDIUM: '#D97706',
  LOW:    '#94A3B8',
}

const priorityLabel: Record<RecoveryPriority, string> = {
  URGENT: 'URGENT',
  HIGH:   'HIGH',
  MEDIUM: 'MEDIUM',
  LOW:    'LOW',
}

const typeLabel: Record<RecoveryType, string> = {
  ABANDONED_CART:  'Abandoned Cart',
  UNPAID_PROPOSAL: 'Unpaid Proposal',
  FAILED_PAYMENT:  'Failed Payment',
  SUPPLIER_FAILURE: 'Supplier Issue',
  INCOMPLETE_TRIP: 'Incomplete Trip',
  HOT_LEAD:        'Hot Lead',
}

const statusStyle: Record<RecoveryStatus, string> = {
  OPEN:        'bg-blue-50 text-blue-700',
  CONTACTED:   'bg-amber-50 text-amber-700',
  IN_PROGRESS: 'bg-purple-50 text-purple-700',
  RECOVERED:   'bg-green-50 text-green-700',
  LOST:        'bg-gray-100 text-gray-500',
  DISMISSED:   'bg-gray-100 text-gray-400',
}

function timeAgo(iso: string): string {
  const ms  = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1)   return 'just now'
  if (min < 60)  return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24)   return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function fmt(amount: number | null, currency: string | null): string {
  if (amount === null || !currency) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 0 }).format(amount)
}

export default function RecoveryCenterPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [summary, setSummary]             = useState<Summary | null>(null)
  const [loading, setLoading]             = useState(true)
  const [statusFilter, setStatusFilter]   = useState('OPEN')
  const [typeFilter, setTypeFilter]       = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [window, setWindow]               = useState(30)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: statusFilter, window: String(window) })
      if (typeFilter)     params.set('type', typeFilter)
      if (priorityFilter) params.set('priority', priorityFilter)
      const res = await fetch(`/api/admin/recovery?${params}`)
      const data = await res.json()
      const sorted = (data.opportunities ?? []).sort((a: Opportunity, b: Opportunity) =>
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
      )
      setOpportunities(sorted)
      setSummary(data.summary ?? null)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, typeFilter, priorityFilter, window])

  useEffect(() => { fetchData() }, [fetchData])

  const urgent = summary?.priorityCounts.URGENT ?? 0
  const high   = summary?.priorityCounts.HIGH   ?? 0

  return (
    <div className="min-h-screen bg-[#F8F6F3]" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" />

      {/* Top bar */}
      <div className="bg-[#0B1F3A] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Recovery Center</h1>
          <p className="text-[#C9A84C] text-xs mt-0.5">Revenue recovery — last {window} days</p>
        </div>
        <div className="flex items-center gap-3">
          {urgent > 0 && (
            <span className="bg-red-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              {urgent} URGENT
            </span>
          )}
          {high > 0 && (
            <span className="bg-orange-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              {high} HIGH
            </span>
          )}
          <button
            onClick={fetchData}
            className="text-xs text-white/60 hover:text-white border border-white/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Summary strip */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {PRIORITY_ORDER.map(p => (
              <div
                key={p}
                className="bg-white rounded-xl p-4 border-l-4 cursor-pointer"
                style={{ borderColor: priorityStripe[p] }}
                onClick={() => setPriorityFilter(priorityFilter === p ? '' : p)}
              >
                <p className="text-2xl font-semibold text-[#0B1F3A] tabular-nums">
                  {summary.priorityCounts[p]}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{priorityLabel[p]}</p>
              </div>
            ))}
          </div>
        )}

        {/* Open value by currency */}
        {summary && Object.keys(summary.openValue).length > 0 && (
          <div className="bg-white rounded-xl px-5 py-4 mb-6 flex flex-wrap gap-6 items-center">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Open Value</p>
            {Object.entries(summary.openValue).map(([cur, total]) => (
              <div key={cur}>
                <span className="font-semibold text-[#0B1F3A] tabular-nums" style={{ fontFamily: "'DM Mono', monospace" }}>
                  {fmt(total, cur)}
                </span>
              </div>
            ))}
            <p className="text-xs text-gray-400 ml-auto">Currencies shown separately — not summed</p>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-5">
          {(['OPEN', 'CONTACTED', 'IN_PROGRESS', 'RECOVERED', 'LOST', 'ALL'] as string[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                statusFilter === s
                  ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                  : 'text-gray-600 border-gray-300 hover:border-[#0B1F3A]'
              }`}
            >
              {s === 'IN_PROGRESS' ? 'In Progress' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700"
            >
              <option value="">All types</option>
              {Object.entries(typeLabel).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={String(window)}
              onChange={e => setWindow(Number(e.target.value))}
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700"
            >
              {[7, 14, 30, 60, 90].map(d => (
                <option key={d} value={d}>Last {d}d</option>
              ))}
            </select>
          </div>
        </div>

        {/* Opportunity list */}
        {loading ? (
          <div className="bg-white rounded-xl p-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : opportunities.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center">
            <p className="text-gray-500 text-sm">No recovery opportunities in this view.</p>
            <p className="text-gray-400 text-xs mt-1">Run the detection cron or adjust filters.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {opportunities.map(opp => (
              <a
                key={opp.id}
                href={`/admin/recovery/${opp.id}`}
                className="block bg-white rounded-xl overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="flex">
                  {/* Severity stripe */}
                  <div
                    className="w-1 flex-shrink-0"
                    style={{ backgroundColor: priorityStripe[opp.priority] }}
                  />
                  <div className="flex-1 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Customer / lead name */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-[#0B1F3A] text-sm truncate">
                            {opp.leadName ?? opp.leadEmail ?? 'Unknown customer'}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
                            {typeLabel[opp.type]}
                          </span>
                        </div>
                        {/* Reason */}
                        <p className="text-xs text-gray-500 line-clamp-1">{opp.reason}</p>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        {/* Value */}
                        {opp.amount !== null && (
                          <span className="font-semibold text-sm text-[#0B1F3A] tabular-nums" style={{ fontFamily: "'DM Mono', monospace" }}>
                            {fmt(opp.amount, opp.currency)}
                          </span>
                        )}
                        {/* Priority + status */}
                        <div className="flex gap-1.5">
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: priorityStripe[opp.priority] }}
                          >
                            {priorityLabel[opp.priority]}
                          </span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusStyle[opp.status]}`}>
                            {opp.status === 'IN_PROGRESS' ? 'In progress' : opp.status.charAt(0) + opp.status.slice(1).toLowerCase()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer meta */}
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400" style={{ fontFamily: "'DM Mono', monospace" }}>
                      <span>Detected {timeAgo(opp.detectedAt)}</span>
                      {opp.lastActivityAt && (
                        <span>Activity {timeAgo(opp.lastActivityAt)}</span>
                      )}
                      {opp.assignedName && (
                        <span className="ml-auto text-gray-500">→ {opp.assignedName}</span>
                      )}
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
