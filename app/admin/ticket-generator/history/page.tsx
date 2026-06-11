'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, Download, Search,
  Plane, Hotel, MapIcon, Car, FileText, Package2,
  RefreshCw, Plus, ExternalLink
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TicketRow {
  id: string; ticket_reference: string
  client_name: string | null; client_email: string | null
  ticket_type: string; pdf_url: string | null
  sent_to_client: boolean; sent_at: string | null
  created_by: string | null; created_at: string
}

interface Pagination { page: number; limit: number; total: number; pages: number }

// ─── Constants ─────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  flight:   <Plane    className="w-3.5 h-3.5" />,
  hotel:    <Hotel    className="w-3.5 h-3.5" />,
  tour:     <MapIcon  className="w-3.5 h-3.5" />,
  transfer: <Car      className="w-3.5 h-3.5" />,
  visa:     <FileText className="w-3.5 h-3.5" />,
  package:  <Package2 className="w-3.5 h-3.5" />,
}

const TYPE_COLORS: Record<string, string> = {
  flight: 'bg-blue-100 text-blue-700', hotel: 'bg-green-100 text-green-700',
  tour: 'bg-purple-100 text-purple-700', transfer: 'bg-amber-100 text-amber-700',
  visa: 'bg-red-100 text-red-700', package: 'bg-[#C9A84C]/15 text-[#92400E]',
}

const TYPE_LABELS: Record<string, string> = {
  flight: 'Flight', hotel: 'Hotel', tour: 'Tour',
  transfer: 'Transfer', visa: 'Visa', package: 'Package',
}

const TYPE_FILTERS = ['all', 'flight', 'hotel', 'tour', 'transfer', 'visa', 'package']

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TicketHistoryPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type, page: String(page) })
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/ticket-generator/history?${params}`)
      const data = await res.json()
      setTickets(data.tickets ?? [])
      setPagination(data.pagination ?? { page: 1, limit: 50, total: 0, pages: 0 })
    } catch {
      setTickets([])
    } finally {
      setLoading(false)
    }
  }, [type, page, search])

  useEffect(() => { void load() }, [load])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  function handleTypeFilter(t: string) {
    setType(t)
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/ticket-generator" className="p-1.5 rounded-lg hover:bg-gray-100 transition">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-lg font-black text-[#0B1F3A]">Ticket History</h1>
              <p className="text-xs text-gray-500 mt-0.5">{pagination.total} total documents generated</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <Link href="/admin/ticket-generator"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-[#C9A84C] text-[#0B1F3A] rounded-lg hover:bg-[#B8973B] transition">
              <Plus className="w-3.5 h-3.5" /> New Ticket
            </Link>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search name, email, reference…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C] bg-white"
              />
            </div>
            <button type="submit" className="px-4 py-2 text-xs font-bold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#0f2a4a] transition">
              Search
            </button>
          </form>
          {/* Type filter */}
          <div className="flex gap-1.5 flex-wrap">
            {TYPE_FILTERS.map(t => (
              <button key={t} onClick={() => handleTypeFilter(t)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg capitalize transition ${
                  type === t ? 'bg-[#0B1F3A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {t === 'all' ? 'All Types' : TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">🎫</div>
              <p className="text-sm font-medium">No tickets found</p>
              <p className="text-xs mt-1">Try adjusting your search or filters</p>
              <Link href="/admin/ticket-generator"
                className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-xs font-bold bg-[#C9A84C] text-[#0B1F3A] rounded-lg hover:bg-[#B8973B] transition">
                <Plus className="w-3.5 h-3.5" /> Generate First Ticket
              </Link>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['Reference', 'Client', 'Type', 'Status', 'Sent At', 'Created By', 'PDF'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tickets.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono font-bold text-[#0B1F3A]">{t.ticket_reference}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-semibold text-[#0B1F3A]">{t.client_name || '—'}</div>
                          <div className="text-[10px] text-gray-400">{t.client_email || ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${TYPE_COLORS[t.ticket_type] ?? 'bg-gray-100 text-gray-600'}`}>
                            {TYPE_ICONS[t.ticket_type]}
                            {TYPE_LABELS[t.ticket_type] ?? t.ticket_type}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {t.sent_to_client ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                              ✓ Sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">
                              Draft
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(t.sent_at)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{t.created_by || '—'}</td>
                        <td className="px-4 py-3">
                          {t.pdf_url ? (
                            <a href={t.pdf_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition">
                              <Download className="w-3 h-3" /> PDF
                            </a>
                          ) : (
                            <span className="text-[10px] text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-100">
                {tickets.map(t => (
                  <div key={t.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-mono font-bold text-[#0B1F3A]">{t.ticket_reference}</div>
                        <div className="text-xs font-semibold text-gray-700 mt-0.5">{t.client_name || '—'}</div>
                        <div className="text-[10px] text-gray-400">{t.client_email || ''}</div>
                      </div>
                      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${TYPE_COLORS[t.ticket_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_ICONS[t.ticket_type]}
                        {TYPE_LABELS[t.ticket_type] ?? t.ticket_type}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {t.sent_to_client ? (
                          <span className="text-[10px] font-bold text-green-600">✓ Sent {fmtDate(t.sent_at)}</span>
                        ) : (
                          <span className="text-[10px] text-gray-400">Draft</span>
                        )}
                      </div>
                      {t.pdf_url && (
                        <a href={t.pdf_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] font-bold text-[#0B1F3A] hover:text-[#C9A84C] transition">
                          <Download className="w-3 h-3" /> Download PDF
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition disabled:opacity-30">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-semibold text-[#0B1F3A]">{page} / {pagination.pages}</span>
              <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page >= pagination.pages}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition disabled:opacity-30">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
