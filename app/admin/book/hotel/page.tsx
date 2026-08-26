'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Star, MapPin, Check, AlertTriangle, Loader2,
  ChevronRight, ChevronDown, ChevronUp, RefreshCw, Building2,
  Calendar, Users, CreditCard, CheckCircle, Copy
} from 'lucide-react'
import AdminBookingShell       from '@/components/admin/booking/AdminBookingShell'
import CustomerSelector        from '@/components/admin/booking/CustomerSelector'
import type { AdminCustomer }  from '@/components/admin/booking/CustomerSelector'
import BookingSummary          from '@/components/admin/booking/BookingSummary'
import { calculateBookingPrice } from '@/lib/pricing/booking-price'
import type { BookingPriceResult } from '@/lib/pricing/booking-price'

// ── Types ────────────────────────────────────────────────────────────────────

interface Destination { code: string; name: string; countryCode: string }

interface CancellationPolicy { amount: string; from: string }
interface HotelRate {
  rateKey:              string
  net:                  string
  allotment:            number
  boardCode:            string
  boardName:            string
  paymentType:          string
  cancellationPolicies: CancellationPolicy[]
  adults:               number
  children:             number
}
interface HotelRoom { code: string; name: string; rates: HotelRate[] }
interface HotelResult {
  code:            number
  name:            string
  categoryName:    string
  categoryCode:    string
  destinationName: string
  zoneName:        string
  minRate:         string
  maxRate:         string
  currency:        string
  rooms:           HotelRoom[]
  reviews:         Array<{ rate: number; reviewCount: number; type: string }>
}

type Step = 0 | 1 | 2 | 3 | 4 | 5   // search/results/room/client/pricing/confirm
type PaymentMethod = 'STRIPE_LINK' | 'BANK_TRANSFER' | 'MARK_PAID' | 'PAY_LATER'

// ── Constants ────────────────────────────────────────────────────────────────

const STEPS = ['Search', 'Results', 'Room', 'Client', 'Pricing', 'Confirm']

const BOARD_LABEL: Record<string, string> = {
  RO: 'Room Only', BB: 'Breakfast', HB: 'Half Board',
  FB: 'Full Board', AI: 'All Inclusive', TI: 'All Inclusive',
}

const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AED', 'NGN', 'ZAR']
const SOURCE_MARKETS = [
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States'  },
  { code: 'NG', label: 'Nigeria'         },
  { code: 'CA', label: 'Canada'          },
  { code: 'AE', label: 'UAE'             },
  { code: 'ZA', label: 'South Africa'    },
]

const PAYMENT_METHODS: { id: PaymentMethod; label: string; desc: string }[] = [
  { id: 'STRIPE_LINK',    label: 'Stripe Payment Link', desc: 'Send a secure payment link to client'   },
  { id: 'BANK_TRANSFER',  label: 'Bank Transfer',        desc: 'Record expected bank transfer'          },
  { id: 'MARK_PAID',      label: 'Mark as Paid',         desc: 'Cash / already received'                },
  { id: 'PAY_LATER',      label: 'Pay Later / Invoice',  desc: 'Confirm booking, payment to follow'     },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function starsFromCategory(cat: string): number {
  const m = cat.match(/\d/)
  return m ? parseInt(m[0]) : 3
}

function freeCancellationUntil(policies: CancellationPolicy[]): string | null {
  if (!policies?.length) return null
  const free = policies.find(p => parseFloat(p.amount) === 0)
  if (!free) return null
  return new Date(free.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function nightCount(ci: string, co: string): number {
  return Math.max(1, Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000))
}

function fmt(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function Stars({ n }: { n: number }) {
  return (
    <span className="flex gap-px">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`w-3 h-3 ${i < n ? 'fill-[#C9A84C] text-[#C9A84C]' : 'text-[#2a3f5f]'}`} />
      ))}
    </span>
  )
}

// ── Destination autocomplete ──────────────────────────────────────────────────

function DestinationInput({ value, onChange }: {
  value: Destination | null
  onChange: (d: Destination | null) => void
}) {
  const [q,       setQ]       = useState(value?.name ?? '')
  const [results, setResults] = useState<Destination[]>([])
  const [open,    setOpen]    = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (q.length < 1) { setResults([]); return }
    fetch(`/api/hotelbeds/destinations?query=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(d => setResults(d.results ?? []))
      .catch(() => setResults([]))
  }, [q])

  return (
    <div ref={ref} className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
      <input
        type="text"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); onChange(null) }}
        onFocus={() => setOpen(true)}
        placeholder="City or destination…"
        className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl pl-9 pr-4 py-2.5
          text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
        required
      />
      {open && results.length > 0 && (
        <ul className="absolute z-50 top-full mt-1 left-0 right-0 bg-[#0a1929] border
          border-[#2a3f5f] rounded-xl shadow-2xl overflow-hidden">
          {results.map(d => (
            <li key={d.code}>
              <button type="button" onClick={() => { onChange(d); setQ(d.name); setOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#0d2035]
                  text-left transition-colors text-sm text-white">
                <span className="text-[10px] font-mono text-gray-500 w-8">{d.code}</span>
                {d.name}
                <span className="ml-auto text-xs text-gray-500">{d.countryCode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminHotelBookingPage() {
  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  // Search params
  const [destination,   setDestination]   = useState<Destination | null>(null)
  const [checkIn,       setCheckIn]       = useState(tomorrow)
  const [checkOut,      setCheckOut]      = useState('')
  const [rooms,         setRooms]         = useState(1)
  const [adults,        setAdults]        = useState(2)
  const [children,      setChildren]      = useState(0)
  const [childAges,     setChildAges]     = useState<number[]>([])
  const [currency,      setCurrency]      = useState('GBP')
  const [sourceMarket,  setSourceMarket]  = useState('GB')
  const [minCategory,   setMinCategory]   = useState(3)

  // Results
  const [hotels,        setHotels]        = useState<HotelResult[]>([])
  const [searchTotal,   setSearchTotal]   = useState(0)
  const [searching,     setSearching]     = useState(false)
  const [searchError,   setSearchError]   = useState<string | null>(null)
  const [filterStars,   setFilterStars]   = useState<number[]>([])
  const [filterBoard,   setFilterBoard]   = useState<string[]>([])
  const [filterFreeCx,  setFilterFreeCx]  = useState(false)

  // Selection
  const [selectedHotel, setSelectedHotel] = useState<HotelResult | null>(null)
  const [selectedRoom,  setSelectedRoom]  = useState<HotelRoom | null>(null)
  const [selectedRate,  setSelectedRate]  = useState<HotelRate | null>(null)
  const [expandedHotel, setExpandedHotel] = useState<number | null>(null)

  // Customer
  const [customer,      setCustomer]      = useState<AdminCustomer | null>(null)

  // Pricing
  const [pricing,       setPricing]       = useState<BookingPriceResult | null>(null)
  const [markupPct,     setMarkupPct]     = useState<number>(18)
  const [serviceFee,    setServiceFee]    = useState(0)
  const [discount,      setDiscount]      = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK_TRANSFER')

  // Confirmation
  const [checkrating,   setCheckrating]   = useState(false)
  const [checkrateError, setCheckrateError] = useState<string | null>(null)
  const [rateChanged,   setRateChanged]   = useState<{ old: number; new: number } | null>(null)
  const [booking_,      setBooking_]      = useState(false)
  const [bookingError,  setBookingError]  = useState<string | null>(null)
  const [bookingResult, setBookingResult] = useState<{ walzRef: string; hotelbedsRef: string } | null>(null)

  const [step, setStep] = useState<Step>(0)

  // Recompute pricing whenever rate or overrides change
  useEffect(() => {
    if (!selectedRate) { setPricing(null); return }
    const net = parseFloat(selectedRate.net)
    setPricing(calculateBookingPrice({
      productType:   'HOTEL',
      supplier:      'HOTELBEDS',
      netAmount:     net,
      currency,
      markupPercent: markupPct,
      serviceFee,
      discount,
    }))
  }, [selectedRate, currency, markupPct, serviceFee, discount])

  // Sync markupPct default when a rate is selected
  useEffect(() => {
    if (selectedRate && step === 4) {
      const p = calculateBookingPrice({
        productType: 'HOTEL', supplier: 'HOTELBEDS',
        netAmount: parseFloat(selectedRate.net), currency,
      })
      setMarkupPct(p.markupPercent)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ── Child ages management ────────────────────────────────────────────────
  const updateChildCount = useCallback((n: number) => {
    setChildren(n)
    setChildAges(ages => {
      if (n > ages.length) return [...ages, ...Array(n - ages.length).fill(5)]
      return ages.slice(0, n)
    })
  }, [])

  // ── Search ───────────────────────────────────────────────────────────────
  async function doSearch() {
    if (!destination || !checkIn || !checkOut) return
    setSearching(true)
    setSearchError(null)
    setHotels([])
    setStep(1)
    try {
      const res = await fetch('/api/hotelbeds/hotels', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          destination: destination.code,
          checkIn, checkOut,
          adults, children, childAges,
          rooms, currency, sourceMarket, minCategory,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setHotels(data.hotels ?? [])
      setSearchTotal(data.total ?? 0)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setSearchError(msg)
      setStep(0)
    } finally {
      setSearching(false)
    }
  }

  // ── Checkrate + Book ─────────────────────────────────────────────────────
  async function doCheckrateAndBook() {
    if (!selectedRate || !pricing) return
    setCheckrating(true)
    setCheckrateError(null)
    setRateChanged(null)

    try {
      const crRes = await fetch('/api/hotelbeds/checkrate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rateKeys: [selectedRate.rateKey] }),
      })
      const crData = await crRes.json()
      if (!crRes.ok) throw new Error(crData.error ?? 'Check-rate failed')

      const latestNet = parseFloat(crData.rooms?.[0]?.rates?.[0]?.net ?? selectedRate.net)
      const originalNet = parseFloat(selectedRate.net)

      if (Math.abs(latestNet - originalNet) > 0.01) {
        setRateChanged({ old: originalNet, new: latestNet })
        setCheckrating(false)
        return
      }

      await book(selectedRate.rateKey)
    } catch (e: unknown) {
      setCheckrateError(e instanceof Error ? e.message : String(e))
      setCheckrating(false)
    }
  }

  function acceptPriceChange() {
    if (!rateChanged || !selectedRate) return
    const updated = { ...selectedRate, net: String(rateChanged.new) }
    setSelectedRate(updated)
    setRateChanged(null)
    book(selectedRate.rateKey)
  }

  async function book(rateKey: string) {
    if (!selectedHotel || !selectedRoom || !selectedRate || !customer || !pricing) return
    setBooking_(true)
    setBookingError(null)
    try {
      const nights = checkIn && checkOut ? nightCount(checkIn, checkOut) : 1
      const res = await fetch('/api/admin/book/hotel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          rateKey,
          holderName:    customer.name,
          holderEmail:   customer.email,
          holderPhone:   customer.phone ?? '',
          checkIn,  checkOut,
          hotelCode:   selectedHotel.code,
          hotelName:   selectedHotel.name,
          roomName:    selectedRoom.name,
          boardName:   BOARD_LABEL[selectedRate.boardCode] ?? selectedRate.boardName,
          boardCode:   selectedRate.boardCode,
          nights,
          rooms, adults, children,
          totalNet:     pricing.supplierCost,
          sellingPrice: pricing.sellingPrice,
          markupPercent: pricing.markupPercent,
          markupAmount:  pricing.markupAmount,
          serviceFee:    pricing.serviceFee,
          discount:      pricing.discount,
          currency,
          clientId:     customer.id,
          paymentMethod,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Booking failed')
      setBookingResult({ walzRef: data.walzRef, hotelbedsRef: data.hotelbedsRef })
    } catch (e: unknown) {
      setBookingError(e instanceof Error ? e.message : String(e))
    } finally {
      setBooking_(false)
      setCheckrating(false)
    }
  }

  // ── Filtered hotels ───────────────────────────────────────────────────────
  const filteredHotels = hotels.filter(h => {
    if (filterStars.length && !filterStars.includes(starsFromCategory(h.categoryCode ?? h.categoryName))) return false
    if (filterFreeCx) {
      const hasFreeCx = h.rooms?.some(r =>
        r.rates?.some(rt => freeCancellationUntil(rt.cancellationPolicies) !== null)
      )
      if (!hasFreeCx) return false
    }
    if (filterBoard.length) {
      const codes = h.rooms?.flatMap(r => r.rates?.map(rt => rt.boardCode) ?? []) ?? []
      if (!filterBoard.some(b => codes.includes(b))) return false
    }
    return true
  })

  // ── Summary data ──────────────────────────────────────────────────────────
  const nights = checkIn && checkOut ? nightCount(checkIn, checkOut) : null
  const summaryDates = checkIn && checkOut
    ? `${new Date(checkIn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(checkOut).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${nights ? ` (${nights}n)` : ''}`
    : undefined

  // ── Done state ────────────────────────────────────────────────────────────
  if (bookingResult) {
    return (
      <div className="min-h-screen bg-[#061320] flex items-center justify-center p-6">
        <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Hotel Booked</h2>
          <p className="text-gray-400 text-sm mb-6">Hotelbeds has confirmed the reservation</p>

          <div className="space-y-3 text-left mb-6">
            <div className="bg-[#0d2035] rounded-xl p-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Walz Reference</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[#C9A84C] font-mono font-bold text-lg">{bookingResult.walzRef}</p>
                <button onClick={() => navigator.clipboard?.writeText(bookingResult.walzRef)}
                  className="text-gray-500 hover:text-white transition-colors">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="bg-[#0d2035] rounded-xl p-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Hotelbeds Reference</p>
              <p className="text-white font-mono text-sm">{bookingResult.hotelbedsRef}</p>
            </div>
            {pricing && (
              <div className="bg-[#0d2035] rounded-xl p-4 flex justify-between">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Customer Total</p>
                  <p className="text-white font-bold">{fmt(currency, pricing.sellingPrice)}</p>
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
            <a href={`/admin/bookings`}
              className="w-full py-2.5 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl text-sm
                hover:bg-[#e0b85c] transition-colors block">
              View All Bookings
            </a>
            <button onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-transparent border border-[#2a3f5f] text-gray-400
                font-medium rounded-xl text-sm hover:border-[#C9A84C] hover:text-white transition-colors">
              New Hotel Booking
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Search bar (step 0 + results header) ─────────────────────────────────
  const searchBar = step === 0 ? null : (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-sm text-gray-400">
        {destination?.name} · {checkIn} – {checkOut} · {rooms} rm · {adults} ad{children > 0 ? ` · ${children} ch` : ''}
      </span>
      <button onClick={() => setStep(0)}
        className="flex items-center gap-1.5 text-xs text-[#C9A84C] hover:text-[#e0b85c]
          border border-[#C9A84C]/30 rounded-lg px-3 py-1 transition-colors">
        <RefreshCw className="w-3 h-3" /> New search
      </button>
    </div>
  )

  // ── Booking summary for sidebar ───────────────────────────────────────────
  const summaryNode = (
    <BookingSummary
      customer={customer}
      productName={selectedHotel?.name ?? undefined}
      productDetail={selectedRoom?.name ?? undefined}
      supplier="Hotelbeds"
      dates={summaryDates ?? undefined}
      travellers={adults || children
        ? `${adults} adult${adults !== 1 ? 's' : ''}${children > 0 ? `, ${children} child${children !== 1 ? 'ren' : ''}` : ''}`
        : undefined}
      pricing={pricing ?? undefined}
      paymentStatus={paymentMethod === 'MARK_PAID' ? 'PAID' : step >= 5 ? 'PENDING' : null}
      onContinue={
        step === 0 ? undefined :
        step === 1 ? (selectedHotel ? () => setStep(2) : undefined) :
        step === 2 ? (selectedRate  ? () => setStep(3) : undefined) :
        step === 3 ? (customer      ? () => setStep(4) : undefined) :
        step === 4 ? (() => setStep(5)) :
        step === 5 ? doCheckrateAndBook :
        undefined
      }
      continueLabel={
        step === 5 ? (checkrating ? 'Checking rate…' : booking_ ? 'Booking…' : 'Check & Confirm') :
        'Continue'
      }
      continueDisabled={
        step === 1 ? !selectedHotel :
        step === 2 ? !selectedRate :
        step === 3 ? !customer :
        step === 4 ? !pricing :
        step === 5 ? (checkrating || booking_) :
        false
      }
      isLoading={checkrating || booking_}
    />
  )

  // ── Banner ────────────────────────────────────────────────────────────────
  const hasBanner = !!(searchError || checkrateError || bookingError || rateChanged)
  const banner = hasBanner ? (
    <>
      {searchError && (
        <div className="flex items-center gap-3 bg-red-900/20 border border-red-900/40 rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {searchError}
        </div>
      )}
      {checkrateError && (
        <div className="flex items-center gap-3 bg-red-900/20 border border-red-900/40 rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Check-rate failed: {checkrateError}
          <button onClick={() => setCheckrateError(null)} className="ml-auto text-red-400 hover:text-white">✕</button>
        </div>
      )}
      {bookingError && (
        <div className="flex items-center gap-3 bg-red-900/20 border border-red-900/40 rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Booking failed: {bookingError}
          <button onClick={() => setBookingError(null)} className="ml-auto text-red-400 hover:text-white">✕</button>
        </div>
      )}
      {rateChanged && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-4">
          <div className="flex items-center gap-2 text-amber-400 font-semibold mb-2">
            <AlertTriangle className="w-4 h-4" /> Rate changed
          </div>
          <p className="text-sm text-gray-300 mb-3">
            The supplier rate changed since your search.
            Previous: <span className="line-through text-gray-500">{fmt(currency, rateChanged.old)}</span>{' '}
            → New: <span className="text-amber-300 font-bold">{fmt(currency, rateChanged.new)}</span>
          </p>
          <div className="flex gap-2">
            <button onClick={acceptPriceChange}
              className="px-4 py-2 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-500">
              Accept new price & book
            </button>
            <button onClick={() => setRateChanged(null)}
              className="px-4 py-2 border border-[#2a3f5f] text-gray-400 text-sm rounded-lg hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  ) : null

  // ── Step content ──────────────────────────────────────────────────────────

  // STEP 0 — SEARCH
  const searchContent = (
    <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
      <h2 className="text-white font-bold mb-5 flex items-center gap-2">
        <Building2 className="w-5 h-5 text-[#C9A84C]" /> Hotel Search
      </h2>
      <form onSubmit={e => { e.preventDefault(); doSearch() }} className="space-y-4">
        {/* Destination */}
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Destination *</label>
          <DestinationInput value={destination} onChange={setDestination} />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Check-in *</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input type="date" value={checkIn} min={today}
                onChange={e => setCheckIn(e.target.value)} required
                className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl pl-9 pr-3 py-2.5
                  text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Check-out *</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input type="date" value={checkOut} min={checkIn || today}
                onChange={e => setCheckOut(e.target.value)} required
                className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl pl-9 pr-3 py-2.5
                  text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
            </div>
          </div>
        </div>

        {/* Occupancy */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Rooms</label>
            <input type="number" value={rooms} min={1} max={5}
              onChange={e => setRooms(Number(e.target.value))}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Adults</label>
            <input type="number" value={adults} min={1} max={8}
              onChange={e => setAdults(Number(e.target.value))}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Children</label>
            <input type="number" value={children} min={0} max={4}
              onChange={e => updateChildCount(Number(e.target.value))}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>
        </div>

        {children > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {childAges.map((age, i) => (
              <div key={i}>
                <label className="text-xs text-gray-500 block mb-1">Child {i + 1} age</label>
                <input type="number" value={age} min={0} max={17}
                  onChange={e => setChildAges(a => a.map((v, j) => j === i ? Number(e.target.value) : v))}
                  className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2
                    text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
              </div>
            ))}
          </div>
        )}

        {/* Currency + source market */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Currency</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]">
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Source market</label>
            <select value={sourceMarket} onChange={e => setSourceMarket(e.target.value)}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]">
              {SOURCE_MARKETS.map(m => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
          </div>
        </div>

        {/* Min stars */}
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Minimum star rating</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(s => (
              <button key={s} type="button"
                onClick={() => setMinCategory(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  minCategory === s
                    ? 'bg-[#C9A84C] text-[#0B1F3A]'
                    : 'bg-[#0d2035] border border-[#2a3f5f] text-gray-400 hover:border-[#C9A84C] hover:text-white'
                }`}>
                {s}★
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={!destination || !checkIn || !checkOut || searching}
          className="w-full flex items-center justify-center gap-2 py-3 bg-[#C9A84C] text-[#0B1F3A]
            font-bold rounded-xl hover:bg-[#e0b85c] disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors text-sm">
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {searching ? 'Searching Hotelbeds…' : 'Search Hotels'}
        </button>
      </form>
    </div>
  )

  // STEP 1 — RESULTS
  const resultsContent = (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-4 flex flex-wrap gap-4 items-center">
        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Filters</span>

        {/* Stars */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Stars:</span>
          {[3, 4, 5].map(s => (
            <button key={s} type="button"
              onClick={() => setFilterStars(f =>
                f.includes(s) ? f.filter(x => x !== s) : [...f, s]
              )}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                filterStars.includes(s)
                  ? 'bg-[#C9A84C] text-[#0B1F3A] font-bold'
                  : 'border border-[#2a3f5f] text-gray-400 hover:text-white'
              }`}>{s}★</button>
          ))}
        </div>

        {/* Board */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Board:</span>
          {['RO', 'BB', 'HB', 'AI'].map(b => (
            <button key={b} type="button"
              onClick={() => setFilterBoard(f =>
                f.includes(b) ? f.filter(x => x !== b) : [...f, b]
              )}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                filterBoard.includes(b)
                  ? 'bg-[#C9A84C] text-[#0B1F3A] font-bold'
                  : 'border border-[#2a3f5f] text-gray-400 hover:text-white'
              }`}>{BOARD_LABEL[b] ?? b}</button>
          ))}
        </div>

        {/* Free cancellation */}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={filterFreeCx}
            onChange={e => setFilterFreeCx(e.target.checked)}
            className="accent-[#C9A84C]" />
          <span className="text-xs text-gray-400">Free cancellation</span>
        </label>

        <span className="ml-auto text-xs text-gray-500">
          {filteredHotels.length}/{searchTotal} hotels
        </span>
      </div>

      {searching && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-5 animate-pulse">
              <div className="h-4 bg-[#1a2f4a] rounded w-1/3 mb-2" />
              <div className="h-3 bg-[#1a2f4a] rounded w-1/4 mb-4" />
              <div className="h-3 bg-[#1a2f4a] rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!searching && filteredHotels.length === 0 && (
        <div className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-8 text-center">
          <p className="text-gray-400">No hotels found matching your filters.</p>
        </div>
      )}

      {filteredHotels.map(hotel => {
        const stars = starsFromCategory(hotel.categoryCode ?? hotel.categoryName ?? '')
        const net   = parseFloat(hotel.minRate)
        const wp    = calculateBookingPrice({ productType: 'HOTEL', supplier: 'HOTELBEDS', netAmount: net, currency })
        const isExpanded = expandedHotel === hotel.code
        const isSelected = selectedHotel?.code === hotel.code

        return (
          <div key={hotel.code}
            className={`bg-[#0a1929] rounded-xl border transition-colors ${
              isSelected ? 'border-[#C9A84C]/60' : 'border-[#1a2f4a]'
            }`}>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h3 className="font-bold text-white text-base leading-tight">{hotel.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Stars n={stars} />
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />{hotel.zoneName ?? hotel.destinationName}
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500">From (supplier)</p>
                  <p className="text-sm text-gray-400">{fmt(currency, net)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Walz price</p>
                  <p className="text-[#C9A84C] font-bold">{fmt(currency, wp.sellingPrice)}</p>
                </div>
              </div>

              {/* Board options */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {Array.from(
                  new Set(hotel.rooms?.flatMap(r => r.rates?.map(rt => rt.boardCode) ?? []) ?? [])
                ).map(bc => (
                  <span key={bc} className="text-[10px] bg-[#0d2035] border border-[#2a3f5f]
                    text-gray-400 rounded px-2 py-0.5">
                    {BOARD_LABEL[bc] ?? bc}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button type="button"
                  onClick={() => {
                    setSelectedHotel(hotel)
                    setExpandedHotel(isExpanded ? null : hotel.code)
                    setStep(1)
                  }}
                  className="flex items-center gap-1.5 text-sm font-semibold text-[#C9A84C]
                    hover:text-[#e0b85c] transition-colors">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {isExpanded ? 'Hide rooms' : 'View rooms'}
                </button>
                {isSelected && selectedRate && (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <Check className="w-3 h-3" /> Room selected
                  </span>
                )}
              </div>
            </div>

            {/* Expanded room list */}
            {isExpanded && (
              <div className="border-t border-[#1a2f4a] divide-y divide-[#1a2f4a]">
                {hotel.rooms?.flatMap(room =>
                  room.rates?.map(rate => {
                    const rateNet = parseFloat(rate.net)
                    const rateWp  = calculateBookingPrice({ productType: 'HOTEL', supplier: 'HOTELBEDS', netAmount: rateNet, currency })
                    const freeCx  = freeCancellationUntil(rate.cancellationPolicies)
                    const isRateSelected = selectedRate?.rateKey === rate.rateKey

                    return (
                      <div key={rate.rateKey}
                        className={`p-4 transition-colors ${isRateSelected ? 'bg-[#0d2035]' : 'hover:bg-[#0b1e30]'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white leading-tight">{room.name}</p>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-xs text-gray-400 bg-[#0d2035] px-2 py-0.5 rounded border border-[#2a3f5f]">
                                {BOARD_LABEL[rate.boardCode] ?? rate.boardCode}
                              </span>
                              {freeCx && (
                                <span className="text-xs text-green-400 flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Free cancel until {freeCx}
                                </span>
                              )}
                              {!freeCx && (
                                <span className="text-xs text-amber-500">Non-refundable</span>
                              )}
                              <span className="text-xs text-gray-500">
                                {rate.allotment} room{rate.allotment !== 1 ? 's' : ''} left
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-gray-500">Net {fmt(currency, rateNet)}</p>
                            <p className="text-[#C9A84C] font-bold text-sm">{fmt(currency, rateWp.sellingPrice)}</p>
                            <button type="button"
                              onClick={() => {
                                setSelectedHotel(hotel)
                                setSelectedRoom(room)
                                setSelectedRate(rate)
                                setStep(2)
                              }}
                              className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                isRateSelected
                                  ? 'bg-green-600 text-white'
                                  : 'bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#e0b85c]'
                              }`}>
                              {isRateSelected ? <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Selected</span> : 'Select'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  }) ?? []
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // STEP 2 — ROOM CONFIRMATION
  const roomContent = selectedHotel && selectedRoom && selectedRate ? (
    <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
      <h2 className="text-white font-bold mb-4">Selected Room</h2>
      <div className="space-y-3">
        <div className="bg-[#0d2035] rounded-xl p-4">
          <p className="text-[#C9A84C] font-bold text-lg">{selectedHotel.name}</p>
          <p className="text-gray-400 text-sm mt-0.5">{selectedRoom.name}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#0d2035] rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-0.5">Board</p>
            <p className="text-white text-sm">{BOARD_LABEL[selectedRate.boardCode] ?? selectedRate.boardCode}</p>
          </div>
          <div className="bg-[#0d2035] rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-0.5">Cancellation</p>
            <p className="text-sm">
              {freeCancellationUntil(selectedRate.cancellationPolicies)
                ? <span className="text-green-400">Free until {freeCancellationUntil(selectedRate.cancellationPolicies)}</span>
                : <span className="text-amber-500">Non-refundable</span>}
            </p>
          </div>
          <div className="bg-[#0d2035] rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-0.5">Supplier Net</p>
            <p className="text-white text-sm">{fmt(currency, parseFloat(selectedRate.net))}</p>
          </div>
          <div className="bg-[#0d2035] rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-0.5">Available</p>
            <p className="text-white text-sm">{selectedRate.allotment} room{selectedRate.allotment !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button type="button" onClick={() => setStep(1)}
          className="text-sm text-[#C9A84C] hover:text-[#e0b85c] flex items-center gap-1.5">
          <ChevronRight className="w-4 h-4 rotate-180" /> Change room
        </button>
        <button type="button" onClick={() => setStep(3)}
          className="w-full py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl
            hover:bg-[#e0b85c] transition-colors text-sm">
          Continue to Client →
        </button>
      </div>
    </div>
  ) : null

  // STEP 3 — CLIENT
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

  // STEP 4 — PRICING
  const pricingContent = pricing ? (
    <div className="space-y-4">
      <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
        <h2 className="text-white font-bold mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-[#C9A84C]" /> Pricing
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Supplier Net ({currency})</label>
            <input type="number" value={pricing.supplierCost} readOnly
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-4 py-2.5
                text-sm text-gray-400 focus:outline-none cursor-not-allowed" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Markup %</label>
            <input type="number" value={markupPct} min={0} max={100} step={0.5}
              onChange={e => setMarkupPct(Number(e.target.value))}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-4 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Service Fee ({currency})</label>
            <input type="number" value={serviceFee} min={0} step={1}
              onChange={e => setServiceFee(Number(e.target.value))}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-4 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Discount ({currency})</label>
            <input type="number" value={discount} min={0} step={1}
              onChange={e => setDiscount(Number(e.target.value))}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-4 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>

          {/* Computed summary */}
          <div className="bg-[#0d2035] rounded-xl p-4 mt-2 space-y-1.5">
            {[
              { l: `Markup (${pricing.markupPercent}%)`, v: fmt(currency, pricing.markupAmount), muted: true },
              ...(pricing.serviceFee > 0 ? [{ l: 'Service Fee', v: fmt(currency, pricing.serviceFee), muted: true }] : []),
              ...(pricing.discount > 0 ? [{ l: 'Discount', v: `−${fmt(currency, pricing.discount)}`, muted: true }] : []),
            ].map(row => (
              <div key={row.l} className="flex justify-between text-xs">
                <span className="text-gray-500">{row.l}</span>
                <span className="text-gray-400">{row.v}</span>
              </div>
            ))}
            <div className="border-t border-[#2a3f5f] pt-2 flex justify-between">
              <span className="text-sm font-semibold text-white">Customer Total</span>
              <span className="text-[#C9A84C] font-bold text-base">{fmt(currency, pricing.sellingPrice)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Gross Profit ({pricing.marginPercent}%)</span>
              <span className="text-green-400 font-medium">{fmt(currency, pricing.grossProfit)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment method */}
      <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
        <h3 className="text-white font-bold mb-3">Payment Method</h3>
        <div className="space-y-2">
          {PAYMENT_METHODS.map(m => (
            <label key={m.id}
              className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                paymentMethod === m.id
                  ? 'border-[#C9A84C]/60 bg-[#C9A84C]/5'
                  : 'border-[#2a3f5f] hover:border-[#3a4f6f]'
              }`}>
              <input type="radio" name="payment" value={m.id} checked={paymentMethod === m.id}
                onChange={() => setPaymentMethod(m.id)}
                className="mt-0.5 accent-[#C9A84C]" />
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

  // STEP 5 — CONFIRM
  const confirmContent = (
    <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
      <h2 className="text-white font-bold mb-4">Final Review</h2>
      <div className="space-y-2 mb-6">
        {[
          { l: 'Hotel',     v: selectedHotel?.name     ?? '—' },
          { l: 'Room',      v: selectedRoom?.name      ?? '—' },
          { l: 'Board',     v: selectedRate ? (BOARD_LABEL[selectedRate.boardCode] ?? selectedRate.boardCode) : '—' },
          { l: 'Check-in',  v: checkIn  || '—' },
          { l: 'Check-out', v: checkOut || '—' },
          { l: 'Guest',     v: customer?.name ?? '—' },
          { l: 'Email',     v: customer?.email ?? '—' },
          { l: 'Supplier Cost', v: pricing ? fmt(currency, pricing.supplierCost) : '—' },
          { l: 'Customer Total', v: pricing ? fmt(currency, pricing.sellingPrice) : '—' },
          { l: 'Payment',   v: PAYMENT_METHODS.find(m => m.id === paymentMethod)?.label ?? paymentMethod },
        ].map(row => (
          <div key={row.l} className="flex justify-between py-1.5 border-b border-[#1a2f4a] last:border-0">
            <span className="text-xs text-gray-500">{row.l}</span>
            <span className="text-xs text-white font-medium max-w-[55%] text-right">{row.v}</span>
          </div>
        ))}
      </div>

      <div className="bg-amber-900/10 border border-amber-700/30 rounded-xl p-3 mb-4">
        <p className="text-xs text-amber-400">
          Clicking &quot;Check &amp; Confirm&quot; will revalidate the rate with Hotelbeds then create a live
          supplier booking. This action cannot be undone.
        </p>
      </div>

      <button type="button" onClick={doCheckrateAndBook}
        disabled={checkrating || booking_}
        className="w-full py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl
          hover:bg-[#e0b85c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors
          flex items-center justify-center gap-2 text-sm">
        {(checkrating || booking_) && <Loader2 className="w-4 h-4 animate-spin" />}
        {checkrating ? 'Checking rate…' : booking_ ? 'Booking…' : 'Check & Confirm Booking'}
      </button>
    </div>
  )

  const stepContent: Record<Step, React.ReactNode> = {
    0: searchContent,
    1: resultsContent,
    2: roomContent,
    3: clientContent,
    4: pricingContent,
    5: confirmContent,
  }

  return (
    <AdminBookingShell
      productType="HOTEL"
      steps={STEPS}
      currentStep={step}
      summary={summaryNode}
      searchBar={step > 0 ? searchBar : undefined}
      banner={banner}
      onBack={step > 0 ? () => setStep((Math.max(0, step - 1)) as Step) : undefined}
      onStepClick={(i) => { if (i < step) setStep(i as Step) }}
    >
      {stepContent[step]}
    </AdminBookingShell>
  )
}
