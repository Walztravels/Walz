'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Plane, Search, Loader2, AlertTriangle, Check, CheckCircle,
  Copy, Plus, Trash2, ArrowRight, Clock, Users, CreditCard,
  ChevronUp, ChevronDown, RotateCcw, Luggage
} from 'lucide-react'
import AdminBookingShell       from '@/components/admin/booking/AdminBookingShell'
import CustomerSelector        from '@/components/admin/booking/CustomerSelector'
import type { AdminCustomer }  from '@/components/admin/booking/CustomerSelector'
import BookingSummary          from '@/components/admin/booking/BookingSummary'
import { calculateBookingPrice } from '@/lib/pricing/booking-price'
import type { BookingPriceResult } from '@/lib/pricing/booking-price'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AirportSuggestion { code: string; name: string; city: string; country: string }

interface FlightSegment {
  airline:       string
  flightNumber:  string
  origin:        string
  destination:   string
  departureTime: string
  arrivalTime:   string
  durationMins:  number
  cabinClass:    string
  baggage:       string
}

interface FlightOffer {
  id:            string
  price:         number
  currency:      string
  segments:      FlightSegment[]
  returnSegments?: FlightSegment[]
  stops:         number
  totalDuration: number
  returnDuration?: number
  baggageInfo:   { cabin: string; checked: string; included: boolean }
  expiresAt?:    string
  badge?:        string
  badgeLabel?:   string
  fareType:      string
}

interface Leg { from: string; fromLabel: string; to: string; toLabel: string; date: string }

type TripType    = 'one-way' | 'round-trip' | 'multi-city'
type CabinClass  = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'
type Step        = 0 | 1 | 2 | 3 | 4 | 5  // search/results/passengers/client/pricing/confirm
type PaymentMethod = 'STRIPE_LINK' | 'BANK_TRANSFER' | 'MARK_PAID' | 'PAY_LATER'

interface PassengerForm {
  type:        'adult' | 'child' | 'infant'
  title:       string
  given_name:  string
  family_name: string
  born_on:     string
  gender:      string
  email:       string
  phone_number: string
  passport_number?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = ['Search', 'Results', 'Passengers', 'Client', 'Pricing', 'Confirm']

const CABIN_LABELS: Record<CabinClass, string> = {
  ECONOMY: 'Economy', PREMIUM_ECONOMY: 'Premium Economy',
  BUSINESS: 'Business', FIRST: 'First Class',
}

const PAYMENT_METHODS: { id: PaymentMethod; label: string; desc: string }[] = [
  { id: 'STRIPE_LINK',   label: 'Stripe Payment Link', desc: 'Send a secure payment link to client'  },
  { id: 'BANK_TRANSFER', label: 'Bank Transfer',        desc: 'Record expected bank transfer'         },
  { id: 'MARK_PAID',     label: 'Mark as Paid',         desc: 'Cash / already received'               },
  { id: 'PAY_LATER',     label: 'Pay Later / Invoice',  desc: 'Confirm booking, payment to follow'    },
]

const BADGE_COLOUR: Record<string, string> = {
  recommended:  'bg-[#C9A84C] text-[#0B1F3A]',
  cheapest:     'bg-green-600 text-white',
  fastest:      'bg-blue-600 text-white',
  luxury:       'bg-purple-700 text-white',
  'best-value': 'bg-teal-600 text-white',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(currency: string, n: number) {
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function fmtTime(iso: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } catch { return iso.slice(11, 16) }
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return iso }
}

// ── Airport Autocomplete ──────────────────────────────────────────────────────

function AirportInput({ value, label: displayLabel, onChange, placeholder }: {
  value: string
  label: string
  onChange: (code: string, label: string) => void
  placeholder?: string
}) {
  const [q,       setQ]       = useState(displayLabel)
  const [results, setResults] = useState<AirportSuggestion[]>([])
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // sync external label
  useEffect(() => { setQ(displayLabel) }, [displayLabel])

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function search(text: string) {
    if (timer.current) clearTimeout(timer.current)
    if (text.length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(text)}`)
        const d = await r.json()
        setResults(d.data ?? [])
      } catch { setResults([]) }
      finally  { setLoading(false) }
    }, 250)
  }

  return (
    <div ref={ref} className="relative">
      <Plane className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
      {value && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono
          text-[#C9A84C] pointer-events-none">{value}</span>
      )}
      <input
        type="text"
        value={q}
        onChange={e => { setQ(e.target.value); onChange('', e.target.value); setOpen(true); search(e.target.value) }}
        onFocus={() => { setOpen(true); if (!results.length && q.length >= 2) search(q) }}
        placeholder={placeholder ?? 'City or airport…'}
        className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl pl-9 pr-12 py-2.5
          text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]" />
      {open && (
        <ul className="absolute z-50 top-full mt-1 left-0 right-0 bg-[#0a1929] border
          border-[#2a3f5f] rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
          {loading && <li className="px-4 py-3 text-xs text-gray-500 text-center">Searching…</li>}
          {!loading && results.length === 0 && q.length >= 2 && (
            <li className="px-4 py-3 text-xs text-gray-500 text-center">No results</li>
          )}
          {results.map(a => (
            <li key={a.code}>
              <button type="button"
                onClick={() => { onChange(a.code, `${a.city} (${a.code})`); setQ(`${a.city} (${a.code})`); setOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#0d2035]
                  text-left transition-colors">
                <span className="text-[10px] font-mono text-[#C9A84C] w-8">{a.code}</span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-white">{a.city}</span>
                  <span className="text-xs text-gray-500 ml-1.5 truncate">{a.name}</span>
                </span>
                <span className="text-[10px] text-gray-600">{a.country}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Segment card for results display ─────────────────────────────────────────

function SegmentRow({ seg }: { seg: FlightSegment }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="text-right w-14 flex-shrink-0">
        <p className="font-bold text-white text-base">{fmtTime(seg.departureTime)}</p>
        <p className="text-xs text-gray-500">{seg.origin}</p>
      </div>
      <div className="flex-1 flex flex-col items-center gap-0.5">
        <p className="text-[10px] text-gray-500">{fmtDuration(seg.durationMins)}</p>
        <div className="w-full border-t border-[#2a3f5f] relative">
          <Plane className="absolute left-1/2 -top-2 -translate-x-1/2 w-3 h-3 text-gray-500" />
        </div>
        <p className="text-[10px] text-gray-500">{seg.airline} {seg.flightNumber}</p>
      </div>
      <div className="text-left w-14 flex-shrink-0">
        <p className="font-bold text-white text-base">{fmtTime(seg.arrivalTime)}</p>
        <p className="text-xs text-gray-500">{seg.destination}</p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function AdminFlightBookingContent() {
  const searchParams = useSearchParams()
  const quoteId = searchParams.get('quoteId')

  const today = new Date().toISOString().split('T')[0]

  // ── Trip params ──────────────────────────────────────────────────────────
  const [tripType,    setTripType]    = useState<TripType>('one-way')
  const [cabin,       setCabin]       = useState<CabinClass>('ECONOMY')
  const [adults,      setAdults]      = useState(1)
  const [children_,   setChildren]    = useState(0)
  const [infants,     setInfants]     = useState(0)

  // Simple legs (one-way / round-trip)
  const [from,        setFrom]        = useState('')
  const [fromLabel,   setFromLabel]   = useState('')
  const [to,          setTo]          = useState('')
  const [toLabel,     setToLabel]     = useState('')
  const [depart,      setDepart]      = useState('')
  const [returnDate,  setReturnDate]  = useState('')

  // Multi-city legs
  const [legs, setLegs] = useState<Leg[]>([
    { from: '', fromLabel: '', to: '', toLabel: '', date: '' },
    { from: '', fromLabel: '', to: '', toLabel: '', date: '' },
  ])

  // Results
  const [offers,      setOffers]      = useState<FlightOffer[]>([])
  const [searching,   setSearching]   = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [sort,        setSort]        = useState<'recommended' | 'cheapest' | 'fastest'>('recommended')
  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  const [selected,    setSelected]    = useState<FlightOffer | null>(null)

  // Passengers
  const [passengers, setPassengers] = useState<PassengerForm[]>([{
    type: 'adult', title: 'mr', given_name: '', family_name: '',
    born_on: '', gender: 'm', email: '', phone_number: '', passport_number: '',
  }])

  // Client
  const [customer,   setCustomer]   = useState<AdminCustomer | null>(null)

  // Pricing
  const [pricing,    setPricing]    = useState<BookingPriceResult | null>(null)
  const [markupPct,  setMarkupPct]  = useState(5)
  const [serviceFee, setServiceFee] = useState(0)
  const [discount,   setDiscount]   = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK_TRANSFER')

  // Booking
  const [booking_,   setBooking_]   = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [result,     setResult]     = useState<{ ref: string; pnr: string | null } | null>(null)

  const [step, setStep] = useState<Step>(0)

  // ── Sync passenger count to pax fields ──────────────────────────────────
  const totalPax = adults + children_ + infants
  useEffect(() => {
    setPassengers(prev => {
      const next: PassengerForm[] = []
      let ai = 0, ci = 0, ii = 0
      for (let i = 0; i < totalPax; i++) {
        const type: PassengerForm['type'] =
          ai < adults   ? 'adult' :
          ci < children_ ? 'child' : 'infant'
        if (type === 'adult')  ai++
        if (type === 'child')  ci++
        if (type === 'infant') ii++
        next.push(prev[i] ?? {
          type, title: 'mr', given_name: '', family_name: '',
          born_on: '', gender: 'm', email: '', phone_number: '', passport_number: '',
        })
        next[i] = { ...next[i], type }
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adults, children_, infants])

  // ── Recompute pricing when offer changes ────────────────────────────────
  useEffect(() => {
    if (!selected) { setPricing(null); return }
    setPricing(calculateBookingPrice({
      productType: 'FLIGHT', supplier: 'DUFFEL',
      netAmount: selected.price, currency: selected.currency,
      markupPercent: markupPct, serviceFee, discount,
    }))
  }, [selected, markupPct, serviceFee, discount])

  useEffect(() => {
    if (selected && step === 4) {
      const p = calculateBookingPrice({
        productType: 'FLIGHT', supplier: 'DUFFEL',
        netAmount: selected.price, currency: selected.currency,
      })
      setMarkupPct(p.markupPercent)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ── Load from quoteId ───────────────────────────────────────────────────
  useEffect(() => {
    if (!quoteId) return
    fetch(`/api/admin/flight-quotes/${quoteId}`)
      .then(r => r.json())
      .then(d => {
        if (!d.quote) return
        const q = d.quote
        setFrom(q.origin); setFromLabel(q.origin)
        setTo(q.destination); setToLabel(q.destination)
        if (q.departureDate) setDepart(q.departureDate.split('T')[0])
        if (q.returnDate)    setReturnDate(q.returnDate.split('T')[0])
        if (q.clientEmail) {
          setCustomer({ id: '', name: q.clientName ?? '', email: q.clientEmail, phone: q.clientPhone ?? null })
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId])

  // ── Sorted offers ────────────────────────────────────────────────────────
  const sortedOffers = [...offers].sort((a, b) => {
    if (sort === 'cheapest') return a.price - b.price
    if (sort === 'fastest')  return a.totalDuration - b.totalDuration
    // recommended: badged first, then cheapest
    const ba = a.badge === 'recommended' ? -1 : a.badge ? 0 : 1
    const bb = b.badge === 'recommended' ? -1 : b.badge ? 0 : 1
    return ba - bb || a.price - b.price
  })

  // ── Search ───────────────────────────────────────────────────────────────
  async function doSearch() {
    setSearching(true); setSearchError(null); setOffers([]); setSelected(null)
    setStep(1)
    try {
      let body: Record<string, unknown>
      if (tripType === 'multi-city') {
        body = {
          trip: 'multi-city',
          segments: legs.map(l => ({ from: l.from, to: l.to, date: l.date })),
          cabin: cabin.toLowerCase(),
          adults, children: children_, infants,
        }
      } else {
        body = {
          trip: tripType,
          from, to,
          depart,
          ...(tripType === 'round-trip' && returnDate ? { return: returnDate } : {}),
          cabin: cabin.toLowerCase(),
          adults, children: children_, infants,
        }
      }

      const res  = await fetch('/api/flights/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: FlightOffer[] = (data.results ?? []).map((r: any) => ({
        id:            r.id,
        price:         r.price?.total ?? r.totalAmount ?? 0,
        currency:      r.price?.currency ?? 'GBP',
        segments:      r.segments ?? [],
        returnSegments: r.returnSegments,
        stops:         r.stops ?? 0,
        totalDuration: r.totalDuration ?? 0,
        returnDuration: r.returnDuration,
        baggageInfo:   r.baggageInfo ?? { cabin: '1× carry-on', checked: 'Not included', included: false },
        expiresAt:     r.expiresAt,
        badge:         r.badge,
        badgeLabel:    r.badgeLabel,
        fareType:      r.fareType ?? 'standard',
      }))

      if (!mapped.length) throw new Error('No flights found. Try different dates.')
      setOffers(mapped)
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : String(e))
      setStep(0)
    } finally {
      setSearching(false)
    }
  }

  // ── Book ──────────────────────────────────────────────────────────────────
  async function doBook() {
    if (!selected || !customer || !pricing) return
    setBooking_(true); setBookingError(null)
    try {
      const paxPayload = passengers.map((p, i) => ({
        title:        p.title,
        given_name:   p.given_name,
        family_name:  p.family_name,
        born_on:      p.born_on,
        gender:       p.gender,
        email:        i === 0 ? (customer.email ?? p.email) : p.email,
        phone_number: i === 0 ? (customer.phone ?? (p.phone_number || '+440000000000')) : (p.phone_number || '+440000000000'),
        ...(p.passport_number ? { passport_number: p.passport_number } : {}),
      }))

      const res = await fetch('/api/admin/book/flight', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId:       selected.id,
          clientName:    customer.name,
          clientEmail:   customer.email,
          clientPhone:   customer.phone ?? '',
          clientId:      customer.id || null,
          passengers:    paxPayload,
          totalNet:      pricing.supplierCost,
          sellingPrice:  pricing.sellingPrice,
          markupPercent: pricing.markupPercent,
          markupAmount:  pricing.markupAmount,
          serviceFee:    pricing.serviceFee,
          discount:      pricing.discount,
          currency:      selected.currency,
          paymentMethod,
          origin:       tripType === 'multi-city' ? legs[0]?.fromLabel : fromLabel,
          destination:  tripType === 'multi-city' ? legs[legs.length - 1]?.toLabel : toLabel,
          tripType,
          departureDate: tripType === 'multi-city' ? legs[0]?.date : depart,
          returnDate:    returnDate || null,
          cabinClass:    cabin,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Booking failed')
      setResult({ ref: data.bookingReference, pnr: data.pnr ?? null })
    } catch (e: unknown) {
      setBookingError(e instanceof Error ? e.message : String(e))
    } finally {
      setBooking_(false)
    }
  }

  // ── Update leg helper ────────────────────────────────────────────────────
  const updateLeg = useCallback((i: number, field: keyof Leg, val: string) => {
    setLegs(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l))
  }, [])

  function addLeg() {
    if (legs.length >= 5) return
    setLegs(prev => [...prev, { from: '', fromLabel: '', to: '', toLabel: '', date: '' }])
  }
  function removeLeg(i: number) {
    if (legs.length <= 2) return
    setLegs(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Done screen ────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="min-h-screen bg-[#061320] flex items-center justify-center p-6">
        <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">
            {result.pnr ? 'Flight Confirmed' : 'Booking Pending'}
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            {result.pnr ? 'Duffel has confirmed the order' : 'Saved — Duffel confirmation pending'}
          </p>

          <div className="space-y-3 text-left mb-6">
            <div className="bg-[#0d2035] rounded-xl p-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Booking Reference</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[#C9A84C] font-mono font-bold text-lg">{result.ref}</p>
                <button onClick={() => navigator.clipboard?.writeText(result.ref)}
                  className="text-gray-500 hover:text-white">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {result.pnr && (
              <div className="bg-[#0d2035] rounded-xl p-4">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Airline PNR</p>
                <p className="text-white font-mono text-lg font-bold tracking-widest">{result.pnr}</p>
              </div>
            )}
            {pricing && (
              <div className="bg-[#0d2035] rounded-xl p-4 flex justify-between">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Customer Total</p>
                  <p className="text-white font-bold">{fmt(selected?.currency ?? 'GBP', pricing.sellingPrice)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Payment</p>
                  <p className="text-amber-400 text-sm font-medium">
                    {paymentMethod === 'MARK_PAID' ? 'Paid' : 'Pending'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <a href="/admin/flight-bookings"
              className="w-full py-2.5 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl text-sm
                hover:bg-[#e0b85c] transition-colors block">
              View Flight Bookings
            </a>
            <button onClick={() => window.location.reload()}
              className="w-full py-2.5 border border-[#2a3f5f] text-gray-400 font-medium rounded-xl
                text-sm hover:border-[#C9A84C] hover:text-white transition-colors">
              New Flight Booking
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Search bar ────────────────────────────────────────────────────────────
  const searchBarNode = step === 0 ? null : (
    <div className="flex items-center gap-3 flex-wrap text-sm text-gray-400">
      <span>
        {tripType === 'multi-city'
          ? `${legs[0]?.from} → … · Multi-city`
          : `${from} → ${to} · ${depart}${returnDate ? ` → ${returnDate}` : ''}`
        }
        {' · '}{adults}ad{children_ > 0 ? ` ${children_}ch` : ''}{infants > 0 ? ` ${infants}inf` : ''}
        {' · '}{CABIN_LABELS[cabin]}
      </span>
      <button onClick={() => { setStep(0); setOffers([]); setSelected(null) }}
        className="flex items-center gap-1.5 text-xs text-[#C9A84C] hover:text-[#e0b85c]
          border border-[#C9A84C]/30 rounded-lg px-3 py-1 transition-colors">
        <RotateCcw className="w-3 h-3" /> New search
      </button>
    </div>
  )

  // ── Sidebar summary ───────────────────────────────────────────────────────
  const origin      = tripType === 'multi-city' ? legs[0]?.fromLabel || legs[0]?.from : fromLabel || from
  const destination = tripType === 'multi-city' ? legs[legs.length-1]?.toLabel || legs[legs.length-1]?.to : toLabel || to
  const routeLabel  = origin && destination ? `${origin} → ${destination}` : undefined

  const summaryNode = (
    <BookingSummary
      customer={customer}
      productName={routeLabel}
      productDetail={selected ? `${CABIN_LABELS[cabin]} · ${selected.stops === 0 ? 'Direct' : `${selected.stops} stop${selected.stops > 1 ? 's' : ''}`}` : undefined}
      supplier="Duffel"
      dates={depart ? `${fmtDate(depart)}${returnDate ? ` – ${fmtDate(returnDate)}` : ''}` : undefined}
      travellers={`${adults} adult${adults !== 1 ? 's' : ''}${children_ > 0 ? `, ${children_} child${children_ !== 1 ? 'ren' : ''}` : ''}${infants > 0 ? `, ${infants} infant${infants !== 1 ? 's' : ''}` : ''}`}
      pricing={pricing ?? undefined}
      paymentStatus={paymentMethod === 'MARK_PAID' ? 'PAID' : step >= 5 ? 'PENDING' : null}
      onContinue={
        step === 1 ? (selected ? () => setStep(2) : undefined) :
        step === 2 ? (() => setStep(3)) :
        step === 3 ? (customer ? () => setStep(4) : undefined) :
        step === 4 ? (() => setStep(5)) :
        step === 5 ? doBook :
        undefined
      }
      continueLabel={step === 5 ? (booking_ ? 'Booking…' : 'Confirm & Book') : 'Continue'}
      continueDisabled={
        step === 1 ? !selected :
        step === 2 ? passengers.some(p => !p.given_name || !p.family_name || !p.born_on) :
        step === 3 ? !customer :
        step === 5 ? booking_ :
        false
      }
      isLoading={booking_}
    />
  )

  // ── Banner ────────────────────────────────────────────────────────────────
  const hasBanner = !!(searchError || bookingError)
  const banner = hasBanner ? (
    <div className="space-y-2">
      {searchError && (
        <div className="flex items-center gap-3 bg-red-900/20 border border-red-900/40
          rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {searchError}
          <button onClick={() => setSearchError(null)} className="ml-auto">✕</button>
        </div>
      )}
      {bookingError && (
        <div className="flex items-center gap-3 bg-red-900/20 border border-red-900/40
          rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {bookingError}
          <button onClick={() => setBookingError(null)} className="ml-auto">✕</button>
        </div>
      )}
    </div>
  ) : null

  // ── STEP 0 — SEARCH ───────────────────────────────────────────────────────
  const searchContent = (
    <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
      <h2 className="text-white font-bold mb-5 flex items-center gap-2">
        <Plane className="w-5 h-5 text-[#C9A84C]" /> Flight Search
      </h2>

      {/* Trip type */}
      <div className="flex gap-2 mb-5">
        {(['one-way', 'round-trip', 'multi-city'] as TripType[]).map(t => (
          <button key={t} type="button" onClick={() => setTripType(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tripType === t
                ? 'bg-[#C9A84C] text-[#0B1F3A]'
                : 'border border-[#2a3f5f] text-gray-400 hover:text-white hover:border-[#3a4f6f]'
            }`}>
            {t === 'one-way' ? 'One-way' : t === 'round-trip' ? 'Return' : 'Multi-city'}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {tripType !== 'multi-city' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">From *</label>
                <AirportInput value={from} label={fromLabel}
                  onChange={(c, l) => { setFrom(c); setFromLabel(l) }}
                  placeholder="Departure city or airport" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">To *</label>
                <AirportInput value={to} label={toLabel}
                  onChange={(c, l) => { setTo(c); setToLabel(l) }}
                  placeholder="Destination city or airport" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">Depart *</label>
                <input type="date" value={depart} min={today}
                  onChange={e => setDepart(e.target.value)} required
                  className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                    text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
              </div>
              {tripType === 'round-trip' && (
                <div>
                  <label className="text-xs text-gray-400 block mb-1.5">Return</label>
                  <input type="date" value={returnDate} min={depart || today}
                    onChange={e => setReturnDate(e.target.value)}
                    className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                      text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
                </div>
              )}
            </div>
          </>
        ) : (
          /* Multi-city legs */
          <div className="space-y-3">
            {legs.map((leg, i) => (
              <div key={i} className="bg-[#0d2035] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#C9A84C]">Leg {i + 1}</p>
                  {i >= 2 && (
                    <button type="button" onClick={() => removeLeg(i)}
                      className="text-gray-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <AirportInput value={leg.from} label={leg.fromLabel}
                    onChange={(c, l) => { updateLeg(i, 'from', c); updateLeg(i, 'fromLabel', l) }}
                    placeholder="From" />
                  <AirportInput value={leg.to} label={leg.toLabel}
                    onChange={(c, l) => { updateLeg(i, 'to', c); updateLeg(i, 'toLabel', l) }}
                    placeholder="To" />
                </div>
                <input type="date" value={leg.date} min={i > 0 ? legs[i-1].date || today : today}
                  onChange={e => updateLeg(i, 'date', e.target.value)}
                  className="w-full bg-[#061320] border border-[#2a3f5f] rounded-xl px-3 py-2
                    text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
              </div>
            ))}
            {legs.length < 5 && (
              <button type="button" onClick={addLeg}
                className="w-full py-2.5 border border-dashed border-[#2a3f5f] rounded-xl
                  text-xs text-gray-400 hover:border-[#C9A84C] hover:text-[#C9A84C]
                  transition-colors flex items-center justify-center gap-2">
                <Plus className="w-3.5 h-3.5" /> Add leg
              </button>
            )}
          </div>
        )}

        {/* Passengers */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Adults', sub: '12+ yrs',    value: adults,    set: setAdults    },
            { label: 'Children', sub: '2–11 yrs', value: children_, set: setChildren  },
            { label: 'Infants', sub: 'Under 2',   value: infants,   set: setInfants   },
          ].map(({ label, sub, value, set }) => (
            <div key={label}>
              <label className="text-xs text-gray-400 block mb-0.5">{label}</label>
              <p className="text-[10px] text-gray-600 mb-1.5">{sub}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => set(Math.max(0, value - 1))}
                  className="w-7 h-7 rounded-lg border border-[#2a3f5f] flex items-center justify-center
                    text-gray-400 hover:text-white hover:border-[#C9A84C] transition-colors text-sm">
                  −
                </button>
                <span className="text-white text-sm w-4 text-center">{value}</span>
                <button type="button" onClick={() => set(Math.min(9, value + 1))}
                  className="w-7 h-7 rounded-lg border border-[#2a3f5f] flex items-center justify-center
                    text-gray-400 hover:text-white hover:border-[#C9A84C] transition-colors text-sm">
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Cabin */}
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Cabin class</label>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(CABIN_LABELS) as CabinClass[]).map(c => (
              <button key={c} type="button" onClick={() => setCabin(c)}
                className={`py-2 px-2 rounded-xl text-xs font-medium text-center transition-colors ${
                  cabin === c
                    ? 'bg-[#C9A84C] text-[#0B1F3A]'
                    : 'border border-[#2a3f5f] text-gray-400 hover:text-white hover:border-[#3a4f6f]'
                }`}>
                {CABIN_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        <button type="button"
          disabled={searching || (tripType !== 'multi-city' ? (!from || !to || !depart) : legs.some(l => !l.from || !l.to || !l.date))}
          onClick={doSearch}
          className="w-full flex items-center justify-center gap-2 py-3 bg-[#C9A84C] text-[#0B1F3A]
            font-bold rounded-xl hover:bg-[#e0b85c] disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors text-sm">
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {searching ? 'Searching Duffel…' : 'Search Flights'}
        </button>
      </div>
    </div>
  )

  // ── STEP 1 — RESULTS ─────────────────────────────────────────────────────
  const resultsContent = (
    <div className="space-y-4">
      {/* Sort */}
      <div className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Sort:</span>
        {(['recommended', 'cheapest', 'fastest'] as const).map(s => (
          <button key={s} type="button" onClick={() => setSort(s)}
            className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
              sort === s ? 'bg-[#C9A84C] text-[#0B1F3A]' : 'border border-[#2a3f5f] text-gray-400 hover:text-white'
            }`}>
            {s}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500">{sortedOffers.length} offers</span>
      </div>

      {searching && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-5 animate-pulse">
              <div className="h-4 bg-[#1a2f4a] rounded w-1/2 mb-2" />
              <div className="h-3 bg-[#1a2f4a] rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {!searching && sortedOffers.map(offer => {
        const wp         = calculateBookingPrice({ productType: 'FLIGHT', supplier: 'DUFFEL', netAmount: offer.price, currency: offer.currency })
        const isSelected = selected?.id === offer.id
        const isExpanded = expandedId === offer.id
        const firstSeg   = offer.segments[0]
        const lastSeg    = offer.segments[offer.segments.length - 1]
        const expiring   = offer.expiresAt && new Date(offer.expiresAt) < new Date(Date.now() + 10 * 60000)

        return (
          <div key={offer.id}
            className={`bg-[#0a1929] rounded-xl border transition-colors ${
              isSelected ? 'border-[#C9A84C]/60' : 'border-[#1a2f4a]'
            }`}>
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {offer.badge && (
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded mb-2 ${BADGE_COLOUR[offer.badge] ?? 'bg-gray-700 text-white'}`}>
                      {offer.badgeLabel ?? offer.badge}
                    </span>
                  )}

                  {/* Outbound summary */}
                  {firstSeg && lastSeg && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-white text-base">{fmtTime(firstSeg.departureTime)}</span>
                      <span className="text-gray-500 text-xs flex-1">
                        {firstSeg.origin} → {lastSeg.destination}
                      </span>
                      <span className="font-bold text-white text-base">{fmtTime(lastSeg.arrivalTime)}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDuration(offer.totalDuration)}</span>
                    <span>{offer.stops === 0 ? 'Direct' : `${offer.stops} stop${offer.stops > 1 ? 's' : ''}`}</span>
                    <span className="flex items-center gap-1">
                      <Luggage className="w-3 h-3" />
                      {offer.baggageInfo.included ? offer.baggageInfo.checked : 'No checked bag'}
                    </span>
                    {expiring && <span className="text-amber-400">Expires soon</span>}
                  </div>

                  {offer.returnSegments && (
                    <p className="text-[10px] text-gray-500 mt-1">Return included · {fmtDuration(offer.returnDuration ?? 0)}</p>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500">Net {fmt(offer.currency, offer.price)}</p>
                  <p className="text-[#C9A84C] font-bold text-base">{fmt(offer.currency, wp.sellingPrice)}</p>
                  <p className="text-[10px] text-gray-600">per booking</p>
                  <button type="button"
                    onClick={() => { setSelected(offer); setStep(2) }}
                    className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      isSelected ? 'bg-green-600 text-white' : 'bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#e0b85c]'
                    }`}>
                    {isSelected ? <span className="flex items-center gap-1"><Check className="w-3 h-3" />Selected</span> : 'Select'}
                  </button>
                </div>
              </div>

              {/* Expand/collapse segments */}
              <button type="button" onClick={() => setExpandedId(isExpanded ? null : offer.id)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#C9A84C] mt-3 transition-colors">
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {isExpanded ? 'Hide' : 'Show'} flight details
              </button>

              {isExpanded && (
                <div className="mt-4 space-y-3 pt-3 border-t border-[#1a2f4a]">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                    Outbound
                  </p>
                  {offer.segments.map((seg, i) => <SegmentRow key={i} seg={seg} />)}
                  {offer.returnSegments && (
                    <>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold pt-2">
                        Return
                      </p>
                      {offer.returnSegments.map((seg, i) => <SegmentRow key={i} seg={seg} />)}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  // ── STEP 2 — PASSENGERS ───────────────────────────────────────────────────
  const PAX_TYPE_LABEL: Record<string, string> = { adult: 'Adult', child: 'Child', infant: 'Infant' }
  const passengersContent = (
    <div className="space-y-4">
      {passengers.map((p, i) => (
        <div key={i} className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-5">
          <p className="text-sm font-bold text-white mb-4">
            Passenger {i + 1} — <span className="text-[#C9A84C]">{PAX_TYPE_LABEL[p.type]}</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Title</label>
              <select value={p.title} onChange={e => setPassengers(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                  text-sm text-white focus:outline-none focus:border-[#C9A84C]">
                <option value="mr">Mr</option>
                <option value="ms">Ms</option>
                <option value="mrs">Mrs</option>
                <option value="miss">Miss</option>
                <option value="dr">Dr</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Gender</label>
              <select value={p.gender} onChange={e => setPassengers(prev => prev.map((x, j) => j === i ? { ...x, gender: e.target.value } : x))}
                className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                  text-sm text-white focus:outline-none focus:border-[#C9A84C]">
                <option value="m">Male</option>
                <option value="f">Female</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">First name *</label>
              <input value={p.given_name} required
                onChange={e => setPassengers(prev => prev.map((x, j) => j === i ? { ...x, given_name: e.target.value } : x))}
                placeholder="As on passport"
                className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                  text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Last name *</label>
              <input value={p.family_name} required
                onChange={e => setPassengers(prev => prev.map((x, j) => j === i ? { ...x, family_name: e.target.value } : x))}
                placeholder="As on passport"
                className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                  text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Date of birth *</label>
              <input type="date" value={p.born_on} required
                max={p.type === 'infant' ? today : p.type === 'child' ? new Date(Date.now() - 2 * 365.25 * 86400000).toISOString().split('T')[0] : new Date(Date.now() - 12 * 365.25 * 86400000).toISOString().split('T')[0]}
                onChange={e => setPassengers(prev => prev.map((x, j) => j === i ? { ...x, born_on: e.target.value } : x))}
                className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                  text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Passport (optional)</label>
              <input value={p.passport_number ?? ''}
                onChange={e => setPassengers(prev => prev.map((x, j) => j === i ? { ...x, passport_number: e.target.value } : x))}
                placeholder="e.g. 123456789"
                className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                  text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]" />
            </div>
            {i === 0 && (
              <>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Email</label>
                  <input type="email" value={p.email}
                    onChange={e => setPassengers(prev => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                    placeholder="Lead passenger"
                    className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                      text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Phone</label>
                  <input type="tel" value={p.phone_number}
                    onChange={e => setPassengers(prev => prev.map((x, j) => j === i ? { ...x, phone_number: e.target.value } : x))}
                    placeholder="+447911123456"
                    className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                      text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]" />
                </div>
              </>
            )}
          </div>
        </div>
      ))}
      <button type="button"
        disabled={passengers.some(p => !p.given_name || !p.family_name || !p.born_on)}
        onClick={() => setStep(3)}
        className="w-full py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl
          hover:bg-[#e0b85c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm">
        Continue to Client →
      </button>
    </div>
  )

  // ── STEP 3 — CLIENT ───────────────────────────────────────────────────────
  const clientContent = (
    <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
      <h2 className="text-white font-bold mb-1 flex items-center gap-2">
        <Users className="w-5 h-5 text-[#C9A84C]" /> Client
      </h2>
      <p className="text-gray-500 text-xs mb-4">Search for an existing client or create a new one</p>
      <CustomerSelector value={customer} onChange={setCustomer} />
      {customer && (
        <button type="button" onClick={() => setStep(4)}
          className="w-full mt-4 py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl
            hover:bg-[#e0b85c] transition-colors text-sm">
          Continue to Pricing →
        </button>
      )}
    </div>
  )

  // ── STEP 4 — PRICING ──────────────────────────────────────────────────────
  const pricingContent = pricing ? (
    <div className="space-y-4">
      <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
        <h2 className="text-white font-bold mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-[#C9A84C]" /> Pricing
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Supplier Net ({selected?.currency})</label>
            <input type="number" value={pricing.supplierCost} readOnly
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-4 py-2.5
                text-sm text-gray-400 cursor-not-allowed" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Markup %</label>
            <input type="number" value={markupPct} min={0} max={100} step={0.5}
              onChange={e => setMarkupPct(Number(e.target.value))}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-4 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Service Fee ({selected?.currency})</label>
            <input type="number" value={serviceFee} min={0} step={1}
              onChange={e => setServiceFee(Number(e.target.value))}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-4 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Discount ({selected?.currency})</label>
            <input type="number" value={discount} min={0} step={1}
              onChange={e => setDiscount(Number(e.target.value))}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-4 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>

          <div className="bg-[#0d2035] rounded-xl p-4 space-y-1.5 mt-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Markup ({pricing.markupPercent}%)</span>
              <span className="text-gray-400">{fmt(pricing.currency, pricing.markupAmount)}</span>
            </div>
            {pricing.serviceFee > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Service Fee</span>
                <span className="text-gray-400">{fmt(pricing.currency, pricing.serviceFee)}</span>
              </div>
            )}
            {pricing.discount > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Discount</span>
                <span className="text-gray-400">−{fmt(pricing.currency, pricing.discount)}</span>
              </div>
            )}
            <div className="border-t border-[#2a3f5f] pt-2 flex justify-between">
              <span className="text-sm font-semibold text-white">Customer Total</span>
              <span className="text-[#C9A84C] font-bold text-base">{fmt(pricing.currency, pricing.sellingPrice)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Gross Profit ({pricing.marginPercent}%)</span>
              <span className="text-green-400 font-medium">{fmt(pricing.currency, pricing.grossProfit)}</span>
            </div>
            <div className="flex justify-between text-xs pt-1 border-t border-[#1a2f4a]">
              <span className="text-gray-600">Per passenger ({totalPax})</span>
              <span className="text-gray-500">{fmt(pricing.currency, Math.round(pricing.sellingPrice / totalPax * 100) / 100)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
        <h3 className="text-white font-bold mb-3">Payment Method</h3>
        <div className="space-y-2">
          {PAYMENT_METHODS.map(m => (
            <label key={m.id}
              className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                paymentMethod === m.id ? 'border-[#C9A84C]/60 bg-[#C9A84C]/5' : 'border-[#2a3f5f] hover:border-[#3a4f6f]'
              }`}>
              <input type="radio" name="payment" value={m.id} checked={paymentMethod === m.id}
                onChange={() => setPaymentMethod(m.id)} className="mt-0.5 accent-[#C9A84C]" />
              <div>
                <p className="text-sm font-medium text-white">{m.label}</p>
                <p className="text-xs text-gray-500">{m.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <button type="button" onClick={() => setStep(5)}
          className="w-full mt-4 py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl
            hover:bg-[#e0b85c] transition-colors text-sm">
          Review & Confirm →
        </button>
      </div>
    </div>
  ) : null

  // ── STEP 5 — CONFIRM ──────────────────────────────────────────────────────
  const pax0 = passengers[0]
  const confirmContent = (
    <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
      <h2 className="text-white font-bold mb-4">Final Review</h2>
      <div className="space-y-0 mb-6">
        {[
          { l: 'Route',      v: tripType === 'multi-city'
              ? legs.map(l => `${l.from}→${l.to}`).join(' / ')
              : `${from} → ${to}${tripType === 'round-trip' ? ` → ${from}` : ''}` },
          { l: 'Date',       v: tripType === 'multi-city' ? legs.map(l => l.date).join(', ') : depart + (returnDate ? ` / ${returnDate}` : '') },
          { l: 'Cabin',      v: CABIN_LABELS[cabin] },
          { l: 'Passengers', v: `${totalPax} (${adults} adult${adults !== 1 ? 's' : ''}${children_ > 0 ? `, ${children_} child${children_ !== 1 ? 'ren' : ''}` : ''}${infants > 0 ? `, ${infants} infant${infants !== 1 ? 's' : ''}` : ''})` },
          { l: 'Lead pax',   v: pax0 ? `${pax0.given_name} ${pax0.family_name}` : '—' },
          { l: 'Client',     v: customer?.name ?? '—' },
          { l: 'Email',      v: customer?.email ?? '—' },
          { l: 'Supplier Net', v: pricing ? fmt(pricing.currency, pricing.supplierCost) : '—' },
          { l: 'Customer Total', v: pricing ? fmt(pricing.currency, pricing.sellingPrice) : '—' },
          { l: 'Payment',    v: PAYMENT_METHODS.find(m => m.id === paymentMethod)?.label ?? paymentMethod },
        ].map(row => (
          <div key={row.l} className="flex justify-between py-2 border-b border-[#1a2f4a] last:border-0">
            <span className="text-xs text-gray-500">{row.l}</span>
            <span className="text-xs text-white font-medium max-w-[60%] text-right">{row.v}</span>
          </div>
        ))}
      </div>

      <div className="bg-amber-900/10 border border-amber-700/30 rounded-xl p-3 mb-4">
        <p className="text-xs text-amber-400">
          This will create a live Duffel order and deduct from the Duffel balance. The action cannot be undone.
        </p>
      </div>

      <button type="button" onClick={doBook} disabled={booking_}
        className="w-full py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl
          hover:bg-[#e0b85c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors
          flex items-center justify-center gap-2 text-sm">
        {booking_ && <Loader2 className="w-4 h-4 animate-spin" />}
        {booking_ ? 'Booking via Duffel…' : 'Confirm & Book Flight'}
      </button>
    </div>
  )

  const stepContent: Record<Step, React.ReactNode> = {
    0: searchContent,
    1: resultsContent,
    2: passengersContent,
    3: clientContent,
    4: pricingContent,
    5: confirmContent,
  }

  return (
    <AdminBookingShell
      productType="FLIGHT"
      steps={STEPS}
      currentStep={step}
      summary={summaryNode}
      searchBar={step > 0 ? searchBarNode : undefined}
      banner={banner}
      onBack={step > 0 ? () => setStep((Math.max(0, step - 1)) as Step) : undefined}
      onStepClick={i => { if (i < step) setStep(i as Step) }}
    >
      {stepContent[step]}
    </AdminBookingShell>
  )
}

export default function AdminFlightBookingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#061320] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
      </div>
    }>
      <AdminFlightBookingContent />
    </Suspense>
  )
}
