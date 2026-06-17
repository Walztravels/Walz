'use client'

import { useEffect, useState, useCallback } from 'react'
import { CheckCircle, XCircle, Clock, RefreshCw, Loader2 } from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

interface Approval {
  id: string
  type: string
  status: string
  requestedBy: string
  approvedBy: string | null
  entityId: string
  entityType: string
  amount: number | null
  currency: string | null
  reason: string
  notes: string | null
  requestedAt: string
  resolvedAt: string | null
  branch: string
}

const TYPE_LABELS: Record<string, string> = {
  refund:           'Refund',
  booking_cancel:   'Booking Cancel',
  visa_approve:     'Visa Approve',
  discount:         'Discount',
}

export default function ApprovalsPage() {
  const { can }            = useStaffPermissions()
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<'pending' | 'resolved'>('pending')
  const [acting, setActing]       = useState<string | null>(null)
  const [notesMap, setNotesMap]   = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/approvals')
    const d   = await res.json()
    setApprovals(d.approvals ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function resolve(id: string, status: 'approved' | 'rejected') {
    setActing(id)
    await fetch('/api/admin/approvals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, notes: notesMap[id] ?? '' }),
    })
    setApprovals(prev => prev.map(a => a.id === id ? { ...a, status, resolvedAt: new Date().toISOString() } : a))
    setActing(null)
  }

  const canResolve = can('applications_approve')

  const filtered = approvals.filter(a =>
    tab === 'pending' ? a.status === 'pending' : a.status !== 'pending',
  )

  const pending  = approvals.filter(a => a.status === 'pending').length
  const resolved = approvals.filter(a => a.status !== 'pending').length

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Approvals</h1>
          <p className="text-sm text-gray-400 mt-0.5">{pending} pending · {resolved} resolved</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-[#C9A84C] transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {(['pending', 'resolved'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all capitalize ${tab === t ? 'bg-[#0B1F3A] text-white' : 'text-gray-500 hover:text-[#0B1F3A]'}`}>
            {t}
            {t === 'pending' && pending > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-3 text-gray-400">
          <CheckCircle className="w-10 h-10 text-gray-200" />
          <p className="text-sm">No {tab} approval requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  a.status === 'pending'  ? 'bg-amber-50'  :
                  a.status === 'approved' ? 'bg-green-50'  : 'bg-red-50'
                }`}>
                  {a.status === 'pending'  ? <Clock        className="w-5 h-5 text-amber-500" /> :
                   a.status === 'approved' ? <CheckCircle  className="w-5 h-5 text-green-500" /> :
                                             <XCircle      className="w-5 h-5 text-red-500"   />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[#0B1F3A]">{TYPE_LABELS[a.type] ?? a.type}</span>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{a.entityType}</span>
                    {a.amount && (
                      <span className="text-xs font-bold text-[#C9A84C]">
                        {a.currency} {a.amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{a.reason}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>Requested by <strong>{a.requestedBy}</strong></span>
                    <span>·</span>
                    <span>{new Date(a.requestedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                    {a.branch !== 'nigeria' && <span>· {a.branch}</span>}
                  </div>
                  {a.resolvedAt && a.approvedBy && (
                    <p className="text-xs text-gray-400 mt-1">
                      Resolved by <strong>{a.approvedBy}</strong> · {new Date(a.resolvedAt).toLocaleDateString('en-GB')}
                    </p>
                  )}
                  {a.notes && <p className="text-xs text-gray-500 italic mt-1">Note: {a.notes}</p>}
                </div>
              </div>

              {canResolve && a.status === 'pending' && (
                <div className="mt-4 flex items-center gap-3 pt-4 border-t border-gray-50">
                  <input
                    placeholder="Optional note…"
                    value={notesMap[a.id] ?? ''}
                    onChange={e => setNotesMap(p => ({ ...p, [a.id]: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]"
                  />
                  <button
                    onClick={() => resolve(a.id, 'approved')}
                    disabled={acting === a.id}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                    {acting === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Approve
                  </button>
                  <button
                    onClick={() => resolve(a.id, 'rejected')}
                    disabled={acting === a.id}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors">
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
