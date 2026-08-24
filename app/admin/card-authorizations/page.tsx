'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Search, Plus, RefreshCw, CreditCard, Clock, CheckCircle, XCircle, AlertCircle, Banknote } from 'lucide-react'

interface CardAuth {
  id:          string
  status:      string
  amount:      number
  currency:    string
  description: string
  clientName:  string
  clientEmail: string
  bookingRef:  string | null
  authorizedAt: string | null
  capturedAt:   string | null
  expiresAt:    string | null
  createdAt:    string
  createdBy:    string
  capturedAmount: number | null
}

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  authorized: 'bg-blue-100 text-blue-800',
  captured:   'bg-green-100 text-green-800',
  released:   'bg-gray-100 text-gray-600',
  expired:    'bg-orange-100 text-orange-800',
  cancelled:  'bg-red-100 text-red-700',
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:    <Clock className="w-3.5 h-3.5" />,
  authorized: <CreditCard className="w-3.5 h-3.5" />,
  captured:   <CheckCircle className="w-3.5 h-3.5" />,
  released:   <XCircle className="w-3.5 h-3.5" />,
  expired:    <AlertCircle className="w-3.5 h-3.5" />,
  cancelled:  <XCircle className="w-3.5 h-3.5" />,
}

const STATUS_LABELS: Record<string, string> = {
  all:        'All',
  pending:    'Pending',
  authorized: 'Authorized',
  captured:   'Captured',
  released:   'Released',
  expired:    'Expired',
  cancelled:  'Cancelled',
}

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(amount)
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CardAuthorizationsPage() {
  const [items,   setItems]   = useState<CardAuth[]>([])
  const [loading, setLoading] = useState(true)
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [pages,   setPages]   = useState(1)
  const [status,  setStatus]  = useState('all')
  const [search,  setSearch]  = useState('')

  const load = useCallback(async (p: number, s: string, q: string) => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ page: String(p), status: s })
      if (q) sp.set('search', q)
      const r = await fetch(`/api/admin/card-authorizations?${sp}`)
      const d = await r.json() as { items: CardAuth[]; total: number; pages: number }
      setItems(d.items)
      setTotal(d.total)
      setPages(d.pages)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(page, status, search) }, [load, page, status, search])

  function handleStatusChange(s: string) {
    setStatus(s)
    setPage(1)
  }

  function handleSearch(q: string) {
    setSearch(q)
    setPage(1)
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Card Authorisations</h1>
          <p className="text-gray-400 text-sm mt-0.5">Pre-authorisation holds and captured payments</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => load(page, status, search)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            href="/admin/card-authorizations/new"
            className="flex items-center gap-1.5 bg-[#C9A84C] hover:bg-amber-500 text-[#0A1628] font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Request
          </Link>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => handleStatusChange(key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              status === key
                ? 'bg-[#C9A84C] border-[#C9A84C] text-[#0A1628] font-semibold'
                : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search by client, description, booking ref…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
        />
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total records', value: total, icon: <Banknote className="w-4 h-4 text-amber-400" /> },
          { label: 'Authorized holds', value: items.filter(i => i.status === 'authorized').length, icon: <CreditCard className="w-4 h-4 text-blue-400" /> },
          { label: 'Captured today', value: items.filter(i => i.status === 'captured' && i.capturedAt && new Date(i.capturedAt).toDateString() === new Date().toDateString()).length, icon: <CheckCircle className="w-4 h-4 text-green-400" /> },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
            {s.icon}
            <div>
              <p className="text-white font-bold text-lg leading-none">{s.value}</p>
              <p className="text-gray-500 text-xs mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-sm">No records found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">CLIENT</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">DESCRIPTION</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">AMOUNT</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">STATUS</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">CREATED</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">EXPIRES</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map(auth => (
                <tr key={auth.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{auth.clientName}</p>
                    <p className="text-gray-500 text-xs">{auth.clientEmail}</p>
                    {auth.bookingRef && <p className="text-gray-600 text-xs">Ref: {auth.bookingRef}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-300 max-w-[220px] truncate">{auth.description}</td>
                  <td className="px-4 py-3 text-white font-semibold tabular-nums">
                    {auth.status === 'captured' && auth.capturedAmount !== null && auth.capturedAmount !== auth.amount
                      ? <>
                          <span>{fmt(auth.capturedAmount, auth.currency)}</span>
                          <span className="text-gray-500 text-xs ml-1">of {fmt(auth.amount, auth.currency)}</span>
                        </>
                      : fmt(auth.amount, auth.currency)
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[auth.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {STATUS_ICON[auth.status]}
                      {auth.status.charAt(0).toUpperCase() + auth.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(auth.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {auth.status === 'authorized' && auth.expiresAt
                      ? <span className={new Date(auth.expiresAt) < new Date() ? 'text-red-400' : ''}>{fmtDate(auth.expiresAt)}</span>
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/card-authorizations/${auth.id}`}
                      className="text-xs text-[#C9A84C] hover:text-amber-300 transition-colors font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>{total} records total</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 rounded border border-gray-700 hover:border-gray-500 disabled:opacity-40 transition-colors"
            >
              ← Prev
            </button>
            <span className="px-3 py-1 text-white">{page} / {pages}</span>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="px-3 py-1 rounded border border-gray-700 hover:border-gray-500 disabled:opacity-40 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
