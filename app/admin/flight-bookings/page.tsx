'use client'

import { useState, useEffect, useCallback } from 'react'
import Link                                  from 'next/link'
import { Plane, Clock, CheckCircle, Ticket, RefreshCw, AlertTriangle } from 'lucide-react'

type BookingStatus = 'pending_review' | 'payment_confirmed' | 'booking_placed' | 'ticket_issued' | 'cancelled' | 'booking_failed' | 'refunded'

interface FlightBooking {
  id:               string
  reference:        string
  status:           BookingStatus
  clientName:       string | null
  clientEmail:      string
  searchedOrigin:   string | null
  searchedDest:     string | null
  departDate:       string | null
  paidAmount:       string | null
  currency:         string
  paymentMethod:    string | null
  offerExpiresAt:   string | null
  duffelBookingRef: string | null
  createdAt:        string
}

const COLUMNS: { key: BookingStatus; label: string; Icon: React.ElementType; border: string; bg: string; text: string }[] = [
  { key: 'pending_review',    label: '🔔 Pending Review',   Icon: Clock,         border: 'border-amber-200',  bg: 'bg-amber-50',  text: 'text-amber-800'  },
  { key: 'payment_confirmed', label: '✓ Payment Confirmed', Icon: CheckCircle,   border: 'border-blue-200',   bg: 'bg-blue-50',   text: 'text-blue-800'   },
  { key: 'booking_placed',    label: '✈ Booking Placed',    Icon: Plane,         border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-800' },
  { key: 'ticket_issued',     label: '🎫 Ticket Issued',    Icon: Ticket,        border: 'border-green-200',  bg: 'bg-green-50',  text: 'text-green-800'  },
]

const FAILED_STATUSES: BookingStatus[] = ['cancelled', 'booking_failed', 'refunded']

function offerExpiry(expiresAt: string | null): { text: string; urgent: boolean; expired: boolean } | null {
  if (!expiresAt) return null
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return { text: 'EXPIRED', urgent: false, expired: true }
  const hrs  = Math.floor(diff / 3_600_000)
  const mins = Math.floor((diff % 3_600_000) / 60_000)
  return { text: `${hrs}h ${mins}m`, urgent: diff < 7_200_000, expired: false }
}

function timeAgo(iso: string) {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    if (diff < 60_000)    return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return `${Math.floor(diff / 86_400_000)}d ago`
  } catch { return '' }
}

function BookingCard({ b }: { b: FlightBooking }) {
  const needsExpiry = ['pending_review', 'payment_confirmed'].includes(b.status)
  const expiry = needsExpiry ? offerExpiry(b.offerExpiresAt) : null

  return (
    <Link href={`/admin/flight-bookings/${b.id}`}>
      <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-[#C9A84C] hover:shadow-md transition-all cursor-pointer group">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[11px] font-bold text-[#0B1F3A] bg-gray-100 px-2 py-0.5 rounded">
            {b.reference}
          </span>
          {b.duffelBookingRef && (
            <span className="text-[10px] text-gray-400 font-mono">{b.duffelBookingRef}</span>
          )}
        </div>

        <p className="text-sm font-semibold text-[#0B1F3A] truncate group-hover:text-[#C9A84C]">
          {b.clientName ?? b.clientEmail}
        </p>
        <p className="text-xs text-gray-400 truncate mb-2">{b.clientEmail}</p>

        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
          <Plane className="w-3 h-3 text-[#C9A84C] flex-shrink-0" />
          <span className="font-medium">{b.searchedOrigin ?? '?'} → {b.searchedDest ?? '?'}</span>
          {b.departDate && <span className="text-gray-400 ml-1">{b.departDate}</span>}
        </div>

        {b.paidAmount && (
          <p className="text-sm font-bold text-[#0B1F3A]">
            {b.currency} {b.paidAmount}
            {b.paymentMethod && <span className="text-xs font-normal text-gray-400 ml-1">via {b.paymentMethod}</span>}
          </p>
        )}

        {expiry && (
          <div className={`mt-2 text-[10px] font-semibold px-2 py-1 rounded-full inline-flex items-center gap-1 ${
            expiry.expired ? 'bg-red-100 text-red-700' :
            expiry.urgent  ? 'bg-amber-100 text-amber-700' :
            'bg-gray-100 text-gray-500'
          }`}>
            {expiry.expired ? (
              <><AlertTriangle className="w-3 h-3" /> Offer expired</>
            ) : (
              <><Clock className="w-3 h-3" /> Expires in {expiry.text}</>
            )}
          </div>
        )}

        <p className="text-[10px] text-gray-400 mt-2">{timeAgo(b.createdAt)}</p>
      </div>
    </Link>
  )
}

export default function FlightBookingsPage() {
  const [bookings,   setBookings]   = useState<FlightBooking[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const res  = await fetch('/api/admin/flight-bookings')
      const data = await res.json()
      setBookings(data.bookings ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const byStatus = (s: BookingStatus) => bookings.filter(b => b.status === s)
  const pending  = byStatus('pending_review').length

  if (loading) return (
    <div className="flex items-center justify-center min-h-96">
      <RefreshCw className="w-8 h-8 animate-spin text-[#C9A84C]" />
    </div>
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Flight Bookings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pending > 0 && (
              <span className="text-amber-600 font-semibold">{pending} pending review · </span>
            )}
            {bookings.length} total
          </p>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-[#0B1F3A] text-white rounded-xl text-sm hover:bg-[#0d2345] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Pipeline columns */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        {COLUMNS.map(col => {
          const items = byStatus(col.key)
          return (
            <div key={col.key} className={`rounded-2xl border p-4 ${col.bg} ${col.border}`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className={`text-sm font-bold ${col.text}`}>{col.label}</h2>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${col.text} ${col.border} bg-white`}>
                  {items.length}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No bookings</p>
              ) : (
                <div className="space-y-3">
                  {items.map(b => <BookingCard key={b.id} b={b} />)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Cancelled / Failed */}
      {bookings.some(b => FAILED_STATUSES.includes(b.status)) && (
        <div>
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Cancelled / Failed</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {bookings
              .filter(b => FAILED_STATUSES.includes(b.status))
              .map(b => <BookingCard key={b.id} b={b} />)}
          </div>
        </div>
      )}
    </div>
  )
}
