'use client'

import { useState, useRef, Suspense } from 'react'
import {
  MapPin, Star, Clock, CheckCircle, AlertCircle, Loader2,
  ExternalLink, Copy, Check, CreditCard, Building2, DollarSign, Calendar,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import AdminBookingShell from '@/components/admin/booking/AdminBookingShell'
import CustomerSelector from '@/components/admin/booking/CustomerSelector'
import type { AdminCustomer } from '@/components/admin/booking/CustomerSelector'
import BookingSummary from '@/components/admin/booking/BookingSummary'
import { calculateBookingPrice } from '@/lib/pricing/booking-price'
import type { BookingPriceResult, BookingSupplier } from '@/lib/pricing/booking-price'
import type { NormalizedActivity, ActivityOption } from '@/lib/activities/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2 | 3 | 4 | 5

interface SearchForm {
  destination: string
  keyword:     string
  dateFrom:    string
  dateTo:      string
  adults:      number
  children:    number
  infants:     number
  currency:    string
}

interface BookingDone {
  walzReference:      string
  bookingId?:         string
  supplierReference?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STEP_LABELS   = ['Search', 'Results', 'Options', 'Client', 'Pricing', 'Confirm']
const CURRENCIES    = ['GBP', 'USD', 'EUR', 'NGN', 'AED']
const DEFAULT_MARKUP = 18

const PAYMENT_METHODS = [
  { value: 'MARK_PAID',     label: 'Mark as Paid',        icon: DollarSign },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer',        icon: Building2 },
  { value: 'STRIPE_LINK',   label: 'Stripe Payment Link',  icon: CreditCard },
  { value: 'PAY_LATER',     label: 'Invoice / Pay Later',  icon: Calendar },
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency', currency, minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function activitySupplier(s: string): BookingSupplier {
  if (s === 'VIATOR')     return 'VIATOR'
  if (s === 'HOTELBEDS')  return 'HOTELBEDS'
  return 'MANUAL'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SupplierBadge({ supplier }: { supplier: string }) {
  if (supplier === 'VIATOR') {
    return (
      <span className="px-2 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30">
        Viator
      </span>
    )
  }
  if (supplier === 'HOTELBEDS') {
    return (
      <span className="px-2 py-0.5 text-xs font-bold bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">
        Hotelbeds
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 text-xs font-bold bg-gray-500/20 text-gray-400 rounded-full border border-gray-500/30">
      {supplier}
    </span>
  )
}

function PaxCounter({
  label, value, min = 0, max = 20, onChange,
}: {
  label: string; value: number; min?: number; max?: number; onChange: (n: number) => void
}) {
  return (
    <div className="flex items-center justify-between bg-[#061320] border border-[#1a2f4a] rounded-xl px-4 py-3">
      <span className="text-sm text-gray-300">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-7 h-7 rounded-lg bg-[#1a2f4a] text-white flex items-center justify-center hover:bg-[#2a3f5f] disabled:opacity-40 transition-colors text-lg leading-none"
        >
          −
        </button>
        <span className="w-5 text-center text-white font-bold text-sm">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-7 h-7 rounded-lg bg-[#1a2f4a] text-white flex items-center justify-center hover:bg-[#2a3f5f] disabled:opacity-40 transition-colors text-lg leading-none"
        >
          +
        </button>
      </div>
    </div>
  )
}

function DoneRow({
  label, value, copyable, highlight,
}: {
  label: string; value: string; copyable?: boolean; highlight?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 gap-4">
      <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-sm font-bold truncate ${highlight ? 'text-[#C9A84C]' : 'text-white'}`}>
          {value}
        </span>
        {copyable && (
          <button
            type="button"
            onClick={copy}
            className="text-gray-600 hover:text-[#C9A84C] transition-colors flex-shrink-0"
            aria-label="Copy"
          >
            {copied
              ? <Check className="w-3.5 h-3.5 text-emerald-400" />
              : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

function ActivityBookingContent() {
  const router = useRouter()

  // Step state
  const [step,       setStep]       = useState<Step>(0)
  const [confirming, setConfirming] = useState(false)
  const [done,       setDone]       = useState<BookingDone | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  // Search
  const [searchForm, setSearchForm] = useState<SearchForm>({
    destination: '', keyword: '', dateFrom: '', dateTo: '',
    adults: 1, children: 0, infants: 0, currency: 'GBP',
  })
  const [searching, setSearching] = useState(false)
  const [results,   setResults]   = useState<NormalizedActivity[]>([])

  // Activity selection + options
  const [selected,        setSelected]        = useState<NormalizedActivity | null>(null)
  const [options,         setOptions]         = useState<ActivityOption[]>([])
  const [loadingOptions,  setLoadingOptions]  = useState(false)
  const [selectedOption,  setSelectedOption]  = useState<ActivityOption | null>(null)

  // Client
  const [customer, setCustomer] = useState<AdminCustomer | null>(null)

  // Pricing overrides
  const [markupPct,  setMarkupPct]  = useState(DEFAULT_MARKUP)
  const [serviceFee, setServiceFee] = useState(0)
  const [discount,   setDiscount]   = useState(0)

  // Payment
  const [paymentMethod, setPaymentMethod] = useState('MARK_PAID')
  const [paymentRef,    setPaymentRef]    = useState('')
  const [notes,         setNotes]         = useState('')

  // Anti-double-submit refs
  const bookingAttemptRef = useRef<string | null>(null)
  const submitLock        = useRef(false)

  const today = new Date().toISOString().split('T')[0]

  // ── Derived pricing ──────────────────────────────────────────────────────

  const pricing: BookingPriceResult | null =
    selectedOption && selected
      ? calculateBookingPrice({
          productType:   'ACTIVITY',
          supplier:      activitySupplier(selected.supplier),
          netAmount:     selectedOption.supplierNetPrice ?? selected.supplierNetPrice ?? 0,
          currency:      selectedOption.currency || selected.currency,
          markupPercent: markupPct,
          serviceFee,
          discount,
        })
      : null

  // ── Helper strings ───────────────────────────────────────────────────────

  const travellersStr = [
    `${searchForm.adults} adult${searchForm.adults !== 1 ? 's' : ''}`,
    searchForm.children ? `${searchForm.children} child${searchForm.children !== 1 ? 'ren' : ''}` : null,
    searchForm.infants  ? `${searchForm.infants} infant${searchForm.infants !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ')

  const datesStr = [searchForm.dateFrom, searchForm.dateTo].filter(Boolean).join(' → ') || null

  // ── Navigation ───────────────────────────────────────────────────────────

  function handleBack() {
    if (step === 0) {
      router.push('/admin/book')
    } else {
      setStep((step - 1) as Step)
    }
  }

  // ── Search ───────────────────────────────────────────────────────────────

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!searchForm.destination.trim()) return
    setError(null)
    setSearching(true)
    setResults([])
    setSelected(null)
    setOptions([])
    setSelectedOption(null)

    try {
      const res = await fetch('/api/admin/activities/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          destination: searchForm.destination,
          keyword:     searchForm.keyword.trim() || undefined,
          dateFrom:    searchForm.dateFrom  || undefined,
          dateTo:      searchForm.dateTo    || undefined,
          adults:      searchForm.adults,
          children:    searchForm.children,
          infants:     searchForm.infants,
          currency:    searchForm.currency,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setResults(data.activities ?? [])
      setStep(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  // ── Load availability ────────────────────────────────────────────────────

  async function loadAvailability(activity: NormalizedActivity) {
    setSelected(activity)
    setOptions([])
    setSelectedOption(null)
    setStep(2)
    setLoadingOptions(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/activities/availability', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          supplier:          activity.supplier,
          supplierProductId: activity.supplierProductId,
          destination:       searchForm.destination,
          date:              searchForm.dateFrom || today,
          adults:            searchForm.adults,
          children:          searchForm.children,
          infants:           searchForm.infants,
          currency:          searchForm.currency,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load availability')
      const opts: ActivityOption[] = data.options ?? []
      setOptions(opts)
      if (opts.length === 1) setSelectedOption(opts[0])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load options')
    } finally {
      setLoadingOptions(false)
    }
  }

  // ── Confirm booking ──────────────────────────────────────────────────────

  async function handleConfirmBooking() {
    if (!selected || !selectedOption || !customer || !pricing || submitLock.current) return
    submitLock.current = true
    if (!bookingAttemptRef.current) {
      bookingAttemptRef.current = crypto.randomUUID()
    }
    setConfirming(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/activities/book', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          supplier:          selected.supplier,
          supplierProductId: selected.supplierProductId,
          optionCode:        selectedOption.code,
          startTime:         selectedOption.startTimes?.[0] ?? undefined,
          activityTitle:     selected.title,
          location:          selected.destination?.name ?? searchForm.destination,
          travelDate:        searchForm.dateFrom || undefined,
          adults:            searchForm.adults,
          children:          searchForm.children,
          infants:           searchForm.infants,
          clientName:        customer.name,
          clientEmail:       customer.email,
          clientPhone:       customer.phone ?? undefined,
          totalAmount:       pricing.sellingPrice,
          supplierNetAmount: pricing.supplierCost,
          markupAmount:      pricing.markupAmount,
          currency:          pricing.currency,
          paymentMethod,
          paymentRef:        paymentRef || undefined,
          notes:             notes || undefined,
          bookingAttemptId:  bookingAttemptRef.current,
        }),
      })
      const text = await res.text()
      let data: Record<string, unknown> = {}
      try { data = JSON.parse(text) } catch { /* non-JSON body — use empty object */ }

      // supplierFailed: Viator rejected the booking but the DB record was saved.
      // Show success with a warning rather than blocking the flow.
      if (data.supplierFailed) {
        setDone({
          walzReference:     data.walzReference as string,
          bookingId:         data.bookingId as string,
          supplierReference: undefined,
        })
        setError('Booking saved, but Viator rejected the live booking request. Go to Activity Bookings to retry or contact Viator support.')
        return
      }

      if (!res.ok) throw new Error((data.error as string) ?? `Booking failed (${res.status})`)
      setDone({
        walzReference:     data.walzReference as string,
        bookingId:         data.bookingId as string,
        supplierReference: data.supplierReference as string,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed')
      submitLock.current = false
    } finally {
      setConfirming(false)
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────

  function reset() {
    setStep(0)
    setDone(null)
    setConfirming(false)
    setError(null)
    setSearchForm({ destination: '', keyword: '', dateFrom: '', dateTo: '', adults: 1, children: 0, infants: 0, currency: 'GBP' })
    setResults([])
    setSelected(null)
    setOptions([])
    setSelectedOption(null)
    setCustomer(null)
    setMarkupPct(DEFAULT_MARKUP)
    setServiceFee(0)
    setDiscount(0)
    setPaymentMethod('MARK_PAID')
    setPaymentRef('')
    setNotes('')
    bookingAttemptRef.current = null
    submitLock.current = false
  }

  // ── Sidebar continue ─────────────────────────────────────────────────────

  function handleContinue() {
    if (step === 1 && selected) {
      loadAvailability(selected)
    } else if (step === 2 && selectedOption) {
      setStep(3)
    } else if (step === 3 && customer) {
      setStep(4)
    } else if (step === 4) {
      if (!bookingAttemptRef.current) {
        bookingAttemptRef.current = crypto.randomUUID()
      }
      setStep(5)
    } else if (step === 5) {
      handleConfirmBooking()
    }
  }

  const continueDisabled =
    step === 0 ? true :
    step === 1 ? !selected :
    step === 2 ? (!selectedOption || loadingOptions) :
    step === 3 ? !customer :
    step === 4 ? false :
    step === 5 ? confirming :
    true

  const continueLabel =
    step === 5 ? (confirming ? 'Creating Booking…' : 'Confirm Booking') : 'Continue →'

  // ── Banner ───────────────────────────────────────────────────────────────

  const banner = error ? (
    <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">{error}</span>
      <button type="button" onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-300 text-lg leading-none">×</button>
    </div>
  ) : null

  // ── Done screen ───────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="min-h-screen bg-[#061320] flex items-start justify-center p-6 pt-16">
        <div className="bg-[#0a1929] border border-[#1a2f4a] rounded-2xl p-8 max-w-lg w-full space-y-6">
          <div className="text-center">
            <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white">Booking Confirmed</h2>
            <p className="text-gray-400 text-sm mt-1">The activity booking has been created successfully.</p>
          </div>

          <div className="bg-[#061320] rounded-xl border border-[#1a2f4a] divide-y divide-[#1a2f4a]">
            <DoneRow label="Walz Reference"     value={done.walzReference}                  copyable />
            {done.supplierReference && (
              <DoneRow label="Supplier Reference" value={done.supplierReference}             copyable />
            )}
            {selected  && <DoneRow label="Activity"     value={selected.title} />}
            {customer  && <DoneRow label="Client"       value={`${customer.name} · ${customer.email}`} />}
            {searchForm.dateFrom && <DoneRow label="Travel Date" value={searchForm.dateFrom} />}
            {pricing   && <DoneRow label="Total Charged" value={fmtPrice(pricing.sellingPrice, pricing.currency)} highlight />}
          </div>

          <div className="flex gap-3">
            <Link
              href="/admin/activities/bookings"
              className="flex-1 flex items-center justify-center gap-2 text-sm font-bold text-white border border-[#1a2f4a] rounded-xl px-4 py-3 hover:bg-[#0d2035] transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> View Bookings
            </Link>
            <button
              type="button"
              onClick={reset}
              className="flex-1 text-sm font-bold text-[#061320] bg-[#C9A84C] rounded-xl px-4 py-3 hover:bg-[#e0b85c] transition-colors"
            >
              Book Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Shell render ──────────────────────────────────────────────────────────

  return (
    <AdminBookingShell
      productType="ACTIVITY"
      steps={STEP_LABELS}
      currentStep={step}
      onBack={handleBack}
      banner={banner}
      summary={
        <BookingSummary
          customer={customer}
          productName={selected?.title ?? null}
          productDetail={
            selected
              ? `${selected.supplier} · ${selected.supplierProductId}`
              : null
          }
          supplier={selected?.supplier ?? null}
          dates={datesStr}
          travellers={travellersStr || null}
          pricing={pricing}
          onContinue={step > 0 ? handleContinue : undefined}
          continueLabel={continueLabel}
          continueDisabled={continueDisabled}
          isLoading={step === 5 && confirming}
          showProfit
        />
      }
    >

      {/* ══ Step 0: Search ══════════════════════════════════════════════════ */}
      {step === 0 && (
        <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6">
          <h2 className="text-white font-bold text-lg mb-6">Find an Activity</h2>
          <form onSubmit={handleSearch} className="space-y-4">

            {/* Destination */}
            <div>
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                Destination
              </label>
              <input
                type="text"
                value={searchForm.destination}
                onChange={e => setSearchForm(f => ({ ...f, destination: e.target.value }))}
                placeholder="e.g. Dubai, London, Cape Town"
                required
                className="w-full bg-[#061320] border border-[#1a2f4a] rounded-xl px-4 py-3 text-white
                  placeholder-gray-600 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>

            {/* Keyword */}
            <div>
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                Keyword <span className="text-gray-600 normal-case font-normal">(optional — e.g. boat party, snorkelling, safari)</span>
              </label>
              <input
                type="text"
                value={searchForm.keyword}
                onChange={e => setSearchForm(f => ({ ...f, keyword: e.target.value }))}
                placeholder="Filter by activity type…"
                className="w-full bg-[#061320] border border-[#1a2f4a] rounded-xl px-4 py-3 text-white
                  placeholder-gray-600 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">From</label>
                <input
                  type="date" value={searchForm.dateFrom} min={today}
                  onChange={e => setSearchForm(f => ({ ...f, dateFrom: e.target.value }))}
                  className="w-full bg-[#061320] border border-[#1a2f4a] rounded-xl px-4 py-3 text-white text-sm
                    focus:outline-none focus:border-[#C9A84C] transition-colors [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">To</label>
                <input
                  type="date" value={searchForm.dateTo} min={searchForm.dateFrom || today}
                  onChange={e => setSearchForm(f => ({ ...f, dateTo: e.target.value }))}
                  className="w-full bg-[#061320] border border-[#1a2f4a] rounded-xl px-4 py-3 text-white text-sm
                    focus:outline-none focus:border-[#C9A84C] transition-colors [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Pax */}
            <div>
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">Travellers</label>
              <div className="space-y-2">
                <PaxCounter label="Adults"   value={searchForm.adults}   min={1} onChange={v => setSearchForm(f => ({ ...f, adults:   v }))} />
                <PaxCounter label="Children" value={searchForm.children}        onChange={v => setSearchForm(f => ({ ...f, children: v }))} />
                <PaxCounter label="Infants"  value={searchForm.infants}         onChange={v => setSearchForm(f => ({ ...f, infants:  v }))} />
              </div>
            </div>

            {/* Currency */}
            <div>
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">Currency</label>
              <select
                value={searchForm.currency}
                onChange={e => setSearchForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full bg-[#061320] border border-[#1a2f4a] rounded-xl px-4 py-3 text-white text-sm
                  focus:outline-none focus:border-[#C9A84C] transition-colors"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <button
              type="submit"
              disabled={searching}
              className="w-full flex items-center justify-center gap-2 bg-[#C9A84C] text-[#061320] font-bold
                py-3.5 rounded-xl hover:bg-[#e0b85c] transition-colors disabled:opacity-60 text-sm"
            >
              {searching
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Searching…</>
                : <><MapPin className="w-4 h-4" /> Search Activities</>}
            </button>
          </form>
        </div>
      )}

      {/* ══ Step 1: Results ═════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">
              <span className="text-white font-semibold">{results.length}</span> activities — {searchForm.destination}
            </p>
          </div>

          {results.length === 0 ? (
            <div className="bg-[#0a1929] border border-[#1a2f4a] rounded-2xl p-12 text-center">
              <MapPin className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No activities found for {searchForm.destination}</p>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="mt-4 text-sm text-[#C9A84C] hover:text-[#e0b85c] transition-colors"
              >
                Try a different search
              </button>
            </div>
          ) : (
            results.map(activity => {
              const imageUrl  = activity.images?.[0]?.url
              const net       = activity.supplierNetPrice ?? 0
              const walzPrice = net > 0
                ? calculateBookingPrice({
                    productType: 'ACTIVITY',
                    supplier:    activitySupplier(activity.supplier),
                    netAmount:   net,
                    currency:    activity.currency,
                  })
                : null
              const isSelected = selected?.id === activity.id

              return (
                <div
                  key={activity.id}
                  className={`bg-[#0a1929] rounded-2xl border transition-all ${
                    isSelected ? 'border-[#C9A84C]' : 'border-[#1a2f4a] hover:border-[#2a3f5f]'
                  }`}
                >
                  <div className="flex gap-4 p-4">
                    {imageUrl && (
                      <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                        <Image src={imageUrl} alt={activity.title} fill className="object-cover" sizes="96px" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-semibold text-white text-sm leading-snug">{activity.title}</p>
                        <SupplierBadge supplier={activity.supplier} />
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-2">
                        {activity.rating != null && (
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="text-gray-300">{activity.rating.toFixed(1)}</span>
                            {activity.reviewCount ? <span>({activity.reviewCount.toLocaleString()})</span> : null}
                          </span>
                        )}
                        {activity.duration?.text && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />{activity.duration.text}
                          </span>
                        )}
                        {activity.destination?.name && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{activity.destination.name}
                          </span>
                        )}
                      </div>

                      {activity.description && (
                        <p className="text-xs text-gray-500 line-clamp-2 mb-3">{activity.description}</p>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="bg-[#061320] rounded-lg p-2 text-center border border-[#1a2f4a]">
                          <p className="text-gray-500">Net Cost</p>
                          <p className="font-bold text-gray-300 mt-0.5">
                            {net > 0 ? fmtPrice(net, activity.currency) : '—'}
                          </p>
                        </div>
                        <div className="bg-[#C9A84C]/10 rounded-lg p-2 text-center border border-[#C9A84C]/20">
                          <p className="text-gray-400">Walz Price</p>
                          <p className="font-bold text-[#C9A84C] mt-0.5">
                            {walzPrice
                              ? fmtPrice(walzPrice.sellingPrice, activity.currency)
                              : fmtPrice(activity.sellingPrice, activity.currency)}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => loadAvailability(activity)}
                        className="w-full text-xs font-bold bg-[#C9A84C] text-[#061320] py-2 rounded-xl
                          hover:bg-[#e0b85c] transition-colors"
                      >
                        Select &amp; Check Availability →
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ══ Step 2: Options (availability) ══════════════════════════════════ */}
      {step === 2 && selected && (
        <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6 space-y-5">

          {/* Activity header */}
          <div className="flex gap-4 pb-5 border-b border-[#1a2f4a]">
            {selected.images?.[0]?.url && (
              <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                <Image
                  src={selected.images[0].url}
                  alt={selected.title}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="mb-1"><SupplierBadge supplier={selected.supplier} /></div>
              <p className="font-bold text-white text-sm">{selected.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {selected.destination?.name ?? searchForm.destination}
              </p>
            </div>
          </div>

          {/* Loading */}
          {loadingOptions && (
            <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Loading available options…</span>
            </div>
          )}

          {/* No options */}
          {!loadingOptions && options.length === 0 && (
            <div className="text-center py-10">
              <AlertCircle className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-white font-semibold">No options available</p>
              <p className="text-sm text-gray-500 mt-1">Contact supplier directly or try different dates.</p>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="mt-4 text-sm text-[#C9A84C] hover:text-[#e0b85c] transition-colors"
              >
                ← Back to results
              </button>
            </div>
          )}

          {/* Options list */}
          {!loadingOptions && options.length > 0 && (
            <>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Available Options — {searchForm.dateFrom || 'Any date'}
              </p>
              <div className="space-y-2">
                {options.map(opt => {
                  const isChosen = selectedOption?.code === opt.code
                  const net = opt.supplierNetPrice ?? 0
                  return (
                    <div
                      key={opt.code}
                      className={`border-2 rounded-xl p-4 transition-all ${
                        isChosen
                          ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                          : 'border-[#1a2f4a] bg-[#061320]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-white text-sm">{opt.name}</p>
                          {opt.duration && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              <Clock className="w-3 h-3 inline mr-1" />{opt.duration}
                            </p>
                          )}
                          {opt.startTimes && opt.startTimes.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {opt.startTimes.slice(0, 4).join(' · ')}
                              {opt.startTimes.length > 4 ? ` +${opt.startTimes.length - 4} more` : ''}
                            </p>
                          )}
                          {opt.freeCancellation && (
                            <p className="text-xs text-emerald-400 font-medium mt-1">Free cancellation</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-gray-500">Net</p>
                          <p className="font-bold text-white text-sm">
                            {net > 0 ? fmtPrice(net, opt.currency) : '—'}
                          </p>
                          <button
                            type="button"
                            onClick={() => setSelectedOption(opt)}
                            className={`mt-2 text-xs font-bold px-3 py-1 rounded-lg transition-colors ${
                              isChosen
                                ? 'bg-[#C9A84C] text-[#061320]'
                                : 'bg-[#1a2f4a] text-white hover:bg-[#2a3f5f]'
                            }`}
                          >
                            {isChosen ? '✓ Selected' : 'Select'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {selectedOption && (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="w-full bg-[#C9A84C] text-[#061320] font-bold py-3 rounded-xl
                    hover:bg-[#e0b85c] transition-colors text-sm"
                >
                  Continue → Client Details
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ Step 3: Client ══════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6 space-y-5">
          <div>
            <h2 className="text-white font-bold text-lg">Select Client</h2>
            <p className="text-gray-500 text-sm mt-1">
              Search for an existing client or create a new one.
            </p>
          </div>

          <CustomerSelector
            value={customer}
            onChange={setCustomer}
            required
          />

          {customer && (
            <button
              type="button"
              onClick={() => setStep(4)}
              className="w-full bg-[#C9A84C] text-[#061320] font-bold py-3 rounded-xl
                hover:bg-[#e0b85c] transition-colors text-sm"
            >
              Continue → Pricing
            </button>
          )}
        </div>
      )}

      {/* ══ Step 4: Pricing ═════════════════════════════════════════════════ */}
      {step === 4 && (
        <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6 space-y-5">
          <div>
            <h2 className="text-white font-bold text-lg">Pricing</h2>
            <p className="text-gray-500 text-sm mt-1">Adjust markup, service fee, and discount.</p>
          </div>

          {/* Markup */}
          <div className="bg-[#061320] rounded-xl border border-[#1a2f4a] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Markup %</p>
                <p className="text-xs text-gray-500 mt-0.5">Default: 18% for VIATOR activities</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={markupPct}
                  min={0}
                  max={200}
                  step={0.5}
                  onChange={e => setMarkupPct(Number(e.target.value))}
                  className="w-20 text-right bg-[#0a1929] border border-[#1a2f4a] rounded-lg px-3 py-1.5
                    text-sm text-white focus:outline-none focus:border-[#C9A84C]"
                />
                <span className="text-gray-400 text-sm">%</span>
              </div>
            </div>

            {pricing && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-[#0a1929] rounded-lg p-2 text-center border border-[#1a2f4a]">
                  <p className="text-gray-500">Net Cost</p>
                  <p className="font-bold text-gray-300 mt-0.5">{fmtPrice(pricing.supplierCost, pricing.currency)}</p>
                </div>
                <div className="bg-[#0a1929] rounded-lg p-2 text-center border border-[#1a2f4a]">
                  <p className="text-gray-500">Markup</p>
                  <p className="font-bold text-gray-300 mt-0.5">{fmtPrice(pricing.markupAmount, pricing.currency)}</p>
                </div>
                <div className="bg-[#C9A84C]/10 rounded-lg p-2 text-center border border-[#C9A84C]/20">
                  <p className="text-[#C9A84C]/70">Sell Price</p>
                  <p className="font-bold text-[#C9A84C] mt-0.5">{fmtPrice(pricing.sellingPrice, pricing.currency)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Service fee + discount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                Service Fee {pricing ? `(${pricing.currency})` : ''}
              </label>
              <input
                type="number"
                value={serviceFee}
                min={0}
                step={0.01}
                onChange={e => setServiceFee(Number(e.target.value))}
                className="w-full bg-[#061320] border border-[#1a2f4a] rounded-xl px-4 py-3 text-white text-sm
                  focus:outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                Discount {pricing ? `(${pricing.currency})` : ''}
              </label>
              <input
                type="number"
                value={discount}
                min={0}
                step={0.01}
                onChange={e => setDiscount(Number(e.target.value))}
                className="w-full bg-[#061320] border border-[#1a2f4a] rounded-xl px-4 py-3 text-white text-sm
                  focus:outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>
          </div>

          {/* Margin warning */}
          {pricing && pricing.marginPercent < 5 && (
            <div className="flex items-center gap-2 bg-red-900/20 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Margin is {pricing.marginPercent.toFixed(1)}% — below 5%. Super admin approval may be required.
            </div>
          )}

          {/* Payment method */}
          <div>
            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
              Payment Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(m => {
                const Icon = m.icon
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setPaymentMethod(m.value)}
                    className={`flex items-center gap-2.5 border-2 rounded-xl p-3 text-sm font-semibold transition-all ${
                      paymentMethod === m.value
                        ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-white'
                        : 'border-[#1a2f4a] text-gray-500 hover:border-[#2a3f5f]'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {(paymentMethod === 'MARK_PAID' || paymentMethod === 'BANK_TRANSFER') && (
            <input
              type="text"
              value={paymentRef}
              onChange={e => setPaymentRef(e.target.value)}
              placeholder="Payment reference (optional)"
              className="w-full bg-[#061320] border border-[#1a2f4a] rounded-xl px-4 py-3 text-white text-sm
                placeholder-gray-600 focus:outline-none focus:border-[#C9A84C] transition-colors"
            />
          )}

          {/* Internal notes */}
          <div>
            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
              Internal Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes (optional)"
              rows={3}
              className="w-full bg-[#061320] border border-[#1a2f4a] rounded-xl px-4 py-3 text-white text-sm
                placeholder-gray-600 focus:outline-none focus:border-[#C9A84C] transition-colors resize-none"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              if (!bookingAttemptRef.current) bookingAttemptRef.current = crypto.randomUUID()
              setStep(5)
            }}
            className="w-full bg-[#C9A84C] text-[#061320] font-bold py-3 rounded-xl
              hover:bg-[#e0b85c] transition-colors text-sm"
          >
            Review Booking →
          </button>
        </div>
      )}

      {/* ══ Step 5: Confirm ═════════════════════════════════════════════════ */}
      {step === 5 && selected && selectedOption && customer && pricing && (
        <div className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] p-6 space-y-5">
          <div>
            <h2 className="text-white font-bold text-lg">Confirm Booking</h2>
            <p className="text-gray-500 text-sm mt-1">Review all details before confirming.</p>
          </div>

          {/* Full review table */}
          <div className="bg-[#061320] rounded-xl border border-[#1a2f4a] divide-y divide-[#1a2f4a]">
            {[
              { label: 'Activity',     value: selected.title },
              { label: 'Supplier',     value: selected.supplier },
              { label: 'Product Code', value: selected.supplierProductId },
              { label: 'Option',       value: selectedOption.name },
              { label: 'Location',     value: selected.destination?.name ?? searchForm.destination },
              { label: 'Travel Date',  value: searchForm.dateFrom || '—' },
              { label: 'Travellers',   value: travellersStr },
              { label: 'Client',       value: customer.name },
              { label: 'Email',        value: customer.email },
              ...(customer.phone ? [{ label: 'Phone', value: customer.phone }] : []),
              { label: 'Supplier Cost', value: fmtPrice(pricing.supplierCost, pricing.currency) },
              { label: `Markup (${pricing.markupPercent}%)`, value: fmtPrice(pricing.markupAmount, pricing.currency) },
              ...(pricing.serviceFee > 0 ? [{ label: 'Service Fee', value: fmtPrice(pricing.serviceFee, pricing.currency) }] : []),
              ...(pricing.discount > 0 ? [{ label: 'Discount', value: `−${fmtPrice(pricing.discount, pricing.currency)}` }] : []),
              { label: 'Customer Total', value: fmtPrice(pricing.sellingPrice, pricing.currency), highlight: true },
              { label: 'Payment Method', value: PAYMENT_METHODS.find(m => m.value === paymentMethod)?.label ?? paymentMethod },
              ...(paymentRef ? [{ label: 'Payment Ref', value: paymentRef }] : []),
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between px-4 py-2.5 gap-3">
                <span className="text-xs text-gray-500 flex-shrink-0">{row.label}</span>
                <span className={`text-xs font-medium text-right min-w-0 truncate ${
                  row.highlight ? 'text-[#C9A84C] font-bold text-sm' : 'text-white'
                }`}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {notes && (
            <div className="bg-[#061320] rounded-xl border border-[#1a2f4a] px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">Internal Notes</p>
              <p className="text-xs text-gray-300">{notes}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleConfirmBooking}
            disabled={confirming}
            className="w-full flex items-center justify-center gap-2 bg-[#C9A84C] text-[#061320] font-bold
              py-4 rounded-xl hover:bg-[#e0b85c] transition-colors text-base disabled:opacity-60"
          >
            {confirming
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Booking…</>
              : 'Confirm Booking'}
          </button>

          {confirming && (
            <p className="text-center text-xs text-gray-500">
              Please do not close this window.
            </p>
          )}
        </div>
      )}
    </AdminBookingShell>
  )
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function AdminActivityBookingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#061320] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
        </div>
      }
    >
      <ActivityBookingContent />
    </Suspense>
  )
}
