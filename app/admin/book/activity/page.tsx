'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  MapPin, ArrowLeft, Search, Star, Clock, CheckCircle,
  AlertCircle, Loader2, ExternalLink, Filter, User, UserPlus,
  CreditCard, DollarSign, Building2, ChevronDown, ChevronUp,
  Wifi, WifiOff, RefreshCw, Calendar, Users, Tag
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import type { NormalizedActivity, ActivityOption } from '@/lib/activities/types'

// ── Types ────────────────────────────────────────────────────────────────────

type Step = 'search' | 'results' | 'availability' | 'client' | 'pricing' | 'payment' | 'confirming' | 'done'

interface SearchForm {
  destination: string
  dateFrom:    string
  dateTo:      string
  adults:      number
  children:    number
  infants:     number
  currency:    string
}

interface SupplierStatus { connected: boolean; checking: boolean; error?: string }

interface ActivityAvailability {
  available: boolean
  options:   ActivityOption[]
  currency:  string
  error?:    string
}

interface Client {
  id:    string
  name:  string
  email: string
  phone?: string
}

interface PricingState {
  supplierNetPrice: number
  currency:         string
  defaultMarkupPct: number
  defaultSellPrice: number
  staffSellPrice:   number
  grossProfit:      number
  margin:           number
  priceChanged:     boolean
  priceAcknowledged: boolean
}

interface BookingDone {
  walzReference:     string
  bookingId:         string
  supplierReference?: string
}

const CURRENCIES = ['GBP','USD','EUR','CAD','AED','NGN','GHS','KES','ZAR','AUD','SGD','JPY']
const PAYMENT_METHODS = [
  { value: 'STRIPE_LINK',   label: 'Stripe Payment Link',  icon: CreditCard },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer',         icon: Building2 },
  { value: 'MARK_PAID',     label: 'Mark as Paid',          icon: DollarSign },
  { value: 'PAY_LATER',     label: 'Invoice / Pay Later',   icon: Calendar },
]

const DEFAULT_MARKUP_PCT = 20

// ── Helpers ───────────────────────────────────────────────────────────────────

function supplierBadge(supplier: string, size: 'sm' | 'xs' = 'xs') {
  const cls = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-xs'
  return supplier === 'VIATOR'
    ? <span className={`${cls} font-bold bg-emerald-100 text-emerald-700 rounded-full`}>Viator</span>
    : supplier === 'HOTELBEDS'
    ? <span className={`${cls} font-bold bg-blue-100 text-blue-700 rounded-full`}>Hotelbeds</span>
    : <span className={`${cls} font-bold bg-gray-100 text-gray-600 rounded-full`}>Manual</span>
}

function fmtPrice(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function calcMarkup(net: number, pct: number) {
  const markup = net * (pct / 100)
  const sell   = net + markup
  const profit = sell - net
  const margin = sell > 0 ? (profit / sell) * 100 : 0
  return { sell: Math.round(sell * 100) / 100, profit: Math.round(profit * 100) / 100, margin: Math.round(margin * 100) / 100 }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminActivityBookingPage() {
  const [step,           setStep]         = useState<Step>('search')
  const [searchForm,     setSearchForm]   = useState<SearchForm>({
    destination: '', dateFrom: '', dateTo: '', adults: 1, children: 0, infants: 0, currency: 'GBP',
  })
  const [results,        setResults]      = useState<NormalizedActivity[]>([])
  const [searchMeta,     setSearchMeta]   = useState<{ hotelbeds?: { count: number; error?: string }; viator?: { count: number; error?: string } } | null>(null)
  const [searching,      setSearching]    = useState(false)
  const [filterSupplier, setFilterSupplier] = useState<'ALL' | 'HOTELBEDS' | 'VIATOR'>('ALL')
  const [filterFreeCancel, setFilterFreeCancel] = useState(false)
  const [filterInstant,  setFilterInstant]  = useState(false)
  const [showFilters,    setShowFilters]    = useState(false)

  const [selected,       setSelected]     = useState<NormalizedActivity | null>(null)
  const [availability,   setAvailability] = useState<ActivityAvailability | null>(null)
  const [loadingAvail,   setLoadingAvail] = useState(false)
  const [selectedOption, setSelectedOption] = useState<ActivityOption | null>(null)

  const [clientSearch,   setClientSearch] = useState('')
  const [clientResults,  setClientResults] = useState<Client[]>([])
  const [searchingClient, setSearchingClient] = useState(false)
  const [client,          setClient]      = useState<Client | null>(null)
  const [newClientMode,   setNewClientMode] = useState(false)
  const [newClient,       setNewClient]   = useState({ firstName: '', lastName: '', email: '', phone: '' })

  const [pricing,        setPricing]      = useState<PricingState | null>(null)
  const [staffSellInput, setStaffSellInput] = useState('')
  const [internalNotes,  setInternalNotes] = useState('')

  const [paymentMethod,  setPaymentMethod] = useState('MARK_PAID')
  const [paymentRef,     setPaymentRef]   = useState('')
  const [paymentNote,    setPaymentNote]  = useState('')

  const [booking,        setBooking]      = useState(false)
  const [done,           setDone]         = useState<BookingDone | null>(null)
  const [error,          setError]        = useState('')

  // Supplier status
  const [hbStatus,     setHbStatus]      = useState<SupplierStatus>({ connected: false, checking: false })
  const [viatorStatus, setViatorStatus]  = useState<SupplierStatus>({ connected: false, checking: false })

  // Idempotency — generated once when entering payment step
  const bookingAttemptRef = useRef<string | null>(null)
  const submitLock = useRef(false)

  const today = new Date().toISOString().split('T')[0]

  // ── Supplier status check ──────────────────────────────────────────────────

  const checkSupplierStatus = useCallback(async () => {
    setViatorStatus(s => ({ ...s, checking: true }))
    setHbStatus(s => ({ ...s, checking: true }))

    // Hotelbeds — infer from search (no dedicated ping endpoint)
    setHbStatus({ connected: true, checking: false })

    // Viator — use the diagnostic endpoint
    try {
      const res  = await fetch('/api/admin/viator-test')
      const data = await res.json()
      if (res.ok && data.httpStatus === 200) {
        setViatorStatus({ connected: true, checking: false })
      } else {
        setViatorStatus({ connected: false, checking: false, error: data.viatorResponse?.message ?? 'API error' })
      }
    } catch {
      setViatorStatus({ connected: false, checking: false, error: 'Network error' })
    }
  }, [])

  useEffect(() => { checkSupplierStatus() }, [checkSupplierStatus])

  // ── Search ─────────────────────────────────────────────────────────────────

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSearching(true)
    setResults([])
    setSearchMeta(null)
    setSelected(null)
    setAvailability(null)
    setSelectedOption(null)

    try {
      const res  = await fetch('/api/admin/activities/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          destination: searchForm.destination,
          dateFrom:    searchForm.dateFrom  || undefined,
          dateTo:      searchForm.dateTo    || undefined,
          adults:      searchForm.adults,
          children:    searchForm.children,
          currency:    searchForm.currency,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setResults(data.activities ?? [])
      setSearchMeta(data.meta)
      setStep('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  // ── Filtered results ───────────────────────────────────────────────────────

  const filteredResults = results.filter(a => {
    if (filterSupplier !== 'ALL' && a.supplier !== filterSupplier) return false
    if (filterFreeCancel && !a.freeCancellation)                   return false
    if (filterInstant    && !a.instantConfirmation)                return false
    return true
  })

  // ── Availability ───────────────────────────────────────────────────────────

  async function loadAvailability(activity: NormalizedActivity) {
    setSelected(activity)
    setAvailability(null)
    setSelectedOption(null)
    setStep('availability')
    setLoadingAvail(true)

    try {
      const res  = await fetch('/api/admin/activities/availability', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          supplier:          activity.supplier,
          supplierProductId: activity.supplierProductId,
          destination:       activity.destination?.name ?? searchForm.destination,
          date:              searchForm.dateFrom || today,
          adults:            searchForm.adults,
          children:          searchForm.children,
          infants:           searchForm.infants,
          currency:          searchForm.currency,
        }),
      })
      const data = await res.json()
      setAvailability(data)

      // If only one option, auto-select it
      if (data.available && data.options?.length === 1) {
        setSelectedOption(data.options[0])
        initPricing(data.options[0], activity)
      }
    } catch (err) {
      setAvailability({ available: false, options: [], currency: searchForm.currency, error: err instanceof Error ? err.message : 'Unavailable' })
    } finally {
      setLoadingAvail(false)
    }
  }

  function selectOption(opt: ActivityOption) {
    setSelectedOption(opt)
    if (selected) initPricing(opt, selected)
  }

  function initPricing(opt: ActivityOption, activity: NormalizedActivity) {
    const net      = opt.supplierNetPrice ?? activity.supplierNetPrice ?? 0
    const currency = opt.currency || activity.currency
    const { sell, profit, margin } = calcMarkup(net, DEFAULT_MARKUP_PCT)
    const prev     = activity.sellingPrice

    setPricing({
      supplierNetPrice:  net,
      currency,
      defaultMarkupPct:  DEFAULT_MARKUP_PCT,
      defaultSellPrice:  sell,
      staffSellPrice:    sell,
      grossProfit:       profit,
      margin,
      priceChanged:      Math.abs(sell - prev) > 0.5,
      priceAcknowledged: false,
    })
    setStaffSellInput(sell.toFixed(2))
  }

  function onSellPriceChange(val: string) {
    setStaffSellInput(val)
    const sell = parseFloat(val)
    if (!isNaN(sell) && pricing) {
      const profit = sell - pricing.supplierNetPrice
      const margin = sell > 0 ? (profit / sell) * 100 : 0
      setPricing(p => p ? { ...p, staffSellPrice: sell, grossProfit: profit, margin } : p)
    }
  }

  // ── Client search ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!clientSearch || clientSearch.length < 3) { setClientResults([]); return }
    const t = setTimeout(async () => {
      setSearchingClient(true)
      try {
        const res  = await fetch(`/api/admin/clients?search=${encodeURIComponent(clientSearch)}&page=1`)
        const data = await res.json()
        const users = (data.users ?? data.clients ?? []).slice(0, 6).map((u: { id: string; name?: string; firstName?: string; lastName?: string; email: string; phone?: string }) => ({
          id:    u.id,
          name:  u.name ?? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
          email: u.email,
          phone: u.phone,
        }))
        setClientResults(users)
      } catch { setClientResults([]) }
      setSearchingClient(false)
    }, 400)
    return () => clearTimeout(t)
  }, [clientSearch])

  async function createClient() {
    if (!newClient.email || !newClient.firstName) {
      setError('First name and email are required'); return
    }
    try {
      const res  = await fetch('/api/admin/clients', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:  `${newClient.firstName} ${newClient.lastName}`.trim(),
          email: newClient.email,
          phone: newClient.phone || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create client')
      setClient({ id: data.user?.id ?? data.id, name: `${newClient.firstName} ${newClient.lastName}`.trim(), email: newClient.email, phone: newClient.phone })
      setNewClientMode(false)
      setStep('pricing')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create client')
    }
  }

  // ── Generate booking attempt ID (idempotency) ──────────────────────────────

  function enterPaymentStep() {
    if (!bookingAttemptRef.current) {
      bookingAttemptRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    }
    setStep('payment')
  }

  // ── Confirm booking ────────────────────────────────────────────────────────

  async function handleConfirmBooking() {
    if (!selected || !client || !pricing || submitLock.current) return
    submitLock.current = true
    setBooking(true)
    setError('')
    setStep('confirming')

    try {
      const res  = await fetch('/api/admin/activities/book', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          supplier:          selected.supplier,
          supplierProductId: selected.supplierProductId,
          supplierReference: selectedOption?.availabilityToken ?? undefined,
          activityTitle:     selected.title,
          location:          selected.destination?.name ?? searchForm.destination,
          travelDate:        searchForm.dateFrom || undefined,
          adults:            searchForm.adults,
          children:          searchForm.children,
          infants:           searchForm.infants,
          clientName:        client.name,
          clientEmail:       client.email,
          clientPhone:       client.phone ?? undefined,
          totalAmount:       pricing.staffSellPrice,
          supplierNetAmount: pricing.supplierNetPrice,
          markupAmount:      pricing.grossProfit,
          currency:          pricing.currency,
          paymentMethod,
          paymentRef:        paymentRef || undefined,
          notes:             internalNotes || undefined,
          bookingAttemptId:  bookingAttemptRef.current ?? undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Booking failed')
      setDone({ walzReference: data.walzReference, bookingId: data.bookingId, supplierReference: data.supplierReference })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed')
      setStep('payment')
      submitLock.current = false
    } finally {
      setBooking(false)
    }
  }

  function reset() {
    setStep('search')
    setSearchForm({ destination: '', dateFrom: '', dateTo: '', adults: 1, children: 0, infants: 0, currency: 'GBP' })
    setResults([])
    setSearchMeta(null)
    setSelected(null)
    setAvailability(null)
    setSelectedOption(null)
    setClient(null)
    setClientSearch('')
    setClientResults([])
    setNewClientMode(false)
    setNewClient({ firstName: '', lastName: '', email: '', phone: '' })
    setPricing(null)
    setInternalNotes('')
    setPaymentMethod('MARK_PAID')
    setPaymentRef('')
    setPaymentNote('')
    setDone(null)
    setError('')
    bookingAttemptRef.current = null
    submitLock.current = false
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto pb-16">

      {/* Back + header */}
      <Link href="/admin/book" className="flex items-center gap-2 text-gray-400 hover:text-[#0B1F3A] text-sm mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to Booking Centre
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-[#0B1F3A] text-xl">Book an Activity</h1>
            <p className="text-gray-400 text-xs">Hotelbeds + Viator · Live search & booking</p>
          </div>
        </div>

        {/* Supplier status */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            {hbStatus.checking
              ? <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
              : hbStatus.connected
              ? <Wifi className="w-3 h-3 text-emerald-500" />
              : <WifiOff className="w-3 h-3 text-red-400" />}
            <span className={hbStatus.connected ? 'text-emerald-600 font-medium' : 'text-gray-400'}>Hotelbeds</span>
          </div>
          <div className="flex items-center gap-1.5">
            {viatorStatus.checking
              ? <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
              : viatorStatus.connected
              ? <Wifi className="w-3 h-3 text-emerald-500" />
              : <WifiOff className="w-3 h-3 text-red-400" />}
            <span className={viatorStatus.connected ? 'text-emerald-600 font-medium' : 'text-gray-400'}>Viator</span>
          </div>
          <button onClick={checkSupplierStatus} className="text-gray-400 hover:text-gray-600">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Step indicator */}
      {step !== 'search' && step !== 'confirming' && step !== 'done' && (
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-5 flex-wrap">
          {[
            ['results', 'Results'],
            ['availability', 'Availability'],
            ['client', 'Client'],
            ['pricing', 'Pricing'],
            ['payment', 'Payment'],
          ].map(([s, label]) => {
            const steps: Step[] = ['results','availability','client','pricing','payment']
            const idx     = steps.indexOf(s as Step)
            const current = steps.indexOf(step as Step)
            const done    = idx < current
            const active  = idx === current
            return (
              <span key={s} className="flex items-center gap-1">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
                  ${done ? 'bg-emerald-500 text-white' : active ? 'bg-[#0B1F3A] text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {done ? '✓' : idx + 1}
                </span>
                <span className={active ? 'text-[#0B1F3A] font-semibold' : done ? 'text-emerald-600' : ''}>{label}</span>
                {idx < 4 && <span className="text-gray-200">›</span>}
              </span>
            )
          })}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 1 — SEARCH
      ══════════════════════════════════════════════════════════ */}
      {(step === 'search' || step === 'results') && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-5">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <input
                value={searchForm.destination}
                onChange={e => setSearchForm(f => ({ ...f, destination: e.target.value }))}
                placeholder="Destination city (e.g. Dubai, London, Cape Town)" required
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-400 font-semibold">From</label>
                <input type="date" value={searchForm.dateFrom} min={today}
                  onChange={e => setSearchForm(f => ({ ...f, dateFrom: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold">To</label>
                <input type="date" value={searchForm.dateTo} min={searchForm.dateFrom || today}
                  onChange={e => setSearchForm(f => ({ ...f, dateTo: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold">Currency</label>
                <select value={searchForm.currency} onChange={e => setSearchForm(f => ({ ...f, currency: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1 bg-white">
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold">Adults</label>
                <input type="number" value={searchForm.adults} min={1} max={20}
                  onChange={e => setSearchForm(f => ({ ...f, adults: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold">Children</label>
                <input type="number" value={searchForm.children} min={0} max={10}
                  onChange={e => setSearchForm(f => ({ ...f, children: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold">Infants</label>
                <input type="number" value={searchForm.infants} min={0} max={10}
                  onChange={e => setSearchForm(f => ({ ...f, infants: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
              </div>
            </div>

            <button type="submit" disabled={searching}
              className="w-full flex items-center justify-center gap-2 bg-[#0B1F3A] text-white font-bold py-3 rounded-xl hover:bg-[#1a3a6e] transition-colors disabled:opacity-60">
              {searching ? <><Loader2 className="w-4 h-4 animate-spin" /> Searching Hotelbeds &amp; Viator…</> : <><Search className="w-4 h-4" /> Search Activities</>}
            </button>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 2 — RESULTS
      ══════════════════════════════════════════════════════════ */}
      {step === 'results' && (
        <>
          {/* Summary + filters */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-2 text-xs flex-wrap">
              {searchMeta?.hotelbeds && (
                <span className={`px-3 py-1 rounded-full border ${searchMeta.hotelbeds.error ? 'bg-red-50 border-red-200 text-red-600' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                  Hotelbeds: {searchMeta.hotelbeds.count} {searchMeta.hotelbeds.error ? '⚠' : ''}
                </span>
              )}
              {searchMeta?.viator && (
                <span className={`px-3 py-1 rounded-full border ${searchMeta.viator.error ? 'bg-red-50 border-red-200 text-red-600' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                  Viator: {searchMeta.viator.count} {searchMeta.viator.error ? '⚠' : ''}
                </span>
              )}
            </div>
            <button onClick={() => setShowFilters(f => !f)}
              className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
              <Filter className="w-3 h-3" />
              Filters
              {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {showFilters && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap gap-4 text-sm">
              <div>
                <label className="text-xs text-gray-400 font-semibold block mb-1">Supplier</label>
                <div className="flex gap-2">
                  {(['ALL','HOTELBEDS','VIATOR'] as const).map(s => (
                    <button key={s} onClick={() => setFilterSupplier(s)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${filterSupplier === s ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                      {s === 'ALL' ? 'All' : s === 'VIATOR' ? 'Viator' : 'Hotelbeds'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
                  <input type="checkbox" checked={filterFreeCancel} onChange={e => setFilterFreeCancel(e.target.checked)} className="rounded" />
                  Free cancellation
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
                  <input type="checkbox" checked={filterInstant} onChange={e => setFilterInstant(e.target.checked)} className="rounded" />
                  Instant confirmation
                </label>
              </div>
            </div>
          )}

          {filteredResults.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              {results.length === 0 ? `No activities found for ${searchForm.destination}` : 'No results match the current filters'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredResults.map(activity => (
                <div key={activity.id}
                  className="bg-white rounded-2xl border border-gray-200 p-4 flex gap-4 hover:border-[#C9A84C] hover:shadow-sm transition-all">
                  {activity.images?.[0]?.url && (
                    <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                      <Image src={activity.images[0].url} alt={activity.title} fill className="object-cover" sizes="96px" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-[#0B1F3A] text-sm leading-snug">{activity.title}</p>
                      {supplierBadge(activity.supplier)}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mb-2">
                      {activity.rating && (
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          {activity.rating.toFixed(1)}
                          {activity.reviewCount ? ` (${activity.reviewCount.toLocaleString()})` : ''}
                        </span>
                      )}
                      {activity.duration?.text && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{activity.duration.text}</span>
                      )}
                      {activity.freeCancellation && <span className="text-emerald-600 font-medium">Free cancel</span>}
                      {activity.instantConfirmation && <span className="text-blue-600 font-medium">Instant</span>}
                      <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{activity.supplierProductId}</span>
                    </div>

                    {/* Admin pricing row */}
                    <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                      <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className="text-gray-400">Supplier Net</p>
                        <p className="font-bold text-gray-700 mt-0.5">
                          {activity.supplierNetPrice ? fmtPrice(activity.supplierNetPrice, activity.currency) : '—'}
                        </p>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-2 text-center">
                        <p className="text-gray-400">Walz Price</p>
                        <p className="font-bold text-amber-700 mt-0.5">{fmtPrice(activity.sellingPrice, activity.currency)}</p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-2 text-center">
                        <p className="text-gray-400">Gross Profit</p>
                        <p className="font-bold text-emerald-700 mt-0.5">
                          {activity.supplierNetPrice
                            ? fmtPrice(activity.sellingPrice - activity.supplierNetPrice, activity.currency)
                            : '—'}
                        </p>
                      </div>
                    </div>

                    <button onClick={() => loadAvailability(activity)}
                      className="w-full text-xs font-bold bg-[#0B1F3A] text-white py-2 rounded-xl hover:bg-[#1a3a6e] transition-colors">
                      Check Live Availability →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 3 — AVAILABILITY
      ══════════════════════════════════════════════════════════ */}
      {step === 'availability' && selected && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <button onClick={() => setStep('results')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#0B1F3A]">
            <ArrowLeft className="w-4 h-4" /> Back to results
          </button>

          {/* Activity summary */}
          <div className="flex gap-4 pb-4 border-b border-gray-100">
            {selected.images?.[0]?.url && (
              <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                <Image src={selected.images[0].url} alt={selected.title} fill className="object-cover" sizes="80px" />
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">{supplierBadge(selected.supplier, 'sm')}</div>
              <p className="font-bold text-[#0B1F3A] text-sm">{selected.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{selected.destination?.name ?? searchForm.destination}</p>
              <p className="text-xs text-gray-400">
                <Users className="w-3 h-3 inline mr-1" />
                {searchForm.adults} adult{searchForm.adults !== 1 ? 's' : ''}
                {searchForm.children ? ` · ${searchForm.children} child${searchForm.children !== 1 ? 'ren' : ''}` : ''}
                {searchForm.dateFrom ? ` · ${searchForm.dateFrom}` : ''}
              </p>
            </div>
          </div>

          {loadingAvail && (
            <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Checking live availability…</span>
            </div>
          )}

          {!loadingAvail && availability && !availability.available && (
            <div className="text-center py-8">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <p className="font-semibold text-gray-700">Not available</p>
              <p className="text-sm text-gray-400 mt-1">{availability.error ?? 'No options found for the selected dates'}</p>
              <button onClick={() => setStep('results')} className="mt-4 text-sm font-bold text-[#0B1F3A] border border-gray-200 rounded-xl px-4 py-2">
                Try another activity
              </button>
            </div>
          )}

          {!loadingAvail && availability?.available && (
            <>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Available Options — {searchForm.dateFrom || 'Any date'}
                </p>
                <div className="space-y-2">
                  {availability.options.map(opt => {
                    const isSelected = selectedOption?.code === opt.code
                    return (
                      <button key={opt.code} onClick={() => selectOption(opt)}
                        className={`w-full text-left border-2 rounded-xl p-3.5 transition-all ${isSelected ? 'border-[#C9A84C] bg-amber-50' : 'border-gray-100 hover:border-gray-300'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-sm text-[#0B1F3A]">{opt.name}</p>
                            {opt.duration && <p className="text-xs text-gray-400 mt-0.5"><Clock className="w-3 h-3 inline mr-1" />{opt.duration}</p>}
                            {opt.startTimes?.length ? (
                              <p className="text-xs text-gray-400 mt-0.5">{opt.startTimes.join(' · ')}</p>
                            ) : null}
                            {opt.freeCancellation && <p className="text-xs text-emerald-600 font-medium mt-0.5">Free cancellation</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-400">Supplier Net</p>
                            <p className="font-bold text-[#0B1F3A] text-sm">
                              {opt.supplierNetPrice ? fmtPrice(opt.supplierNetPrice, opt.currency) : '—'}
                            </p>
                            {isSelected && <span className="text-xs text-amber-600 font-bold">✓ Selected</span>}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {selectedOption && (
                <button onClick={() => setStep('client')}
                  className="w-full bg-[#0B1F3A] text-white font-bold py-3 rounded-xl hover:bg-[#1a3a6e] transition-colors">
                  Continue → Client Details
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 4 — CLIENT
      ══════════════════════════════════════════════════════════ */}
      {step === 'client' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <button onClick={() => setStep('availability')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#0B1F3A]">
            <ArrowLeft className="w-4 h-4" /> Back to availability
          </button>

          <p className="font-bold text-[#0B1F3A] text-base">Client Details</p>

          {!client && !newClientMode && (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-gray-400" />
                <input
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="Search by name, email, or phone…"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C]"
                />
                {searchingClient && <Loader2 className="w-4 h-4 animate-spin absolute right-3.5 top-3 text-gray-400" />}
              </div>

              {clientResults.length > 0 && (
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                  {clientResults.map(c => (
                    <button key={c.id} onClick={() => { setClient(c); setStep('pricing') }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#0B1F3A]">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
                      </div>
                      <span className="ml-auto text-xs text-[#C9A84C] font-bold">Select →</span>
                    </button>
                  ))}
                </div>
              )}

              {clientSearch.length >= 3 && clientResults.length === 0 && !searchingClient && (
                <p className="text-sm text-gray-400 text-center py-2">No match found.</p>
              )}

              <button onClick={() => setNewClientMode(true)}
                className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-300 text-gray-500 font-semibold py-3 rounded-xl hover:bg-gray-50 text-sm">
                <UserPlus className="w-4 h-4" /> Create New Client
              </button>
            </>
          )}

          {/* New client form */}
          {newClientMode && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input value={newClient.firstName} onChange={e => setNewClient(c => ({ ...c, firstName: e.target.value }))}
                  placeholder="First name *"
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
                <input value={newClient.lastName} onChange={e => setNewClient(c => ({ ...c, lastName: e.target.value }))}
                  placeholder="Last name"
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
              </div>
              <input value={newClient.email} onChange={e => setNewClient(c => ({ ...c, email: e.target.value }))}
                type="email" placeholder="Email *"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
              <input value={newClient.phone} onChange={e => setNewClient(c => ({ ...c, phone: e.target.value }))}
                placeholder="Phone"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
              <div className="flex gap-3">
                <button onClick={() => setNewClientMode(false)} className="flex-1 border border-gray-200 text-gray-500 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={createClient} className="flex-1 bg-[#0B1F3A] text-white font-bold py-2.5 rounded-xl text-sm hover:bg-[#1a3a6e]">
                  Create &amp; Continue
                </button>
              </div>
            </div>
          )}

          {/* Selected client summary */}
          {client && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
                <User className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-emerald-800 text-sm">{client.name}</p>
                <p className="text-xs text-emerald-600">{client.email}{client.phone ? ` · ${client.phone}` : ''}</p>
              </div>
              <button onClick={() => setClient(null)} className="text-xs text-emerald-600 hover:text-emerald-800 font-bold">Change</button>
            </div>
          )}

          {client && (
            <button onClick={() => setStep('pricing')}
              className="w-full bg-[#0B1F3A] text-white font-bold py-3 rounded-xl hover:bg-[#1a3a6e] transition-colors">
              Continue → Pricing
            </button>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 5 — PRICING
      ══════════════════════════════════════════════════════════ */}
      {step === 'pricing' && selected && pricing && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <button onClick={() => setStep('client')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#0B1F3A]">
            <ArrowLeft className="w-4 h-4" /> Back to client
          </button>

          <p className="font-bold text-[#0B1F3A] text-base">Pricing</p>

          {/* Price change warning */}
          {pricing.priceChanged && !pricing.priceAcknowledged && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Live price differs from search result</p>
                <p className="text-xs mt-1 text-amber-700">
                  Search: {selected.supplierNetPrice ? fmtPrice(selected.supplierNetPrice, selected.currency) : '—'} →
                  Live: {fmtPrice(pricing.supplierNetPrice, pricing.currency)}
                </p>
                <button onClick={() => setPricing(p => p ? { ...p, priceAcknowledged: true } : p)}
                  className="mt-2 text-xs font-bold bg-amber-600 text-white px-3 py-1 rounded-lg">
                  Acknowledge &amp; Continue
                </button>
              </div>
            </div>
          )}

          {/* Pricing breakdown */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-gray-100 text-sm">
              {[
                ['Supplier', selected.supplier],
                ['Product Code', selected.supplierProductId],
                ['Option', selectedOption?.name ?? '—'],
                ['Date', searchForm.dateFrom || '—'],
              ].map(([label, val]) => (
                <div key={label} className="p-3">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="font-semibold text-[#0B1F3A] text-sm mt-0.5 truncate">{val}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Supplier Net Cost</span>
              <span className="font-bold text-gray-700">{fmtPrice(pricing.supplierNetPrice, pricing.currency)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Default Markup ({pricing.defaultMarkupPct}%)</span>
              <span className="font-semibold text-gray-600">{fmtPrice(pricing.defaultSellPrice - pricing.supplierNetPrice, pricing.currency)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Default Sell Price</span>
              <span className="font-semibold text-gray-600">{fmtPrice(pricing.defaultSellPrice, pricing.currency)}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-bold text-[#0B1F3A]">Staff Selling Price</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{pricing.currency}</span>
                <input
                  type="number"
                  value={staffSellInput}
                  onChange={e => onSellPriceChange(e.target.value)}
                  step="0.01"
                  min="0"
                  className="w-28 text-right border border-[#C9A84C] rounded-lg px-3 py-1.5 text-sm font-bold text-[#0B1F3A] focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">Gross Profit</p>
                <p className={`font-bold text-base mt-0.5 ${pricing.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmtPrice(pricing.grossProfit, pricing.currency)}
                </p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">Margin</p>
                <p className={`font-bold text-base mt-0.5 ${pricing.margin >= 5 ? 'text-blue-700' : 'text-red-600'}`}>
                  {pricing.margin.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          {pricing.margin < 5 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Margin below 5% — super admin approval may be required.
            </div>
          )}

          <textarea
            value={internalNotes}
            onChange={e => setInternalNotes(e.target.value)}
            placeholder="Internal notes (optional)"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] resize-none"
          />

          <button
            onClick={enterPaymentStep}
            disabled={pricing.priceChanged && !pricing.priceAcknowledged}
            className="w-full bg-[#0B1F3A] text-white font-bold py-3 rounded-xl hover:bg-[#1a3a6e] transition-colors disabled:opacity-50">
            Continue → Payment
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 6 — PAYMENT
      ══════════════════════════════════════════════════════════ */}
      {step === 'payment' && selected && client && pricing && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <button onClick={() => setStep('pricing')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#0B1F3A]">
            <ArrowLeft className="w-4 h-4" /> Back to pricing
          </button>

          <p className="font-bold text-[#0B1F3A] text-base">Payment</p>

          {/* Booking summary strip */}
          <div className="bg-[#F5F0E8] rounded-xl p-4 text-sm space-y-1">
            <p><span className="text-gray-500">Activity:</span> <span className="font-semibold text-[#0B1F3A]">{selected.title}</span></p>
            <p><span className="text-gray-500">Client:</span> <span className="font-semibold">{client.name} · {client.email}</span></p>
            <p><span className="text-gray-500">Date:</span> <span className="font-semibold">{searchForm.dateFrom || '—'}</span></p>
            <p><span className="text-gray-500">Amount due:</span> <span className="font-bold text-[#0B1F3A] text-base">{fmtPrice(pricing.staffSellPrice, pricing.currency)}</span></p>
          </div>

          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Payment Method</p>
          <div className="grid grid-cols-2 gap-3">
            {PAYMENT_METHODS.map(m => {
              const Icon = m.icon
              return (
                <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                  className={`flex items-center gap-2.5 border-2 rounded-xl p-3.5 text-sm font-semibold transition-all ${paymentMethod === m.value ? 'border-[#C9A84C] bg-amber-50 text-[#0B1F3A]' : 'border-gray-100 text-gray-500 hover:border-gray-300'}`}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {m.label}
                </button>
              )
            })}
          </div>

          {paymentMethod === 'BANK_TRANSFER' && (
            <div className="space-y-3">
              <input value={paymentRef} onChange={e => setPaymentRef(e.target.value)}
                placeholder="Bank transfer reference"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
              <textarea value={paymentNote} onChange={e => setPaymentNote(e.target.value)}
                placeholder="Internal note (e.g. confirmed in Walz CAD account)"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] resize-none" />
            </div>
          )}

          {paymentMethod === 'MARK_PAID' && (
            <input value={paymentRef} onChange={e => setPaymentRef(e.target.value)}
              placeholder="Reference (optional)"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
          )}

          {paymentMethod === 'PAY_LATER' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              <strong>Pay Later:</strong> A booking record will be created with payment status UNPAID.
              No supplier booking will be triggered until payment is confirmed.
            </div>
          )}

          <button onClick={handleConfirmBooking} disabled={booking}
            className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white font-bold py-3.5 rounded-xl hover:bg-amber-700 transition-colors text-base disabled:opacity-60">
            {booking
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating booking…</>
              : 'Confirm Booking'}
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 7 — CONFIRMING (loading)
      ══════════════════════════════════════════════════════════ */}
      {step === 'confirming' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-[#0B1F3A]" />
          <p className="font-bold text-[#0B1F3A]">Creating booking…</p>
          <p className="text-sm text-gray-400">Do not close this window or refresh.</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 8 — DONE
      ══════════════════════════════════════════════════════════ */}
      {step === 'done' && done && selected && pricing && client && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 space-y-6">
          <div className="text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-[#0B1F3A]">Booking Confirmed</h2>
          </div>

          <div className="bg-[#F5F0E8] rounded-xl p-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Walz Reference</span>
              <span className="font-bold text-[#0B1F3A] text-base">{done.walzReference}</span>
            </div>
            {done.supplierReference && (
              <div className="flex justify-between">
                <span className="text-gray-500">Supplier Reference</span>
                <span className="font-semibold">{done.supplierReference}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Supplier</span>
              <span>{supplierBadge(selected.supplier)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Activity</span>
              <span className="font-semibold text-right max-w-[55%]">{selected.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Client</span>
              <span className="font-semibold">{client.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span className="font-semibold">{searchForm.dateFrom || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Travellers</span>
              <span className="font-semibold">
                {searchForm.adults}A{searchForm.children ? ` · ${searchForm.children}C` : ''}{searchForm.infants ? ` · ${searchForm.infants}I` : ''}
              </span>
            </div>
            <hr className="border-gray-200" />
            <div className="flex justify-between">
              <span className="text-gray-500">Client Price</span>
              <span className="font-bold text-[#0B1F3A]">{fmtPrice(pricing.staffSellPrice, pricing.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Supplier Cost</span>
              <span className="font-semibold text-gray-600">{fmtPrice(pricing.supplierNetPrice, pricing.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Gross Profit</span>
              <span className="font-bold text-emerald-700">{fmtPrice(pricing.grossProfit, pricing.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Payment</span>
              <span className="font-semibold">{PAYMENT_METHODS.find(m => m.value === paymentMethod)?.label ?? paymentMethod}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/admin/activities/bookings"
              className="flex-1 flex items-center justify-center gap-2 text-sm font-bold text-[#0B1F3A] border border-gray-200 rounded-xl px-4 py-2.5 hover:bg-gray-50">
              <ExternalLink className="w-4 h-4" /> View All Bookings
            </Link>
            <button onClick={reset}
              className="flex-1 text-sm font-bold text-white bg-[#0B1F3A] rounded-xl px-4 py-2.5 hover:bg-[#1a3a6e]">
              Book Another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
