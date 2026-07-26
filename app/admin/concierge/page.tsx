'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles, Search, ChevronDown, ChevronUp, Clock,
  CheckCircle, XCircle, AlertCircle, Loader2, User, FileText,
} from 'lucide-react'

interface ConciergeRequest {
  id:              string
  reference:       string
  status:          string
  sla:             string
  intent_fields:   Record<string, unknown>
  created_at:      string
  updated_at:      string
  client_name:     string | null
  client_email:    string | null
  chatwoot_conv_id: number | null
  assigned_to:     string | null
  internal_notes:  string | null
  category:        { name: string; slug: string } | null
}

const STATUSES = ['ALL', 'PENDING', 'QUOTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

const STATUS_STYLES: Record<string, string> = {
  PENDING:     'bg-amber-50 text-amber-700 border-amber-200',
  QUOTED:      'bg-blue-50 text-blue-700 border-blue-200',
  CONFIRMED:   'bg-green-50 text-green-700 border-green-200',
  IN_PROGRESS: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED:   'bg-gray-50 text-gray-600 border-gray-200',
  CANCELLED:   'bg-red-50 text-red-600 border-red-200',
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING:     <Clock className="w-3 h-3" />,
  QUOTED:      <AlertCircle className="w-3 h-3" />,
  CONFIRMED:   <CheckCircle className="w-3 h-3" />,
  IN_PROGRESS: <Loader2 className="w-3 h-3" />,
  COMPLETED:   <CheckCircle className="w-3 h-3" />,
  CANCELLED:   <XCircle className="w-3 h-3" />,
}

export default function AdminConciergePage() {
  const [requests,    setRequests]    = useState<ConciergeRequest[]>([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [status,      setStatus]      = useState('ALL')
  const [search,      setSearch]      = useState('')
  const [page,        setPage]        = useState(1)
  const [totalPages,  setTotalPages]  = useState(1)
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [saving,      setSaving]      = useState<string | null>(null)
  const [noteEdits,   setNoteEdits]   = useState<Record<string, string>>({})
  const [assignEdits, setAssignEdits] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ status, page: String(page) })
      if (search) qs.set('search', search)
      const res  = await fetch(`/api/admin/concierge?${qs}`)
      const data = await res.json() as {
        requests: ConciergeRequest[]
        total:    number
        totalPages: number
      }
      setRequests(data.requests ?? [])
      setTotal(data.total ?? 0)
      setTotalPages(data.totalPages ?? 1)
    } catch {
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [status, search, page])

  useEffect(() => { void load() }, [load])

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [status, search])

  const handleUpdate = async (id: string, updates: Record<string, unknown>) => {
    setSaving(id)
    try {
      const res = await fetch(`/api/admin/concierge/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const { request } = await res.json() as { request: ConciergeRequest }
        setRequests(prev => prev.map(r => r.id === id ? request : r))
      }
    } finally {
      setSaving(null)
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[#C9A84C]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#0B1F3A]">Concierge Requests</h1>
            <p className="text-sm text-gray-500">{total} total request{total !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search reference, client name, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map(s => (
            <button key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                status === s
                  ? 'bg-[#0B1F3A] text-[#C9A84C] border-[#0B1F3A]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}>
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Request list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Sparkles className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No concierge requests found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(req => {
            const isExpanded  = expanded === req.id
            const isSaving    = saving === req.id
            const statusStyle = STATUS_STYLES[req.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'
            const noteValue   = noteEdits[req.id] ?? (req.internal_notes ?? '')
            const assignValue = assignEdits[req.id] ?? (req.assigned_to ?? '')

            return (
              <div key={req.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Summary row */}
                <button
                  className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-gray-50/50 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : req.id)}>
                  <div className="flex-shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusStyle}`}>
                      {STATUS_ICONS[req.status]}
                      {req.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#0B1F3A] tracking-wider">{req.reference}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {req.category?.name ?? 'Concierge'} · {req.client_name ?? req.client_email ?? 'Anonymous'}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-400 flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>{req.sla}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 flex-shrink-0 hidden md:block">
                    {formatDate(req.created_at)}
                  </div>
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  }
                </button>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-50 bg-gray-50/30">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-4">

                      {/* Request fields */}
                      <div className="lg:col-span-2 space-y-3">
                        <div className="bg-white rounded-lg border border-gray-100 p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <FileText className="w-3.5 h-3.5 text-[#C9A84C]" />
                            <p className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider">Request Details</p>
                          </div>
                          <dl className="space-y-1.5">
                            {Object.entries(req.intent_fields ?? {}).map(([k, v]) => (
                              <div key={k} className="grid grid-cols-2 gap-2">
                                <dt className="text-[11px] text-gray-500 capitalize">{k.replace(/_/g, ' ')}</dt>
                                <dd className="text-[11px] font-medium text-[#0B1F3A]">{String(v)}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>

                        {/* Client info */}
                        <div className="bg-white rounded-lg border border-gray-100 p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <User className="w-3.5 h-3.5 text-[#C9A84C]" />
                            <p className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider">Client</p>
                          </div>
                          <dl className="space-y-1">
                            {req.client_name  && <div className="grid grid-cols-2 gap-2"><dt className="text-[11px] text-gray-500">Name</dt><dd className="text-[11px] font-medium text-[#0B1F3A]">{req.client_name}</dd></div>}
                            {req.client_email && <div className="grid grid-cols-2 gap-2"><dt className="text-[11px] text-gray-500">Email</dt><dd className="text-[11px] font-medium text-[#0B1F3A]">{req.client_email}</dd></div>}
                            {req.chatwoot_conv_id && (
                              <div className="mt-2">
                                <a
                                  href={`https://chat.walztravels.com/app/accounts/1/conversations/${req.chatwoot_conv_id}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="text-[11px] text-[#C9A84C] font-semibold hover:underline">
                                  View in Chatwoot →
                                </a>
                              </div>
                            )}
                          </dl>
                        </div>
                      </div>

                      {/* Actions panel */}
                      <div className="space-y-3">
                        {/* Status update */}
                        <div className="bg-white rounded-lg border border-gray-100 p-3">
                          <p className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">Update Status</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {STATUSES.filter(s => s !== 'ALL').map(s => (
                              <button key={s}
                                disabled={isSaving || req.status === s}
                                onClick={() => handleUpdate(req.id, { status: s })}
                                className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all disabled:opacity-50 ${
                                  req.status === s
                                    ? 'bg-[#0B1F3A] text-[#C9A84C] border-[#0B1F3A]'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                }`}>
                                {s.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Assign to */}
                        <div className="bg-white rounded-lg border border-gray-100 p-3">
                          <p className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">Assigned To</p>
                          <input
                            type="text"
                            placeholder="Staff name or email…"
                            value={assignValue}
                            onChange={e => setAssignEdits(prev => ({ ...prev, [req.id]: e.target.value }))}
                            className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A] mb-2"
                          />
                          <button
                            disabled={isSaving}
                            onClick={() => handleUpdate(req.id, { assigned_to: assignValue || null })}
                            className="w-full py-1.5 text-[11px] font-bold bg-[#0B1F3A] text-[#C9A84C] rounded-lg hover:bg-[#162d52] transition-colors disabled:opacity-50">
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Save Assignment'}
                          </button>
                        </div>

                        {/* Internal notes */}
                        <div className="bg-white rounded-lg border border-gray-100 p-3">
                          <p className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">Internal Notes</p>
                          <textarea
                            rows={3}
                            placeholder="Add notes for the team…"
                            value={noteValue}
                            onChange={e => setNoteEdits(prev => ({ ...prev, [req.id]: e.target.value }))}
                            className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A] resize-none mb-2"
                          />
                          <button
                            disabled={isSaving}
                            onClick={() => handleUpdate(req.id, { internal_notes: noteValue || null })}
                            className="w-full py-1.5 text-[11px] font-bold bg-[#0B1F3A] text-[#C9A84C] rounded-lg hover:bg-[#162d52] transition-colors disabled:opacity-50">
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Save Notes'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
