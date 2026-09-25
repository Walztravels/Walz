'use client'

import { useState, useCallback } from 'react'
import FlightResultCard, { type FlightOfferResult } from './FlightResultCard'
import HotelResultCard, { type HotelOfferResult, type HotelRateResult } from './HotelResultCard'
import { useResearchAdd, type AddedResult } from './useResearchAdd'
import { resolveHotelDestCode } from '@/lib/itinerary/hotel-destination'
import { fmtPrice } from './researchFormat'

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

export type FlightResult = FlightOfferResult

interface Leg { from: string; to: string; date: string }

export type ResearchAddedResult = AddedResult

export interface ResearchTabProps {
  itinId: string
  destination: string
  startDate?: string | null
  endDate?: string | null
  numberOfTravellers?: number
  currency?: string
  onAdded?: (r: ResearchAddedResult) => void
  onViewBookings?: () => void
  /** Current booking row ids in the itinerary; an 'Added' card resets when its booking id is absent. */
  existingBookingIds?: string[]
  /** @deprecated superseded by onAdded; kept so existing callers compile */
  onAddHotel?: (hotel: HotelResult) => void
  /** @deprecated superseded by onAdded */
  onAddFlight?: (flight: FlightResult) => void
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

// ── Flight-specific unavailability banner (no "reference results": fallback has no results) ──
export function flightBannerText(reason?: string, message?: string): string {
  switch (reason) {
    case 'NOT_CONFIGURED': return 'Live flight search is not configured'
    case 'SUPPLIER_AUTH': return 'The flight supplier rejected our credentials'
    case 'INVALID_REQUEST': return message || 'The flight search request was not valid'
    case 'RATE_LIMITED': return 'The supplier is rate-limiting requests, try again shortly'
    case 'TIMEOUT': return 'The supplier took too long, try again'
    case 'SUPPLIER_ERROR':
    case 'PROCESSING_ERROR': return 'The supplier returned an error'
    default: return 'Live search unavailable — API not configured or unreachable.'
  }
}

function FlightFallbackBanner({ reason, message }: { reason?: string; message?: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4 text-amber-300 text-sm">
      <span className="text-amber-400 text-lg leading-none mt-0.5">⚠</span>
      <span>{flightBannerText(reason, message)}</span>
    </div>
  )
}

/** Local YYYY-MM-DD */
function localToday(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
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
  onAdded,
  onViewBookings,
  existingBookingIds,
}: {
  itinId: string
  defaultDestination: string
  defaultCheckIn: string
  defaultCheckOut: string
  defaultAdults: number
  onAdded?: (r: ResearchAddedResult) => void
  onViewBookings?: () => void
  existingBookingIds?: string[]
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
  const [offers, setOffers] = useState<HotelOfferResult[]>([])
  const [legacyNotice, setLegacyNotice] = useState<string | null>(null)
  const [searchedParams, setSearchedParams] = useState<{ rooms: number; adults: number; children: number; childAges: number[] } | null>(null)
  const { add, cancel, stateOf } = useResearchAdd(itinId, onAdded, existingBookingIds)
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
      const childAges = childrenCount > 0
        ? childAgesStr.split(',').map((x) => parseInt(x.trim())).filter((n) => !isNaN(n))
        : []
      const occ = {
        rooms: Math.max(1, parseInt(rooms) || 1),
        adults: Math.max(1, parseInt(adults) || 1),
        children: childrenCount,
      }
      setOffers([])
      setHotels([])
      setLegacyNotice(null)
      let richOk = false
      try {
        const rich = await fetch('/api/admin/travel-search/hotels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination: resolveHotelDestCode(destination),
            checkIn, checkOut, ...occ, childAges,
          }),
        })
        if (rich.ok) {
          const rd = await rich.json()
          setOffers((rd.offers ?? []) as HotelOfferResult[])
          setSearchedParams({ ...occ, childAges })
          setSource('hotelbeds')
          richOk = true
        }
      } catch { /* fall through to legacy */ }
      if (richOk) return

      // Graceful fallback: hotel-level results only, Add disabled.
      const qs = new URLSearchParams({
        type: 'hotels', destination, checkIn, checkOut, adults, children, rooms,
      })
      if (childrenCount > 0 && childAgesStr.trim()) qs.set('childAges', childAgesStr.trim())
      const res = await fetch(`/api/admin/itineraries/${itinId}/research?${qs}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setHotels(data.hotels ?? [])
      setSource(data.source ?? null)
      setFallback(data.fallback === true)
      setLegacyNotice('Room and rate selection is unavailable right now, so these are hotel-level prices only. Adding to the itinerary is disabled until room search works again.')
    } catch (err) {
      setError((err as Error).message)
      setHotels([])
    } finally {
      setLoading(false)
    }
  }, [itinId, destination, checkIn, checkOut, adults, children, childAgesStr, rooms, childrenCount])

  const addRate = (h: HotelOfferResult, r: HotelRateResult, key: string, allowDuplicate: boolean) => {
    const p = searchedParams
    void add(key, {
      type: 'hotel',
      hotelCode: h.providerHotelCode,
      rateKey: r.rateKey,
      checkIn: h.checkIn,
      checkOut: h.checkOut,
      rooms: p?.rooms ?? h.rooms,
      adults: p?.adults ?? h.adults,
      children: p?.children ?? h.children,
      ...(p && p.childAges.length ? { childAges: p.childAges } : {}),
      hotelName: h.hotelName,
      location: [h.city, h.destinationName].filter(Boolean).join(', '),
      stars: h.starRating ?? 0,
      image: h.imageUrls?.[0] ?? null,
    }, allowDuplicate)
  }

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
      {!fallback && source && (hotels.length > 0 || offers.length > 0) && (
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

      {legacyNotice && (
        <p className="text-amber-300 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 mb-4">{legacyNotice}</p>
      )}

      {!loading && searched && hotels.length === 0 && offers.length === 0 && !error && (
        <p className="text-white/40 text-sm text-center py-6">
          No hotels found. Try a different destination or date range.
        </p>
      )}

      {!loading && offers.length > 0 && (
        <div className="space-y-3">
          {offers.map((h) => (
            <HotelResultCard
              key={h.providerHotelCode}
              hotel={h}
              stateOf={stateOf}
              onViewBookings={onViewBookings}
              onCancel={cancel}
              onAddRate={(r, key) => addRate(h, r, key, false)}
              onAddAnyway={(r, key) => addRate(h, r, key, true)}
            />
          ))}
        </div>
      )}

      {!loading && hotels.length > 0 && (
        <div className="space-y-3">
          {hotels.map((h, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 flex items-start gap-3 border border-white/10">
              <div className="w-16 h-16 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 text-2xl">🏨</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm">{h.name}</p>
                <p className="text-amber-400 text-xs">{'⭐'.repeat(Math.min(h.stars, 5))}</p>
                <p className="text-white/50 text-xs">{h.address}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-white font-bold text-sm">{fmtPrice(h.price, h.currency)}</p>
                <p className="text-white/40 text-xs">from (rate not selectable)</p>
                <button type="button" disabled className="mt-2 min-h-[44px] bg-amber-500 text-black text-sm font-bold px-4 rounded-lg opacity-50 cursor-not-allowed">
                  Add to Itinerary
                </button>
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
  onAdded,
  onViewBookings,
  existingBookingIds,
}: {
  itinId: string
  defaultDate: string
  defaultAdults: number
  onAdded?: (r: ResearchAddedResult) => void
  onViewBookings?: () => void
  existingBookingIds?: string[]
}) {
  const { add, cancel, stateOf } = useResearchAdd(itinId, onAdded, existingBookingIds)
  const [tripType, setTripType] = useState<TripType>('oneway')

  // One-way / Return
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const today = localToday()
  // Never seed the form with a past itinerary date
  const [date, setDate] = useState(defaultDate && defaultDate >= today ? defaultDate : '')
  const [returnDate, setReturnDate] = useState('')

  // Multi-city
  const [legs, setLegs] = useState<Leg[]>([EMPTY_LEG(), EMPTY_LEG()])

  const [adults, setAdults] = useState(String(defaultAdults))
  const [children, setChildren] = useState('0')
  const [cabin, setCabin] = useState('ECONOMY')
  const [loading, setLoading] = useState(false)
  const [flights, setFlights] = useState<FlightResult[]>([])
  const [fallback, setFallback] = useState(false)
  const [failReason, setFailReason] = useState<string | undefined>()
  const [failMessage, setFailMessage] = useState<string | undefined>()
  const [dateError, setDateError] = useState<string | null>(null)
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
    if (resolvedLegs.some((l) => l.date < today)) {
      setDateError('Choose a departure date of today or later')
      setFlights([])
      setFallback(false)
      setFailReason(undefined)
      setFailMessage(undefined)
      return
    }
    setDateError(null)
    setLoading(true)
    setError(null)
    setFallback(false)
    setFailReason(undefined)
    setFailMessage(undefined)
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
      setFailReason(data.reason)
      setFailMessage(data.message)
    } catch (err) {
      setError((err as Error).message)
      setFlights([])
    } finally {
      setLoading(false)
    }
  }, [itinId, adults, children, cabin, buildLegs, today])

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
            <input type="date" className={inputCls} value={date} min={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {tripType === 'return' && (
            <Field label="Return">
              <input type="date" className={inputCls} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} min={date || today} />
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
                  <input type="date" className={inputCls} value={leg.date} min={today} onChange={(e) => updateLeg(i, 'date', e.target.value)} />
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
      {dateError && (
        <p role="alert" className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-3 mb-4">{dateError}</p>
      )}
      {fallback && <FlightFallbackBanner reason={failReason} message={failMessage} />}

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
            const key = f.offerId ?? `noid-${i}`
            return (
              <FlightResultCard
                key={key}
                flight={f}
                state={stateOf(key)}
                onAdd={() => f.offerId && void add(key, { type: 'flight', offerId: f.offerId })}
                onAddAnyway={() => f.offerId && void add(key, { type: 'flight', offerId: f.offerId }, true)}
                onCancel={() => cancel(key)}
                onViewBookings={onViewBookings}
              />
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
  onAdded,
  onViewBookings,
  existingBookingIds,
}: ResearchTabProps) {
  const [hotelsOpen, setHotelsOpen] = useState(true)
  const [flightsOpen, setFlightsOpen] = useState(true)
  const pax = numberOfTravellers ?? 1

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
          defaultAdults={pax}
          onAdded={onAdded}
          onViewBookings={onViewBookings}
          existingBookingIds={existingBookingIds}
        />
      </Section>

      <Section title="Flight Search" icon="✈️" open={flightsOpen} onToggle={() => setFlightsOpen((v) => !v)}>
        <FlightSearch
          itinId={itinId}
          defaultDate={startDate ?? ''}
          defaultAdults={pax}
          onAdded={onAdded}
          onViewBookings={onViewBookings}
          existingBookingIds={existingBookingIds}
        />
      </Section>
    </div>
  )
}
