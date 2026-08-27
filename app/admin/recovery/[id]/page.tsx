'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CheckCircle, AlertTriangle, Clock, Phone, Mail, ExternalLink, ChevronLeft } from 'lucide-react'

type RecoveryPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
type RecoveryStatus   = 'OPEN' | 'CONTACTED' | 'IN_PROGRESS' | 'RECOVERED' | 'LOST' | 'DISMISSED'

interface Opportunity {
  id:               string
  type:             string
  status:           RecoveryStatus
  priority:         RecoveryPriority
  reason:           string
  amount:           number | null
  currency:         string | null
  assignedToId:     string | null
  leadId:           string | null
  tripId:           string | null
  cartSessionId:    string | null
  quoteId:          string | null
  bookingId:        string | null
  activityBookingId: string | null
  detectedAt:       string
  lastActivityAt:   string | null
  nextActionAt:     string | null
  recoveredAt:      string | null
  recoveredAmount:  number | null
  recoveredCurrency: string | null
  notes:            string | null
}

interface Lead {
  id:            string
  name:          string
  email:         string
  whatsapp:      string | null
  status:        string
  destination:   string | null
  interestLevel: string | null
}

interface ActivityBooking {
  id:                    string
  walzReference:         string | null
  activityTitle:         string | null
  status:                string
  supplier:              string
  totalAmount:           number | null
  currency:              string
  clientName:            string
  clientEmail:           string
  travelDate:            string | null
  failureReason:         string | null
  reconciliationAttempts: number
}

interface TimelineEvent {
  event:     string
  createdAt: string
  metadata:  unknown
}

interface QuoteDetail {
  id:           string
  reference:    string
  clientName:   string
  clientEmail:  string
  currency:     string
  totalMinor:   string   // BigInt serialised as string
  viewCount:    number
  sentAt:       string | null
  firstViewedAt: string | null
  lastViewedAt: string | null
  status:       string
  validUntil:   string
}

interface DetailData {
  opportunity:      Opportunity
  lead:             Lead | null
  cartSession:      unknown | null
  activityBooking:  ActivityBooking | null
  trip:             unknown | null
  assignedStaff:    { id: string; name: string; email: string } | null
  quote:            QuoteDetail | null
  timeline:         TimelineEvent[]
}

const priorityStripe: Record<RecoveryPriority, string> = {
  URGENT: '#DC2626',
  HIGH:   '#EA580C',
  MEDIUM: '#D97706',
  LOW:    '#94A3B8',
}

function fmt(amount: number | null, currency: string | null) {
  if (!amount || !currency) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 0 }).format(amount)
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1)   return 'just now'
  if (min < 60)  return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24)   return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

const typeLabel: Record<string, string> = {
  ABANDONED_CART:   'Abandoned Cart',
  UNPAID_PROPOSAL:  'Unpaid Proposal',
  FAILED_PAYMENT:   'Failed Payment',
  SUPPLIER_FAILURE: 'Supplier Issue',
  INCOMPLETE_TRIP:  'Incomplete Trip',
  HOT_LEAD:         'Hot Lead',
}

export default function RecoveryDetailPage() {
  const { id }                 = useParams<{ id: string }>()
  const router                 = useRouter()
  const [data, setData]        = useState<DetailData | null>(null)
  const [loading, setLoading]  = useState(true)
  const [actioning, setActioning] = useState(false)
  const [note, setNote]        = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [toast, setToast]      = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/recovery/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActioning(true)
    try {
      const res = await fetch(`/api/admin/recovery/${id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, ...extra }),
      })
      if (res.ok) {
        showToast('Done')
        // Refresh data
        const fresh = await fetch(`/api/admin/recovery/${id}`)
        setData(await fresh.json())
      } else {
        showToast('Action failed')
      }
    } finally {
      setActioning(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F6F3]">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  if (!data?.opportunity) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F6F3]">
        <p className="text-gray-500">Opportunity not found.</p>
      </div>
    )
  }

  const opp    = data.opportunity
  const stripe = priorityStripe[opp.priority]
  const isActive = ['OPEN', 'CONTACTED', 'IN_PROGRESS'].includes(opp.status)

  return (
    <div className="min-h-screen bg-[#F8F6F3]" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#0B1F3A] text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-[#0B1F3A] text-white px-6 py-4" style={{ borderBottom: `3px solid ${stripe}` }}>
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="text-white/50 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold">{typeLabel[opp.type] ?? opp.type}</h1>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: stripe }}
              >
                {opp.priority}
              </span>
            </div>
            <p className="text-[#C9A84C] text-xs mt-0.5">Detected {timeAgo(opp.detectedAt)}</p>
          </div>
          {opp.amount !== null && (
            <div className="text-right">
              <p className="text-xl font-semibold tabular-nums" style={{ fontFamily: "'DM Mono', monospace" }}>
                {fmt(opp.amount, opp.currency)}
              </p>
              <p className="text-xs text-white/50">Opportunity value</p>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* SUPPLIER_FAILURE — special alert */}
        {opp.type === 'SUPPLIER_FAILURE' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900">Customer paid — do not ask them to pay again</p>
              <p className="text-xs text-red-700 mt-0.5">The supplier booking has an issue. Resolve with the supplier before contacting the customer about rebooking.</p>
            </div>
          </div>
        )}

        {/* HOT_LEAD — scoring breakdown */}
        {opp.type === 'HOT_LEAD' && (() => {
          // Parse signals from reason: "HOT lead — score N. Signals: A, B, C"
          const match = opp.reason.match(/score (\d+)\. Signals?: (.+)/)
          const score   = match ? match[1] : null
          const signals = match ? match[2].split(', ').filter(Boolean) : []
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🔥</span>
                <p className="text-sm font-semibold text-amber-900">
                  Why this lead is hot{score ? ` — score ${score}` : ''}
                </p>
              </div>
              {signals.length > 0 ? (
                <ul className="space-y-1">
                  {signals.map((s, i) => (
                    <li key={i} className="text-xs text-amber-800 flex items-center gap-2">
                      <span className="text-amber-500">•</span> {s}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-amber-700">{opp.reason}</p>
              )}
            </div>
          )
        })()}

        {/* UNPAID_PROPOSAL — proposal engagement summary */}
        {opp.type === 'UNPAID_PROPOSAL' && data.quote && (() => {
          const q = data.quote!
          const totalDisplay = Number(q.totalMinor) > 0
            ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: q.currency, minimumFractionDigits: 0 }).format(Number(q.totalMinor) / 100)
            : '—'
          return (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">Proposal</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-blue-400">Reference</p>
                  <p className="font-mono font-medium text-blue-900">{q.reference}</p>
                </div>
                <div>
                  <p className="text-blue-400">Value</p>
                  <p className="font-semibold text-blue-900 tabular-nums">{totalDisplay}</p>
                </div>
                <div>
                  <p className="text-blue-400">Views</p>
                  <p className="font-semibold text-blue-900">{q.viewCount}</p>
                </div>
                <div>
                  <p className="text-blue-400">Status</p>
                  <p className="font-medium text-blue-900 capitalize">{q.status}</p>
                </div>
              </div>
              {q.lastViewedAt && (
                <p className="text-xs text-blue-600 mt-2">
                  Last viewed: {new Date(q.lastViewedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
              <a href={`/admin/quotes/${q.id}`} className="inline-flex items-center gap-1 text-xs text-[#C9A84C] hover:underline mt-2">
                Open Proposal <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )
        })()}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Left: customer + booking context */}
          <div className="md:col-span-2 space-y-4">

            {/* Customer */}
            <div className="bg-white rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Customer</p>
              {data.lead ? (
                <div className="space-y-2">
                  <p className="font-semibold text-[#0B1F3A]">{data.lead.name}</p>
                  <div className="flex flex-wrap gap-3">
                    <a href={`mailto:${data.lead.email}`} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#0B1F3A]">
                      <Mail className="w-3.5 h-3.5" /> {data.lead.email}
                    </a>
                    {data.lead.whatsapp && (
                      <a href={`https://wa.me/${data.lead.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-800">
                        <Phone className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                    )}
                  </div>
                  {data.lead.destination && (
                    <p className="text-xs text-gray-500">Destination: {data.lead.destination}</p>
                  )}
                  <a href={`/admin/leads?id=${data.lead.id}`} className="inline-flex items-center gap-1 text-xs text-[#C9A84C] hover:underline mt-1">
                    Open Lead <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No linked customer record</p>
              )}
            </div>

            {/* Activity booking detail */}
            {data.activityBooking && (
              <div className="bg-white rounded-xl p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Booking</p>
                <div className="space-y-2">
                  <p className="font-medium text-[#0B1F3A]">{data.activityBooking.activityTitle ?? 'Activity'}</p>
                  <p className="text-xs text-gray-500 font-mono">{data.activityBooking.walzReference}</p>
                  <div className="flex gap-2 flex-wrap text-xs">
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{data.activityBooking.supplier}</span>
                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{data.activityBooking.status}</span>
                    {data.activityBooking.failureReason && (
                      <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full">{data.activityBooking.failureReason}</span>
                    )}
                  </div>
                  {data.activityBooking.travelDate && (
                    <p className="text-xs text-gray-500">Travel date: {data.activityBooking.travelDate}</p>
                  )}
                  {data.activityBooking.reconciliationAttempts > 0 && (
                    <p className="text-xs text-amber-600">{data.activityBooking.reconciliationAttempts} reconciliation attempt{data.activityBooking.reconciliationAttempts !== 1 ? 's' : ''}</p>
                  )}
                  <a href={`/admin/activities/bookings/${data.activityBooking.id}`} className="inline-flex items-center gap-1 text-xs text-[#C9A84C] hover:underline">
                    Open Booking <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            {/* Reason */}
            <div className="bg-white rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Why this was flagged</p>
              <p className="text-sm text-gray-700">{opp.reason}</p>
              {opp.nextActionAt && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Follow-up scheduled: {new Date(opp.nextActionAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
            </div>

            {/* Timeline */}
            {data.timeline.length > 0 && (
              <div className="bg-white rounded-xl p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Activity</p>
                <div className="space-y-2">
                  {data.timeline.map((evt, i) => (
                    <div key={i} className="flex items-start gap-3 text-xs">
                      <span className="text-gray-400 mt-0.5" style={{ fontFamily: "'DM Mono', monospace" }}>
                        {new Date(evt.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-gray-600">{evt.event.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {opp.notes && (
              <div className="bg-white rounded-xl p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Staff Notes</p>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{opp.notes}</pre>
              </div>
            )}
          </div>

          {/* Right: actions */}
          <div className="space-y-4">

            {/* Assigned */}
            <div className="bg-white rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Assigned To</p>
              <p className="text-sm font-medium text-[#0B1F3A]">
                {data.assignedStaff?.name ?? 'Unassigned'}
              </p>
            </div>

            {/* Status */}
            <div className="bg-white rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Status</p>
              <div className="space-y-2">
                {opp.status === 'RECOVERED' ? (
                  <div className="flex items-center gap-2 text-green-700 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Recovered {opp.recoveredAt ? timeAgo(opp.recoveredAt) : ''}
                    {opp.recoveredAmount !== null && (
                      <span className="font-semibold">{fmt(opp.recoveredAmount, opp.recoveredCurrency)}</span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">{opp.status.replace(/_/g, ' ')}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            {isActive && (
              <div className="bg-white rounded-xl p-5 space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Actions</p>

                {/* Quick actions */}
                <button
                  disabled={actioning}
                  onClick={() => doAction('mark_contacted')}
                  className="w-full text-left text-sm px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#0B1F3A] hover:bg-[#F8F6F3] transition-colors disabled:opacity-50"
                >
                  Mark Contacted
                </button>
                <button
                  disabled={actioning}
                  onClick={() => doAction('mark_in_progress')}
                  className="w-full text-left text-sm px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#0B1F3A] hover:bg-[#F8F6F3] transition-colors disabled:opacity-50"
                >
                  Mark In Progress
                </button>
                <button
                  disabled={actioning}
                  onClick={() => doAction('mark_recovered')}
                  className="w-full text-left text-sm px-3 py-2.5 rounded-lg bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                >
                  Mark Recovered
                </button>
                <button
                  disabled={actioning}
                  onClick={() => doAction('mark_lost')}
                  className="w-full text-left text-sm px-3 py-2.5 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 transition-colors disabled:opacity-50"
                >
                  Mark Lost
                </button>
                <button
                  disabled={actioning}
                  onClick={() => doAction('dismiss')}
                  className="w-full text-left text-sm px-3 py-2.5 rounded-lg border border-gray-200 text-gray-400 hover:border-gray-400 transition-colors disabled:opacity-50"
                >
                  Dismiss
                </button>

                {/* Divider */}
                <div className="border-t border-gray-100 my-1" />

                {/* Add note */}
                <div>
                  <p className="text-xs text-gray-400 mb-1">Add Note</p>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Type a note…"
                    rows={2}
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-[#C9A84C]"
                  />
                  <button
                    disabled={actioning || !note.trim()}
                    onClick={() => { doAction('add_note', { note }); setNote('') }}
                    className="mt-1 w-full text-xs py-2 rounded-lg bg-[#0B1F3A] text-white hover:bg-[#162d52] transition-colors disabled:opacity-50"
                  >
                    Save Note
                  </button>
                </div>

                {/* Schedule follow-up */}
                <div>
                  <p className="text-xs text-gray-400 mb-1">Schedule Follow-Up</p>
                  <input
                    type="datetime-local"
                    value={followUpDate}
                    onChange={e => setFollowUpDate(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C]"
                  />
                  <button
                    disabled={actioning || !followUpDate}
                    onClick={() => { doAction('schedule_follow_up', { nextActionAt: followUpDate }); setFollowUpDate('') }}
                    className="mt-1 w-full text-xs py-2 rounded-lg border border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C] hover:text-white transition-colors disabled:opacity-50"
                  >
                    Schedule
                  </button>
                </div>
              </div>
            )}

            {/* Links to related records */}
            <div className="bg-white rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Open Records</p>
              <div className="space-y-2">
                {opp.leadId && (
                  <a href={`/admin/leads`} className="flex items-center justify-between text-sm text-[#0B1F3A] hover:text-[#C9A84C]">
                    Open Lead <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {opp.tripId && (
                  <a href={`/admin/trips/${opp.tripId}`} className="flex items-center justify-between text-sm text-[#0B1F3A] hover:text-[#C9A84C]">
                    Open Trip <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {opp.activityBookingId && (
                  <a href={`/admin/activities/bookings/${opp.activityBookingId}`} className="flex items-center justify-between text-sm text-[#0B1F3A] hover:text-[#C9A84C]">
                    Open Booking <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {opp.quoteId && (
                  <a href={`/admin/quotes/${opp.quoteId}`} className="flex items-center justify-between text-sm text-[#0B1F3A] hover:text-[#C9A84C]">
                    Open Quote <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
