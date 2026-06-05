'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Mail, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'

interface Client {
  email: string; phone: string | null
  totalBookings: number; totalSpent: number; lastBooking: string | null
}

interface Booking {
  id: string; bookingReference: string; pnr: string | null; status: string
  totalAmount: number; currency: string; createdAt: string
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [clientBookings, setClientBookings] = useState<Record<string, Booking[]>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ ...(search ? { search } : {}) })
    const res = await fetch(`/api/admin/clients?${params}`)
    const data = await res.json()
    setClients(data.clients ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [search])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  async function loadBookings(email: string) {
    if (clientBookings[email]) return
    const res = await fetch(`/api/admin/bookings?search=${encodeURIComponent(email)}&limit=50`)
    const data = await res.json()
    setClientBookings((prev) => ({ ...prev, [email]: data.bookings ?? [] }))
  }

  async function toggleExpanded(email: string) {
    if (expanded === email) {
      setExpanded(null)
    } else {
      setExpanded(email)
      await loadBookings(email)
    }
  }

  const statusColor: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    CONFIRMED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-700',
    COMPLETED: 'bg-blue-100 text-blue-700',
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Clients</h1>
        <p className="text-gray-500 text-sm mt-1">{total} unique client{total !== 1 ? 's' : ''}</p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 px-4 py-3 flex items-center gap-3">
        <Search className="w-4 h-4 text-gray-400" />
        <input
          type="text" placeholder="Search by email…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
        />
      </div>

      {/* Client list */}
      <div className="space-y-2">
        {loading && !clients.length ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400">No clients found.</div>
        ) : clients.map((c) => {
          const isOpen = expanded === c.email
          const bookings = clientBookings[c.email] ?? []
          return (
            <div key={c.email} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <button
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
                onClick={() => toggleExpanded(c.email)}
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-[#0B1F3A] flex items-center justify-center flex-shrink-0">
                  <span className="text-[#C9A84C] font-bold text-sm">{c.email[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[#0B1F3A] truncate">{c.email}</div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-0.5">
                    {c.phone && <span>📱 {c.phone}</span>}
                    <span>{c.totalBookings} booking{c.totalBookings !== 1 ? 's' : ''}</span>
                    {c.lastBooking && <span>Last: {format(new Date(c.lastBooking), 'dd MMM yyyy')}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-[#0B1F3A]">
                    {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(c.totalSpent)}
                  </div>
                  <div className="text-xs text-gray-400">total spent</div>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <a
                    href={`mailto:${c.email}`}
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 text-gray-400 hover:text-[#C9A84C] hover:bg-amber-50 rounded-lg transition-colors"
                    title="Send email"
                  >
                    <Mail className="w-4 h-4" />
                  </a>
                  {c.phone && (
                    <a
                      href={`https://wa.me/${c.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  )}
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {/* Booking history */}
              {isOpen && (
                <div className="border-t border-gray-100 px-6 py-4">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Booking History</div>
                  {bookings.length === 0 ? (
                    <p className="text-sm text-gray-400">No bookings found.</p>
                  ) : (
                    <div className="space-y-2">
                      {bookings.map((b) => (
                        <div key={b.id} className="flex items-center gap-4 py-2 border-b border-gray-50 last:border-0">
                          <span className="font-mono text-xs font-bold text-[#0B1F3A]">{b.bookingReference}</span>
                          {b.pnr && b.pnr !== b.bookingReference && <span className="text-xs text-gray-400 font-mono">PNR: {b.pnr}</span>}
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[b.status] ?? 'bg-gray-100 text-gray-500'}`}>{b.status}</span>
                          <span className="text-sm font-semibold text-[#0B1F3A] ml-auto">
                            {new Intl.NumberFormat('en-GB', { style: 'currency', currency: b.currency }).format(b.totalAmount)}
                          </span>
                          <span className="text-xs text-gray-400">{format(new Date(b.createdAt), 'dd MMM yyyy')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
