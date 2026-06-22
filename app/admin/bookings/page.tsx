'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronDown, ChevronUp, CheckCircle, XCircle, Send, RefreshCw, Ticket } from 'lucide-react'
import { CallButton } from '@/components/admin/CallButton'
import { format } from 'date-fns'

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'FAILED'

interface Booking {
  id: string
  bookingReference: string
  pnr: string | null
  status: BookingStatus
  paymentStatus: string
  totalAmount: number
  currency: string
  contactEmail: string
  contactPhone: string | null
  createdAt: string
  passengers: Array<{
    firstName: string; lastName: string; type: string; gender: string
    dateOfBirth: string; passportNumber: string; passportExpiry: string; nationality: string
    email?: string; phone?: string
  }>
  flightDetails: {
    outbound?: Array<{ departureAirport: string; arrivalAirport: string; departureTime: string; airline: string; flightNumber: string }>
    duffelOfferId?: string; duffelOrderId?: string
  } | null
  addons: Array<{ description: string; price: number; selected: boolean }> | null
}

interface CancelTarget {
  id: string
  ref: string
  amount: number
  currency: string
  email: string
}

const STATUS_TABS = ['ALL', 'PENDING', 'CONFIRMED', 'CANCELLED'] as const

const statusColor: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  CONFIRMED: 'bg-green-100 text-green-700 border-green-200',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
  COMPLETED: 'bg-blue-100 text-blue-700 border-blue-200',
  FAILED: 'bg-gray-100 text-gray-600 border-gray-200',
}

function fmt(amount: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
}

export default function BookingsPage() {
  const [status, setStatus] = useState<string>('ALL')
  const [search, setSearch] = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [updateMsg, setUpdateMsg] = useState('')
  const [msgModalId, setMsgModalId] = useState<string | null>(null)

  // Cancel modal state
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null)
  const [cancelType, setCancelType] = useState<'cash' | 'credit'>('cash')
  const [creditAmount, setCreditAmount] = useState('')
  const [issuedCode, setIssuedCode] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ status, ...(search ? { search } : {}) })
    const res = await fetch(`/api/admin/bookings?${params}`)
    const data = await res.json()
    setBookings(data.bookings ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [status, search])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  async function doAction(id: string, action: string, message?: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, message }),
      })
      if (res.ok) {
        await load()
        setMsgModalId(null)
        setUpdateMsg('')
      }
    } finally {
      setActing(null)
    }
  }

  function openCancelModal(b: Booking) {
    setCancelTarget({ id: b.id, ref: b.bookingReference, amount: b.totalAmount, currency: b.currency, email: b.contactEmail })
    setCancelType('cash')
    setCreditAmount(String(b.totalAmount))
    setIssuedCode(null)
  }

  function closeCancelModal() {
    setCancelTarget(null)
    setIssuedCode(null)
  }

  async function confirmCancel() {
    if (!cancelTarget) return
    setActing(cancelTarget.id)
    try {
      if (cancelType === 'cash') {
        const res = await fetch(`/api/admin/bookings/${cancelTarget.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'MARK_CANCELLED' }),
        })
        if (res.ok) {
          await load()
          closeCancelModal()
        }
      } else {
        const amount = parseFloat(creditAmount) || cancelTarget.amount
        const res = await fetch(`/api/admin/bookings/${cancelTarget.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'CANCEL_WITH_CREDIT', creditAmount: amount, creditCurrency: cancelTarget.currency }),
        })
        const data = await res.json()
        if (res.ok && data.voucherCode) {
          setIssuedCode(data.voucherCode)
          await load()
        }
      }
    } finally {
      setActing(null)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Bookings</h1>
          <p className="text-gray-500 text-sm mt-1">{total} total booking{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#0B1F3A] transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4">
        <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
          {STATUS_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setStatus(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                status === t ? 'bg-[#0B1F3A] text-white' : 'text-gray-500 hover:text-[#0B1F3A]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="px-4 py-3 flex items-center gap-3">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by reference, PNR or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
          />
        </div>
      </div>

      {/* Bookings */}
      <div className="space-y-3">
        {loading && !bookings.length ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Loading…</div>
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400">No bookings found.</div>
        ) : bookings.map((b) => {
          const isOpen = expanded === b.id
          const pax = Array.isArray(b.passengers) ? b.passengers : []
          const flight = b.flightDetails?.outbound?.[0]

          return (
            <div key={b.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Summary row */}
              <button
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
                onClick={() => setExpanded(isOpen ? null : b.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-[#0B1F3A] text-sm">{b.bookingReference}</span>
                    {b.pnr && b.pnr !== b.bookingReference && (
                      <span className="text-xs text-gray-400 font-mono">PNR: {b.pnr}</span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor[b.status]}`}>
                      {b.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <span>{b.contactEmail}</span>
                    {b.contactPhone && <span>📱 {b.contactPhone}</span>}
                    {flight && <span>✈️ {flight.departureAirport} → {b.flightDetails?.outbound?.at(-1)?.arrivalAirport}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-[#0B1F3A]">{fmt(b.totalAmount, b.currency)}</div>
                  <div className="text-xs text-gray-400">{format(new Date(b.createdAt), 'dd MMM yyyy')}</div>
                </div>
                <div className="ml-2 text-gray-400">
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {/* Expanded details */}
              {isOpen && (
                <div className="border-t border-gray-100 px-6 py-5 space-y-5">
                  {/* Flight details */}
                  {b.flightDetails?.outbound && b.flightDetails.outbound.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">✈️ Flight</div>
                      {b.flightDetails.outbound.map((seg, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm text-gray-700 mb-1">
                          <span className="font-mono font-bold text-[#0B1F3A]">{seg.flightNumber}</span>
                          <span>{seg.airline}</span>
                          <span className="text-gray-400">·</span>
                          <span>{seg.departureAirport} → {seg.arrivalAirport}</span>
                          <span className="text-gray-400">·</span>
                          <span>{seg.departureTime ? format(new Date(seg.departureTime), 'dd MMM yyyy HH:mm') : '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Passengers */}
                  <div>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">👥 Passengers ({pax.length})</div>
                    <div className="overflow-x-auto">
                      <table className="text-sm w-full">
                        <thead>
                          <tr className="border-b border-gray-100">
                            {['Name', 'Type', 'DOB', 'Passport', 'Expiry', 'Nationality', 'Email', 'WhatsApp'].map((h) => (
                              <th key={h} className="pb-2 pr-4 text-left text-xs text-gray-400 font-medium whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {pax.map((p, i) => (
                            <tr key={i} className="border-b border-gray-50">
                              <td className="py-2 pr-4 font-semibold text-[#0B1F3A] whitespace-nowrap">{p.firstName} {p.lastName}</td>
                              <td className="py-2 pr-4 text-gray-600">{p.type} / {p.gender === 'M' ? 'M' : 'F'}</td>
                              <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.dateOfBirth}</td>
                              <td className="py-2 pr-4 font-mono text-[#0B1F3A]">{p.passportNumber?.toUpperCase()}</td>
                              <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.passportExpiry}</td>
                              <td className="py-2 pr-4 text-gray-600">{p.nationality}</td>
                              <td className="py-2 pr-4 text-gray-600 text-xs">{p.email ?? '—'}</td>
                              <td className="py-2 pr-4 text-gray-600 text-xs">
                                {p.phone
                                  ? <span className="flex items-center gap-1.5">{p.phone} <CallButton phoneNumber={p.phone} /></span>
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                    {b.status !== 'CONFIRMED' && b.status !== 'CANCELLED' && (
                      <button
                        onClick={() => doAction(b.id, 'MARK_CONFIRMED')}
                        disabled={acting === b.id}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Mark Issued
                      </button>
                    )}
                    {b.status !== 'CANCELLED' && (
                      <button
                        onClick={() => openCancelModal(b)}
                        disabled={acting === b.id}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60"
                      >
                        <XCircle className="w-4 h-4" />
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={() => setMsgModalId(b.id)}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      Send Update
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Cancel Booking Modal ── */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl my-auto">

            {issuedCode ? (
              /* ── Success: voucher issued ── */
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <Ticket className="w-7 h-7 text-green-600" />
                </div>
                <h3 className="font-bold text-[#0B1F3A] text-lg mb-2">Travel Credit Issued!</h3>
                <p className="text-gray-500 text-sm mb-4">
                  Booking <strong>{cancelTarget.ref}</strong> has been cancelled and a travel credit voucher has been sent to <strong>{cancelTarget.email}</strong>.
                </p>
                <div className="bg-[#F7F8FA] rounded-xl p-4 mb-5 border border-dashed border-[#C9A84C]">
                  <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider">Voucher Code</p>
                  <p className="font-mono font-bold text-[#0B1F3A] text-xl tracking-widest">{issuedCode}</p>
                </div>
                <button
                  onClick={closeCancelModal}
                  className="w-full bg-[#0B1F3A] hover:bg-[#1a3358] text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              /* ── Choose cancellation type ── */
              <>
                <h3 className="font-bold text-[#0B1F3A] mb-1">Cancel Booking</h3>
                <p className="text-gray-500 text-sm mb-5">
                  <span className="font-mono font-semibold">{cancelTarget.ref}</span>
                  {' · '}
                  <span className="font-semibold">{fmt(cancelTarget.amount, cancelTarget.currency)}</span>
                </p>

                {/* Option buttons */}
                <div className="space-y-3 mb-5">
                  {/* Cash refund */}
                  <button
                    onClick={() => setCancelType('cash')}
                    className={`w-full text-left flex items-start gap-4 p-4 rounded-xl border-2 transition-all ${
                      cancelType === 'cash'
                        ? 'border-[#0B1F3A] bg-[#0B1F3A]/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      cancelType === 'cash' ? 'border-[#0B1F3A]' : 'border-gray-300'
                    }`}>
                      {cancelType === 'cash' && <div className="w-2.5 h-2.5 rounded-full bg-[#0B1F3A]" />}
                    </div>
                    <div>
                      <p className="font-semibold text-[#0B1F3A] text-sm">Issue Cash Refund</p>
                      <p className="text-gray-500 text-xs mt-0.5">Cancel booking only. Process refund manually via payment gateway.</p>
                    </div>
                  </button>

                  {/* Travel credit */}
                  <button
                    onClick={() => setCancelType('credit')}
                    className={`w-full text-left flex items-start gap-4 p-4 rounded-xl border-2 transition-all ${
                      cancelType === 'credit'
                        ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      cancelType === 'credit' ? 'border-[#C9A84C]' : 'border-gray-300'
                    }`}>
                      {cancelType === 'credit' && <div className="w-2.5 h-2.5 rounded-full bg-[#C9A84C]" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-[#0B1F3A] text-sm">Issue Travel Credit Voucher</p>
                        <span className="bg-[#C9A84C]/20 text-[#9a7f3a] text-xs px-2 py-0.5 rounded-full font-medium">Recommended</span>
                      </div>
                      <p className="text-gray-500 text-xs mt-0.5">Generate a voucher code and email it to the client automatically. Valid for 12 months on any booking.</p>
                    </div>
                  </button>
                </div>

                {/* Credit amount input */}
                {cancelType === 'credit' && (
                  <div className="mb-5">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      Voucher Value ({cancelTarget.currency})
                    </label>
                    <input
                      type="number"
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(e.target.value)}
                      min="1"
                      step="0.01"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#C9A84C] text-gray-700"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Voucher will be emailed to <span className="font-medium">{cancelTarget.email}</span>
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={confirmCancel}
                    disabled={acting === cancelTarget.id}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 text-white ${
                      cancelType === 'credit'
                        ? 'bg-[#C9A84C] hover:bg-[#b8943d]'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {acting === cancelTarget.id
                      ? 'Processing…'
                      : cancelType === 'credit'
                        ? '✈️ Issue Credit & Cancel'
                        : 'Confirm Cancellation'
                    }
                  </button>
                  <button
                    onClick={closeCancelModal}
                    disabled={acting === cancelTarget.id}
                    className="px-6 border border-gray-200 hover:bg-gray-50 text-gray-600 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Send Update Modal */}
      {msgModalId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl my-auto">
            <h3 className="font-bold text-[#0B1F3A] mb-4">Send Update to Client</h3>
            <textarea
              value={updateMsg}
              onChange={(e) => setUpdateMsg(e.target.value)}
              rows={4}
              placeholder="Enter your message to the client…"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C9A84C] resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => doAction(msgModalId, 'SEND_UPDATE', updateMsg)}
                disabled={!updateMsg.trim() || acting === msgModalId}
                className="flex-1 bg-[#0B1F3A] hover:bg-[#1a3358] text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
              >
                Send Email
              </button>
              <button
                onClick={() => { setMsgModalId(null); setUpdateMsg('') }}
                className="px-6 border border-gray-200 hover:bg-gray-50 text-gray-600 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
