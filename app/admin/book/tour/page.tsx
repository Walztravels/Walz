'use client'

import { useState } from 'react'
import { Map, ArrowLeft, Search } from 'lucide-react'
import Link from 'next/link'

const WA = '12317902336'

export default function AdminTourBookingPage() {
  const [destination, setDestination] = useState('')
  const [tourName,    setTourName]    = useState('')
  const [travelDate,  setTravelDate]  = useState('')
  const [adults,      setAdults]      = useState(2)
  const [children,    setChildren]    = useState(0)
  const [notes,       setNotes]       = useState('')
  const [clientName,  setClientName]  = useState('')
  const [clientEmail, setClientEmail] = useState('')

  const today = new Date().toISOString().split('T')[0]

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const msg = encodeURIComponent(
      `[ADMIN TOUR REQUEST]\nClient: ${clientName} (${clientEmail})\nDestination: ${destination}\nTour: ${tourName || 'Any'}\nDate: ${travelDate}\nAdults: ${adults}, Children: ${children}${notes ? `\nNotes: ${notes}` : ''}`
    )
    window.open(`https://wa.me/${WA}?text=${msg}`, '_blank')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/admin/book" className="flex items-center gap-2 text-gray-400 hover:text-[#0B1F3A] text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Booking Centre
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-rose-600 flex items-center justify-center">
          <Map className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-[#0B1F3A] text-xl">Book a Tour</h1>
          <p className="text-gray-400 text-xs">Viator · Day tours & packages · Worldwide</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 p-4 bg-[#F5F0E8] rounded-xl">
            <p className="text-xs font-bold text-[#0B1F3A] uppercase tracking-wider col-span-full">Client</p>
            <input value={clientName} onChange={e => setClientName(e.target.value)}
              placeholder="Client name" required
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
            <input value={clientEmail} onChange={e => setClientEmail(e.target.value)}
              type="email" placeholder="Client email" required
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <input value={destination} onChange={e => setDestination(e.target.value)}
            placeholder="Destination (e.g. Serengeti, Paris)" required
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
          <input value={tourName} onChange={e => setTourName(e.target.value)}
            placeholder="Tour name or type (optional)"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400 font-semibold">Date</label>
              <input type="date" value={travelDate} min={today} onChange={e => setTravelDate(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold">Adults</label>
              <input type="number" value={adults} onChange={e => setAdults(Number(e.target.value))} min={1} max={20}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold">Children</label>
              <input type="number" value={children} onChange={e => setChildren(Number(e.target.value))} min={0} max={10}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
            </div>
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Special requests or additional notes (optional)"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] resize-none" />
          <button type="submit"
            className="w-full flex items-center justify-center gap-2 bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 transition-colors">
            <Search className="w-4 h-4" /> Send to WhatsApp for Processing
          </button>
        </form>
      </div>
    </div>
  )
}
