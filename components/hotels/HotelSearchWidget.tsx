'use client'

import { useState } from 'react'
import { Search, Plus, Minus, Star, MapPin, Loader2, AlertCircle } from 'lucide-react'
import { HotelBookingModal } from './HotelBookingModal'
import { cn } from '@/lib/utils'

interface Rate {
  rateKey:              string
  rateType:             'BOOKABLE' | 'RECHECK'
  net:                  string
  sellingRate:          string
  currency:             string
  boardCode:            string
  boardName:            string
  rooms:                number
  adults:               number
  children:             number
  rateCommentsId?:      string
  cancellationPolicies?: { amount: string; from: string }[]
  promotions?:          { code: string; name: string }[]
}

interface HotelRoom {
  code:  string
  name:  string
  rates: Rate[]
}

interface HotelResult {
  code:            number
  name:            string
  categoryName:    string
  categoryCode:    string
  destinationName: string
  minRate:         string
  maxRate:         string
  currency:        string
  rooms:           HotelRoom[]
  reviews?:        { type: string; rate: number; reviewCount: number }[]
}

interface ChildAge {
  age: string
}

export function HotelSearchWidget() {
  const [destination, setDestination]     = useState('')
  const [checkIn,     setCheckIn]         = useState('')
  const [checkOut,    setCheckOut]        = useState('')
  const [adults,      setAdults]          = useState(2)
  const [children,    setChildren]        = useState(0)
  const [childAges,   setChildAges]       = useState<ChildAge[]>([])
  const [rooms,       setRooms]           = useState(1)
  const [loading,     setLoading]         = useState(false)
  const [error,       setError]           = useState<string | null>(null)
  const [results,     setResults]         = useState<HotelResult[]>([])
  const [hasSearched, setHasSearched]     = useState(false)
  const [selected,    setSelected]        = useState<{ hotel: HotelResult; rate: Rate } | null>(null)

  function setChildrenCount(n: number) {
    const clamped = Math.max(0, n)
    setChildren(clamped)
    setChildAges(prev => {
      if (clamped > prev.length) return [...prev, ...Array(clamped - prev.length).fill({ age: '7' })]
      return prev.slice(0, clamped)
    })
  }

  async function search() {
    if (!destination || !checkIn || !checkOut) {
      setError('Please fill in destination, check-in and check-out dates')
      return
    }
    setLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      const res = await fetch('/api/hotelbeds/hotels', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          checkIn,
          checkOut,
          adults,
          children,
          childAges: childAges.map(c => parseInt(c.age, 10)),
          rooms,
          currency:     'GBP',
          sourceMarket: 'GB',
          minCategory:  3,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setResults(data.hotels ?? [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const bestRate = (hotel: HotelResult): Rate | undefined =>
    hotel.rooms?.[0]?.rates?.[0]

  const reviewRate = (hotel: HotelResult) =>
    hotel.reviews?.find(r => r.type === 'HOTELBEDS')?.rate

  return (
    <div>
      {/* Search form */}
      <div className="bg-white rounded-2xl shadow-sm border border-walz-border p-5 mb-6">
        <h2 className="font-bold text-walz-deep-navy mb-4">Search Hotels via Hotelbeds</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-walz-muted mb-1">Destination code *</label>
            <input
              value={destination}
              onChange={e => setDestination(e.target.value.toUpperCase())}
              placeholder="e.g. DXB, LON"
              className="w-full border border-walz-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-walz-gold"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-walz-muted mb-1">Check-in *</label>
            <input
              type="date"
              value={checkIn}
              onChange={e => setCheckIn(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border border-walz-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-walz-gold"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-walz-muted mb-1">Check-out *</label>
            <input
              type="date"
              value={checkOut}
              onChange={e => setCheckOut(e.target.value)}
              min={checkIn || new Date().toISOString().split('T')[0]}
              className="w-full border border-walz-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-walz-gold"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-walz-muted mb-1">Rooms</label>
            <div className="flex items-center gap-2 border border-walz-border rounded-xl px-3 py-2">
              <button onClick={() => setRooms(r => Math.max(1, r - 1))} className="text-walz-muted hover:text-walz-gold">
                <Minus className="w-4 h-4" />
              </button>
              <span className="flex-1 text-center text-sm font-medium">{rooms}</span>
              <button onClick={() => setRooms(r => Math.min(5, r + 1))} className="text-walz-muted hover:text-walz-gold">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Guests */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-walz-muted">Adults</span>
            <div className="flex items-center gap-2 border border-walz-border rounded-xl px-3 py-1.5">
              <button onClick={() => setAdults(a => Math.max(1, a - 1))} className="text-walz-muted hover:text-walz-gold">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-5 text-center text-sm font-medium">{adults}</span>
              <button onClick={() => setAdults(a => Math.min(8, a + 1))} className="text-walz-muted hover:text-walz-gold">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-walz-muted">Children</span>
            <div className="flex items-center gap-2 border border-walz-border rounded-xl px-3 py-1.5">
              <button onClick={() => setChildrenCount(children - 1)} className="text-walz-muted hover:text-walz-gold">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-5 text-center text-sm font-medium">{children}</span>
              <button onClick={() => setChildrenCount(children + 1)} className="text-walz-muted hover:text-walz-gold">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Cert 3.3 — children ages mandatory */}
        {childAges.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-4">
            {childAges.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <label className="text-xs text-walz-muted">Child {i + 1} age</label>
                <select
                  value={c.age}
                  onChange={e => setChildAges(prev => prev.map((p, j) => j === i ? { age: e.target.value } : p))}
                  className="border border-walz-border rounded-lg px-2 py-1 text-sm outline-none focus:border-walz-gold"
                >
                  {Array.from({ length: 17 }, (_, k) => k + 1).map(age => (
                    <option key={age} value={age}>{age}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm mb-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={search}
          disabled={loading}
          className="flex items-center gap-2 bg-walz-gold text-walz-deep-navy font-bold px-6 py-3 rounded-xl disabled:opacity-50 hover:bg-[#d4b05a] transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {loading ? 'Searching…' : 'Search Hotels'}
        </button>
      </div>

      {/* Results */}
      {hasSearched && !loading && (
        <div>
          {results.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-walz-border">
              <p className="text-walz-muted">No hotels found. Try adjusting your search.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-walz-muted mb-4">{results.length} hotel{results.length !== 1 ? 's' : ''} found</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {results.map(hotel => {
                  const rate   = bestRate(hotel)
                  const review = reviewRate(hotel)
                  return (
                    <div key={hotel.code} className="bg-white rounded-2xl border border-walz-border overflow-hidden hover:shadow-md transition-shadow">
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-bold text-walz-deep-navy text-sm leading-snug">{hotel.name}</h3>
                          {review && (
                            <span className="flex items-center gap-1 text-xs bg-walz-gold/10 text-walz-gold font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                              <Star className="w-3 h-3 fill-walz-gold" />
                              {review.toFixed(1)}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-walz-muted flex items-center gap-1 mb-2">
                          <MapPin className="w-3 h-3" />
                          {hotel.categoryName} · {hotel.destinationName}
                        </p>

                        {rate && (
                          <div className="space-y-1.5">
                            <p className="text-xs text-walz-muted">
                              {hotel.rooms[0].name} · {rate.boardName}
                            </p>

                            {/* Cert 3.8 — cancellation policy */}
                            {rate.cancellationPolicies && rate.cancellationPolicies.length > 0 && (
                              <p className="text-xs text-amber-700">
                                ⚠ Cancellation fee from {new Date(rate.cancellationPolicies[0].from).toLocaleDateString('en-GB')}
                              </p>
                            )}

                            {/* Cert 2.7 — promotions */}
                            {rate.promotions && rate.promotions.length > 0 && (
                              <p className="text-xs text-green-700">✓ {rate.promotions[0].name}</p>
                            )}

                            <div className="flex items-end justify-between pt-2 border-t border-walz-border mt-2">
                              <div>
                                <p className="text-xs text-walz-muted">from</p>
                                <p className="text-xl font-bold text-walz-gold">
                                  {rate.currency} {parseFloat(rate.net).toLocaleString()}
                                </p>
                                <p className="text-xs text-walz-muted">total net</p>
                              </div>
                              <button
                                onClick={() => setSelected({ hotel, rate })}
                                className="bg-walz-gold text-walz-deep-navy font-bold text-xs px-4 py-2 rounded-lg hover:bg-[#d4b05a] transition-colors"
                              >
                                Book Now
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Booking modal */}
      {selected && (
        <HotelBookingModal
          hotel={selected.hotel as any}
          rate={selected.rate}
          checkIn={checkIn}
          checkOut={checkOut}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
