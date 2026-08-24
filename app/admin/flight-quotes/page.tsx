'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface QuoteItem {
  id:            string
  status:        string
  clientName:    string | null
  clientEmail:   string | null
  origin:        string
  destination:   string
  departureDate: string
  airline:       string
  cabinClass:    string
  displayPrice:  string
  currency:      string
  createdBy:     string
  createdAt:     string
  viewedAt:      string | null
  approvedAt:    string | null
  expiresAt:     string
}

const SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$' }
function fmt(amount: string, currency: string) {
  const sym = SYM[currency.toUpperCase()] ?? currency + ' '
  return `${sym}${parseFloat(amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
}

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-blue-100 text-blue-700',
  viewed:   'bg-indigo-100 text-indigo-700',
  approved: 'bg-green-100 text-green-700',
  expired:  'bg-red-100 text-red-600',
  booked:   'bg-slate-100 text-slate-600',
}
const STATUS_LABELS: Record<string, string> = {
  pending:  'Pending',
  viewed:   'Viewed',
  approved: 'Approved',
  expired:  'Expired',
  booked:   'Booked',
}

const ALL_STATUSES = Object.keys(STATUS_LABELS)

export default function FlightQuotesPage() {
  const [items,   setItems]   = useState<QuoteItem[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [pages,   setPages]   = useState(1)
  const [status,  setStatus]  = useState('all')
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const sp = new URLSearchParams({ page: String(page) })
      if (status !== 'all') sp.set('status', status)
      const r = await window.fetch(`/api/admin/flight-quotes?${sp}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Failed to load')
      setItems(d.items)
      setTotal(d.total)
      setPages(d.pages)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => { void load() }, [load])

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Flight Quotes</h1>
          <p className="text-sm text-gray-500 mt-1">{total} total</p>
        </div>
        <Link
          href="/admin/book/flight"
          className="bg-[#0A1628] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#1a2a48] transition-colors"
        >
          + New Booking / Quote
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
        >
          <option value="all">All statuses</option>
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Route</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Departure</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Airline</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Price</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Expires</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">Loading…</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">No quotes found.</td>
                </tr>
              ) : items.map(q => (
                <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{q.clientName ?? '—'}</p>
                    {q.clientEmail && <p className="text-gray-400 text-xs">{q.clientEmail}</p>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900">
                    {q.origin} → {q.destination}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs">
                    {new Date(q.departureDate).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{q.airline}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                    {fmt(q.displayPrice, q.currency)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[q.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[q.status] ?? q.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(q.expiresAt).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(q.createdAt).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {q.status === 'approved' && (
                      <Link
                        href={`/admin/book/flight?quoteId=${q.id}`}
                        className="text-xs font-semibold text-[#C9A84C] hover:underline whitespace-nowrap"
                      >
                        Verify &amp; Book →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">Page {page} of {pages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
