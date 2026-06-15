'use client'

import { useState, useEffect } from 'react'
import { UserPlus, Loader2 } from 'lucide-react'

interface ABooking {
  id: string; clientName: string; clientEmail: string; clientPhone?: string
  activityId: string; activity?: { title: string; location: string }
  date?: string; adults: number; totalAmount?: number; currency: string
  status: string; paymentStatus: string; convertedToLeadId?: string
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  ENQUIRY:   'bg-gray-100 text-gray-600',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PAID:      'bg-green-100 text-green-700',
  COMPLETED: 'bg-purple-100 text-purple-700',
  CANCELLED: 'bg-red-100 text-red-600',
}

export default function ActivityBookingsPage() {
  const [bookings,   setBookings]   = useState<ABooking[]>([])
  const [converting, setConverting] = useState<string | null>(null)
  const [toast,      setToast]      = useState<string | null>(null)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  async function load() {
    const r = await fetch('/api/admin/activities/bookings')
    const d = await r.json()
    setBookings(d.bookings ?? [])
  }
  useEffect(() => { load() }, [])

  async function convertToLead(b: ABooking) {
    setConverting(b.id)
    try {
      const res = await fetch('/api/admin/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:    b.clientName,
          email:   b.clientEmail,
          phone:   b.clientPhone,
          source:  'ACTIVITY_BOOKING',
          service: 'Holiday Package',
          notes:   `Converted from activity booking: ${b.activity?.title ?? b.activityId}`,
        }),
      })
      const data = await res.json()
      if (data.lead?.id) {
        await fetch(`/api/admin/activities/bookings/${b.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ convertedToLeadId: data.lead.id }),
        })
        showToast('Converted to lead!')
      } else {
        showToast('Failed to create lead')
      }
    } catch { showToast('Error converting to lead') }
    setConverting(null); load()
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/admin/activities/bookings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  const fmt = (d?: string) => d
    ? new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
    : '—'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#0B1F3A] text-white px-4 py-3 rounded-xl shadow-xl text-sm">
          {toast}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Activity Bookings</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          {bookings.length} total · {bookings.filter(b => b.status === 'CONFIRMED').length} confirmed · {bookings.filter(b => b.convertedToLeadId).length} converted
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Client','Activity','Date','Adults','Amount','Status','Lead','Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 && (
              <tr><td colSpan={8} className="text-center py-16 text-gray-400 text-sm">
                No activity bookings yet
              </td></tr>
            )}
            {bookings.map(b => (
              <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-semibold text-[#0B1F3A]">{b.clientName}</p>
                  <p className="text-xs text-gray-400">{b.clientEmail}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-[#0B1F3A]">{b.activity?.title ?? '—'}</p>
                  <p className="text-xs text-gray-400">{b.activity?.location}</p>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{fmt(b.date)}</td>
                <td className="px-4 py-3 text-gray-600 text-center">{b.adults}</td>
                <td className="px-4 py-3 font-semibold text-[#0B1F3A]">
                  {b.totalAmount ? `${b.currency} ${b.totalAmount.toLocaleString()}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <select value={b.status} onChange={e => updateStatus(b.id, e.target.value)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 outline-none cursor-pointer ${STATUS_COLORS[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {['ENQUIRY','CONFIRMED','PAID','COMPLETED','CANCELLED'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {b.convertedToLeadId
                    ? <span className="text-xs text-green-600 font-semibold">✓ Lead</span>
                    : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  {!b.convertedToLeadId && (
                    <button onClick={() => convertToLead(b)} disabled={converting === b.id}
                      className="flex items-center gap-1.5 text-xs text-[#C9A84C] hover:text-[#0B1F3A] font-medium disabled:opacity-50 transition-colors">
                      {converting === b.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <UserPlus className="w-3.5 h-3.5" />}
                      {converting === b.id ? 'Converting…' : 'To Lead'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
