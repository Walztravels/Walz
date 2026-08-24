'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { formatCurrencyMinor } from '@/lib/currency'

interface CCAItem {
  id:                string
  reference:         string
  status:            string
  cardholderName:    string
  cardholderEmail:   string
  travellerName:     string
  serviceType:       string
  bookingReference?: string
  currency:          string
  maxAmountMinor:    number
  totalChargedMinor: number
  cardLast4?:        string
  cardBrand?:        string
  validUntil:        string
  signedAt?:         string
  sentAt?:           string
  createdAt:         string
  createdBy:         string
}

const STATUS_STYLES: Record<string, string> = {
  draft:                   'bg-gray-100 text-gray-600',
  sent:                    'bg-blue-100 text-blue-700',
  opened:                  'bg-indigo-100 text-indigo-700',
  active:                  'bg-green-100 text-green-700',
  authentication_required: 'bg-amber-100 text-amber-700',
  partially_used:          'bg-teal-100 text-teal-700',
  fully_used:              'bg-slate-100 text-slate-600',
  expired:                 'bg-red-100 text-red-600',
  revoked:                 'bg-red-200 text-red-700',
  cancelled:               'bg-gray-200 text-gray-500',
}

const STATUS_LABELS: Record<string, string> = {
  draft:                   'Draft',
  sent:                    'Sent',
  opened:                  'Opened',
  active:                  'Active',
  authentication_required: 'Auth Required',
  partially_used:          'Partially Used',
  fully_used:              'Fully Used',
  expired:                 'Expired',
  revoked:                 'Revoked',
  cancelled:               'Cancelled',
}

const ALL_STATUSES = Object.keys(STATUS_LABELS)

export default function CreditCardAuthorizationsPage() {
  const [items,     setItems]     = useState<CCAItem[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [pages,     setPages]     = useState(1)
  const [status,    setStatus]    = useState('all')
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sp = new URLSearchParams({ page: String(page) })
      if (status !== 'all') sp.set('status', status)
      if (search.trim()) sp.set('search', search.trim())
      const r = await window.fetch(`/api/admin/credit-card-authorizations?${sp}`)
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
  }, [page, status, search])

  useEffect(() => { void fetch() }, [fetch])

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { setPage(1); void fetch() }
  }

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credit Card Authorisations</h1>
          <p className="text-sm text-gray-500 mt-1">{total} total</p>
        </div>
        <Link
          href="/admin/credit-card-authorizations/new"
          className="bg-[#0A1628] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#1a2a48] transition-colors"
        >
          + New Authorisation
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by name, email, reference…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleSearchKey}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
        />
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

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-40">Reference</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Cardholder</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Traveller</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Service</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Max Amount</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Charged</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Card</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Valid Until</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">Loading…</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">No authorisations found.</td>
                </tr>
              ) : items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/credit-card-authorizations/${item.id}`}
                      className="font-mono text-xs text-[#0A1628] font-semibold hover:underline"
                    >
                      {item.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{item.cardholderName}</p>
                    <p className="text-gray-500 text-xs">{item.cardholderEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-800">{item.travellerName}</p>
                    {item.bookingReference && (
                      <p className="text-gray-400 text-xs font-mono">{item.bookingReference}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{item.serviceType}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                    {formatCurrencyMinor(item.maxAmountMinor, item.currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {item.totalChargedMinor > 0
                      ? formatCurrencyMinor(item.totalChargedMinor, item.currency)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.cardLast4 ? (
                      <span className="font-mono text-xs">{item.cardBrand} ···{item.cardLast4}</span>
                    ) : (
                      <span className="text-gray-400 text-xs">Not saved</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(item.validUntil).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(item.createdAt).toLocaleDateString('en-GB')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
