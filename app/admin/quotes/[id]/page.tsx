'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuoteSegment {
  id: string
  flightNumber: string
  airline: string
  origin: string
  destination: string
  departureTime: string
  arrivalTime: string
  durationMinutes: number
  stops: number
  cabinClass?: string
}

interface QuoteFlightOption {
  id: string
  label?: string
  isRecommended?: boolean
  airlineName: string
  originCode: string
  destinationCode: string
  priceMinor: number
  currency: string
  refundable?: boolean
  changesAllowed?: boolean
  baggageIncluded?: boolean
  baggageKg?: number
  segments: QuoteSegment[]
  media?: QuoteMedia[]
}

interface QuoteHotelOption {
  id: string
  hotelName: string
  starRating?: number
  checkIn: string
  checkOut: string
  nights: number
  roomType?: string
  mealPlan?: string
  priceMinor: number
  currency: string
  media?: QuoteMedia[]
}

interface QuoteItem {
  id: string
  type: string
  title: string
  description?: string
  priceMinor: number
  currency: string
}

interface QuoteMedia {
  id: string
  url: string
  caption?: string
  type?: string
}

interface QuoteVersion {
  id: string
  version: number
  createdAt: string
  createdBy: string
  note?: string
}

interface QuoteActivity {
  id: string
  action: string
  actorName?: string
  actorEmail?: string
  note?: string
  createdAt: string
}

interface QuoteDetail {
  id: string
  reference: string
  status: string
  version: number
  clientName: string
  clientEmail: string
  clientPhone?: string
  clientCountry?: string
  currency: string
  title: string
  description?: string
  validUntil: string
  sentAt?: string
  acceptedAt?: string
  declinedAt?: string
  changesRequestedAt?: string
  convertedAt?: string
  viewCount: number
  firstViewedAt?: string
  lastViewedAt?: string
  selectedFlightOptionId?: string
  selectedHotelOptionId?: string
  totalMinor: number
  subtotalMinor: number
  depositMinor?: number
  depositCurrency?: string
  depositPercentage?: number
  internalNotes?: string
  createdBy: string
  assignedTo?: string
  declineReason?: string
  changesNote?: string
  clientSignatureName?: string
  items: QuoteItem[]
  flightOptions: QuoteFlightOption[]
  hotelOptions: QuoteHotelOption[]
  media: QuoteMedia[]
  versions: QuoteVersion[]
  activity: QuoteActivity[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$',
}

function fmtMinor(minor: number, currency: string) {
  const sym = SYM[currency?.toUpperCase()] ?? currency + ' '
  const val = (minor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sym}${val}`
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}`.trim() : `${m}m`
}

function fmtTime(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function Stars({ rating }: { rating?: number }) {
  const n = Math.round(rating ?? 0)
  return (
    <span className="text-[#C9A84C] tracking-tight text-base leading-none">
      {'★'.repeat(Math.min(n, 5))}{'☆'.repeat(Math.max(0, 5 - n))}
    </span>
  )
}

const STATUS_STYLES: Record<string, string> = {
  draft:             'bg-gray-100 text-gray-600',
  ready:             'bg-blue-100 text-blue-700',
  sent:              'bg-indigo-100 text-indigo-700',
  viewed:            'bg-purple-100 text-purple-700',
  accepted:          'bg-green-100 text-green-700',
  declined:          'bg-red-100 text-red-600',
  changes_requested: 'bg-amber-100 text-amber-700',
  converted:         'bg-emerald-100 text-emerald-700',
  cancelled:         'bg-gray-200 text-gray-500',
  archived:          'bg-gray-100 text-gray-400',
  expired:           'bg-red-50 text-red-400',
}
const STATUS_LABELS: Record<string, string> = {
  draft:             'Draft',
  ready:             'Ready',
  sent:              'Sent',
  viewed:            'Viewed',
  accepted:          'Accepted',
  declined:          'Declined',
  changes_requested: 'Changes Requested',
  converted:         'Converted',
  cancelled:         'Cancelled',
  archived:          'Archived',
  expired:           'Expired',
}

const ACTIVITY_ICONS: Record<string, string> = {
  created:           '📄',
  sent:              '📤',
  resent:            '🔄',
  viewed:            '👁️',
  accepted:          '✅',
  declined:          '❌',
  changes_requested: '✏️',
  converted:         '🎉',
  extended:          '📅',
  cancelled:         '🚫',
  archived:          '🗂️',
  note_updated:      '📝',
}

// ─── Toast ───────────────────────────────────────────────────────────────────

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function QuoteDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [quote,   setQuote]   = useState<QuoteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [toasts,  setToasts]  = useState<Toast[]>([])
  const toastId = useRef(0)

  // Modal state
  const [sendModal,    setSendModal]    = useState(false)
  const [extendModal,  setExtendModal]  = useState(false)
  const [cancelModal,  setCancelModal]  = useState(false)
  const [extendDays,   setExtendDays]   = useState('7')
  const [cancelReason, setCancelReason] = useState('')
  const [actionBusy,   setActionBusy]   = useState(false)
  const [sentLink,     setSentLink]     = useState<string | null>(null)

  // Internal notes
  const [notes,     setNotes]     = useState('')
  const [notesBusy, setNotesBusy] = useState(false)

  function addToast(type: 'success' | 'error', message: string) {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await window.fetch(`/api/admin/quotes/${id}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Failed to load')
      setQuote(d)
      setNotes(d.internalNotes ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function patch(body: Record<string, unknown>) {
    setActionBusy(true)
    try {
      const r = await window.fetch(`/api/admin/quotes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Action failed')
      return d
    } finally {
      setActionBusy(false)
    }
  }

  async function handleSend(resend = false) {
    try {
      const d = await patch({ action: resend ? 'resend' : 'send' })
      setSentLink(d.clientLink ?? null)
      addToast('success', resend ? 'Quote resent successfully.' : 'Quote sent successfully.')
      await load()
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : 'Failed to send')
    }
  }

  async function handleExtend() {
    try {
      await patch({ action: 'extend', days: parseInt(extendDays, 10) || 7 })
      setExtendModal(false)
      addToast('success', `Validity extended by ${extendDays} days.`)
      await load()
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : 'Failed to extend')
    }
  }

  async function handleDuplicate() {
    try {
      const d = await patch({ action: 'duplicate' })
      addToast('success', 'Quote duplicated.')
      if (d.id) window.open(`/admin/quotes/${d.id}`, '_blank')
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : 'Failed to duplicate')
    }
  }

  async function handleCancel() {
    try {
      await patch({ action: 'cancel', reason: cancelReason || undefined })
      setCancelModal(false)
      setCancelReason('')
      addToast('success', 'Quote cancelled.')
      await load()
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : 'Failed to cancel')
    }
  }

  async function handleArchive() {
    try {
      await patch({ action: 'archive' })
      addToast('success', 'Quote archived.')
      await load()
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : 'Failed to archive')
    }
  }

  async function saveNotes() {
    if (!quote || notes === (quote.internalNotes ?? '')) return
    setNotesBusy(true)
    try {
      const r = await window.fetch(`/api/admin/quotes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_notes', internalNotes: notes }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Failed to save notes')
      addToast('success', 'Notes saved.')
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : 'Failed to save notes')
    } finally {
      setNotesBusy(false)
    }
  }

  // ─── Render helpers ─────────────────────────────────────────────────────

  const status = quote?.status ?? ''
  const isDraft    = status === 'draft' || status === 'ready'
  const isSent     = status === 'sent' || status === 'viewed'
  const isAccepted = status === 'accepted'
  const isSettled  = ['cancelled', 'archived', 'converted', 'declined'].includes(status)

  function itemsSubtotal() {
    if (!quote) return 0
    return quote.items.reduce((s, i) => s + i.priceMinor, 0)
  }

  // ─── Loading / error ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading quote…</p>
        </div>
      </div>
    )
  }

  if (error || !quote) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <Link href="/admin/quotes" className="text-sm text-[#C9A84C] hover:underline mb-4 block">← Quotes</Link>
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
          {error ?? 'Quote not found.'}
        </div>
      </div>
    )
  }

  const selectedFlight = quote.flightOptions.find(f => f.id === quote.selectedFlightOptionId)
  const selectedHotel  = quote.hotelOptions.find(h => h.id === quote.selectedHotelOptionId)

  const flightSubtotal = selectedFlight ? selectedFlight.priceMinor : 0
  const hotelSubtotal  = selectedHotel  ? selectedHotel.priceMinor  : 0
  const computedSubtotal = flightSubtotal + hotelSubtotal + itemsSubtotal()

  return (
    <div className="p-6 max-w-screen-xl mx-auto">

      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
              t.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="flex flex-col gap-1">
          <Link href="/admin/quotes" className="text-sm text-[#C9A84C] hover:underline w-fit">
            ← Quotes
          </Link>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <h1 className="text-2xl font-bold text-gray-900">{quote.title}</h1>
            <span className="text-xs font-mono font-semibold bg-gray-100 text-gray-500 px-2 py-1 rounded-md tracking-wide">
              #{quote.reference}
            </span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABELS[status] ?? status}
            </span>
            {quote.version > 1 && (
              <span className="text-xs text-gray-400">v{quote.version}</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isDraft && (
            <>
              <Link
                href={`/admin/travel-search?quoteId=${quote.id}`}
                className="border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                + Add Travel Product
              </Link>
              <button
                onClick={() => setSendModal(true)}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Send Quote
              </button>
            </>
          )}
          {isSent && (
            <>
              <button
                onClick={() => { void handleSend(true) }}
                disabled={actionBusy}
                className="border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Resend
              </button>
              <button
                onClick={() => setExtendModal(true)}
                className="border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Extend
              </button>
            </>
          )}
          {isAccepted && (
            <Link
              href={`/admin/bookings/new?quoteId=${quote.id}`}
              className="bg-[#0A1628] hover:bg-[#1a2a48] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Convert to Booking
            </Link>
          )}
          <button
            onClick={() => { void handleDuplicate() }}
            disabled={actionBusy}
            className="border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Duplicate
          </button>
          {!isSettled && (
            <button
              onClick={() => setCancelModal(true)}
              className="border border-red-200 text-red-600 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
            >
              Cancel
            </button>
          )}
          {status !== 'archived' && (
            <button
              onClick={() => { void handleArchive() }}
              disabled={actionBusy}
              className="border border-gray-200 text-gray-400 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Archive
            </button>
          )}
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left column (2/3) ── */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Client card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Client</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Name</p>
                <p className="text-gray-900 font-semibold">{quote.clientName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Email</p>
                <a href={`mailto:${quote.clientEmail}`} className="text-[#C9A84C] hover:underline text-sm">
                  {quote.clientEmail}
                </a>
              </div>
              {quote.clientPhone && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Phone</p>
                  <p className="text-gray-900 text-sm">{quote.clientPhone}</p>
                </div>
              )}
              {quote.clientCountry && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Country</p>
                  <p className="text-gray-900 text-sm">{quote.clientCountry}</p>
                </div>
              )}
            </div>
          </div>

          {/* Flight options */}
          {quote.flightOptions.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Flight Options
              </h2>
              <div className="flex flex-col gap-4">
                {quote.flightOptions.map(fo => {
                  const isSelected = fo.id === quote.selectedFlightOptionId
                  return (
                    <div
                      key={fo.id}
                      className={`border rounded-xl p-4 transition-colors ${
                        isSelected ? 'border-[#C9A84C] bg-amber-50' : 'border-gray-200'
                      }`}
                    >
                      {/* Flight header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-gray-900">{fo.airlineName}</span>
                          <span className="font-mono text-sm font-semibold text-gray-600">
                            {fo.originCode} → {fo.destinationCode}
                          </span>
                          {fo.isRecommended && (
                            <span className="text-xs font-semibold bg-[#C9A84C] text-white px-2 py-0.5 rounded-full">
                              Recommended
                            </span>
                          )}
                          {fo.label && !fo.isRecommended && (
                            <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {fo.label}
                            </span>
                          )}
                          {isSelected && (
                            <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              ✓ Selected
                            </span>
                          )}
                        </div>
                        <p className="text-lg font-bold text-gray-900 tabular-nums">
                          {fmtMinor(fo.priceMinor, fo.currency)}
                        </p>
                      </div>

                      {/* Segments */}
                      {fo.segments.length > 0 && (
                        <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 mb-3">
                          {fo.segments.map(seg => (
                            <div key={seg.id} className="px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                              <span className="font-mono font-semibold text-gray-800 text-xs w-20 shrink-0">
                                {seg.flightNumber}
                              </span>
                              <span className="font-semibold text-gray-900">
                                {fmtTime(seg.departureTime)}
                              </span>
                              <span className="text-gray-400 text-xs">{seg.origin}</span>
                              <span className="text-gray-300 text-xs">→</span>
                              <span className="font-semibold text-gray-900">
                                {fmtTime(seg.arrivalTime)}
                              </span>
                              <span className="text-gray-400 text-xs">{seg.destination}</span>
                              <span className="text-gray-400 text-xs ml-auto">
                                {fmtDuration(seg.durationMinutes)}
                                {seg.stops > 0 && (
                                  <span className="ml-2 text-amber-600">· {seg.stops} stop{seg.stops > 1 ? 's' : ''}</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Fare conditions */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className={`rounded-lg px-2 py-1.5 text-center font-medium ${fo.refundable ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>
                          {fo.refundable ? '✓ Refundable' : '✗ Non-refundable'}
                        </div>
                        <div className={`rounded-lg px-2 py-1.5 text-center font-medium ${fo.changesAllowed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>
                          {fo.changesAllowed ? '✓ Changes' : '✗ No changes'}
                        </div>
                        <div className={`rounded-lg px-2 py-1.5 text-center font-medium ${fo.baggageIncluded ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-600'}`}>
                          {fo.baggageIncluded
                            ? `✓ Baggage${fo.baggageKg ? ` ${fo.baggageKg}kg` : ''}`
                            : '✗ No baggage'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Hotel options */}
          {quote.hotelOptions.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Hotel Options
              </h2>
              <div className="flex flex-col gap-4">
                {quote.hotelOptions.map(ho => {
                  const isSelected = ho.id === quote.selectedHotelOptionId
                  return (
                    <div
                      key={ho.id}
                      className={`border rounded-xl p-4 transition-colors ${
                        isSelected ? 'border-[#C9A84C] bg-amber-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-bold text-gray-900">{ho.hotelName}</span>
                            {isSelected && (
                              <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                ✓ Selected
                              </span>
                            )}
                          </div>
                          {ho.starRating !== undefined && (
                            <Stars rating={ho.starRating} />
                          )}
                        </div>
                        <p className="text-lg font-bold text-gray-900 tabular-nums">
                          {fmtMinor(ho.priceMinor, ho.currency)}
                        </p>
                      </div>

                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Check-in</p>
                          <p className="text-gray-800 font-medium">{fmtDate(ho.checkIn)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Check-out</p>
                          <p className="text-gray-800 font-medium">{fmtDate(ho.checkOut)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Nights</p>
                          <p className="text-gray-800 font-medium">{ho.nights}</p>
                        </div>
                        {ho.roomType && (
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">Room</p>
                            <p className="text-gray-800 font-medium">{ho.roomType}</p>
                          </div>
                        )}
                        {ho.mealPlan && (
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">Meal Plan</p>
                            <p className="text-gray-800 font-medium">{ho.mealPlan}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Additional items */}
          {quote.items.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Additional Items
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 font-semibold text-gray-500 text-xs uppercase">Type</th>
                      <th className="text-left py-2 pr-4 font-semibold text-gray-500 text-xs uppercase">Item</th>
                      <th className="text-right py-2 font-semibold text-gray-500 text-xs uppercase">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {quote.items.map(item => (
                      <tr key={item.id}>
                        <td className="py-2.5 pr-4 text-gray-400 capitalize text-xs">{item.type}</td>
                        <td className="py-2.5 pr-4">
                          <p className="text-gray-900 font-medium">{item.title}</p>
                          {item.description && (
                            <p className="text-gray-400 text-xs mt-0.5">{item.description}</p>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-gray-900 tabular-nums">
                          {fmtMinor(item.priceMinor, item.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Activity timeline */}
          {quote.activity.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Activity
              </h2>
              <div className="relative max-h-80 overflow-y-auto pr-2">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-100" />
                <div className="flex flex-col gap-4">
                  {quote.activity.map(ev => (
                    <div key={ev.id} className="flex gap-3 relative pl-9">
                      <div className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-sm shrink-0">
                        {ACTIVITY_ICONS[ev.action] ?? '•'}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-sm text-gray-800">
                          <span className="font-semibold capitalize">{ev.action.replace(/_/g, ' ')}</span>
                          {ev.actorName && (
                            <span className="text-gray-500"> by {ev.actorName}</span>
                          )}
                        </p>
                        {ev.note && (
                          <p className="text-xs text-gray-500 mt-0.5">{ev.note}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(ev.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right column (1/3) ── */}
        <div className="flex flex-col gap-5">

          {/* Pricing summary */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Pricing
            </h2>
            <div className="flex flex-col gap-2 text-sm">
              {selectedFlight && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Flight</span>
                  <span className="font-medium tabular-nums">{fmtMinor(selectedFlight.priceMinor, selectedFlight.currency)}</span>
                </div>
              )}
              {selectedHotel && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Hotel</span>
                  <span className="font-medium tabular-nums">{fmtMinor(selectedHotel.priceMinor, selectedHotel.currency)}</span>
                </div>
              )}
              {quote.items.map(item => (
                <div key={item.id} className="flex items-center justify-between">
                  <span className="text-gray-600 truncate pr-2">{item.title}</span>
                  <span className="font-medium tabular-nums shrink-0">{fmtMinor(item.priceMinor, item.currency)}</span>
                </div>
              ))}
              <div className="border-t border-gray-100 pt-2 mt-1 flex items-center justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold tabular-nums">{fmtMinor(computedSubtotal, quote.currency)}</span>
              </div>
              {quote.depositMinor != null && (
                <div className="flex items-center justify-between text-amber-700">
                  <span>Deposit {quote.depositPercentage != null ? `(${quote.depositPercentage}%)` : ''}</span>
                  <span className="font-semibold tabular-nums">
                    {fmtMinor(quote.depositMinor, quote.depositCurrency ?? quote.currency)}
                  </span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2 mt-1 flex items-center justify-between">
                <span className="font-bold text-gray-900 text-base">Total</span>
                <span className="font-bold text-gray-900 text-base tabular-nums">
                  {fmtMinor(quote.totalMinor, quote.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Quote details */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Quote Details
            </h2>
            <dl className="flex flex-col gap-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 shrink-0">Reference</dt>
                <dd className="font-mono font-semibold text-gray-800 text-xs text-right">#{quote.reference}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 shrink-0">Version</dt>
                <dd className="text-gray-800">v{quote.version}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 shrink-0">Valid Until</dt>
                <dd className="text-gray-800">{fmtDate(quote.validUntil)}</dd>
              </div>
              {quote.sentAt && (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500 shrink-0">Sent</dt>
                  <dd className="text-gray-800 text-right">{fmtDate(quote.sentAt)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 shrink-0">Views</dt>
                <dd className="text-gray-800">
                  {quote.viewCount}
                  {quote.firstViewedAt && (
                    <span className="text-gray-400 text-xs ml-1">(first {fmtDate(quote.firstViewedAt)})</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 shrink-0">Created by</dt>
                <dd className="text-gray-800 text-right truncate">{quote.createdBy}</dd>
              </div>
              {quote.assignedTo && (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500 shrink-0">Assigned to</dt>
                  <dd className="text-gray-800 text-right truncate">{quote.assignedTo}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Client response */}
          {(quote.acceptedAt || quote.declinedAt || quote.changesRequestedAt) && (
            <div className={`border rounded-xl p-5 ${
              quote.acceptedAt ? 'bg-green-50 border-green-200' :
              quote.declinedAt ? 'bg-red-50 border-red-200' :
              'bg-amber-50 border-amber-200'
            }`}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Client Response
              </h2>
              <dl className="flex flex-col gap-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500 shrink-0">Status</dt>
                  <dd>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] ?? ''}`}>
                      {STATUS_LABELS[status] ?? status}
                    </span>
                  </dd>
                </div>
                {quote.clientSignatureName && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500 shrink-0">Signed by</dt>
                    <dd className="text-gray-800 font-medium">{quote.clientSignatureName}</dd>
                  </div>
                )}
                {quote.acceptedAt && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500 shrink-0">Accepted</dt>
                    <dd className="text-gray-800 text-right">{fmtDateTime(quote.acceptedAt)}</dd>
                  </div>
                )}
                {quote.declinedAt && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500 shrink-0">Declined</dt>
                    <dd className="text-gray-800 text-right">{fmtDateTime(quote.declinedAt)}</dd>
                  </div>
                )}
                {quote.changesRequestedAt && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500 shrink-0">Changes</dt>
                    <dd className="text-gray-800 text-right">{fmtDateTime(quote.changesRequestedAt)}</dd>
                  </div>
                )}
                {quote.declineReason && (
                  <div>
                    <dt className="text-gray-500 mb-1">Decline reason</dt>
                    <dd className="text-gray-800 text-sm bg-white rounded-lg px-3 py-2 border border-red-100">
                      {quote.declineReason}
                    </dd>
                  </div>
                )}
                {quote.changesNote && (
                  <div>
                    <dt className="text-gray-500 mb-1">Changes note</dt>
                    <dd className="text-gray-800 text-sm bg-white rounded-lg px-3 py-2 border border-amber-100">
                      {quote.changesNote}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Internal notes */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Internal Notes
            </h2>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={() => { void saveNotes() }}
              rows={4}
              placeholder="Add internal notes visible only to the team…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-transparent placeholder:text-gray-300"
            />
            {notesBusy && (
              <p className="text-xs text-gray-400 mt-1">Saving…</p>
            )}
          </div>

          {/* Quick actions */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Quick Actions
            </h2>
            <div className="flex flex-col gap-2">
              {isDraft && (
                <button
                  onClick={() => setSendModal(true)}
                  className="w-full text-left text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 px-3 py-2.5 rounded-lg transition-colors"
                >
                  📤 Send to client
                </button>
              )}
              {isSent && (
                <>
                  <button
                    onClick={() => { void handleSend(true) }}
                    disabled={actionBusy}
                    className="w-full text-left text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    🔄 Resend quote
                  </button>
                  <button
                    onClick={() => setExtendModal(true)}
                    className="w-full text-left text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-2.5 rounded-lg transition-colors"
                  >
                    📅 Extend validity
                  </button>
                </>
              )}
              <button
                onClick={() => { void handleDuplicate() }}
                disabled={actionBusy}
                className="w-full text-left text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 px-3 py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                📋 Duplicate quote
              </button>
              {!isSettled && (
                <button
                  onClick={() => setCancelModal(true)}
                  className="w-full text-left text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 px-3 py-2.5 rounded-lg transition-colors"
                >
                  🚫 Cancel quote
                </button>
              )}
            </div>
          </div>

          {/* Versions */}
          {quote.versions.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Versions
              </h2>
              <div className="flex flex-col gap-1.5">
                {quote.versions.map(v => (
                  <div key={v.id} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg ${v.version === quote.version ? 'bg-amber-50 text-amber-800' : 'text-gray-600'}`}>
                    <span className="font-medium">v{v.version}</span>
                    <span className="text-xs text-gray-400">{fmtDate(v.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Send Modal ── */}
      {sendModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Send Quote</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will send the quote to <strong>{quote.clientName}</strong> at{' '}
              <strong>{quote.clientEmail}</strong>.
            </p>
            {sentLink ? (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">Client link:</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={sentLink}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 text-gray-700"
                  />
                  <button
                    onClick={() => { void navigator.clipboard.writeText(sentLink) }}
                    className="border border-gray-200 px-3 py-2 rounded-lg text-xs hover:bg-gray-50 text-gray-600"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ) : null}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setSendModal(false); setSentLink(null) }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                {sentLink ? 'Close' : 'Cancel'}
              </button>
              {!sentLink && (
                <button
                  onClick={() => { void handleSend(false) }}
                  disabled={actionBusy}
                  className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                >
                  {actionBusy ? 'Sending…' : 'Confirm & Send'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Extend Modal ── */}
      {extendModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Extend Validity</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Extend by (days)
            </label>
            <input
              type="number"
              min={1}
              max={90}
              value={extendDays}
              onChange={e => setExtendDays(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
            />
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setExtendModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleExtend() }}
                disabled={actionBusy}
                className="px-4 py-2 text-sm font-semibold bg-[#0A1628] hover:bg-[#1a2a48] text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                {actionBusy ? 'Saving…' : 'Extend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Modal ── */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel Quote</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will cancel quote <strong>#{quote.reference}</strong>. You can optionally add a reason.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Reason (optional)
            </label>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Enter a reason…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C] resize-none"
            />
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => { setCancelModal(false); setCancelReason('') }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={() => { void handleCancel() }}
                disabled={actionBusy}
                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                {actionBusy ? 'Cancelling…' : 'Cancel Quote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
