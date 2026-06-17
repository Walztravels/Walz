'use client'

import { useEffect, useState, useCallback } from 'react'
import { Car, Search, RefreshCw, Loader2 } from 'lucide-react'

interface Transfer {
  id: string
  bookingReference: string
  totalAmount: number
  currency: string
  status: string
  paymentStatus: string
  contactEmail: string
  contactPhone: string | null
  flightDetails: Record<string, unknown> | null
  hotelDetails: Record<string, unknown> | null
  notes: string | null
  createdAt: string
  user: { name: string | null; email: string | null } | null
}

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: 'bg-green-100 text-green-700',
  PENDING:   'bg-amber-100 text-amber-700',
  CANCELLED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  FAILED:    'bg-red-100 text-red-700',
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/transfers')
    const d   = await res.json()
    setTransfers(d.transfers ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = transfers.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${t.bookingReference} ${t.contactEmail} ${t.user?.name ?? ''}`.toLowerCase().includes(q)
  })

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Transfers</h1>
          <p className="text-sm text-gray-400 mt-0.5">{transfers.length} transfer bookings</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-[#C9A84C] transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by reference, email or client name…"
          className="w-full pl-9 pr-4 h-10 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-3 text-gray-400">
          <Car className="w-10 h-10 text-gray-200" />
          <p className="text-sm">No transfer bookings found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Reference', 'Client', 'Contact', 'Amount', 'Status', 'Payment', 'Date'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-[#C9A84C] font-semibold">{t.bookingReference}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#0B1F3A] text-sm">{t.user?.name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{t.user?.email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-600">{t.contactEmail}</p>
                      {t.contactPhone && <p className="text-xs text-gray-400">{t.contactPhone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#0B1F3A] text-sm">
                        {t.currency} {t.totalAmount.toLocaleString()}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${STATUS_STYLE[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${STATUS_STYLE[t.paymentStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
