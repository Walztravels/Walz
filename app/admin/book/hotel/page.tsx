'use client'

import { useState } from 'react'
import { Hotel, ArrowLeft, Search } from 'lucide-react'
import Link from 'next/link'

const WA = '12317902336'

export default function AdminHotelBookingPage() {
  const [destination, setDestination] = useState('')
  const [checkIn,     setCheckIn]     = useState('')
  const [checkOut,    setCheckOut]    = useState('')
  const [rooms,       setRooms]       = useState(1)
  const [clientName,  setClientName]  = useState('')
  const [clientEmail, setClientEmail] = useState('')

  const today = new Date().toISOString().split('T')[0]

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const msg = encodeURIComponent(
      `[ADMIN HOTEL REQUEST]\nClient: ${clientName} (${clientEmail})\nDestination: ${destination}\nCheck-in: ${checkIn}\nCheck-out: ${checkOut}\nRooms: ${rooms}`
    )
    window.open(`https://wa.me/${WA}?text=${msg}`, '_blank')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/admin/book" className="flex items-center gap-2 text-gray-400 hover:text-[#0B1F3A] text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Booking Centre
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
          <Hotel className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-[#0B1F3A] text-xl">Book a Hotel</h1>
          <p className="text-gray-400 text-xs">Hotelbeds · Live rates</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <form onSubmit={handleSearch} className="space-y-4">
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
            placeholder="Destination city" required
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 font-semibold">Check-in</label>
              <input type="date" value={checkIn} min={today} onChange={e => setCheckIn(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold">Check-out</label>
              <input type="date" value={checkOut} min={checkIn || today} onChange={e => setCheckOut(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 font-semibold">Rooms</label>
            <input type="number" value={rooms} onChange={e => setRooms(Number(e.target.value))} min={1} max={10}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
          </div>
          <button type="submit"
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition-colors">
            <Search className="w-4 h-4" /> Send to WhatsApp for Processing
          </button>
        </form>
      </div>
    </div>
  )
}
