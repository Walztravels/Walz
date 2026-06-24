'use client'

import { useState, useEffect }     from 'react'
import { useParams }               from 'next/navigation'
import Link                        from 'next/link'
import { ArrowLeft, Plane, User, CreditCard, Clock, Loader2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'

interface Passenger {
  id?:           string
  title?:        string
  given_name?:   string
  family_name?:  string
  born_on?:      string
  gender?:       string
  email?:        string
  phone_number?: string
  firstName?:    string
  lastName?:     string
  dob?:          string
  phone?:        string
}

interface FlightBooking {
  id:               string
  reference:        string
  status:           string
  clientName:       string | null
  clientEmail:      string
  clientPhone:      string | null
  offerId:          string | null
  offerExpiresAt:   string | null
  searchedOrigin:   string | null
  searchedDest:     string | null
  departDate:       string | null
  returnDate:       string | null
  cabinClass:       string | null
  tripType:         string | null
  passengers:       Passenger[]
  quotedAmount:     string | null
  paidAmount:       string | null
  currency:         string
  paymentMethod:    string | null
  paymentRef:       string | null
  paidAt:           string | null
  duffelOrderId:    string | null
  duffelBookingRef: string | null
  duffelAmount:     string | null
  bookedAt:         string | null
  bookedBy:         string | null
  ticketIssuedAt:   string | null
  ticketIssuedBy:   string | null
  ticketData:       Record<string, unknown> | null
  adminNotes:       string | null
  createdAt:        string
}

interface DuffelPassenger {
  id:           string
  title:        string
  given_name:   string
  family_name:  string
  born_on:      string
  gender:       string
  email:        string
  phone_number: string
}

const STATUS_LABEL: Record<string, string> = {
  pending_review:    '🔔 Pending Review',
  payment_confirmed: '✓ Payment Confirmed',
  booking_placed:    '✈ Booking Placed',
  ticket_issued:     '🎫 Ticket Issued',
  cancelled:         '✗ Cancelled',
  refunded:          '↩ Refunded',
  booking_failed:    '✗ Booking Failed',
  change_pending:    '⚠ Airline Change',
}

const STATUS_COLOR: Record<string, string> = {
  pending_review:    'bg-amber-100 text-amber-800',
  payment_confirmed: 'bg-blue-100 text-blue-800',
  booking_placed:    'bg-purple-100 text-purple-800',
  ticket_issued:     'bg-green-100 text-green-800',
  cancelled:         'bg-red-100 text-red-800',
  refunded:          'bg-gray-100 text-gray-700',
  booking_failed:    'bg-red-100 text-red-800',
  change_pending:    'bg-amber-100 text-amber-800',
}

function offerExpiryBanner(expiresAt: string | null) {
  if (!expiresAt) return null
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return { msg: '✗ Duffel offer EXPIRED — you must re-search for a fresh offer.', cls: 'bg-red-50 border-red-300 text-red-700' }
  if (diff < 7_200_000) {
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    return { msg: `⚠ Duffel offer expires in ${h}h ${m}m — place booking soon!`, cls: 'bg-amber-50 border-amber-300 text-amber-700' }
  }
  return null
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
      <dt className="text-gray-400 text-sm w-36 flex-shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-[#0B1F3A] text-right">{value ?? '—'}</dd>
    </div>
  )
}

export default function FlightBookingDetailPage() {
  const { id }      = useParams<{ id: string }>()
  const [booking,   setBooking]   = useState<FlightBooking | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [busy,      setBusy]      = useState(false)
  const [adminNote, setAdminNote] = useState('')
  const [showPax,   setShowPax]   = useState(false)
  const [paxForms,  setPaxForms]  = useState<DuffelPassenger[]>([])
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState<string | null>(null)

  async function reload() {
    const res  = await fetch(`/api/admin/flight-bookings/${id}`)
    const data = await res.json()
    if (data.booking) {
      setBooking(data.booking)
      if (data.booking.passengers?.length) {
        setPaxForms(data.booking.passengers.map((p: Passenger, i: number): DuffelPassenger => ({
          id:           `passenger-${i}`,
          title:        p.title        ?? 'mr',
          given_name:   p.given_name   ?? p.firstName ?? '',
          family_name:  p.family_name  ?? p.lastName  ?? '',
          born_on:      p.born_on      ?? p.dob       ?? '',
          gender:       p.gender       ?? 'm',
          email:        p.email        ?? data.booking.clientEmail ?? '',
          phone_number: p.phone_number ?? p.phone ?? data.booking.clientPhone ?? '',
        })))
      } else {
        const name = data.booking.clientName ?? ''
        setPaxForms([{
          id:           'passenger-0',
          title:        'mr',
          given_name:   name.split(' ')[0] ?? '',
          family_name:  name.split(' ').slice(1).join(' ') ?? '',
          born_on:      '',
          gender:       'm',
          email:        data.booking.clientEmail ?? '',
          phone_number: data.booking.clientPhone ?? '',
        }])
      }
    }
  }

  useEffect(() => { reload().finally(() => setLoading(false)) }, [id])

  async function doAction(endpoint: string, extra: Record<string, unknown> = {}) {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res  = await fetch(`/api/admin/flight-bookings/${id}/${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ adminNote, bookedBy: 'admin', issuedBy: 'admin', ...extra }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      setSuccess(data.status ? `Status → ${STATUS_LABEL[data.status] ?? data.status}` : 'Done')
      await reload()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  function updatePax(i: number, field: keyof DuffelPassenger, value: string) {
    setPaxForms(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
    </div>
  )

  if (!booking) return (
    <div className="p-6 text-center text-gray-500">Booking not found.</div>
  )

  const expiry = offerExpiryBanner(booking.offerExpiresAt)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin/flight-bookings" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#0B1F3A] mb-3 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Flight Bookings
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold font-mono text-[#0B1F3A]">{booking.reference}</h1>
            {booking.duffelBookingRef && (
              <p className="text-sm text-gray-400 mt-0.5">
                Airline PNR: <span className="font-mono font-bold text-[#0B1F3A]">{booking.duffelBookingRef}</span>
              </p>
            )}
          </div>
          <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${STATUS_COLOR[booking.status] ?? 'bg-gray-100 text-gray-700'}`}>
            {STATUS_LABEL[booking.status] ?? booking.status}
          </span>
        </div>
      </div>

      {/* Offer expiry banner */}
      {expiry && (
        <div className={`mb-4 p-3 rounded-xl border text-sm font-semibold flex items-center gap-2 ${expiry.cls}`}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {expiry.msg}
        </div>
      )}

      {/* Error / success */}
      {error   && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm">✓ {success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Client */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-[#C9A84C]" />
            <h2 className="font-bold text-[#0B1F3A] text-sm">Client</h2>
          </div>
          <dl>
            <InfoRow label="Name"     value={booking.clientName} />
            <InfoRow label="Email"    value={<a href={`mailto:${booking.clientEmail}`} className="text-blue-600 hover:underline">{booking.clientEmail}</a>} />
            <InfoRow label="Phone"    value={booking.clientPhone} />
            <InfoRow label="Received" value={new Date(booking.createdAt).toLocaleString('en-GB')} />
          </dl>
        </div>

        {/* Payment */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-[#C9A84C]" />
            <h2 className="font-bold text-[#0B1F3A] text-sm">Payment</h2>
          </div>
          <dl>
            <InfoRow label="Amount paid"    value={<span className="text-lg font-bold">{booking.currency} {booking.paidAmount}</span>} />
            <InfoRow label="Method"         value={booking.paymentMethod} />
            <InfoRow label="Reference"      value={<span className="font-mono text-xs">{booking.paymentRef}</span>} />
            <InfoRow label="Paid at"        value={booking.paidAt ? new Date(booking.paidAt).toLocaleString('en-GB') : null} />
            {booking.duffelAmount && (
              <InfoRow label="Duffel cost"  value={<span className="text-purple-700 font-bold">{booking.currency} {booking.duffelAmount}</span>} />
            )}
          </dl>
        </div>

        {/* Flight */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Plane className="w-4 h-4 text-[#C9A84C]" />
            <h2 className="font-bold text-[#0B1F3A] text-sm">Flight Details</h2>
          </div>
          <dl>
            <InfoRow label="Route"     value={<span className="font-bold">{booking.searchedOrigin} → {booking.searchedDest}</span>} />
            <InfoRow label="Depart"    value={booking.departDate} />
            <InfoRow label="Return"    value={booking.returnDate} />
            <InfoRow label="Trip type" value={(booking.tripType ?? 'one_way').replace('_', ' ')} />
            <InfoRow label="Cabin"     value={<span className="capitalize">{booking.cabinClass}</span>} />
            <InfoRow label="Offer ID"  value={<span className="font-mono text-[10px] break-all text-gray-500">{booking.offerId}</span>} />
          </dl>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-[#C9A84C]" />
            <h2 className="font-bold text-[#0B1F3A] text-sm">Timeline</h2>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Booking received',    time: booking.createdAt,       done: true },
              { label: 'Payment confirmed',   time: null,                    done: ['payment_confirmed', 'booking_placed', 'ticket_issued'].includes(booking.status) },
              { label: 'Placed on Duffel',    time: booking.bookedAt,        done: !!booking.bookedAt },
              { label: 'Ticket issued',       time: booking.ticketIssuedAt,  done: !!booking.ticketIssuedAt },
            ].map(step => (
              <div key={step.label} className="flex items-center gap-2 text-sm">
                <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${step.done ? 'bg-green-500' : 'bg-gray-200'}`} />
                <span className={step.done ? 'text-[#0B1F3A] font-medium' : 'text-gray-400'}>{step.label}</span>
                {step.time && <span className="text-[10px] text-gray-400 ml-auto">{new Date(step.time).toLocaleString('en-GB')}</span>}
              </div>
            ))}
          </div>
          {booking.adminNotes && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Admin notes</p>
              <p className="text-xs text-gray-600">{booking.adminNotes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="font-bold text-[#0B1F3A] mb-4">Actions</h2>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Admin Note (optional)
          </label>
          <textarea
            value={adminNote}
            onChange={e => setAdminNote(e.target.value)}
            className="w-full p-3 border border-gray-200 rounded-xl text-sm resize-none h-20 focus:outline-none focus:border-[#C9A84C]"
            placeholder="e.g. Payment verified via Stripe dashboard reference #ch_..."
          />
        </div>

        {/* pending_review */}
        {booking.status === 'pending_review' && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => doAction('confirm-payment')}
              disabled={busy}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : '✓'}
              Confirm Payment Received
            </button>
            <button
              onClick={() => doAction('cancel', { reason: adminNote || 'Admin cancelled' })}
              disabled={busy}
              className="flex items-center gap-2 px-6 py-3 bg-red-50 hover:bg-red-100 text-red-700 font-semibold rounded-xl text-sm border border-red-200 disabled:opacity-50 transition-colors"
            >
              ✗ Cancel Booking
            </button>
          </div>
        )}

        {/* payment_confirmed — show passenger form before placing on Duffel */}
        {booking.status === 'payment_confirmed' && (
          <div>
            <button
              onClick={() => setShowPax(v => !v)}
              className="flex items-center gap-1 text-sm font-semibold text-[#0B1F3A] mb-4 hover:text-[#C9A84C] transition-colors"
            >
              {showPax ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showPax ? 'Hide' : 'Review / edit'} passenger details for Duffel
            </button>

            {showPax && (
              <div className="space-y-5 mb-4 p-4 bg-gray-50 rounded-xl">
                {paxForms.map((pax, i) => (
                  <div key={i}>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                      Passenger {i + 1}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        { key: 'title',        label: 'Title',           type: 'select', options: ['mr', 'ms', 'mrs', 'miss', 'dr'] },
                        { key: 'given_name',   label: 'First name',      type: 'text'   },
                        { key: 'family_name',  label: 'Last name',       type: 'text'   },
                        { key: 'born_on',      label: 'DOB (YYYY-MM-DD)',type: 'text',  span: true },
                        { key: 'gender',       label: 'Gender',          type: 'select', options: ['m', 'f'] },
                        { key: 'email',        label: 'Email',           type: 'email', span: true },
                        { key: 'phone_number', label: 'Phone (+44...)',  type: 'text',  span: true },
                      ] as { key: keyof DuffelPassenger; label: string; type: string; options?: string[]; span?: boolean }[]).map(f => (
                        <div key={f.key} className={f.span ? 'col-span-2' : ''}>
                          <label className="text-xs text-gray-500 block mb-0.5">{f.label}</label>
                          {f.type === 'select' ? (
                            <select
                              value={pax[f.key]}
                              onChange={e => updatePax(i, f.key, e.target.value)}
                              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#C9A84C]"
                            >
                              {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input
                              type={f.type}
                              value={pax[f.key]}
                              onChange={e => updatePax(i, f.key, e.target.value)}
                              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#C9A84C]"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => doAction('place', { passengers: paxForms })}
              disabled={busy}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plane className="w-4 h-4" />}
              Place Booking on Duffel
            </button>
          </div>
        )}

        {/* booking_placed */}
        {booking.status === 'booking_placed' && (
          <div>
            <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-800">
              ✓ Booking placed — Duffel PNR: <strong className="font-mono">{booking.duffelBookingRef}</strong>
              {booking.bookedAt && <span className="ml-2 text-purple-500 text-xs">on {new Date(booking.bookedAt).toLocaleString('en-GB')}</span>}
            </div>
            <button
              onClick={() => doAction('issue-ticket')}
              disabled={busy}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : '🎫'}
              Issue &amp; Send Ticket to Client
            </button>
          </div>
        )}

        {/* ticket_issued */}
        {booking.status === 'ticket_issued' && (
          <div>
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
              ✓ Ticket issued and emailed to <strong>{booking.clientEmail}</strong>
              {booking.ticketIssuedAt && (
                <span className="ml-1 text-green-600 text-xs">on {new Date(booking.ticketIssuedAt).toLocaleString('en-GB')}</span>
              )}
            </div>
            <button
              onClick={() => doAction('issue-ticket')}
              disabled={busy}
              className="flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : '📧'}
              Resend Ticket Email
            </button>
          </div>
        )}

        {/* booking_failed */}
        {booking.status === 'booking_failed' && (
          <div>
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
              ✗ Booking failed — check admin notes above.
            </div>
            <button
              onClick={() => doAction('confirm-payment')}
              disabled={busy}
              className="flex items-center gap-2 px-6 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-xl text-sm border border-blue-200 disabled:opacity-50 transition-colors"
            >
              ↩ Reset to Payment Confirmed (retry)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
