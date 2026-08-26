'use client'

import { useState, useEffect, Suspense } from 'react'
import {
  Search, MapPin, Clock, CheckCircle, AlertCircle, Loader2,
  Copy, Check, Users, Calendar, CreditCard, Building2,
  DollarSign, ExternalLink, Plus, Minus,
} from 'lucide-react'
import Link from 'next/link'
import AdminBookingShell  from '@/components/admin/booking/AdminBookingShell'
import BookingSummary     from '@/components/admin/booking/BookingSummary'
import CustomerSelector   from '@/components/admin/booking/CustomerSelector'
import type { AdminCustomer } from '@/components/admin/booking/CustomerSelector'
import { calculateBookingPrice } from '@/lib/pricing/booking-price'
import type { BookingPriceResult } from '@/lib/pricing/booking-price'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TourListing {
  id:          string
  name:        string
  slug:        string
  description: string
  highlights:  string
  price:       number
  currency:    string
  duration:    string
  location:    string
  imageUrl?:   string | null
  photos:      string[]
  active:      boolean
  order:       number
}

type Step = 0 | 1 | 2 | 3 | 4  // Tour | Dates & Pax | Client | Pricing | Confirm

type PaymentMethod = 'STRIPE_LINK' | 'BANK_TRANSFER' | 'MARK_PAID' | 'PAY_LATER'

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = ['Tour', 'Dates & Pax', 'Client', 'Pricing', 'Confirm']

const PAYMENT_METHODS: { id: PaymentMethod; label: string; desc: string }[] = [
  { id: 'STRIPE_LINK',   label: 'Stripe Payment Link', desc: 'Send a secure payment link to client'    },
  { id: 'BANK_TRANSFER', label: 'Bank Transfer',        desc: 'Record an expected bank transfer'        },
  { id: 'MARK_PAID',     label: 'Mark as Paid',         desc: 'Cash or payment already received'        },
  { id: 'PAY_LATER',     label: 'Pay Later / Invoice',  desc: 'Confirm booking, payment to follow'      },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function travellersLabel(adults: number, children: number, infants: number): string {
  const parts: string[] = []
  if (adults   > 0) parts.push(`${adults} Adult${adults   !== 1 ? 's' : ''}`)
  if (children > 0) parts.push(`${children} Child${children !== 1 ? 'ren' : ''}`)
  if (infants  > 0) parts.push(`${infants} Infant${infants  !== 1 ? 's' : ''}`)
  return parts.join(' · ') || '0 travellers'
}

// ── Counter component ─────────────────────────────────────────────────────────

interface CounterProps {
  label: string
  sublabel?: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}

function Counter({ label, sublabel, value, onChange, min = 0, max = 20 }: CounterProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#1a2f4a] last:border-0">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {sublabel && <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-8 h-8 rounded-full border border-[#1a2f4a] flex items-center justify-center
            text-gray-400 hover:border-[#C9A84C] hover:text-[#C9A84C] disabled:opacity-30
            disabled:cursor-not-allowed transition-colors"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-6 text-center text-white font-bold text-sm">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-8 h-8 rounded-full border border-[#1a2f4a] flex items-center justify-center
            text-gray-400 hover:border-[#C9A84C] hover:text-[#C9A84C] disabled:opacity-30
            disabled:cursor-not-allowed transition-colors"
          aria-label={`Increase ${label}`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function AdminTourBookingWizard() {
  // ── Step ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(0)

  // ── Step 0 — Tour select ─────────────────────────────────────────────────
  const [tours,        setTours]       = useState<TourListing[]>([])
  const [toursLoading, setToursLoading] = useState(true)
  const [toursError,   setToursError]  = useState<string | null>(null)
  const [searchQuery,  setSearchQuery] = useState('')
  const [selectedTour, setSelectedTour] = useState<TourListing | null>(null)

  // ── Step 1 — Dates & Pax ─────────────────────────────────────────────────
  const [travelDate, setTravelDate] = useState('')
  const [adults,     setAdults]     = useState(1)
  const [children,   setChildren]   = useState(0)
  const [infants,    setInfants]    = useState(0)

  // ── Step 2 — Client ───────────────────────────────────────────────────────
  const [customer, setCustomer] = useState<AdminCustomer | null>(null)

  // ── Step 3 — Pricing ──────────────────────────────────────────────────────
  const [markupPercent, setMarkupPercent] = useState(30)
  const [serviceFee,    setServiceFee]    = useState(0)
  const [discount,      setDiscount]      = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('STRIPE_LINK')
  const [notes,         setNotes]         = useState('')

  // ── Derived pricing ───────────────────────────────────────────────────────
  const [pricing, setPricing] = useState<BookingPriceResult | null>(null)

  useEffect(() => {
    if (!selectedTour) { setPricing(null); return }
    setPricing(calculateBookingPrice({
      productType:   'TOUR',
      supplier:      'WALZ',
      netAmount:     selectedTour.price,
      currency:      selectedTour.currency,
      markupPercent,
      serviceFee,
      discount,
    }))
  }, [selectedTour, markupPercent, serviceFee, discount])

  // ── Step 4 — Confirm ──────────────────────────────────────────────────────
  const [booking,  setBooking]  = useState(false)
  const [walzRef,  setWalzRef]  = useState<string | null>(null)
  const [copied,   setCopied]   = useState(false)

  // ── Error banner ──────────────────────────────────────────────────────────
  const [error,    setError]    = useState<string | null>(null)

  // ── Load tours ────────────────────────────────────────────────────────────
  useEffect(() => {
    setToursLoading(true)
    setToursError(null)
    fetch('/api/admin/tours')
      .then(r => r.json())
      .then((data: TourListing[] | { error: string }) => {
        if (Array.isArray(data)) {
          setTours(data.filter(t => t.active))
        } else {
          setToursError((data as { error: string }).error ?? 'Failed to load tours')
        }
      })
      .catch(() => setToursError('Network error — could not load tours'))
      .finally(() => setToursLoading(false))
  }, [])

  // ── Filtered tours ────────────────────────────────────────────────────────
  const filteredTours = tours.filter(t => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return t.name.toLowerCase().includes(q) || t.location.toLowerCase().includes(q)
  })

  // ── Navigation ────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]

  function canAdvance(): boolean {
    switch (step) {
      case 0: return selectedTour !== null
      case 1: return travelDate !== '' && adults >= 1
      case 2: return customer !== null
      case 3: return pricing !== null
      default: return false
    }
  }

  function goNext() {
    if (step < 4) setStep((step + 1) as Step)
  }

  function goBack() {
    if (step > 0) setStep((step - 1) as Step)
    setError(null)
  }

  function handleStepClick(idx: number) {
    // Only allow clicking already-completed steps
    if (idx < step) setStep(idx as Step)
  }

  // ── Confirm booking ───────────────────────────────────────────────────────
  async function handleConfirm() {
    if (!selectedTour || !customer || !pricing || booking) return
    setBooking(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/book/tour', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tourId:       selectedTour.id,
          tourName:     selectedTour.name,
          tourSlug:     selectedTour.slug,
          tourLocation: selectedTour.location,
          tourDuration: selectedTour.duration,
          travelDate,
          adults,
          children,
          infants,
          holderName:    customer.name,
          holderEmail:   customer.email,
          holderPhone:   customer.phone ?? null,
          totalNet:      pricing.supplierCost,
          sellingPrice:  pricing.sellingPrice,
          markupPercent: pricing.markupPercent,
          markupAmount:  pricing.markupAmount,
          serviceFee:    pricing.serviceFee,
          discount:      pricing.discount,
          currency:      pricing.currency,
          clientId:      customer.id,
          paymentMethod,
          notes:         notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Booking failed')
      setWalzRef(data.walzRef)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed — please try again')
    } finally {
      setBooking(false)
    }
  }

  async function copyRef() {
    if (!walzRef) return
    await navigator.clipboard.writeText(walzRef).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Booking Summary sidebar ───────────────────────────────────────────────
  const summaryTravellers = adults + children + infants > 0
    ? travellersLabel(adults, children, infants)
    : null

  const paymentStatus = walzRef
    ? (paymentMethod === 'MARK_PAID' ? 'PAID' : 'PENDING')
    : null

  const summary = (
    <BookingSummary
      customer={customer}
      productName={selectedTour?.name ?? null}
      productDetail={selectedTour ? `${selectedTour.location} · ${selectedTour.duration}` : null}
      supplier="WALZ"
      dates={travelDate || null}
      travellers={summaryTravellers}
      pricing={pricing}
      paymentStatus={paymentStatus as 'PENDING' | 'PAID' | null}
      onContinue={step < 4 && !walzRef ? goNext : undefined}
      continueLabel={step === 3 ? 'Review Booking' : 'Continue'}
      continueDisabled={!canAdvance()}
    />
  )

  // ── Error banner ──────────────────────────────────────────────────────────
  const banner = error ? (
    <div className="flex items-start gap-3 bg-red-900/30 border border-red-700/50 text-red-300
      rounded-xl px-4 py-3 text-sm">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span className="flex-1">{error}</span>
      <button
        type="button"
        onClick={() => setError(null)}
        className="text-red-400 hover:text-red-200 transition-colors font-bold"
        aria-label="Dismiss error"
      >
        ×
      </button>
    </div>
  ) : null

  // ── Search bar (step 0 only) ───────────────────────────────────────────────
  const searchBar = step === 0 ? (
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
      <input
        type="text"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        placeholder="Filter by tour name or location…"
        className="w-full bg-[#061320] border border-[#1a2f4a] rounded-xl pl-10 pr-4 py-2.5
          text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]
          transition-colors"
      />
    </div>
  ) : undefined

  // ── Done screen ───────────────────────────────────────────────────────────
  if (walzRef && selectedTour && pricing && customer) {
    return (
      <AdminBookingShell
        productType="TOUR"
        steps={STEPS}
        currentStep={4}
        summary={
          <BookingSummary
            customer={customer}
            productName={selectedTour.name}
            productDetail={`${selectedTour.location} · ${selectedTour.duration}`}
            supplier="WALZ"
            dates={travelDate}
            travellers={travellersLabel(adults, children, infants)}
            pricing={pricing}
            paymentStatus={paymentMethod === 'MARK_PAID' ? 'PAID' : 'PENDING'}
          />
        }
      >
        <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-8 space-y-6">
          {/* Success header */}
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Tour Booking Confirmed</h2>
            <p className="text-sm text-gray-400">The booking has been saved to the system.</p>
          </div>

          {/* Reference */}
          <div className="bg-[#061320] rounded-xl border border-[#1a2f4a] p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Walz Reference</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-2xl font-bold text-[#C9A84C] tracking-widest">{walzRef}</span>
              <button
                type="button"
                onClick={copyRef}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-400
                  hover:text-white border border-[#1a2f4a] hover:border-[#C9A84C] rounded-lg
                  px-3 py-1.5 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Summary rows */}
          <div className="divide-y divide-[#1a2f4a] text-sm">
            {[
              ['Tour',         selectedTour.name],
              ['Location',     selectedTour.location],
              ['Duration',     selectedTour.duration],
              ['Travel Date',  travelDate || '—'],
              ['Travellers',   travellersLabel(adults, children, infants)],
              ['Client',       `${customer.name} · ${customer.email}`],
              ['Customer Total', fmt(pricing.currency, pricing.sellingPrice)],
              ['Payment',      PAYMENT_METHODS.find(m => m.id === paymentMethod)?.label ?? paymentMethod],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between py-2.5">
                <span className="text-gray-400">{label}</span>
                <span className="text-white font-medium text-right max-w-[55%]">{value}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/admin/bookings"
              className="flex-1 flex items-center justify-center gap-2 border border-[#1a2f4a]
                text-gray-300 hover:text-white hover:border-[#C9A84C] rounded-xl px-4 py-2.5
                text-sm font-semibold transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View Bookings
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 bg-[#C9A84C] text-[#0B1F3A] rounded-xl px-4 py-2.5
                text-sm font-bold hover:bg-[#e0b85c] transition-colors"
            >
              Book Another Tour
            </button>
          </div>
        </div>
      </AdminBookingShell>
    )
  }

  // ── Main wizard ───────────────────────────────────────────────────────────
  return (
    <AdminBookingShell
      productType="TOUR"
      steps={STEPS}
      currentStep={step}
      summary={summary}
      searchBar={searchBar}
      onBack={step > 0 ? goBack : undefined}
      onStepClick={handleStepClick}
      banner={banner}
    >

      {/* ════════════════════════════════════════════════════
          STEP 0 — SELECT TOUR
      ════════════════════════════════════════════════════ */}
      {step === 0 && (
        <div className="space-y-4">
          {toursLoading && (
            <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Loading tours…</span>
            </div>
          )}

          {toursError && (
            <div className="flex items-center gap-3 bg-red-900/30 border border-red-700/50
              text-red-300 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {toursError}
            </div>
          )}

          {!toursLoading && !toursError && filteredTours.length === 0 && (
            <div className="text-center py-20 text-gray-500">
              {searchQuery ? `No tours match "${searchQuery}"` : 'No active tours found.'}
            </div>
          )}

          {!toursLoading && filteredTours.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredTours.map(tour => {
                const isSelected = selectedTour?.id === tour.id
                return (
                  <button
                    key={tour.id}
                    type="button"
                    onClick={() => setSelectedTour(isSelected ? null : tour)}
                    className={`text-left rounded-2xl border-2 transition-all overflow-hidden
                      ${isSelected
                        ? 'border-[#C9A84C] bg-[#0a1929] shadow-lg shadow-[#C9A84C]/10'
                        : 'border-[#1a2f4a] bg-[#0a1929] hover:border-[#2a4060]'
                      }`}
                  >
                    {/* Image */}
                    {(tour.imageUrl || tour.photos?.[0]) && (
                      <div className="relative h-36 overflow-hidden bg-[#061320]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={tour.imageUrl ?? tour.photos[0]}
                          alt={tour.name}
                          className="w-full h-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-[#C9A84C]/10 flex items-center
                            justify-center">
                            <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center
                              justify-center shadow-lg">
                              <Check className="w-4 h-4 text-[#0B1F3A]" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="p-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className={`font-bold text-sm leading-snug ${isSelected ? 'text-[#C9A84C]' : 'text-white'}`}>
                          {tour.name}
                        </p>
                        {isSelected && (
                          <span className="flex-shrink-0 text-[10px] font-bold bg-[#C9A84C]/20
                            text-[#C9A84C] rounded-full px-2 py-0.5 border border-[#C9A84C]/40">
                            Selected
                          </span>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 mb-3">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {tour.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {tour.duration}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-gray-500 line-clamp-2 mb-3">{tour.description}</p>

                      {/* Price */}
                      <div className="flex items-baseline gap-1">
                        <span className="text-[10px] text-gray-500">From</span>
                        <span className="text-base font-bold text-[#C9A84C]">
                          {fmt(tour.currency, tour.price)}
                        </span>
                        <span className="text-[10px] text-gray-500">/ person (net)</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Continue button */}
          {selectedTour && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={goNext}
                className="px-6 py-2.5 bg-[#C9A84C] text-[#0B1F3A] rounded-xl text-sm font-bold
                  hover:bg-[#e0b85c] transition-colors"
              >
                Continue — Dates &amp; Pax
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          STEP 1 — DATES & PAX
      ════════════════════════════════════════════════════ */}
      {step === 1 && selectedTour && (
        <div className="space-y-4">
          {/* Selected tour recap */}
          <div className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{selectedTour.name}</p>
              <p className="text-xs text-gray-400">{selectedTour.location} · {selectedTour.duration}</p>
            </div>
            <button
              type="button"
              onClick={() => setStep(0)}
              className="text-xs text-[#C9A84C] hover:text-[#e0b85c] font-semibold transition-colors"
            >
              Change
            </button>
          </div>

          {/* Date picker */}
          <div className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-[#C9A84C]" />
              <p className="text-sm font-bold text-white">Travel Date</p>
            </div>
            <label className="text-xs text-gray-400 block mb-1.5">Departure / Start date</label>
            <input
              type="date"
              value={travelDate}
              min={today}
              onChange={e => setTravelDate(e.target.value)}
              className="w-full bg-[#061320] border border-[#1a2f4a] rounded-xl px-4 py-2.5
                text-sm text-white focus:outline-none focus:border-[#C9A84C] transition-colors
                [color-scheme:dark]"
            />
          </div>

          {/* Pax counters */}
          <div className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-[#C9A84C]" />
              <p className="text-sm font-bold text-white">Travellers</p>
            </div>
            <Counter
              label="Adults"
              sublabel="12+ years"
              value={adults}
              onChange={setAdults}
              min={1}
              max={20}
            />
            <Counter
              label="Children"
              sublabel="2–11 years"
              value={children}
              onChange={setChildren}
              min={0}
              max={12}
            />
            <Counter
              label="Infants"
              sublabel="Under 2 years"
              value={infants}
              onChange={setInfants}
              min={0}
              max={6}
            />
          </div>

          {/* Continue */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={goNext}
              disabled={!travelDate}
              className="px-6 py-2.5 bg-[#C9A84C] text-[#0B1F3A] rounded-xl text-sm font-bold
                hover:bg-[#e0b85c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Continue — Client
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          STEP 2 — CLIENT
      ════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-[#C9A84C]" />
              <p className="text-sm font-bold text-white">Select or Create Client</p>
            </div>
            <CustomerSelector
              value={customer}
              onChange={setCustomer}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={goNext}
              disabled={!customer}
              className="px-6 py-2.5 bg-[#C9A84C] text-[#0B1F3A] rounded-xl text-sm font-bold
                hover:bg-[#e0b85c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Continue — Pricing
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          STEP 3 — PRICING
      ════════════════════════════════════════════════════ */}
      {step === 3 && selectedTour && pricing && (
        <div className="space-y-4">
          {/* Pricing card */}
          <div className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-[#C9A84C]" />
              <p className="text-sm font-bold text-white">Pricing</p>
            </div>

            {/* Supplier net (read-only) */}
            <div className="flex items-center justify-between py-2 border-b border-[#1a2f4a]">
              <span className="text-sm text-gray-400">Supplier Cost (net)</span>
              <span className="font-bold text-gray-300">{fmt(pricing.currency, pricing.supplierCost)}</span>
            </div>

            {/* Markup % */}
            <div className="flex items-center justify-between py-2 border-b border-[#1a2f4a]">
              <label className="text-sm text-gray-400" htmlFor="markup-pct">Markup %</label>
              <div className="flex items-center gap-2">
                <input
                  id="markup-pct"
                  type="number"
                  min={0}
                  max={200}
                  step={0.5}
                  value={markupPercent}
                  onChange={e => setMarkupPercent(Math.max(0, Number(e.target.value)))}
                  className="w-20 text-right bg-[#061320] border border-[#1a2f4a] rounded-lg
                    px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#C9A84C]
                    transition-colors"
                />
                <span className="text-gray-400 text-sm">%</span>
              </div>
            </div>

            {/* Markup amount (read-only) */}
            <div className="flex items-center justify-between py-2 border-b border-[#1a2f4a]">
              <span className="text-sm text-gray-500">Markup Amount</span>
              <span className="text-sm text-gray-400">{fmt(pricing.currency, pricing.markupAmount)}</span>
            </div>

            {/* Service fee */}
            <div className="flex items-center justify-between py-2 border-b border-[#1a2f4a]">
              <label className="text-sm text-gray-400" htmlFor="service-fee">Service Fee</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">{pricing.currency}</span>
                <input
                  id="service-fee"
                  type="number"
                  min={0}
                  step={0.01}
                  value={serviceFee}
                  onChange={e => setServiceFee(Math.max(0, Number(e.target.value)))}
                  className="w-24 text-right bg-[#061320] border border-[#1a2f4a] rounded-lg
                    px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#C9A84C]
                    transition-colors"
                />
              </div>
            </div>

            {/* Discount */}
            <div className="flex items-center justify-between py-2 border-b border-[#1a2f4a]">
              <label className="text-sm text-gray-400" htmlFor="discount">Discount</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">{pricing.currency}</span>
                <input
                  id="discount"
                  type="number"
                  min={0}
                  step={0.01}
                  value={discount}
                  onChange={e => setDiscount(Math.max(0, Number(e.target.value)))}
                  className="w-24 text-right bg-[#061320] border border-[#1a2f4a] rounded-lg
                    px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#C9A84C]
                    transition-colors"
                />
              </div>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-[#C9A84C]/10 rounded-xl p-3 text-center border border-[#C9A84C]/20">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Customer Total</p>
                <p className="font-bold text-[#C9A84C] text-lg">{fmt(pricing.currency, pricing.sellingPrice)}</p>
              </div>
              <div className={`rounded-xl p-3 text-center border ${pricing.grossProfit >= 0 ? 'bg-emerald-900/20 border-emerald-700/30' : 'bg-red-900/20 border-red-700/30'}`}>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                  Gross Profit ({pricing.marginPercent}%)
                </p>
                <p className={`font-bold text-lg ${pricing.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt(pricing.currency, pricing.grossProfit)}
                </p>
              </div>
            </div>
          </div>

          {/* Payment method */}
          <div className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-5">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-[#C9A84C]" />
              <p className="text-sm font-bold text-white">Payment Method</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`text-left p-3.5 rounded-xl border-2 transition-all
                    ${paymentMethod === m.id
                      ? 'border-[#C9A84C] bg-[#C9A84C]/10'
                      : 'border-[#1a2f4a] hover:border-[#2a4060]'
                    }`}
                >
                  <p className={`text-sm font-semibold ${paymentMethod === m.id ? 'text-[#C9A84C]' : 'text-white'}`}>
                    {m.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] p-5">
            <label className="text-sm font-bold text-white block mb-3" htmlFor="notes">
              Internal Notes <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Special requests, internal instructions…"
              className="w-full bg-[#061320] border border-[#1a2f4a] rounded-xl px-4 py-2.5
                text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]
                resize-none transition-colors"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={goNext}
              className="px-6 py-2.5 bg-[#C9A84C] text-[#0B1F3A] rounded-xl text-sm font-bold
                hover:bg-[#e0b85c] transition-colors"
            >
              Review Booking
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          STEP 4 — CONFIRM
      ════════════════════════════════════════════════════ */}
      {step === 4 && selectedTour && pricing && customer && (
        <div className="space-y-4">
          {/* Review table */}
          <div className="bg-[#0a1929] rounded-xl border border-[#1a2f4a] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#1a2f4a]">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Booking Review</p>
            </div>
            <div className="divide-y divide-[#1a2f4a] text-sm px-5">
              {[
                ['Tour',           selectedTour.name],
                ['Location',       selectedTour.location],
                ['Duration',       selectedTour.duration],
                ['Travel Date',    travelDate || '—'],
                ['Travellers',     travellersLabel(adults, children, infants)],
                ['Client',         customer.name],
                ['Email',          customer.email],
                ['Phone',          customer.phone ?? '—'],
                ['Supplier Cost',  fmt(pricing.currency, pricing.supplierCost)],
                [`Markup (${pricing.markupPercent}%)`, fmt(pricing.currency, pricing.markupAmount)],
                ...(pricing.serviceFee > 0
                  ? [['Service Fee', fmt(pricing.currency, pricing.serviceFee)]]
                  : []),
                ...(pricing.discount > 0
                  ? [['Discount', `−${fmt(pricing.currency, pricing.discount)}`]]
                  : []),
                ['Payment',        PAYMENT_METHODS.find(m => m.id === paymentMethod)?.label ?? paymentMethod],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2.5">
                  <span className="text-gray-400">{label}</span>
                  <span className="text-white font-medium text-right max-w-[55%]">{value}</span>
                </div>
              ))}

              {/* Total */}
              <div className="flex justify-between py-3">
                <span className="font-bold text-white text-base">Customer Total</span>
                <span className="font-bold text-[#C9A84C] text-lg">
                  {fmt(pricing.currency, pricing.sellingPrice)}
                </span>
              </div>
            </div>
          </div>

          {/* Irreversible warning */}
          <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-700/40
            text-amber-300 rounded-xl px-4 py-3 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
            <span>
              <strong className="text-amber-200">This action is irreversible.</strong>
              {' '}Clicking Confirm will create a booking record in the system.
              Double-check all details before proceeding.
            </span>
          </div>

          {/* Confirm button */}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={booking}
            className="w-full flex items-center justify-center gap-2 bg-[#C9A84C] text-[#0B1F3A]
              font-bold py-3.5 rounded-xl hover:bg-[#e0b85c] disabled:opacity-50
              disabled:cursor-not-allowed transition-colors text-base"
          >
            {booking
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Booking…</>
              : <>
                  <CheckCircle className="w-4 h-4" />
                  Confirm Tour Booking
                </>
            }
          </button>

          {notes && (
            <div className="bg-[#061320] rounded-xl border border-[#1a2f4a] px-4 py-3">
              <p className="text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Notes</p>
              <p className="text-sm text-gray-300">{notes}</p>
            </div>
          )}
        </div>
      )}
    </AdminBookingShell>
  )
}

// ── Page export with Suspense ──────────────────────────────────────────────────

export default function AdminTourBookingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#061320] flex items-center justify-center gap-3 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Loading tour booking…</span>
        </div>
      }
    >
      <AdminTourBookingWizard />
    </Suspense>
  )
}
