'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Segment {
  originCode:          string
  originCity:          string
  originTerminal:      string
  departureAt:         string
  destinationCode:     string
  destinationCity:     string
  destinationTerminal: string
  arrivalAt:           string
  flightNumber:        string
  aircraft:            string
  durationMinutes:     string
  stops:               string
}

interface FlightOption {
  label:             string
  isRecommended:     boolean
  airline:           string
  airlineCode:       string
  tripType:          'roundtrip' | 'oneway' | 'multicity'
  cabinClass:        'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'
  isRefundable:      boolean
  changesAllowed:    boolean
  changeFee:         string
  seatIncluded:      boolean
  mealIncluded:      boolean
  personalItem:      string
  cabinBaggage:      string
  checkedBaggage:    string
  sellingPriceMinor: string
  clientNote:        string
  segments:          Segment[]
}

interface HotelOption {
  label:             string
  isRecommended:     boolean
  hotelName:         string
  starRating:        string
  address:           string
  city:              string
  country:           string
  description:       string
  checkIn:           string
  checkOut:          string
  nights:            string
  rooms:             string
  adults:            string
  children:          string
  roomType:          string
  bedType:           string
  mealPlan:          string
  breakfastIncluded: boolean
  checkInTime:       string
  checkOutTime:      string
  isRefundable:      boolean
  amenities:         string
  sellingPriceMinor: string
  clientNote:        string
}

interface AdditionalItem {
  type:              'tour' | 'transfer' | 'visa' | 'insurance' | 'concierge' | 'fee' | 'custom'
  title:             string
  description:       string
  sellingPriceMinor: string
  clientNote:        string
  clientVisible:     boolean
}

// ─── Defaults ────────────────────────────────────────────────────────────────

function defaultSegment(): Segment {
  return {
    originCode: '', originCity: '', originTerminal: '',
    departureAt: '',
    destinationCode: '', destinationCity: '', destinationTerminal: '',
    arrivalAt: '',
    flightNumber: '', aircraft: '',
    durationMinutes: '', stops: '0',
  }
}

function defaultFlightOption(): FlightOption {
  return {
    label: '', isRecommended: false, airline: '', airlineCode: '',
    tripType: 'roundtrip', cabinClass: 'ECONOMY',
    isRefundable: false, changesAllowed: false, changeFee: '',
    seatIncluded: false, mealIncluded: false,
    personalItem: '', cabinBaggage: '', checkedBaggage: '',
    sellingPriceMinor: '', clientNote: '',
    segments: [defaultSegment()],
  }
}

function defaultHotelOption(): HotelOption {
  return {
    label: '', isRecommended: false, hotelName: '', starRating: '4',
    address: '', city: '', country: '', description: '',
    checkIn: '', checkOut: '', nights: '', rooms: '1', adults: '2', children: '0',
    roomType: '', bedType: '', mealPlan: '',
    breakfastIncluded: false, checkInTime: '', checkOutTime: '',
    isRefundable: false, amenities: '', sellingPriceMinor: '', clientNote: '',
  }
}

function defaultItem(): AdditionalItem {
  return { type: 'custom', title: '', description: '', sellingPriceMinor: '', clientNote: '', clientVisible: true }
}

// ─── Helper: nights auto-calc ────────────────────────────────────────────────

function calcNights(checkIn: string, checkOut: string): string {
  if (!checkIn || !checkOut) return ''
  const d1 = new Date(checkIn), d2 = new Date(checkOut)
  const diff = Math.round((d2.getTime() - d1.getTime()) / 86_400_000)
  return diff > 0 ? String(diff) : ''
}

// ─── Helper: price to minor ───────────────────────────────────────────────────

function toMinor(s: string): number {
  const n = parseFloat(s)
  if (isNaN(n)) return 0
  return Math.round(n * 100)
}

// ─── Currency symbols ─────────────────────────────────────────────────────────

const SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$' }

// ─── Shared field styles ──────────────────────────────────────────────────────

const INPUT  = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C]'
const SELECT = `${INPUT} cursor-pointer`
const LABEL  = 'block text-xs font-semibold text-gray-600 mb-1'
const SECTION_CARD = 'bg-white border border-gray-200 rounded-xl p-6 mb-6'
const SECTION_TITLE = 'text-base font-bold text-[#0A1628] mb-4'
const FIELD  = 'flex flex-col'
const CHECKBOX_WRAP = 'flex items-center gap-2'
const CHECKBOX = 'h-4 w-4 rounded border-gray-300 text-[#C9A84C] focus:ring-[#C9A84C]'
const ITEM_CARD = 'border border-gray-200 rounded-xl p-4 mb-4 bg-gray-50'
const REMOVE_BTN = 'text-xs text-red-500 hover:text-red-700 font-medium'
const ADD_BTN = 'mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#C9A84C] hover:text-[#a8883a] transition-colors'
const GRID2 = 'grid grid-cols-1 sm:grid-cols-2 gap-4'
const GRID3 = 'grid grid-cols-1 sm:grid-cols-3 gap-4'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewQuotePage() {
  const router = useRouter()

  // Section 1
  const [clientName,    setClientName]    = useState('')
  const [clientEmail,   setClientEmail]   = useState('')
  const [clientPhone,   setClientPhone]   = useState('')
  const [clientCountry, setClientCountry] = useState('')
  const [currency,      setCurrency]      = useState<'GBP'|'USD'|'EUR'|'AED'|'CAD'>('GBP')

  // Section 2
  const [title,         setTitle]         = useState('')
  const [description,   setDescription]   = useState('')
  const [validDays,     setValidDays]     = useState('14')
  const [internalNotes, setInternalNotes] = useState('')

  // Section 3
  const [flightOptions, setFlightOptions] = useState<FlightOption[]>([defaultFlightOption()])

  // Section 4
  const [hotelOptions, setHotelOptions]   = useState<HotelOption[]>([defaultHotelOption()])

  // Section 5
  const [items, setItems]                 = useState<AdditionalItem[]>([defaultItem()])

  // Submit state
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // ── Flight helpers ──────────────────────────────────────────────────────────

  const updateFlight = useCallback(<K extends keyof FlightOption>(
    i: number, key: K, val: FlightOption[K]
  ) => {
    setFlightOptions(prev => prev.map((f, idx) => idx === i ? { ...f, [key]: val } : f))
  }, [])

  const addFlightOption = () => setFlightOptions(prev => [...prev, defaultFlightOption()])
  const removeFlightOption = (i: number) =>
    setFlightOptions(prev => prev.filter((_, idx) => idx !== i))

  const updateSegment = useCallback(<K extends keyof Segment>(
    fi: number, si: number, key: K, val: Segment[K]
  ) => {
    setFlightOptions(prev => prev.map((f, fi2) =>
      fi2 !== fi ? f : {
        ...f,
        segments: f.segments.map((s, si2) => si2 === si ? { ...s, [key]: val } : s)
      }
    ))
  }, [])

  const addSegment = (fi: number) =>
    setFlightOptions(prev => prev.map((f, i) =>
      i !== fi ? f : { ...f, segments: [...f.segments, defaultSegment()] }
    ))

  const removeSegment = (fi: number, si: number) =>
    setFlightOptions(prev => prev.map((f, i) =>
      i !== fi ? f : { ...f, segments: f.segments.filter((_, j) => j !== si) }
    ))

  // ── Hotel helpers ───────────────────────────────────────────────────────────

  const updateHotel = useCallback(<K extends keyof HotelOption>(
    i: number, key: K, val: HotelOption[K]
  ) => {
    setHotelOptions(prev => prev.map((h, idx) => {
      if (idx !== i) return h
      const next = { ...h, [key]: val }
      if (key === 'checkIn' || key === 'checkOut') {
        next.nights = calcNights(
          key === 'checkIn' ? (val as string) : h.checkIn,
          key === 'checkOut' ? (val as string) : h.checkOut,
        )
      }
      return next
    }))
  }, [])

  const addHotelOption    = () => setHotelOptions(prev => [...prev, defaultHotelOption()])
  const removeHotelOption = (i: number) =>
    setHotelOptions(prev => prev.filter((_, idx) => idx !== i))

  // ── Item helpers ────────────────────────────────────────────────────────────

  const updateItem = useCallback(<K extends keyof AdditionalItem>(
    i: number, key: K, val: AdditionalItem[K]
  ) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it))
  }, [])

  const addItem    = () => setItems(prev => [...prev, defaultItem()])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))

  // ── Pricing summary ─────────────────────────────────────────────────────────

  const pricingSummary = useMemo(() => {
    const sym = SYM[currency] ?? currency
    const recommendedFlight = flightOptions.find(f => f.isRecommended) ?? flightOptions[0]
    const recommendedHotel  = hotelOptions.find(h => h.isRecommended)  ?? hotelOptions[0]
    const flightPrice = toMinor(recommendedFlight?.sellingPriceMinor ?? '')
    const hotelPrice  = toMinor(recommendedHotel?.sellingPriceMinor ?? '')
    const itemsTotal  = items
      .filter(it => it.clientVisible)
      .reduce((acc, it) => acc + toMinor(it.sellingPriceMinor), 0)
    const total = flightPrice + hotelPrice + itemsTotal
    const fmt = (minor: number) => `${sym}${(minor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return { flightPrice, hotelPrice, itemsTotal, total, fmt }
  }, [currency, flightOptions, hotelOptions, items])

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (sendEmail: boolean) => {
    setError(null)
    setLoading(true)
    try {
      const body = {
        clientName,
        clientEmail,
        clientPhone:   clientPhone   || undefined,
        clientCountry: clientCountry || undefined,
        currency,
        title,
        description:   description   || undefined,
        validDays:     parseInt(validDays, 10) || 14,
        internalNotes: internalNotes || undefined,
        sendEmail,
        flightOptions: flightOptions.map(f => ({
          label:          f.label          || undefined,
          isRecommended:  f.isRecommended,
          airline:        f.airline,
          airlineCode:    f.airlineCode    || undefined,
          tripType:       f.tripType,
          cabinClass:     f.cabinClass,
          isRefundable:   f.isRefundable,
          changesAllowed: f.changesAllowed,
          changeFee:      f.changeFee      || undefined,
          seatIncluded:   f.seatIncluded,
          mealIncluded:   f.mealIncluded,
          personalItem:   f.personalItem   || undefined,
          cabinBaggage:   f.cabinBaggage   || undefined,
          checkedBaggage: f.checkedBaggage || undefined,
          sellingPriceMinor: toMinor(f.sellingPriceMinor),
          clientNote:     f.clientNote     || undefined,
          segments: f.segments.map(s => ({
            originCode:          s.originCode          || undefined,
            originCity:          s.originCity          || undefined,
            originTerminal:      s.originTerminal      || undefined,
            departureAt:         s.departureAt ? new Date(s.departureAt).toISOString() : undefined,
            destinationCode:     s.destinationCode     || undefined,
            destinationCity:     s.destinationCity     || undefined,
            destinationTerminal: s.destinationTerminal || undefined,
            arrivalAt:           s.arrivalAt ? new Date(s.arrivalAt).toISOString() : undefined,
            flightNumber:        s.flightNumber        || undefined,
            aircraft:            s.aircraft            || undefined,
            durationMinutes:     s.durationMinutes ? parseInt(s.durationMinutes, 10) : undefined,
            stops:               s.stops ? parseInt(s.stops, 10) : 0,
          })),
        })),
        hotelOptions: hotelOptions.map(h => ({
          label:             h.label             || undefined,
          isRecommended:     h.isRecommended,
          hotelName:         h.hotelName,
          starRating:        h.starRating ? parseInt(h.starRating, 10) : undefined,
          address:           h.address           || undefined,
          city:              h.city              || undefined,
          country:           h.country           || undefined,
          description:       h.description       || undefined,
          checkIn:           h.checkIn ? new Date(h.checkIn).toISOString() : undefined,
          checkOut:          h.checkOut ? new Date(h.checkOut).toISOString() : undefined,
          nights:            h.nights ? parseInt(h.nights, 10) : undefined,
          rooms:             h.rooms    ? parseInt(h.rooms, 10) : 1,
          adults:            h.adults   ? parseInt(h.adults, 10) : 2,
          children:          h.children ? parseInt(h.children, 10) : 0,
          roomType:          h.roomType          || undefined,
          bedType:           h.bedType           || undefined,
          mealPlan:          h.mealPlan          || undefined,
          breakfastIncluded: h.breakfastIncluded,
          checkInTime:       h.checkInTime       || undefined,
          checkOutTime:      h.checkOutTime      || undefined,
          isRefundable:      h.isRefundable,
          amenities: h.amenities
            ? h.amenities.split(',').map(a => a.trim()).filter(Boolean)
            : [],
          sellingPriceMinor: toMinor(h.sellingPriceMinor),
          clientNote:        h.clientNote        || undefined,
        })),
        items: items.map(it => ({
          type:              it.type,
          title:             it.title,
          description:       it.description || undefined,
          sellingPriceMinor: toMinor(it.sellingPriceMinor),
          clientNote:        it.clientNote  || undefined,
          clientVisible:     it.clientVisible,
        })),
      }

      const res = await fetch('/api/admin/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || data?.message || `Server error ${res.status}`)
      }

      const data = await res.json()
      router.push(`/admin/quotes/${data.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      setLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-[#0A1628] px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <a
            href="/admin/quotes"
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            ← Quotes
          </a>
          <span className="text-gray-600">/</span>
          <h1 className="text-white font-semibold text-lg">New Quote &amp; Proposal</h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Section 1: Client Details ───────────────────────────────────── */}
        <div className={SECTION_CARD}>
          <h2 className={SECTION_TITLE}>1 · Client Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={FIELD}>
              <label className={LABEL}>Client Name *</label>
              <input className={INPUT} type="text" value={clientName}
                placeholder="Jane Smith"
                onChange={e => setClientName(e.target.value)} />
            </div>
            <div className={FIELD}>
              <label className={LABEL}>Client Email *</label>
              <input className={INPUT} type="email" value={clientEmail}
                placeholder="jane@example.com"
                onChange={e => setClientEmail(e.target.value)} />
            </div>
            <div className={FIELD}>
              <label className={LABEL}>Client Phone</label>
              <input className={INPUT} type="tel" value={clientPhone}
                placeholder="+44 7700 000000"
                onChange={e => setClientPhone(e.target.value)} />
            </div>
            <div className={FIELD}>
              <label className={LABEL}>Client Country</label>
              <input className={INPUT} type="text" value={clientCountry}
                placeholder="United Kingdom"
                onChange={e => setClientCountry(e.target.value)} />
            </div>
            <div className={FIELD}>
              <label className={LABEL}>Currency</label>
              <select className={SELECT} value={currency}
                onChange={e => setCurrency(e.target.value as typeof currency)}>
                <option value="GBP">GBP — British Pound (£)</option>
                <option value="USD">USD — US Dollar ($)</option>
                <option value="EUR">EUR — Euro (€)</option>
                <option value="AED">AED — Dirham</option>
                <option value="CAD">CAD — Canadian Dollar (CA$)</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Section 2: Proposal Details ────────────────────────────────── */}
        <div className={SECTION_CARD}>
          <h2 className={SECTION_TITLE}>2 · Proposal Details</h2>
          <div className="flex flex-col gap-4">
            <div className={FIELD}>
              <label className={LABEL}>Proposal Title *</label>
              <input className={INPUT} type="text" value={title}
                placeholder="Dubai Luxury Getaway — 7 Nights"
                onChange={e => setTitle(e.target.value)} />
            </div>
            <div className={FIELD}>
              <label className={LABEL}>Introductory Message to Client</label>
              <textarea className={`${INPUT} min-h-[100px] resize-y`} value={description}
                placeholder="We're delighted to present this bespoke travel proposal…"
                onChange={e => setDescription(e.target.value)} />
            </div>
            <div className={`${GRID2}`}>
              <div className={FIELD}>
                <label className={LABEL}>Valid for (days)</label>
                <input className={INPUT} type="number" min={1} value={validDays}
                  onChange={e => setValidDays(e.target.value)} />
              </div>
            </div>
            <div className={FIELD}>
              <label className={`${LABEL} flex items-center gap-1`}>
                Internal Notes
                <span className="text-gray-400 font-normal">(not shown to client)</span>
              </label>
              <textarea className={`${INPUT} min-h-[80px] resize-y`} value={internalNotes}
                placeholder="Markup: 18%. Client prefers window seats. Direct contact: Sarah (PA)."
                onChange={e => setInternalNotes(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── Section 3: Flight Options ───────────────────────────────────── */}
        <div className={SECTION_CARD}>
          <h2 className={SECTION_TITLE}>3 · Flight Options</h2>

          {flightOptions.map((flight, fi) => (
            <div key={fi} className={`${ITEM_CARD} mb-6`}>
              {/* Option header */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-[#0A1628]">
                  Flight Option {fi + 1}
                </span>
                {flightOptions.length > 1 && (
                  <button type="button" className={REMOVE_BTN}
                    onClick={() => removeFlightOption(fi)}>
                    Remove option
                  </button>
                )}
              </div>

              {/* Option meta */}
              <div className={`${GRID3} mb-4`}>
                <div className={FIELD}>
                  <label className={LABEL}>Label</label>
                  <input className={INPUT} type="text" value={flight.label}
                    placeholder="Recommended"
                    onChange={e => updateFlight(fi, 'label', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Airline *</label>
                  <input className={INPUT} type="text" value={flight.airline}
                    placeholder="Emirates"
                    onChange={e => updateFlight(fi, 'airline', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Airline Code</label>
                  <input className={INPUT} type="text" maxLength={2} value={flight.airlineCode}
                    placeholder="EK"
                    onChange={e => updateFlight(fi, 'airlineCode', e.target.value.toUpperCase())} />
                </div>
              </div>

              <div className={`${GRID3} mb-4`}>
                <div className={FIELD}>
                  <label className={LABEL}>Trip Type</label>
                  <select className={SELECT} value={flight.tripType}
                    onChange={e => updateFlight(fi, 'tripType', e.target.value as FlightOption['tripType'])}>
                    <option value="roundtrip">Round Trip</option>
                    <option value="oneway">One Way</option>
                    <option value="multicity">Multi-City</option>
                  </select>
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Cabin Class</label>
                  <select className={SELECT} value={flight.cabinClass}
                    onChange={e => updateFlight(fi, 'cabinClass', e.target.value as FlightOption['cabinClass'])}>
                    <option value="ECONOMY">Economy</option>
                    <option value="PREMIUM_ECONOMY">Premium Economy</option>
                    <option value="BUSINESS">Business</option>
                    <option value="FIRST">First</option>
                  </select>
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Selling Price ({currency})</label>
                  <input className={INPUT} type="number" min={0} step="0.01"
                    value={flight.sellingPriceMinor}
                    placeholder="3200.00"
                    onChange={e => updateFlight(fi, 'sellingPriceMinor', e.target.value)} />
                </div>
              </div>

              {/* Checkboxes row */}
              <div className="flex flex-wrap gap-x-6 gap-y-3 mb-4">
                <label className={CHECKBOX_WRAP}>
                  <input type="checkbox" className={CHECKBOX}
                    checked={flight.isRecommended}
                    onChange={e => updateFlight(fi, 'isRecommended', e.target.checked)} />
                  <span className="text-xs text-gray-700">Recommended</span>
                </label>
                <label className={CHECKBOX_WRAP}>
                  <input type="checkbox" className={CHECKBOX}
                    checked={flight.isRefundable}
                    onChange={e => updateFlight(fi, 'isRefundable', e.target.checked)} />
                  <span className="text-xs text-gray-700">Refundable</span>
                </label>
                <label className={CHECKBOX_WRAP}>
                  <input type="checkbox" className={CHECKBOX}
                    checked={flight.changesAllowed}
                    onChange={e => updateFlight(fi, 'changesAllowed', e.target.checked)} />
                  <span className="text-xs text-gray-700">Changes Allowed</span>
                </label>
                <label className={CHECKBOX_WRAP}>
                  <input type="checkbox" className={CHECKBOX}
                    checked={flight.seatIncluded}
                    onChange={e => updateFlight(fi, 'seatIncluded', e.target.checked)} />
                  <span className="text-xs text-gray-700">Seat Included</span>
                </label>
                <label className={CHECKBOX_WRAP}>
                  <input type="checkbox" className={CHECKBOX}
                    checked={flight.mealIncluded}
                    onChange={e => updateFlight(fi, 'mealIncluded', e.target.checked)} />
                  <span className="text-xs text-gray-700">Meal Included</span>
                </label>
              </div>

              {/* Baggage & fees */}
              <div className={`${GRID3} mb-4`}>
                <div className={FIELD}>
                  <label className={LABEL}>Personal Item</label>
                  <input className={INPUT} type="text" value={flight.personalItem}
                    placeholder="1 × small bag"
                    onChange={e => updateFlight(fi, 'personalItem', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Cabin Baggage</label>
                  <input className={INPUT} type="text" value={flight.cabinBaggage}
                    placeholder="7 kg"
                    onChange={e => updateFlight(fi, 'cabinBaggage', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Checked Baggage</label>
                  <input className={INPUT} type="text" value={flight.checkedBaggage}
                    placeholder="2 × 23 kg"
                    onChange={e => updateFlight(fi, 'checkedBaggage', e.target.value)} />
                </div>
              </div>

              {flight.changesAllowed && (
                <div className={`${FIELD} mb-4`}>
                  <label className={LABEL}>Change Fee</label>
                  <input className={INPUT} type="text" value={flight.changeFee}
                    placeholder="£150 per person"
                    onChange={e => updateFlight(fi, 'changeFee', e.target.value)} />
                </div>
              )}

              <div className={`${FIELD} mb-4`}>
                <label className={LABEL}>Client Note</label>
                <input className={INPUT} type="text" value={flight.clientNote}
                  placeholder="Price is per person based on 2 travelling"
                  onChange={e => updateFlight(fi, 'clientNote', e.target.value)} />
              </div>

              {/* Segments */}
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Segments
                </p>
                {flight.segments.map((seg, si) => (
                  <div key={si} className="border border-gray-200 rounded-lg p-4 mb-3 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-600">Segment {si + 1}</span>
                      {flight.segments.length > 1 && (
                        <button type="button" className={REMOVE_BTN}
                          onClick={() => removeSegment(fi, si)}>
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Origin */}
                    <p className="text-xs text-gray-400 mb-2 font-medium">Origin</p>
                    <div className={`${GRID3} mb-3`}>
                      <div className={FIELD}>
                        <label className={LABEL}>IATA Code</label>
                        <input className={INPUT} type="text" maxLength={3}
                          value={seg.originCode} placeholder="LHR"
                          onChange={e => updateSegment(fi, si, 'originCode', e.target.value.toUpperCase())} />
                      </div>
                      <div className={FIELD}>
                        <label className={LABEL}>City</label>
                        <input className={INPUT} type="text" value={seg.originCity}
                          placeholder="London"
                          onChange={e => updateSegment(fi, si, 'originCity', e.target.value)} />
                      </div>
                      <div className={FIELD}>
                        <label className={LABEL}>Terminal</label>
                        <input className={INPUT} type="text" value={seg.originTerminal}
                          placeholder="T3"
                          onChange={e => updateSegment(fi, si, 'originTerminal', e.target.value)} />
                      </div>
                    </div>
                    <div className={`${FIELD} mb-3`}>
                      <label className={LABEL}>Departure</label>
                      <input className={INPUT} type="datetime-local" value={seg.departureAt}
                        onChange={e => updateSegment(fi, si, 'departureAt', e.target.value)} />
                    </div>

                    {/* Destination */}
                    <p className="text-xs text-gray-400 mb-2 font-medium">Destination</p>
                    <div className={`${GRID3} mb-3`}>
                      <div className={FIELD}>
                        <label className={LABEL}>IATA Code</label>
                        <input className={INPUT} type="text" maxLength={3}
                          value={seg.destinationCode} placeholder="DXB"
                          onChange={e => updateSegment(fi, si, 'destinationCode', e.target.value.toUpperCase())} />
                      </div>
                      <div className={FIELD}>
                        <label className={LABEL}>City</label>
                        <input className={INPUT} type="text" value={seg.destinationCity}
                          placeholder="Dubai"
                          onChange={e => updateSegment(fi, si, 'destinationCity', e.target.value)} />
                      </div>
                      <div className={FIELD}>
                        <label className={LABEL}>Terminal</label>
                        <input className={INPUT} type="text" value={seg.destinationTerminal}
                          placeholder="T1"
                          onChange={e => updateSegment(fi, si, 'destinationTerminal', e.target.value)} />
                      </div>
                    </div>
                    <div className={`${FIELD} mb-3`}>
                      <label className={LABEL}>Arrival</label>
                      <input className={INPUT} type="datetime-local" value={seg.arrivalAt}
                        onChange={e => updateSegment(fi, si, 'arrivalAt', e.target.value)} />
                    </div>

                    {/* Flight details */}
                    <div className={`${GRID3}`}>
                      <div className={FIELD}>
                        <label className={LABEL}>Flight Number</label>
                        <input className={INPUT} type="text" value={seg.flightNumber}
                          placeholder="EK002"
                          onChange={e => updateSegment(fi, si, 'flightNumber', e.target.value)} />
                      </div>
                      <div className={FIELD}>
                        <label className={LABEL}>Aircraft</label>
                        <input className={INPUT} type="text" value={seg.aircraft}
                          placeholder="Boeing 777-300ER"
                          onChange={e => updateSegment(fi, si, 'aircraft', e.target.value)} />
                      </div>
                      <div className={FIELD}>
                        <label className={LABEL}>Duration (min)</label>
                        <input className={INPUT} type="number" min={0}
                          value={seg.durationMinutes} placeholder="410"
                          onChange={e => updateSegment(fi, si, 'durationMinutes', e.target.value)} />
                      </div>
                    </div>
                    <div className={`${FIELD} mt-3`}>
                      <label className={LABEL}>Stops</label>
                      <input className={INPUT} type="number" min={0} max={5}
                        value={seg.stops}
                        onChange={e => updateSegment(fi, si, 'stops', e.target.value)} />
                    </div>
                  </div>
                ))}

                <button type="button" className={ADD_BTN} onClick={() => addSegment(fi)}>
                  + Add Segment
                </button>
              </div>
            </div>
          ))}

          <button type="button" onClick={addFlightOption}
            className="inline-flex items-center gap-2 rounded-lg border border-[#C9A84C] px-4 py-2 text-sm font-semibold text-[#C9A84C] hover:bg-[#C9A84C]/10 transition-colors">
            + Add Flight Option
          </button>
        </div>

        {/* ── Section 4: Hotel Options ────────────────────────────────────── */}
        <div className={SECTION_CARD}>
          <h2 className={SECTION_TITLE}>4 · Hotel Options</h2>

          {hotelOptions.map((hotel, hi) => (
            <div key={hi} className={`${ITEM_CARD} mb-6`}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-[#0A1628]">Hotel Option {hi + 1}</span>
                {hotelOptions.length > 1 && (
                  <button type="button" className={REMOVE_BTN}
                    onClick={() => removeHotelOption(hi)}>
                    Remove option
                  </button>
                )}
              </div>

              <div className={`${GRID3} mb-4`}>
                <div className={FIELD}>
                  <label className={LABEL}>Label</label>
                  <input className={INPUT} type="text" value={hotel.label}
                    placeholder="Best Value"
                    onChange={e => updateHotel(hi, 'label', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Hotel Name *</label>
                  <input className={INPUT} type="text" value={hotel.hotelName}
                    placeholder="Atlantis The Palm"
                    onChange={e => updateHotel(hi, 'hotelName', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Star Rating</label>
                  <select className={SELECT} value={hotel.starRating}
                    onChange={e => updateHotel(hi, 'starRating', e.target.value)}>
                    {[1,2,3,4,5].map(s => (
                      <option key={s} value={String(s)}>{s} Star{s > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={`${GRID2} mb-4`}>
                <div className={FIELD}>
                  <label className={LABEL}>Address</label>
                  <input className={INPUT} type="text" value={hotel.address}
                    placeholder="Crescent Road, Palm Jumeirah"
                    onChange={e => updateHotel(hi, 'address', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>City</label>
                  <input className={INPUT} type="text" value={hotel.city}
                    placeholder="Dubai"
                    onChange={e => updateHotel(hi, 'city', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Country</label>
                  <input className={INPUT} type="text" value={hotel.country}
                    placeholder="United Arab Emirates"
                    onChange={e => updateHotel(hi, 'country', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Selling Price ({currency})</label>
                  <input className={INPUT} type="number" min={0} step="0.01"
                    value={hotel.sellingPriceMinor} placeholder="4800.00"
                    onChange={e => updateHotel(hi, 'sellingPriceMinor', e.target.value)} />
                </div>
              </div>

              <div className={`${FIELD} mb-4`}>
                <label className={LABEL}>Description</label>
                <textarea className={`${INPUT} min-h-[80px] resize-y`}
                  value={hotel.description}
                  placeholder="Iconic resort on Palm Jumeirah with world-class amenities…"
                  onChange={e => updateHotel(hi, 'description', e.target.value)} />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className={FIELD}>
                  <label className={LABEL}>Check-In Date</label>
                  <input className={INPUT} type="date" value={hotel.checkIn}
                    onChange={e => updateHotel(hi, 'checkIn', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Check-Out Date</label>
                  <input className={INPUT} type="date" value={hotel.checkOut}
                    onChange={e => updateHotel(hi, 'checkOut', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Nights</label>
                  <input className={INPUT} type="number" min={1} value={hotel.nights}
                    placeholder="7"
                    onChange={e => updateHotel(hi, 'nights', e.target.value)} />
                </div>
              </div>

              {/* Guests */}
              <div className={`${GRID3} mb-4`}>
                <div className={FIELD}>
                  <label className={LABEL}>Rooms</label>
                  <input className={INPUT} type="number" min={1} value={hotel.rooms}
                    onChange={e => updateHotel(hi, 'rooms', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Adults</label>
                  <input className={INPUT} type="number" min={1} value={hotel.adults}
                    onChange={e => updateHotel(hi, 'adults', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Children</label>
                  <input className={INPUT} type="number" min={0} value={hotel.children}
                    onChange={e => updateHotel(hi, 'children', e.target.value)} />
                </div>
              </div>

              {/* Room */}
              <div className={`${GRID3} mb-4`}>
                <div className={FIELD}>
                  <label className={LABEL}>Room Type</label>
                  <input className={INPUT} type="text" value={hotel.roomType}
                    placeholder="Deluxe Ocean Suite"
                    onChange={e => updateHotel(hi, 'roomType', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Bed Type</label>
                  <input className={INPUT} type="text" value={hotel.bedType}
                    placeholder="King"
                    onChange={e => updateHotel(hi, 'bedType', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Meal Plan</label>
                  <input className={INPUT} type="text" value={hotel.mealPlan}
                    placeholder="Bed &amp; Breakfast"
                    onChange={e => updateHotel(hi, 'mealPlan', e.target.value)} />
                </div>
              </div>

              {/* Times */}
              <div className={`${GRID2} mb-4`}>
                <div className={FIELD}>
                  <label className={LABEL}>Check-In Time</label>
                  <input className={INPUT} type="time" value={hotel.checkInTime}
                    onChange={e => updateHotel(hi, 'checkInTime', e.target.value)} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Check-Out Time</label>
                  <input className={INPUT} type="time" value={hotel.checkOutTime}
                    onChange={e => updateHotel(hi, 'checkOutTime', e.target.value)} />
                </div>
              </div>

              {/* Amenities */}
              <div className={`${FIELD} mb-4`}>
                <label className={LABEL}>Amenities (comma-separated)</label>
                <input className={INPUT} type="text" value={hotel.amenities}
                  placeholder="Pool, Spa, Private Beach, Gym, Butler Service"
                  onChange={e => updateHotel(hi, 'amenities', e.target.value)} />
              </div>

              {/* Checkboxes */}
              <div className="flex flex-wrap gap-x-6 gap-y-3 mb-4">
                <label className={CHECKBOX_WRAP}>
                  <input type="checkbox" className={CHECKBOX}
                    checked={hotel.isRecommended}
                    onChange={e => updateHotel(hi, 'isRecommended', e.target.checked)} />
                  <span className="text-xs text-gray-700">Recommended</span>
                </label>
                <label className={CHECKBOX_WRAP}>
                  <input type="checkbox" className={CHECKBOX}
                    checked={hotel.breakfastIncluded}
                    onChange={e => updateHotel(hi, 'breakfastIncluded', e.target.checked)} />
                  <span className="text-xs text-gray-700">Breakfast Included</span>
                </label>
                <label className={CHECKBOX_WRAP}>
                  <input type="checkbox" className={CHECKBOX}
                    checked={hotel.isRefundable}
                    onChange={e => updateHotel(hi, 'isRefundable', e.target.checked)} />
                  <span className="text-xs text-gray-700">Refundable</span>
                </label>
              </div>

              <div className={FIELD}>
                <label className={LABEL}>Client Note</label>
                <input className={INPUT} type="text" value={hotel.clientNote}
                  placeholder="Free airport transfer included"
                  onChange={e => updateHotel(hi, 'clientNote', e.target.value)} />
              </div>
            </div>
          ))}

          <button type="button" onClick={addHotelOption}
            className="inline-flex items-center gap-2 rounded-lg border border-[#C9A84C] px-4 py-2 text-sm font-semibold text-[#C9A84C] hover:bg-[#C9A84C]/10 transition-colors">
            + Add Hotel Option
          </button>
        </div>

        {/* ── Section 5: Additional Items ─────────────────────────────────── */}
        <div className={SECTION_CARD}>
          <h2 className={SECTION_TITLE}>5 · Additional Items</h2>

          {items.length > 0 && (
            <div className="mb-3">
              {items.map((item, ii) => (
                <div key={ii} className={`${ITEM_CARD}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-600">Item {ii + 1}</span>
                    <button type="button" className={REMOVE_BTN}
                      onClick={() => removeItem(ii)}>
                      Remove
                    </button>
                  </div>

                  <div className={`${GRID3} mb-3`}>
                    <div className={FIELD}>
                      <label className={LABEL}>Type</label>
                      <select className={SELECT} value={item.type}
                        onChange={e => updateItem(ii, 'type', e.target.value as AdditionalItem['type'])}>
                        <option value="tour">Tour</option>
                        <option value="transfer">Transfer</option>
                        <option value="visa">Visa</option>
                        <option value="insurance">Insurance</option>
                        <option value="concierge">Concierge</option>
                        <option value="fee">Fee</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div className={FIELD}>
                      <label className={LABEL}>Title</label>
                      <input className={INPUT} type="text" value={item.title}
                        placeholder="Burj Khalifa Observation Deck"
                        onChange={e => updateItem(ii, 'title', e.target.value)} />
                    </div>
                    <div className={FIELD}>
                      <label className={LABEL}>Price ({currency})</label>
                      <input className={INPUT} type="number" min={0} step="0.01"
                        value={item.sellingPriceMinor} placeholder="120.00"
                        onChange={e => updateItem(ii, 'sellingPriceMinor', e.target.value)} />
                    </div>
                  </div>

                  <div className={`${FIELD} mb-3`}>
                    <label className={LABEL}>Description</label>
                    <input className={INPUT} type="text" value={item.description}
                      placeholder="Ticket for 2 adults, At the Top SKY experience"
                      onChange={e => updateItem(ii, 'description', e.target.value)} />
                  </div>

                  <div className={`${FIELD} mb-3`}>
                    <label className={LABEL}>Client Note</label>
                    <input className={INPUT} type="text" value={item.clientNote}
                      placeholder="Book in advance to secure your slot"
                      onChange={e => updateItem(ii, 'clientNote', e.target.value)} />
                  </div>

                  <label className={CHECKBOX_WRAP}>
                    <input type="checkbox" className={CHECKBOX}
                      checked={item.clientVisible}
                      onChange={e => updateItem(ii, 'clientVisible', e.target.checked)} />
                    <span className="text-xs text-gray-700">Visible to client</span>
                  </label>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={addItem}
            className="inline-flex items-center gap-2 rounded-lg border border-[#C9A84C] px-4 py-2 text-sm font-semibold text-[#C9A84C] hover:bg-[#C9A84C]/10 transition-colors">
            + Add Item
          </button>
        </div>

        {/* ── Section 6: Pricing Summary ──────────────────────────────────── */}
        <div className={SECTION_CARD}>
          <h2 className={SECTION_TITLE}>6 · Pricing Summary</h2>
          <p className="text-xs text-gray-400 mb-4">
            Auto-calculated from recommended options and visible items.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="py-2 text-gray-600">
                    Flight
                    {(() => {
                      const rec = flightOptions.find(f => f.isRecommended) ?? flightOptions[0]
                      return rec?.label ? ` — ${rec.label}` : ''
                    })()}
                  </td>
                  <td className="py-2 text-right font-medium text-gray-900">
                    {pricingSummary.fmt(pricingSummary.flightPrice)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-gray-600">
                    Hotel
                    {(() => {
                      const rec = hotelOptions.find(h => h.isRecommended) ?? hotelOptions[0]
                      return rec?.hotelName ? ` — ${rec.hotelName}` : ''
                    })()}
                  </td>
                  <td className="py-2 text-right font-medium text-gray-900">
                    {pricingSummary.fmt(pricingSummary.hotelPrice)}
                  </td>
                </tr>
                {items.filter(it => it.clientVisible).map((it, ii) => (
                  <tr key={ii}>
                    <td className="py-2 text-gray-600">{it.title || `Item ${ii + 1}`}</td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      {pricingSummary.fmt(toMinor(it.sellingPriceMinor))}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200">
                  <td className="pt-3 pb-1 font-bold text-[#0A1628] text-base">Total</td>
                  <td className="pt-3 pb-1 text-right font-bold text-[#0A1628] text-base">
                    {pricingSummary.fmt(pricingSummary.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Section 7: Submit ───────────────────────────────────────────── */}
        <div className={SECTION_CARD}>
          <h2 className={SECTION_TITLE}>7 · Save Proposal</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSubmit(false)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Spinner /> : null}
              Save as Draft
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleSubmit(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg bg-[#C9A84C] px-6 py-3 text-sm font-semibold text-white hover:bg-[#b8963e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Spinner /> : null}
              Save &amp; Send to Client
            </button>
          </div>

          <p className="mt-3 text-xs text-gray-400">
            "Save as Draft" stores the proposal without sending an email.
            "Save &amp; Send to Client" dispatches the proposal link to <strong>{clientEmail || 'the client'}</strong>.
          </p>
        </div>

      </div>
    </div>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
