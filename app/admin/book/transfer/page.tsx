'use client'
import { useState, useEffect } from 'react'
import {
  Car, Search, AlertTriangle, Loader2, Check,
  CheckCircle, Copy, ArrowRight, Clock, Users,
  CreditCard, Plane
} from 'lucide-react'
import AdminBookingShell       from '@/components/admin/booking/AdminBookingShell'
import CustomerSelector        from '@/components/admin/booking/CustomerSelector'
import type { AdminCustomer }  from '@/components/admin/booking/CustomerSelector'
import BookingSummary          from '@/components/admin/booking/BookingSummary'
import { calculateBookingPrice } from '@/lib/pricing/booking-price'
import type { BookingPriceResult } from '@/lib/pricing/booking-price'

// ── Types ────────────────────────────────────────────────────────────────────

interface TransferResult {
  transferKey:  string
  transferType: string
  vehicleName:  string
  vehicleDesc:  string | null
  maxPax:       number | null
  price:        number
  currency:     string
  duration:     number | null
  imageUrl:     string | null
}

type Step = 0 | 1 | 2 | 3 | 4   // search/results/client/pricing/confirm
type PaymentMethod = 'STRIPE_LINK' | 'BANK_TRANSFER' | 'MARK_PAID' | 'PAY_LATER'
type LocationType  = 'IATA' | 'RESORT' | 'ATLAS' | 'PORT' | 'STATION'

// ── Constants ────────────────────────────────────────────────────────────────

const STEPS = ['Search', 'Results', 'Client', 'Pricing', 'Confirm']

const LOCATION_TYPES: { code: LocationType; label: string }[] = [
  { code: 'IATA',    label: 'Airport (IATA)' },
  { code: 'RESORT',  label: 'Resort code'    },
  { code: 'ATLAS',   label: 'Atlas / Hotel'  },
  { code: 'PORT',    label: 'Port'           },
  { code: 'STATION', label: 'Station'        },
]

const PAYMENT_METHODS: { id: PaymentMethod; label: string; desc: string }[] = [
  { id: 'STRIPE_LINK',   label: 'Stripe Payment Link', desc: 'Send a secure payment link to client'  },
  { id: 'BANK_TRANSFER', label: 'Bank Transfer',        desc: 'Record expected bank transfer'         },
  { id: 'MARK_PAID',     label: 'Mark as Paid',         desc: 'Cash / already received'               },
  { id: 'PAY_LATER',     label: 'Pay Later / Invoice',  desc: 'Confirm booking, payment to follow'    },
]

const TRANSFER_TYPE_LABEL: Record<string, string> = {
  PRIVATE: 'Private',
  SHARED:  'Shared Shuttle',
  FERRY:   'Ferry',
  TRAIN:   'Train',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function durationLabel(mins: number | null): string {
  if (!mins) return '—'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function AdminTransferBookingPage() {
  const today = new Date().toISOString().split('T')[0]

  // Search params
  const [fromCode,     setFromCode]     = useState('')
  const [fromType,     setFromType]     = useState<LocationType>('IATA')
  const [fromDisplay,  setFromDisplay]  = useState('')
  const [toCode,       setToCode]       = useState('')
  const [toType,       setToType]       = useState<LocationType>('IATA')
  const [toDisplay,    setToDisplay]    = useState('')
  const [fromDate,     setFromDate]     = useState(today)
  const [fromTime,     setFromTime]     = useState('12:00')
  const [adults,       setAdults]       = useState(2)
  const [children,     setChildren]     = useState(0)
  const [flightNumber, setFlightNumber] = useState('')
  const [flightDir,    setFlightDir]    = useState<'ARRIVAL' | 'DEPARTURE'>('ARRIVAL')
  const [currency,     setCurrency]     = useState('GBP')

  // Results
  const [transfers,    setTransfers]    = useState<TransferResult[]>([])
  const [searching,    setSearching]    = useState(false)
  const [searchError,  setSearchError]  = useState<string | null>(null)
  const [filterType,   setFilterType]   = useState<string[]>([])

  // Selection
  const [selected,     setSelected]     = useState<TransferResult | null>(null)

  // Customer
  const [customer,     setCustomer]     = useState<AdminCustomer | null>(null)

  // Pricing
  const [pricing,      setPricing]      = useState<BookingPriceResult | null>(null)
  const [markupPct,    setMarkupPct]    = useState(25)
  const [serviceFee,   setServiceFee]   = useState(0)
  const [discount,     setDiscount]     = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK_TRANSFER')

  // Booking
  const [booking_,     setBooking_]     = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [result,       setResult]       = useState<{ walzRef: string; hotelbedsRef: string } | null>(null)

  const [step, setStep] = useState<Step>(0)

  // Recompute pricing when vehicle or overrides change
  useEffect(() => {
    if (!selected) { setPricing(null); return }
    setPricing(calculateBookingPrice({
      productType:   'TRANSFER',
      supplier:      'HOTELBEDS',
      netAmount:     selected.price,
      currency:      selected.currency || currency,
      markupPercent: markupPct,
      serviceFee,
      discount,
    }))
  }, [selected, currency, markupPct, serviceFee, discount])

  // Default markup when entering pricing step
  useEffect(() => {
    if (selected && step === 3) {
      const p = calculateBookingPrice({
        productType: 'TRANSFER', supplier: 'HOTELBEDS',
        netAmount: selected.price, currency: selected.currency || currency,
      })
      setMarkupPct(p.markupPercent)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ── Search ───────────────────────────────────────────────────────────────
  async function doSearch() {
    if (!fromCode.trim() || !toCode.trim() || !fromDate) return
    setSearching(true)
    setSearchError(null)
    setTransfers([])
    setSelected(null)
    setStep(1)
    try {
      const params = new URLSearchParams({
        fromCode:  fromCode.trim().toUpperCase(),
        toCode:    toCode.trim().toUpperCase(),
        fromType,  toType,
        fromDate,  fromTime,
        adults:    String(adults),
        children:  String(children),
      })
      const res = await fetch(`/api/hotelbeds/transfers?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Search failed')
      setTransfers(data.transfers ?? [])
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
    setBooking_(true)
    setBookingError(null)
    try {
      const res = await fetch('/api/admin/book/transfer', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          transferKey:     selected.transferKey,
          fromCode:        fromCode.trim().toUpperCase(),
          fromType,
          toCode:          toCode.trim().toUpperCase(),
          toType,
          fromDisplay:     fromDisplay || fromCode.toUpperCase(),
          toDisplay:       toDisplay   || toCode.toUpperCase(),
          fromDate,        fromTime,
          adults,          children,
          holderName:      customer.name,
          holderEmail:     customer.email,
          holderPhone:     customer.phone ?? '',
          flightNumber:    flightNumber || null,
          flightDirection: flightDir,
          vehicleName:     selected.vehicleName,
          vehicleDesc:     selected.vehicleDesc,
          maxPax:          selected.maxPax,
          totalNet:        pricing.supplierCost,
          sellingPrice:    pricing.sellingPrice,
          markupPercent:   pricing.markupPercent,
          markupAmount:    pricing.markupAmount,
          serviceFee:      pricing.serviceFee,
          discount:        pricing.discount,
          currency:        selected.currency || currency,
          clientId:        customer.id,
          paymentMethod,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Booking failed')
      setResult({ walzRef: data.walzRef, hotelbedsRef: data.hotelbedsRef })
    } catch (e: unknown) {
      setBookingError(e instanceof Error ? e.message : String(e))
    } finally {
      setBooking_(false)
    }
  }

  // ── Filtered results ─────────────────────────────────────────────────────
  const filtered = transfers.filter(t =>
    filterType.length === 0 || filterType.includes(t.transferType)
  )

  // ── Summary data ─────────────────────────────────────────────────────────
  const summaryDates = fromDate
    ? `${new Date(fromDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} ${fromTime}`
    : undefined
  const summaryTravel = (fromDisplay || fromCode) && (toDisplay || toCode)
    ? `${fromDisplay || fromCode} → ${toDisplay || toCode}`
    : undefined

  // ── Done ──────────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="min-h-screen bg-[#061320] flex items-center justify-center p-6">
        <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Transfer Booked</h2>
          <p className="text-gray-400 text-sm mb-6">Hotelbeds has confirmed the transfer</p>

          <div className="space-y-3 text-left mb-6">
            <div className="bg-[#0d2035] rounded-xl p-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Walz Reference</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[#C9A84C] font-mono font-bold text-lg">{result.walzRef}</p>
                <button onClick={() => navigator.clipboard?.writeText(result.walzRef)}
                  className="text-gray-500 hover:text-white transition-colors">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="bg-[#0d2035] rounded-xl p-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Hotelbeds Reference</p>
              <p className="text-white font-mono text-sm">{result.hotelbedsRef}</p>
            </div>
            {pricing && (
              <div className="bg-[#0d2035] rounded-xl p-4 flex justify-between">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Customer Total</p>
                  <p className="text-white font-bold">{fmt(selected?.currency || currency, pricing.sellingPrice)}</p>
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
            <a href="/admin/bookings"
              className="w-full py-2.5 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl text-sm
                hover:bg-[#e0b85c] transition-colors block">
              View All Bookings
            </a>
            <button onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-transparent border border-[#2a3f5f] text-gray-400
                font-medium rounded-xl text-sm hover:border-[#C9A84C] hover:text-white transition-colors">
              New Transfer Booking
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Search summary bar ────────────────────────────────────────────────────
  const searchBar = step === 0 ? null : (
    <div className="flex items-center gap-3 flex-wrap text-sm text-gray-400">
      <span>
        {fromCode.toUpperCase()} → {toCode.toUpperCase()} · {fromDate} {fromTime} ·{' '}
        {adults} adult{adults !== 1 ? 's' : ''}{children > 0 ? `, ${children} child${children !== 1 ? 'ren' : ''}` : ''}
      </span>
      <button onClick={() => { setStep(0); setTransfers([]); setSelected(null) }}
        className="flex items-center gap-1.5 text-xs text-[#C9A84C] hover:text-[#e0b85c]
          border border-[#C9A84C]/30 rounded-lg px-3 py-1 transition-colors">
        New search
      </button>
    </div>
  )

  // ── Booking summary sidebar ───────────────────────────────────────────────
  const summaryNode = (
    <BookingSummary
      customer={customer}
      productName={selected?.vehicleName ?? undefined}
      productDetail={selected ? (TRANSFER_TYPE_LABEL[selected.transferType] ?? selected.transferType) : undefined}
      supplier="Hotelbeds Transfers"
      dates={summaryDates}
      travellers={summaryTravel ?? (adults ? `${adults} adult${adults !== 1 ? 's' : ''}${children > 0 ? `, ${children} child${children !== 1 ? 'ren' : ''}` : ''}` : undefined)}
      pricing={pricing ?? undefined}
      paymentStatus={paymentMethod === 'MARK_PAID' ? 'PAID' : step >= 4 ? 'PENDING' : null}
      onContinue={
        step === 1 ? (selected ? () => setStep(2) : undefined) :
        step === 2 ? (customer  ? () => setStep(3) : undefined) :
        step === 3 ? (() => setStep(4)) :
        step === 4 ? doBook :
        undefined
      }
      continueLabel={step === 4 ? (booking_ ? 'Booking…' : 'Confirm Booking') : 'Continue'}
      continueDisabled={
        step === 1 ? !selected :
        step === 2 ? !customer :
        step === 3 ? !pricing  :
        step === 4 ? booking_  :
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
        </div>
      )}
      {bookingError && (
        <div className="flex items-center gap-3 bg-red-900/20 border border-red-900/40
          rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Booking failed: {bookingError}
          <button onClick={() => setBookingError(null)} className="ml-auto hover:text-white">✕</button>
        </div>
      )}
    </div>
  ) : null

  // ── STEP 0 — SEARCH ───────────────────────────────────────────────────────
  const searchContent = (
    <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
      <h2 className="text-white font-bold mb-5 flex items-center gap-2">
        <Car className="w-5 h-5 text-[#C9A84C]" /> Transfer Search
      </h2>

      <form onSubmit={e => { e.preventDefault(); doSearch() }} className="space-y-4">
        {/* From */}
        <div className="bg-[#0d2035] rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pickup</p>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <select value={fromType} onChange={e => setFromType(e.target.value as LocationType)}
              className="bg-[#061320] border border-[#2a3f5f] rounded-xl px-3 py-2.5 text-xs
                text-white focus:outline-none focus:border-[#C9A84C]">
              {LOCATION_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
            <input value={fromCode} onChange={e => setFromCode(e.target.value.toUpperCase())}
              placeholder={fromType === 'IATA' ? 'Airport code e.g. LGW' : 'Location code'}
              required
              className="bg-[#061320] border border-[#2a3f5f] rounded-xl px-3 py-2.5 text-sm
                text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]
                font-mono uppercase" />
          </div>
          <input value={fromDisplay} onChange={e => setFromDisplay(e.target.value)}
            placeholder="Display name (optional) e.g. London Gatwick Airport"
            className="w-full bg-[#061320] border border-[#2a3f5f] rounded-xl px-3 py-2.5 text-sm
              text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]" />
        </div>

        {/* Arrow */}
        <div className="flex justify-center">
          <ArrowRight className="w-5 h-5 text-[#C9A84C]" />
        </div>

        {/* To */}
        <div className="bg-[#0d2035] rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Drop-off</p>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <select value={toType} onChange={e => setToType(e.target.value as LocationType)}
              className="bg-[#061320] border border-[#2a3f5f] rounded-xl px-3 py-2.5 text-xs
                text-white focus:outline-none focus:border-[#C9A84C]">
              {LOCATION_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
            <input value={toCode} onChange={e => setToCode(e.target.value.toUpperCase())}
              placeholder={toType === 'IATA' ? 'Airport code e.g. DXB' : 'Location code'}
              required
              className="bg-[#061320] border border-[#2a3f5f] rounded-xl px-3 py-2.5 text-sm
                text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]
                font-mono uppercase" />
          </div>
          <input value={toDisplay} onChange={e => setToDisplay(e.target.value)}
            placeholder="Display name (optional) e.g. Burj Al Arab, Dubai"
            className="w-full bg-[#061320] border border-[#2a3f5f] rounded-xl px-3 py-2.5 text-sm
              text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]" />
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Travel date *</label>
            <input type="date" value={fromDate} min={today}
              onChange={e => setFromDate(e.target.value)} required
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Pickup time</label>
            <input type="time" value={fromTime}
              onChange={e => setFromTime(e.target.value)}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>
        </div>

        {/* Passengers */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Adults</label>
            <input type="number" value={adults} min={1} max={16}
              onChange={e => setAdults(Number(e.target.value))}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Children</label>
            <input type="number" value={children} min={0} max={8}
              onChange={e => setChildren(Number(e.target.value))}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Currency</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-3 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]">
              {['GBP','USD','EUR','CAD','AED','NGN','ZAR'].map(c =>
                <option key={c} value={c}>{c}</option>
              )}
            </select>
          </div>
        </div>

        {/* Flight info */}
        <div className="bg-[#0d2035] rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <Plane className="w-3.5 h-3.5" /> Flight details (for airport transfers)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Flight number</label>
              <input value={flightNumber} onChange={e => setFlightNumber(e.target.value.toUpperCase())}
                placeholder="e.g. BA123"
                className="w-full bg-[#061320] border border-[#2a3f5f] rounded-xl px-3 py-2
                  text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]
                  font-mono uppercase" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Direction</label>
              <div className="flex gap-2">
                {(['ARRIVAL', 'DEPARTURE'] as const).map(d => (
                  <button key={d} type="button"
                    onClick={() => setFlightDir(d)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                      flightDir === d
                        ? 'bg-[#C9A84C] text-[#0B1F3A]'
                        : 'border border-[#2a3f5f] text-gray-400 hover:text-white'
                    }`}>
                    {d === 'ARRIVAL' ? '→ Arr' : '← Dep'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button type="submit" disabled={!fromCode.trim() || !toCode.trim() || searching}
          className="w-full flex items-center justify-center gap-2 py-3 bg-[#C9A84C] text-[#0B1F3A]
            font-bold rounded-xl hover:bg-[#e0b85c] disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors text-sm">
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {searching ? 'Searching Hotelbeds…' : 'Search Transfers'}
        </button>
      </form>
    </div>
  )

  // ── STEP 1 — RESULTS ─────────────────────────────────────────────────────
  const allTypes = Array.from(new Set(transfers.map(t => t.transferType)))
  const resultsContent = (
    <div className="space-y-4">
      {/* Filters */}
      {allTypes.length > 1 && (
        <div className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-3 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Type:</span>
          {allTypes.map(t => (
            <button key={t} type="button"
              onClick={() => setFilterType(f => f.includes(t) ? f.filter(x => x !== t) : [...f, t])}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                filterType.includes(t)
                  ? 'bg-[#C9A84C] text-[#0B1F3A]'
                  : 'border border-[#2a3f5f] text-gray-400 hover:text-white'
              }`}>
              {TRANSFER_TYPE_LABEL[t] ?? t}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-500">{filtered.length} options</span>
        </div>
      )}

      {searching && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-5 animate-pulse">
              <div className="h-4 bg-[#1a2f4a] rounded w-1/3 mb-2" />
              <div className="h-3 bg-[#1a2f4a] rounded w-1/4" />
            </div>
          ))}
        </div>
      )}

      {!searching && filtered.length === 0 && (
        <div className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-8 text-center">
          <Car className="w-8 h-8 text-gray-600 mx-auto mb-2" />
          <p className="text-gray-400">No transfers found for this route.</p>
          <p className="text-gray-600 text-xs mt-1">Check the location codes and try again.</p>
        </div>
      )}

      {filtered.map(t => {
        const wp = calculateBookingPrice({
          productType: 'TRANSFER', supplier: 'HOTELBEDS',
          netAmount: t.price, currency: t.currency || currency,
        })
        const isSelected = selected?.transferKey === t.transferKey

        return (
          <div key={t.transferKey}
            className={`bg-[#0a1929] rounded-xl border transition-colors ${
              isSelected ? 'border-[#C9A84C]/60' : 'border-[#1a2f4a] hover:border-[#2a3f5f]'
            }`}>
            <div className="p-5 flex items-start gap-4">
              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-[#0d2035] border border-[#2a3f5f]
                flex items-center justify-center flex-shrink-0">
                <Car className="w-5 h-5 text-[#C9A84C]" />
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-base leading-tight">{t.vehicleName}</p>
                {t.vehicleDesc && t.vehicleDesc !== t.vehicleName && (
                  <p className="text-xs text-gray-400 mt-0.5">{t.vehicleDesc}</p>
                )}
                <div className="flex flex-wrap gap-3 mt-2">
                  <span className="text-xs text-gray-400 bg-[#0d2035] border border-[#2a3f5f]
                    rounded px-2 py-0.5">
                    {TRANSFER_TYPE_LABEL[t.transferType] ?? t.transferType}
                  </span>
                  {t.maxPax && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Users className="w-3 h-3" /> Max {t.maxPax}
                    </span>
                  )}
                  {t.duration && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="w-3 h-3" /> {durationLabel(t.duration)}
                    </span>
                  )}
                </div>
              </div>

              {/* Price + select */}
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-500">Net {fmt(t.currency || currency, t.price)}</p>
                <p className="text-[#C9A84C] font-bold text-base">{fmt(t.currency || currency, wp.sellingPrice)}</p>
                <button type="button"
                  onClick={() => { setSelected(t); setStep(2) }}
                  className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    isSelected
                      ? 'bg-green-600 text-white'
                      : 'bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#e0b85c]'
                  }`}>
                  {isSelected ? <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Selected</span> : 'Select'}
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  // ── STEP 2 — CLIENT ────────────────────────────────────────────────────────
  const clientContent = (
    <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
      <h2 className="text-white font-bold mb-1 flex items-center gap-2">
        <Users className="w-5 h-5 text-[#C9A84C]" /> Client
      </h2>
      <p className="text-gray-500 text-xs mb-4">Search for an existing client or create a new one</p>
      <CustomerSelector value={customer} onChange={setCustomer} />
      {customer && (
        <button type="button" onClick={() => setStep(3)}
          className="w-full mt-4 py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl
            hover:bg-[#e0b85c] transition-colors text-sm">
          Continue to Pricing →
        </button>
      )}
    </div>
  )

  // ── STEP 3 — PRICING ──────────────────────────────────────────────────────
  const pricingContent = pricing ? (
    <div className="space-y-4">
      <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
        <h2 className="text-white font-bold mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-[#C9A84C]" /> Pricing
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Supplier Net ({selected?.currency || currency})</label>
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
            <label className="text-xs text-gray-400 block mb-1">Service Fee ({selected?.currency || currency})</label>
            <input type="number" value={serviceFee} min={0} step={1}
              onChange={e => setServiceFee(Number(e.target.value))}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-4 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Discount ({selected?.currency || currency})</label>
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
          </div>
        </div>
      </div>

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
        <button type="button" onClick={() => setStep(4)}
          className="w-full mt-4 py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl
            hover:bg-[#e0b85c] transition-colors text-sm">
          Review & Confirm →
        </button>
      </div>
    </div>
  ) : null

  // ── STEP 4 — CONFIRM ──────────────────────────────────────────────────────
  const confirmContent = (
    <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
      <h2 className="text-white font-bold mb-4">Final Review</h2>
      <div className="space-y-0 mb-6">
        {[
          { l: 'Vehicle',     v: selected?.vehicleName ?? '—' },
          { l: 'Type',        v: selected ? (TRANSFER_TYPE_LABEL[selected.transferType] ?? selected.transferType) : '—' },
          { l: 'From',        v: fromDisplay || fromCode.toUpperCase() || '—' },
          { l: 'To',          v: toDisplay   || toCode.toUpperCase()   || '—' },
          { l: 'Date',        v: `${fromDate} at ${fromTime}` },
          { l: 'Passengers',  v: `${adults} adult${adults !== 1 ? 's' : ''}${children > 0 ? `, ${children} children` : ''}` },
          { l: 'Flight',      v: flightNumber ? `${flightNumber} (${flightDir})` : 'Not provided' },
          { l: 'Client',      v: customer?.name ?? '—' },
          { l: 'Email',       v: customer?.email ?? '—' },
          { l: 'Supplier Net', v: pricing ? fmt(pricing.currency, pricing.supplierCost) : '—' },
          { l: 'Customer Total', v: pricing ? fmt(pricing.currency, pricing.sellingPrice) : '—' },
          { l: 'Payment',     v: PAYMENT_METHODS.find(m => m.id === paymentMethod)?.label ?? paymentMethod },
        ].map(row => (
          <div key={row.l}
            className="flex justify-between py-2 border-b border-[#1a2f4a] last:border-0">
            <span className="text-xs text-gray-500">{row.l}</span>
            <span className="text-xs text-white font-medium max-w-[55%] text-right">{row.v}</span>
          </div>
        ))}
      </div>

      <div className="bg-amber-900/10 border border-amber-700/30 rounded-xl p-3 mb-4">
        <p className="text-xs text-amber-400">
          This will create a live Hotelbeds transfer booking. The action cannot be undone.
        </p>
      </div>

      <button type="button" onClick={doBook} disabled={booking_}
        className="w-full py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl
          hover:bg-[#e0b85c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors
          flex items-center justify-center gap-2 text-sm">
        {booking_ && <Loader2 className="w-4 h-4 animate-spin" />}
        {booking_ ? 'Booking…' : 'Confirm Transfer Booking'}
      </button>
    </div>
  )

  const stepContent: Record<Step, React.ReactNode> = {
    0: searchContent,
    1: resultsContent,
    2: clientContent,
    3: pricingContent,
    4: confirmContent,
  }

  return (
    <AdminBookingShell
      productType="TRANSFER"
      steps={STEPS}
      currentStep={step}
      summary={summaryNode}
      searchBar={step > 0 ? searchBar : undefined}
      banner={banner}
      onBack={step > 0 ? () => setStep((Math.max(0, step - 1)) as Step) : undefined}
      onStepClick={i => { if (i < step) setStep(i as Step) }}
    >
      {stepContent[step]}
    </AdminBookingShell>
  )
}
