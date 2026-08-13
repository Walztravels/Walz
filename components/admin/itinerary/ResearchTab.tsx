'use client'

import { useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
export interface HotelResult {
  name: string
  stars: number
  address: string
  price: number
  currency: string
  thumbnailUrl?: string
}

export interface FlightSlice {
  airline: string
  flightNumber: string
  departure: string
  arrival: string
  duration: string
  stops: number
}

export interface FlightResult {
  airline: string
  flightNumber: string
  departure: string
  arrival: string
  duration: string
  stops: number
  price: number
  currency: string
  slices?: FlightSlice[]
}

interface Leg { from: string; to: string; date: string }

interface Props {
  itinId: string
  destination: string
  startDate: string | null
  endDate: string | null
  numberOfTravellers: number
  onAddHotel?: (hotel: HotelResult) => void
  onAddFlight?: (flight: FlightResult) => void
}

// ── Formatting helpers ─────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function fmtDate(iso: string) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}

function fmtPrice(amount: number, currency: string) {
  const sym: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AED: 'AED ', NGN: '₦' }
  return `${sym[currency] ?? currency + ' '}${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// ── Skeleton card ──────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white/5 rounded-xl p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-16 h-16 bg-white/10 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/10 rounded w-3/4" />
          <div className="h-3 bg-white/10 rounded w-1/2" />
          <div className="h-3 bg-white/10 rounded w-1/4" />
        </div>
      </div>
    </div>
  )
}

// ── Unavailability banner ──────────────────────────────────────────────────────
function FallbackBanner() {
  return (
    <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4 text-amber-300 text-sm">
      <span className="text-amber-400 text-lg leading-none mt-0.5">⚠</span>
      <span>
        Live search unavailable — API not configured or unreachable. Results below are for
        reference only.
      </span>
    </div>
  )
}

// ── Section toggle wrapper ─────────────────────────────────────────────────────
function Section({
  title, icon, open, onToggle, children,
}: {
  title: string; icon: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="bg-white/5 rounded-2xl overflow-hidden border border-white/10">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2 font-semibold text-white">
          <span>{icon}</span>
          {title}
        </span>
        <span className="text-white/40 text-lg transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}

// ── Input field helper ─────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-white/50 font-semibold uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-amber-400/60 focus:bg-white/15 transition-colors'

const selectCls =
  'bg-[#0B1F3A] border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400/60 transition-colors'

// ── Hotel search section ───────────────────────────────────────────────────────
function HotelSearch({
  itinId,
  defaultDestination,
  defaultCheckIn,
  defaultCheckOut,
  defaultAdults,
  onAdd,
}: {
  itinId: string
  defaultDestination: string
  defaultCheckIn: string
  defaultCheckOut: string
  defaultAdults: number
  onAdd?: (hotel: HotelResult) => void
}) {
  const [destination, setDestination] = useState(defaultDestination)
  const [checkIn, setCheckIn] = useState(defaultCheckIn)
  const [checkOut, setCheckOut] = useState(defaultCheckOut)
  const [adults, setAdults] = useState(String(defaultAdults))
  const [children, setChildren] = useState('0')
  const [childAgesStr, setChildAgesStr] = useState('')
  const [rooms, setRooms] = useState('1')
  const [loading, setLoading] = useState(false)
  const [hotels, setHotels] = useState<HotelResult[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [fallback, setFallback] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const childrenCount = Math.max(0, parseInt(children) || 0)

  const search = useCallback(async () => {
    if (!destination || !checkIn || !checkOut) return
    setLoading(true)
    setError(null)
    setFallback(false)
    setSource(null)
    setSearched(true)
    try {
      const qs = new URLSearchParams({
        type: 'hotels',
        destination,
        checkIn,
        checkOut,
        adults,
        children,
        rooms,
      })
      if (childrenCount > 0 && childAgesStr.trim()) {
        qs.set('childAges', childAgesStr.trim())
      }
      const res = await fetch(`/api/admin/itineraries/${itinId}/research?${qs}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setHotels(data.hotels ?? [])
      setSource(data.source ?? null)
      setFallback(data.fallback === true)
    } catch (err) {
      setError((err as Error).message)
      setHotels([])
    } finally {
      setLoading(false)
    }
  }, [itinId, destination, checkIn, checkOut, adults, children, childAgesStr, rooms, childrenCount])

  return (
    <div>
      {/* Form */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="col-span-2 sm:col-span-2">
          <Field label="Destination">
            <input
              className={inputCls}
              placeholder="Paris, Dubai, Rome…"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
          </Field>
        </div>
        <Field label="Check-In">
          <input type="date" className={inputCls} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label="Check-Out">
          <input type="date" className={inputCls} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
        <Field label="Adults">
          <input
            type="number" min={1} max={20} className={inputCls}
            value={adults} onChange={(e) => setAdults(e.target.value)}
          />
        </Field>
        <Field label="Children">
          <input
            type="number" min={0} max={9} className={inputCls}
            value={children} onChange={(e) => setChildren(e.target.value)}
          />
        </Field>
        <Field label="Rooms">
          <input
            type="number" min={1} max={10} className={inputCls}
            value={rooms} onChange={(e) => setRooms(e.target.value)}
          />
        </Field>
        <div className="flex items-end">
          <button
            type="button"
            onClick={search}
            disabled={loading || !destination || !checkIn || !checkOut}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Searching…' : 'Search Hotels'}
          </button>
        </div>
      </div>

      {/* Children ages (only when children > 0) */}
      {childrenCount > 0 && (
        <div className="mb-4">
          <Field label={`Children Ages (${childrenCount} child${childrenCount > 1 ? 'ren' : ''}) — comma-separated`}>
            <input
              className={inputCls}
              placeholder={childrenCount === 1 ? 'e.g. 7' : 'e.g. 7, 10'}
              value={childAgesStr}
              onChange={(e) => setChildAgesStr(e.target.value)}
            />
          </Field>
        </div>
      )}

      {/* Source badge */}
      {!fallback && source && hotels.length > 0 && (
        <p className="text-white/30 text-xs mb-3">
          📡 Live results via{' '}
          {source === 'hotelbeds+amadeus'
            ? 'Hotelbeds + Amadeus'
            : source === 'hotelbeds'
            ? 'Hotelbeds'
            : source === 'amadeus'
            ? 'Amadeus'
            : source}
        </p>
      )}

      {/* Fallback banner */}
      {fallback && <FallbackBanner />}

      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-3 mb-4">{error}</p>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && searched && hotels.length === 0 && !error && (
        <p className="text-white/40 text-sm text-center py-6">
          No hotels found. Try a different destination or date range.
        </p>
      )}

      {!loading && hotels.length > 0 && (
        <div className="space-y-3">
          {hotels.map((h, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 flex items-start gap-3 border border-white/10 hover:border-white/20 transition-colors">
              {h.thumbnailUrl ? (
                <img
                  src={h.thumbnailUrl} alt={h.name}
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-white/10"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 text-2xl">🏨</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm truncate">{h.name}</p>
                <p className="text-amber-400 text-xs">
                  {'⭐'.repeat(Math.min(h.stars, 5))}
                  {h.stars === 0 && <span className="text-white/40">No rating</span>}
                </p>
                <p className="text-white/50 text-xs truncate">{h.address}</p>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <div className="text-right">
                  <p className="text-white font-bold text-sm">{fmtPrice(h.price, h.currency)}</p>
                  <p className="text-white/40 text-xs">per night</p>
                </div>
                {onAdd && (
                  <button
                    type="button"
                    onClick={() => onAdd(h)}
                    className="bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                  >
                    + Add
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Flight search section ──────────────────────────────────────────────────────
type TripType = 'oneway' | 'return' | 'multicity'

const EMPTY_LEG = (): Leg => ({ from: '', to: '', date: '' })

function FlightSearch({
  itinId,
  defaultDate,
  defaultAdults,
  onAdd,
}: {
  itinId: string
  defaultDate: string
  defaultAdults: number
  onAdd?: (flight: FlightResult) => void
}) {
  const [tripType, setTripType] = useState<TripType>('oneway')

  // One-way / Return
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [returnDate, setReturnDate] = useState('')

  // Multi-city
  const [legs, setLegs] = useState<Leg[]>([EMPTY_LEG(), EMPTY_LEG()])

  const [adults, setAdults] = useState(String(defaultAdults))
  const [children, setChildren] = useState('0')
  const [cabin, setCabin] = useState('ECONOMY')
  const [loading, setLoading] = useState(false)
  const [flights, setFlights] = useState<FlightResult[]>([])
  const [fallback, setFallback] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const buildLegs = useCallback((): Leg[] | null => {
    if (tripType === 'multicity') {
      if (legs.some((l) => !l.from || !l.to || !l.date)) return null
      return legs
    }
    if (!from || !to || !date) return null
    if (tripType === 'return') {
      if (!returnDate) return null
      return [
        { from, to, date },
        { from: to, to: from, date: returnDate },
      ]
    }
    return [{ from, to, date }]
  }, [tripType, from, to, date, returnDate, legs])

  const canSearch = useCallback(() => buildLegs() !== null, [buildLegs])

  const search = useCallback(async () => {
    const resolvedLegs = buildLegs()
    if (!resolvedLegs) return
    setLoading(true)
    setError(null)
    setFallback(false)
    setSearched(true)
    try {
      const qs = new URLSearchParams({
        type: 'flights',
        adults,
        children,
        cabin,
        legs: JSON.stringify(resolvedLegs),
      })
      const res = await fetch(`/api/admin/itineraries/${itinId}/research?${qs}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setFlights(data.flights ?? [])
      setFallback(data.fallback === true)
    } catch (err) {
      setError((err as Error).message)
      setFlights([])
    } finally {
      setLoading(false)
    }
  }, [itinId, adults, children, cabin, buildLegs])

  const updateLeg = (i: number, field: keyof Leg, value: string) =>
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const addLeg = () => setLegs((prev) => [...prev, EMPTY_LEG()])
  const removeLeg = (i: number) => setLegs((prev) => prev.filter((_, idx) => idx !== i))

  return (
    <div>
      {/* Trip type tabs */}
      <div className="flex gap-1 mb-4 bg-white/5 rounded-lg p-1 w-fit">
        {(['oneway', 'return', 'multicity'] as TripType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTripType(t)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              tripType === t
                ? 'bg-amber-500 text-black'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            {t === 'oneway' ? 'One-way' : t === 'return' ? 'Return' : 'Multi-city'}
          </button>
        ))}
      </div>

      {/* One-way / Return form */}
      {(tripType === 'oneway' || tripType === 'return') && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <Field label="From (IATA)">
            <input
              className={inputCls} placeholder="LOS" maxLength={3}
              value={from}
              onChange={(e) => setFrom(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
          </Field>
          <Field label="To (IATA)">
            <input
              className={inputCls} placeholder="CDG" maxLength={3}
              value={to}
              onChange={(e) => setTo(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
          </Field>
          <Field label="Depart">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {tripType === 'return' && (
            <Field label="Return">
              <input type="date" className={inputCls} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} min={date} />
            </Field>
          )}
          <Field label="Adults">
            <input type="number" min={1} max={9} className={inputCls} value={adults} onChange={(e) => setAdults(e.target.value)} />
          </Field>
          <Field label="Children">
            <input type="number" min={0} max={8} className={inputCls} value={children} onChange={(e) => setChildren(e.target.value)} />
          </Field>
          <Field label="Cabin">
            <select className={selectCls} value={cabin} onChange={(e) => setCabin(e.target.value)}>
              <option value="ECONOMY">Economy</option>
              <option value="PREMIUM_ECONOMY">Premium Economy</option>
              <option value="BUSINESS">Business</option>
              <option value="FIRST">First</option>
            </select>
          </Field>
          <div className={`flex items-end ${tripType === 'return' ? 'col-span-2 sm:col-span-3' : 'col-span-2 sm:col-span-3'}`}>
            <button
              type="button" onClick={search}
              disabled={loading || !canSearch()}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-5 py-2 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Searching…' : 'Search Flights'}
            </button>
          </div>
        </div>
      )}

      {/* Multi-city form */}
      {tripType === 'multicity' && (
        <div className="mb-4 space-y-3">
          {legs.map((leg, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Leg {i + 1}</span>
                {i >= 2 && (
                  <button
                    type="button" onClick={() => removeLeg(i)}
                    className="text-red-400 text-xs hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="From (IATA)">
                  <input
                    className={inputCls} placeholder="LOS" maxLength={3}
                    value={leg.from}
                    onChange={(e) => updateLeg(i, 'from', e.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="To (IATA)">
                  <input
                    className={inputCls} placeholder="CDG" maxLength={3}
                    value={leg.to}
                    onChange={(e) => updateLeg(i, 'to', e.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="Date">
                  <input type="date" className={inputCls} value={leg.date} onChange={(e) => updateLeg(i, 'date', e.target.value)} />
                </Field>
              </div>
            </div>
          ))}

          {legs.length < 4 && (
            <button
              type="button" onClick={addLeg}
              className="w-full border border-dashed border-white/20 rounded-xl py-3 text-white/40 hover:text-white/70 hover:border-white/40 text-sm transition-colors"
            >
              + Add another leg
            </button>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Field label="Adults">
              <input type="number" min={1} max={9} className={inputCls} value={adults} onChange={(e) => setAdults(e.target.value)} />
            </Field>
            <Field label="Children">
              <input type="number" min={0} max={8} className={inputCls} value={children} onChange={(e) => setChildren(e.target.value)} />
            </Field>
            <Field label="Cabin">
              <select className={selectCls} value={cabin} onChange={(e) => setCabin(e.target.value)}>
                <option value="ECONOMY">Economy</option>
                <option value="PREMIUM_ECONOMY">Premium Economy</option>
                <option value="BUSINESS">Business</option>
                <option value="FIRST">First</option>
              </select>
            </Field>
          </div>

          <button
            type="button" onClick={search}
            disabled={loading || !canSearch()}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Searching…' : 'Search Flights'}
          </button>
        </div>
      )}

      {/* Fallback banner */}
      {fallback && <FallbackBanner />}

      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-3 mb-4">{error}</p>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && searched && flights.length === 0 && !error && (
        <p className="text-white/40 text-sm text-center py-6">
          No flights found. Try different airports or dates.
        </p>
      )}

      {!loading && flights.length > 0 && (
        <div className="space-y-3">
          {flights.map((f, i) => {
            const slices = f.slices ?? [f]
            return (
              <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-white/20 transition-colors">
                {/* Multiple slices */}
                {slices.map((s, si) => (
                  <div key={si} className={si > 0 ? 'mt-3 pt-3 border-t border-white/10' : ''}>
                    {slices.length > 1 && (
                      <p className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-1">
                        {si === 0 ? 'Outbound' : si === 1 && slices.length === 2 ? 'Return' : `Leg ${si + 1}`}
                      </p>
                    )}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-white font-semibold text-sm">{s.airline}</span>
                          {s.flightNumber && (
                            <span className="text-white/40 text-xs font-mono bg-white/5 px-2 py-0.5 rounded">
                              {s.flightNumber}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <div className="text-center">
                            <p className="text-white font-bold leading-none">{fmtTime(s.departure)}</p>
                            <p className="text-white/40 text-xs mt-0.5">{fmtDate(s.departure)}</p>
                          </div>
                          <div className="flex-1 flex items-center gap-1 min-w-0">
                            <div className="h-px flex-1 bg-white/20" />
                            <span className="text-white/40 text-xs whitespace-nowrap">
                              {s.duration}
                              {s.stops > 0 && ` · ${s.stops} stop${s.stops > 1 ? 's' : ''}`}
                            </span>
                            <div className="h-px flex-1 bg-white/20" />
                          </div>
                          <div className="text-center">
                            <p className="text-white font-bold leading-none">{fmtTime(s.arrival)}</p>
                            <p className="text-white/40 text-xs mt-0.5">{fmtDate(s.arrival)}</p>
                          </div>
                        </div>
                        {s.stops === 0 && <p className="text-green-400 text-xs mt-1">Direct</p>}
                        {s.stops > 0 && <p className="text-white/40 text-xs mt-1">{s.stops} stop{s.stops > 1 ? 's' : ''}</p>}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Price + Add — always at bottom right */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                  <div>
                    <p className="text-white font-bold">{fmtPrice(f.price, f.currency)}</p>
                    <p className="text-white/40 text-xs">total · all legs</p>
                  </div>
                  {onAdd && (
                    <button
                      type="button"
                      onClick={() => onAdd(f)}
                      className="bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    >
                      + Add
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ResearchTab({
  itinId,
  destination,
  startDate,
  endDate,
  numberOfTravellers,
  onAddHotel,
  onAddFlight,
}: Props) {
  const [hotelsOpen, setHotelsOpen] = useState(true)
  const [flightsOpen, setFlightsOpen] = useState(true)

  return (
    <div className="space-y-4">
      <p className="text-white/50 text-sm">
        Search live availability and add results directly to the itinerary.
      </p>

      <Section title="Hotel Search" icon="🏨" open={hotelsOpen} onToggle={() => setHotelsOpen((v) => !v)}>
        <HotelSearch
          itinId={itinId}
          defaultDestination={destination}
          defaultCheckIn={startDate ?? ''}
          defaultCheckOut={endDate ?? ''}
          defaultAdults={numberOfTravellers}
          onAdd={onAddHotel}
        />
      </Section>

      <Section title="Flight Search" icon="✈️" open={flightsOpen} onToggle={() => setFlightsOpen((v) => !v)}>
        <FlightSearch
          itinId={itinId}
          defaultDate={startDate ?? ''}
          defaultAdults={numberOfTravellers}
          onAdd={onAddFlight}
        />
      </Section>
    </div>
  )
}
