'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import {
  Search, RefreshCw, Shield, Download, CheckCircle,
  Clock, XCircle, ChevronLeft, ChevronRight, MapPin, Calendar,
  ExternalLink,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface InsuranceOrder {
  id:                  string
  client_id:           string | null
  battleface_order_id: string
  order_reference:     string | null
  plan_name:           string | null
  status:              string
  premium:             number
  currency:            string
  destination_country: string
  trip_start_date:     string
  trip_end_date:       string
  policy_number:       string | null
  policy_document_url: string | null
  stripe_payment_id:   string | null
  created_at:          string
  updated_at:          string
  client_email:        string | null
  client_name:         string | null
}

interface Pagination {
  page: number; limit: number; total: number; pages: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case 'approved':
      return <span className="inline-flex items-center gap-1 text-xs font-semibold bg-green-100 text-green-700 px-2.5 py-1 rounded-full"><CheckCircle className="w-3 h-3" />Active</span>
    case 'pending':
      return <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full"><Clock className="w-3 h-3" />Pending</span>
    case 'cancelled':
      return <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-100 text-red-600 px-2.5 py-1 rounded-full"><XCircle className="w-3 h-3" />Cancelled</span>
    default:
      return <span className="inline-flex items-center gap-1 text-xs font-semibold bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">{status}</span>
  }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdminInsurancePage() {
  const [orders,     setOrders]     = useState<InsuranceOrder[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 })
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [status,     setStatus]     = useState('all')
  const [page,       setPage]       = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status, page: String(page), limit: '50' })
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/insurance?${params}`)
      const d   = await res.json()
      setOrders(d.orders ?? [])
      setPagination(d.pagination ?? { page: 1, limit: 50, total: 0, pages: 0 })
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [status, page, search])

  useEffect(() => { load() }, [load])

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [status, search])

  // Stats derived from current page (full stats would need a separate endpoint)
  const approvedCount = orders.filter(o => o.status === 'approved').length
  const pendingCount  = orders.filter(o => o.status === 'pending').length
  const totalPremium  = orders.filter(o => o.status === 'approved').reduce((s, o) => s + Number(o.premium), 0)

  return (
    <div className="space-y-6">

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#0B1F3A]">Insurance Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">Walz Travel Shield — powered by Battleface</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:border-gray-300 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Orders',   value: pagination.total,                 sub: 'all time',          color: 'text-[#0B1F3A]' },
          { label: 'Active Policies', value: approvedCount,                    sub: 'this page',          color: 'text-green-600' },
          { label: 'Pending Payment', value: pendingCount,                     sub: 'this page',          color: 'text-amber-600' },
          { label: 'Premium (page)',  value: `USD ${totalPremium.toFixed(2)}`, sub: 'active orders',     color: 'text-[#C9A84C]' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 px-4 py-4">
            <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs font-semibold text-gray-600 mt-0.5">{c.label}</div>
            <div className="text-xs text-gray-400">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white rounded-xl border border-gray-100 p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by client email, policy or order reference…"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#0B1F3A] transition-colors"
          />
        </div>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#0B1F3A] bg-white text-gray-700 font-medium"
        >
          <option value="all">All Statuses</option>
          <option value="approved">Active</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading orders…</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <Shield className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="font-semibold text-gray-500 text-sm">No insurance orders found</p>
            <p className="text-xs text-gray-400 mt-1">
              {search || status !== 'all' ? 'Try adjusting your filters.' : 'Insurance orders will appear here once clients purchase policies.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-[#F8F9FA]">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Destination</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Travel Dates</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Premium</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Policy Ref</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ordered</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map(o => {
                    const ref = o.policy_number || o.order_reference || o.battleface_order_id
                    return (
                      <tr key={o.id} className="hover:bg-[#F8F9FA] transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-[#0B1F3A] text-sm truncate max-w-[180px]">
                            {o.client_name || o.client_email || '—'}
                          </div>
                          {o.client_name && o.client_email && (
                            <div className="text-xs text-gray-400 truncate max-w-[180px]">{o.client_email}</div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-700">
                          {o.plan_name ?? 'Walz Travel Shield'}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="flex items-center gap-1 text-sm text-gray-700">
                            <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                            {o.destination_country}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                            <Calendar className="w-3 h-3 text-gray-400 shrink-0" />
                            {o.trip_start_date} → {o.trip_end_date}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-bold text-[#0B1F3A] text-sm whitespace-nowrap">
                          {o.currency} {Number(o.premium).toFixed(2)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-xs text-gray-700 select-all">{ref}</span>
                        </td>
                        <td className="px-4 py-3.5">{statusBadge(o.status)}</td>
                        <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                          {format(new Date(o.created_at), 'd MMM yyyy')}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            {o.policy_document_url && (
                              <a
                                href={o.policy_document_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Download policy document"
                                className="p-1.5 rounded-lg hover:bg-[#C9A84C]/10 text-[#C9A84C] transition-colors"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            )}
                            {o.stripe_payment_id && (
                              <a
                                href={`https://dashboard.stripe.com/payments/${o.stripe_payment_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View in Stripe"
                                className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-400 transition-colors"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-gray-100">
              {orders.map(o => {
                const ref = o.policy_number || o.order_reference || o.battleface_order_id
                return (
                  <div key={o.id} className="px-4 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[#0B1F3A] text-sm">
                          {o.client_name || o.client_email || 'Unknown'}
                        </div>
                        <div className="text-xs text-gray-400">{o.plan_name ?? 'Walz Travel Shield'}</div>
                      </div>
                      {statusBadge(o.status)}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{o.destination_country}</span>
                      <span className="font-bold text-[#0B1F3A]">{o.currency} {Number(o.premium).toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {o.trip_start_date} → {o.trip_end_date}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-gray-500">{ref}</span>
                      <div className="flex items-center gap-2">
                        {o.policy_document_url && (
                          <a href={o.policy_document_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-semibold text-[#C9A84C]">
                            <Download className="w-3.5 h-3.5" /> Download
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-[#F8F9FA]">
                <span className="text-xs text-gray-500">
                  Showing {((page - 1) * pagination.limit) + 1}–{Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-2 rounded-lg hover:bg-white border border-gray-200 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-semibold text-[#0B1F3A] px-2">
                    {page} / {pagination.pages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                    disabled={page >= pagination.pages}
                    className="p-2 rounded-lg hover:bg-white border border-gray-200 disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
