'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, AlertTriangle, Pencil, Check, X, Copy,
  Plane, Building2, Car, MapPin, Activity, Plus, FileText, ChevronRight,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TripMeta {
  reference: string
  title: string
  clientName: string
  clientEmail: string
  departDate: string
  returnDate: string
  destination: string
  notes: string
  createdAt: string
}

interface BookingRow {
  id: string
  bookingReference: string
  type: 'FLIGHT' | 'HOTEL' | 'TRANSFER' | 'PACKAGE' | 'ACTIVITY'
  status: string
  paymentStatus: string
  contactEmail: string
  totalAmount: number
  currency: string
  createdAt: string
}

interface TripData {
  trip: TripMeta | null
  bookings: BookingRow[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const TYPE_COLORS: Record<string, string> = {
  FLIGHT: 'bg-blue-900/40 text-blue-300 border-blue-700',
  HOTEL: 'bg-green-900/40 text-green-300 border-green-700',
  TRANSFER: 'bg-purple-900/40 text-purple-300 border-purple-700',
  PACKAGE: 'bg-rose-900/40 text-rose-300 border-rose-700',
  ACTIVITY: 'bg-amber-900/40 text-amber-300 border-amber-700',
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-900/30 text-amber-300 border-amber-700',
  CONFIRMED: 'bg-green-900/30 text-green-300 border-green-700',
  CANCELLED: 'bg-red-900/30 text-red-300 border-red-700',
  COMPLETED: 'bg-slate-700/60 text-slate-300 border-slate-600',
  FAILED: 'bg-red-900/30 text-red-400 border-red-700',
  SUCCEEDED: 'bg-green-900/30 text-green-300 border-green-700',
}

const PRODUCT_LINKS: Array<{ label: string; type: string; icon: React.ReactNode; path: string }> = [
  { label: 'Flight', type: 'flight', icon: <Plane className="w-5 h-5" />, path: '/admin/book/flight' },
  { label: 'Hotel', type: 'hotel', icon: <Building2 className="w-5 h-5" />, path: '/admin/book/hotel' },
  { label: 'Transfer', type: 'transfer', icon: <Car className="w-5 h-5" />, path: '/admin/book/transfer' },
  { label: 'Tour', type: 'tour', icon: <MapPin className="w-5 h-5" />, path: '/admin/book/tour' },
  { label: 'Activity', type: 'activity', icon: <Activity className="w-5 h-5" />, path: '/admin/book/activity' },
]

// ─── Inline editable field ────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  onSave,
  textarea = false,
  type = 'text',
}: {
  label: string
  value: string
  onSave: (v: string) => void
  textarea?: boolean
  type?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit() {
    onSave(draft)
    setEditing(false)
  }
  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
        {!editing && (
          <button
            onClick={() => { setDraft(value); setEditing(true) }}
            className="text-slate-500 hover:text-[#C9A84C] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex gap-2 items-start">
          {textarea ? (
            <textarea
              className="flex-1 bg-[#061320] border border-[#C9A84C] rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none"
              rows={3}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') cancel() }}
              autoFocus
            />
          ) : (
            <input
              type={type}
              className="flex-1 bg-[#061320] border border-[#C9A84C] rounded-lg px-3 py-2 text-white text-sm focus:outline-none [color-scheme:dark]"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
              onBlur={commit}
              autoFocus
            />
          )}
          <button onClick={commit} className="text-green-400 hover:text-green-300 mt-2"><Check className="w-4 h-4" /></button>
          <button onClick={cancel} className="text-slate-500 hover:text-red-400 mt-2"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <p className="text-white text-sm">{value || <span className="text-slate-500 italic">Not set</span>}</p>
      )}
    </div>
  )
}

// ─── Mini CSS bar chart ───────────────────────────────────────────────────────

function MiniBarChart({ bookings }: { bookings: BookingRow[] }) {
  const total = bookings.reduce((s, b) => s + (b.totalAmount || 0), 0)
  if (total === 0) return null

  const byType: Record<string, number> = {}
  bookings.forEach(b => {
    byType[b.type] = (byType[b.type] || 0) + (b.totalAmount || 0)
  })

  const colors: Record<string, string> = {
    FLIGHT: '#3b82f6',
    HOTEL: '#22c55e',
    TRANSFER: '#a855f7',
    PACKAGE: '#f43f5e',
    ACTIVITY: '#f59e0b',
  }

  return (
    <div className="mt-4">
      <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">Revenue by Type</p>
      <div className="space-y-2">
        {Object.entries(byType).map(([type, amount]) => {
          const pct = (amount / total) * 100
          return (
            <div key={type} className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-16 shrink-0">{type}</span>
              <div className="flex-1 bg-[#061320] rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: colors[type] || '#6b7280' }}
                />
              </div>
              <span className="text-xs text-white w-16 text-right shrink-0">
                {pct.toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TripWorkspacePage() {
  const params = useParams()
  const ref = (params?.ref as string) ?? ''

  const [data, setData] = useState<TripData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!ref) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/trips?ref=${encodeURIComponent(ref)}`)
      if (res.status === 404) { setNotFound(true); return }
      const json: TripData = await res.json()
      if (!json.trip) { setNotFound(true); return }
      setData(json)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [ref])

  useEffect(() => { load() }, [load])

  async function saveField(field: string, value: string) {
    if (!data?.trip) return
    const updated = { ...data.trip, [field]: value }
    setData(prev => prev ? { ...prev, trip: updated } : prev)
    setSaving(true)
    try {
      await fetch('/api/admin/trips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: ref, [field]: value }),
      })
    } finally {
      setSaving(false)
    }
  }

  function copyRef() {
    navigator.clipboard.writeText(ref).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#061320] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  // ── Not found ──
  if (notFound || !data?.trip) {
    return (
      <div className="min-h-screen bg-[#061320] text-white flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="w-10 h-10 text-amber-400" />
        <h2 className="text-xl font-bold">Trip not found</h2>
        <p className="text-slate-400 text-sm">No workspace found for <span className="font-mono text-[#C9A84C]">{ref}</span></p>
        <Link href="/admin/trips" className="text-[#C9A84C] hover:underline text-sm flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Trips
        </Link>
      </div>
    )
  }

  const { trip, bookings } = data

  // ── Financial summary ──
  const totalRevenue = bookings.reduce((s, b) => s + (b.totalAmount || 0), 0)
  const byType: Record<string, number> = {}
  const byPayment: Record<string, number> = { SUCCEEDED: 0, PENDING: 0, FAILED: 0 }
  bookings.forEach(b => {
    byType[b.type] = (byType[b.type] || 0) + 1
    const ps = b.paymentStatus?.toUpperCase()
    if (ps === 'SUCCEEDED') byPayment.SUCCEEDED++
    else if (ps === 'FAILED') byPayment.FAILED++
    else byPayment.PENDING++
  })

  return (
    <div className="min-h-screen bg-[#061320] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-2">
            <Link href="/admin/trips" className="inline-flex items-center gap-1.5 text-sm text-[#C9A84C] hover:text-[#e0be70] transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Trips
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white">Trip Workspace</h1>
              <button
                onClick={copyRef}
                className="flex items-center gap-2 font-mono text-sm font-bold text-[#C9A84C] bg-[#0a1929] border border-[#1a2f4a] rounded-lg px-3 py-1.5 hover:border-[#C9A84C] transition-colors"
                title="Copy reference"
              >
                {ref}
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 opacity-50" />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 text-[#C9A84C] animate-spin" />}
            <span className="text-xs text-slate-500">
              {trip.createdAt ? `Created ${fmtDate(trip.createdAt)}` : ''}
            </span>
          </div>
        </div>

        {/* ── Section 1: Overview ── */}
        <div className="bg-[#0a1929] border border-[#1a2f4a] rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-5">Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <EditableField label="Trip Title" value={trip.title} onSave={v => saveField('title', v)} />
            <EditableField label="Destination" value={trip.destination} onSave={v => saveField('destination', v)} />
            <EditableField label="Client Name" value={trip.clientName} onSave={v => saveField('clientName', v)} />
            <EditableField label="Client Email" value={trip.clientEmail} onSave={v => saveField('clientEmail', v)} type="email" />
            <EditableField label="Depart Date" value={trip.departDate} onSave={v => saveField('departDate', v)} type="date" />
            <EditableField label="Return Date" value={trip.returnDate} onSave={v => saveField('returnDate', v)} type="date" />
            <div className="sm:col-span-2">
              <EditableField label="Internal Notes" value={trip.notes} onSave={v => saveField('notes', v)} textarea />
            </div>
          </div>
        </div>

        {/* ── Section 2: Linked Bookings ── */}
        <div className="bg-[#0a1929] border border-[#1a2f4a] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Linked Bookings</h2>
            <span className="text-xs text-slate-500">{bookings.length} booking{bookings.length !== 1 ? 's' : ''}</span>
          </div>

          {bookings.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm mb-4">No bookings linked to this workspace yet.</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {PRODUCT_LINKS.map(p => (
                  <Link
                    key={p.type}
                    href={`${p.path}?tripRef=${ref}`}
                    className="inline-flex items-center gap-1.5 text-xs bg-[#061320] border border-[#1a2f4a] hover:border-[#C9A84C] text-slate-300 hover:text-[#C9A84C] rounded-lg px-3 py-2 transition-colors"
                  >
                    {p.icon} Add {p.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1a2f4a]">
                    {['Reference', 'Type', 'Status', 'Client', 'Date', 'Amount', 'Actions'].map(h => (
                      <th key={h} className="text-left text-xs text-slate-400 uppercase tracking-wider pb-3 pr-4 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b, i) => (
                    <tr key={b.id} className={`border-b border-[#1a2f4a]/50 ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                      <td className="py-3 pr-4">
                        <span className="font-mono text-xs text-white">{b.bookingReference}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${TYPE_COLORS[b.type] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                          {b.type}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[b.status] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-300 text-xs">{b.contactEmail}</td>
                      <td className="py-3 pr-4 text-slate-400 text-xs whitespace-nowrap">{fmtDate(b.createdAt)}</td>
                      <td className="py-3 pr-4 text-white font-medium whitespace-nowrap">
                        {fmt(b.totalAmount, b.currency)}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(b.bookingReference)
                            }}
                            className="text-slate-500 hover:text-[#C9A84C] transition-colors"
                            title="Copy booking ref"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <Link
                            href={`/admin/bookings/${b.id}`}
                            className="text-slate-500 hover:text-[#C9A84C] transition-colors"
                            title="View booking"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Section 3: Financial Summary ── */}
        <div className="bg-[#0a1929] border border-[#1a2f4a] rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-5">Financial Summary</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#061320] rounded-xl p-4 border border-[#1a2f4a]">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Total Value</p>
              <p className="text-xl font-bold text-white">{fmt(totalRevenue)}</p>
            </div>
            <div className="bg-[#061320] rounded-xl p-4 border border-[#1a2f4a]">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Bookings</p>
              <p className="text-xl font-bold text-white">{bookings.length}</p>
            </div>
            <div className="bg-[#061320] rounded-xl p-4 border border-[#1a2f4a]">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Paid</p>
              <p className="text-xl font-bold text-green-400">{byPayment.SUCCEEDED}</p>
            </div>
            <div className="bg-[#061320] rounded-xl p-4 border border-[#1a2f4a]">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Pending</p>
              <p className="text-xl font-bold text-amber-400">{byPayment.PENDING}</p>
            </div>
          </div>

          {/* By type */}
          {Object.keys(byType).length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">Bookings by Type</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(byType).map(([type, count]) => (
                  <span key={type} className={`text-xs font-medium px-2.5 py-1 rounded-full border ${TYPE_COLORS[type] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                    {type}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Mini bar chart */}
          {bookings.length > 0 && <MiniBarChart bookings={bookings} />}
        </div>

        {/* ── Add Product quick links ── */}
        <div className="bg-[#0a1929] border border-[#1a2f4a] rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Add Product</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {PRODUCT_LINKS.map(p => (
              <Link
                key={p.type}
                href={`${p.path}?tripRef=${ref}`}
                className="flex flex-col items-center gap-2 bg-[#061320] border border-[#1a2f4a] hover:border-[#C9A84C] rounded-xl p-4 text-slate-400 hover:text-[#C9A84C] transition-colors group text-center"
              >
                <span className="text-slate-500 group-hover:text-[#C9A84C] transition-colors">{p.icon}</span>
                <span className="text-xs font-medium">{p.label}</span>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
