'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────
interface PackageBooking {
  id:             string
  booking_ref:    string
  client_name:    string
  client_email:   string
  client_phone?:  string | null
  package_id:     string
  package_title?: string | null
  package_slug?:  string | null
  travellers:     number
  currency:       string
  total_amount:   number | string
  payment_status: 'pending' | 'deposit_paid' | 'fully_paid'
  status:         'pending' | 'confirmed' | 'cancelled'
  created_at:     string
}

type FilterTab = 'all' | 'pending' | 'confirmed' | 'cancelled'

// ── Badge helpers ─────────────────────────────────────────────────────────────
function paymentBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    pending:      { label: 'Pending',      className: 'bg-yellow-100 text-yellow-800 border border-yellow-200' },
    deposit_paid: { label: 'Deposit Paid', className: 'bg-blue-100   text-blue-800   border border-blue-200'   },
    fully_paid:   { label: 'Fully Paid',   className: 'bg-green-100  text-green-800  border border-green-200'  },
  }
  const cfg = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-700 border border-gray-200' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    pending:   { label: 'Pending',   className: 'bg-gray-100  text-gray-700  border border-gray-200'  },
    confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800 border border-green-200' },
    cancelled: { label: 'Cancelled', className: 'bg-red-100   text-red-800   border border-red-200'   },
  }
  const cfg = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-700 border border-gray-200' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

// ── Currency formatter ────────────────────────────────────────────────────────
function fmtCurrency(currency: string, amount: number | string) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return `${currency} —`
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(num)
  } catch {
    return `${currency} ${num.toFixed(2)}`
  }
}

// ── WhatsApp button ───────────────────────────────────────────────────────────
function WhatsAppButton({ booking }: { booking: PackageBooking }) {
  if (!booking.client_phone) return null
  const phone = booking.client_phone.replace(/\D/g, '').replace(/^0/, '44')
  const text  = encodeURIComponent(
    `Hi ${booking.client_name}, regarding your Walz Travels booking ${booking.booking_ref} — we wanted to follow up with you. Please let us know if you have any questions!`
  )
  return (
    <a
      href={`https://wa.me/${phone}?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      title="WhatsApp client"
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors flex-shrink-0"
    >
      {/* WhatsApp icon */}
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.122 1.524 5.855L.057 23.428a.5.5 0 00.609.61l5.652-1.485A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.808 9.808 0 01-4.99-1.364l-.357-.213-3.707.974.988-3.612-.234-.373A9.78 9.78 0 012.182 12C2.182 6.565 6.565 2.182 12 2.182S21.818 6.565 21.818 12 17.435 21.818 12 21.818z"/>
      </svg>
    </a>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PackageBookingsPage() {
  const [bookings,    setBookings]    = useState<PackageBooking[]>([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState<FilterTab>('all')
  const [updating,    setUpdating]    = useState<string | null>(null)

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/package-bookings')
      const data = await res.json() as PackageBooking[]
      setBookings(Array.isArray(data) ? data : [])
    } catch {
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  async function patchBooking(id: string, patch: Partial<Pick<PackageBooking, 'status' | 'payment_status'>>) {
    setUpdating(id)
    try {
      await fetch(`/api/admin/package-bookings/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      setBookings(prev =>
        prev.map(b => b.id === id ? { ...b, ...patch } : b)
      )
    } finally {
      setUpdating(null)
    }
  }

  // ── Derived stats ───────────────────────────────────────────────────────────
  const totalRevenue = bookings
    .filter(b => b.payment_status === 'fully_paid')
    .reduce((sum, b) => sum + (typeof b.total_amount === 'string' ? parseFloat(b.total_amount) : b.total_amount), 0)

  const pendingCount   = bookings.filter(b => b.status === 'pending').length
  const confirmedCount = bookings.filter(b => b.status === 'confirmed').length

  const filtered = activeTab === 'all'
    ? bookings
    : bookings.filter(b => b.status === activeTab)

  // ── Render ──────────────────────────────────────────────────────────────────
  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all',       label: 'All',       count: bookings.length   },
    { key: 'pending',   label: 'Pending',   count: pendingCount      },
    { key: 'confirmed', label: 'Confirmed', count: confirmedCount    },
    { key: 'cancelled', label: 'Cancelled', count: bookings.filter(b => b.status === 'cancelled').length },
  ]

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      {/* Page header */}
      <div className="bg-[#0B1F3A] px-8 py-6 border-b border-white/10">
        <h1 className="text-2xl font-bold text-white">Package Bookings</h1>
        <p className="text-white/50 text-sm mt-0.5">Manage travel package reservations</p>
      </div>

      <div className="px-8 py-6 space-y-6">

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Bookings', value: bookings.length.toString(),     accent: false },
            { label: 'Pending',        value: pendingCount.toString(),         accent: false },
            { label: 'Confirmed',      value: confirmedCount.toString(),        accent: false },
            {
              label: 'Revenue (Paid)',
              value: isNaN(totalRevenue)
                ? '—'
                : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(totalRevenue),
              accent: true,
            },
          ].map(({ label, value, accent }) => (
            <div key={label} className={`rounded-xl p-5 ${accent ? 'bg-[#0B1F3A]' : 'bg-white border border-gray-200'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${accent ? 'text-[#C9A84C]' : 'text-gray-400'}`}>
                {label}
              </p>
              <p className={`text-2xl font-bold ${accent ? 'text-white' : 'text-[#0B1F3A]'}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1.5 border border-gray-200 w-fit">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === key
                  ? 'bg-[#0B1F3A] text-white shadow-sm'
                  : 'text-gray-500 hover:text-[#0B1F3A] hover:bg-gray-50'
              }`}
            >
              {label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading bookings…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <svg className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="font-medium">No bookings found</p>
              <p className="text-sm mt-0.5">
                {activeTab !== 'all' ? `No ${activeTab} bookings at the moment.` : 'No package bookings yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Booking Ref', 'Client', 'Package', 'Travellers', 'Total', 'Payment', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(booking => {
                    const isUpdating = updating === booking.id
                    return (
                      <tr key={booking.id} className="hover:bg-gray-50/60 transition-colors">

                        {/* Booking Ref */}
                        <td className="px-4 py-4">
                          <span className="font-mono text-xs font-semibold text-[#C9A84C] bg-[#0B1F3A] px-2 py-1 rounded">
                            {booking.booking_ref}
                          </span>
                        </td>

                        {/* Client */}
                        <td className="px-4 py-4 min-w-[160px]">
                          <p className="font-semibold text-[#0B1F3A] leading-tight">{booking.client_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{booking.client_email}</p>
                        </td>

                        {/* Package */}
                        <td className="px-4 py-4 min-w-[180px]">
                          {booking.package_slug ? (
                            <Link
                              href={`/packages/${booking.package_slug}`}
                              target="_blank"
                              className="text-[#0B1F3A] font-medium hover:text-[#C9A84C] transition-colors underline underline-offset-2"
                            >
                              {booking.package_title ?? booking.package_id}
                            </Link>
                          ) : (
                            <span className="text-gray-500">{booking.package_title ?? booking.package_id}</span>
                          )}
                        </td>

                        {/* Travellers */}
                        <td className="px-4 py-4 text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#0B1F3A]/10 text-[#0B1F3A] font-bold text-xs">
                            {booking.travellers}
                          </span>
                        </td>

                        {/* Total */}
                        <td className="px-4 py-4 whitespace-nowrap font-semibold text-[#0B1F3A]">
                          {fmtCurrency(booking.currency ?? 'GBP', booking.total_amount)}
                        </td>

                        {/* Payment status */}
                        <td className="px-4 py-4">
                          {paymentBadge(booking.payment_status)}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          {statusBadge(booking.status)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 flex-wrap">

                            {/* WhatsApp */}
                            <WhatsAppButton booking={booking} />

                            {/* Status dropdown */}
                            <div className="relative">
                              <select
                                disabled={isUpdating}
                                value={booking.status}
                                onChange={e => patchBooking(booking.id, { status: e.target.value as PackageBooking['status'] })}
                                className="appearance-none text-xs font-medium px-2.5 py-1.5 pr-6 rounded-lg border border-gray-200 bg-white text-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C] disabled:opacity-50 cursor-pointer hover:border-gray-300 transition-colors"
                              >
                                <option value="pending">Pending</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                              <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>

                            {/* Payment dropdown */}
                            <div className="relative">
                              <select
                                disabled={isUpdating}
                                value={booking.payment_status}
                                onChange={e => patchBooking(booking.id, { payment_status: e.target.value as PackageBooking['payment_status'] })}
                                className="appearance-none text-xs font-medium px-2.5 py-1.5 pr-6 rounded-lg border border-gray-200 bg-white text-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C] disabled:opacity-50 cursor-pointer hover:border-gray-300 transition-colors"
                              >
                                <option value="pending">Pending</option>
                                <option value="deposit_paid">Deposit Paid</option>
                                <option value="fully_paid">Fully Paid</option>
                              </select>
                              <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>

                            {/* Spinner while updating */}
                            {isUpdating && (
                              <svg className="w-4 h-4 animate-spin text-[#C9A84C] flex-shrink-0" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
