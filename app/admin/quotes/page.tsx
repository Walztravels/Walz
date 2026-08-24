'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuoteCount {
  items:         number
  flightOptions: number
  hotelOptions:  number
}

interface QuoteItem {
  id:              string
  reference:       string
  status:          string
  clientName:      string | null
  clientEmail:     string | null
  currency:        string
  title:           string
  totalMinor:      number
  subtotalMinor:   number
  validUntil:      string | null
  sentAt:          string | null
  viewCount:       number
  firstViewedAt:   string | null
  acceptedAt:      string | null
  createdBy:       string
  assignedTo:      string | null
  createdAt:       string
  updatedAt:       string
  _count:          QuoteCount
}

interface ApiResponse {
  items: QuoteItem[]
  total: number
  page:  number
  pages: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SYM: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  AED: 'AED ',
  CAD: 'CA$',
}

function fmtAmount(minor: number, currency: string): string {
  const sym = SYM[currency.toUpperCase()] ?? currency + ' '
  return `${sym}${(minor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB')
}

const STATUS_STYLES: Record<string, string> = {
  draft:              'bg-slate-100 text-slate-600',
  ready:              'bg-blue-100 text-blue-700',
  sent:               'bg-indigo-100 text-indigo-700',
  viewed:             'bg-purple-100 text-purple-700',
  changes_requested:  'bg-amber-100 text-amber-700',
  accepted:           'bg-green-100 text-green-700',
  declined:           'bg-red-100 text-red-600',
  expired:            'bg-red-50 text-red-400',
  converted:          'bg-emerald-100 text-emerald-700',
  cancelled:          'bg-gray-100 text-gray-500',
  archived:           'bg-gray-50 text-gray-400',
}

const STATUS_LABELS: Record<string, string> = {
  draft:              'Draft',
  ready:              'Ready',
  sent:               'Sent',
  viewed:             'Viewed',
  changes_requested:  'Changes Requested',
  accepted:           'Accepted',
  declined:           'Declined',
  expired:            'Expired',
  converted:          'Converted',
  cancelled:          'Cancelled',
  archived:           'Archived',
}

const ALL_STATUSES = Object.keys(STATUS_LABELS)

// Statuses where a "Send →" action makes sense
const SENDABLE = new Set(['draft', 'ready'])

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label:   string
  value:   string | number
  sub?:    string
  accent?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent ? 'text-[#C9A84C]' : 'text-gray-900'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
        STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const [items,   setItems]   = useState<QuoteItem[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [pages,   setPages]   = useState(1)
  const [status,  setStatus]  = useState('all')
  const [q,       setQ]       = useState('')
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // Debounce search input
  const [debouncedQ, setDebouncedQ] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = (value: string) => {
    setQ(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(value)
      setPage(1)
    }, 400)
  }

  const handleClear = () => {
    setQ('')
    setDebouncedQ('')
    setStatus('all')
    setPage(1)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sp = new URLSearchParams({ page: String(page) })
      if (status !== 'all') sp.set('status', status)
      if (debouncedQ.trim()) sp.set('q', debouncedQ.trim())
      const r = await window.fetch(`/api/admin/quotes?${sp}`)
      const d: ApiResponse = await r.json()
      if (!r.ok) throw new Error((d as unknown as { error?: string }).error ?? 'Failed to load')
      setItems(d.items)
      setTotal(d.total)
      setPages(d.pages)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [page, status, debouncedQ])

  useEffect(() => { void load() }, [load])

  // Derived KPIs from current page data (supplemented by the total from the API)
  const sentOrViewed = items.filter(i => i.status === 'sent' || i.status === 'viewed').length
  const accepted     = items.filter(i => i.status === 'accepted' || i.status === 'converted').length
  const declined     = items.filter(i => i.status === 'declined' || i.status === 'cancelled').length
  const convRate     = items.length > 0
    ? `${Math.round((accepted / items.length) * 100)}%`
    : '—'

  const hasFilters = status !== 'all' || debouncedQ.trim().length > 0

  return (
    <div className="p-6 max-w-screen-xl mx-auto">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotes &amp; Proposals</h1>
          <p className="text-sm text-gray-500 mt-1">{total} total</p>
        </div>
        <Link
          href="/admin/quotes/new"
          className="bg-[#0A1628] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#1a2a48] transition-colors"
        >
          + New Quote
        </Link>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total Quotes"      value={total}      sub="across all statuses" />
        <KpiCard label="Sent / Viewed"     value={sentOrViewed} sub="awaiting response" />
        <KpiCard label="Accepted"          value={accepted}   sub="incl. converted" accent />
        <KpiCard label="Declined / Cancelled" value={declined} sub={`page conv. rate ${convRate}`} />
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
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

        <input
          type="text"
          value={q}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search reference, client, title…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
        />

        {hasFilters && (
          <button
            onClick={handleClear}
            className="text-sm text-gray-500 hover:text-gray-800 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Reference</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Title</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Amount</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Valid Until</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Views</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Sent</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">Loading…</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">No quotes found.</td>
                </tr>
              ) : items.map(q => (
                <tr key={q.id} className="hover:bg-gray-50 transition-colors">

                  {/* Reference */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-bold text-gray-800 whitespace-nowrap">
                      {q.reference}
                    </span>
                  </td>

                  {/* Client */}
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 whitespace-nowrap">{q.clientName ?? '—'}</p>
                    {q.clientEmail && (
                      <p className="text-gray-400 text-xs">{q.clientEmail}</p>
                    )}
                  </td>

                  {/* Title */}
                  <td className="px-4 py-3 text-gray-700 max-w-[220px]">
                    <p className="truncate" title={q.title}>{q.title}</p>
                  </td>

                  {/* Amount */}
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                    {fmtAmount(q.totalMinor, q.currency)}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={q.status} />
                  </td>

                  {/* Valid Until */}
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {fmtDate(q.validUntil)}
                  </td>

                  {/* Views */}
                  <td className="px-4 py-3 text-center text-xs text-gray-500">
                    {q.viewCount > 0 ? `${q.viewCount} view${q.viewCount === 1 ? '' : 's'}` : '—'}
                  </td>

                  {/* Sent */}
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {fmtDate(q.sentAt)}
                  </td>

                  {/* Created */}
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {fmtDate(q.createdAt)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {SENDABLE.has(q.status) && (
                        <Link
                          href={`/admin/quotes/${q.id}?send=1`}
                          className="text-xs font-semibold text-indigo-600 hover:underline whitespace-nowrap"
                        >
                          Send →
                        </Link>
                      )}
                      <Link
                        href={`/admin/quotes/${q.id}`}
                        className="text-xs font-semibold text-[#C9A84C] hover:underline whitespace-nowrap"
                      >
                        View →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">Page {page} of {pages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
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
