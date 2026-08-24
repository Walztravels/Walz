'use client'

import { useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Plane, Hotel, Activity, Car, Plus, RefreshCw, ChevronDown, ChevronUp,
         Star, Clock, Luggage, AlertCircle, Check, ShoppingCart, X, Loader2 } from 'lucide-react'
import type {
  NormalizedFlightOffer, NormalizedHotelOffer,
  NormalizedActivityOffer, NormalizedTransferOffer,
} from '@/lib/travel-search/types'

// ─── types ───────────────────────────────────────────────────────────────────

type Tab         = 'flights' | 'hotels' | 'activities' | 'transfers'
type ProductType = 'flight'  | 'hotel'  | 'activity'   | 'transfer'

function tabToProduct(tab: Tab): ProductType {
  return tab === 'flights' ? 'flight' : tab === 'hotels' ? 'hotel' : tab === 'activities' ? 'activity' : 'transfer'
}

interface CartItem {
  id:          string
  type:        ProductType
  title:       string
  cost:        number
  markup:      number
  serviceFee:  number
  selling:     number
  currency:    string
  offerRef:    string
  offer:       NormalizedFlightOffer | NormalizedHotelOffer | NormalizedActivityOffer | NormalizedTransferOffer
  extra?:      Record<string, string>  // e.g. selectedRateKey for hotels
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(minor: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minor / 100)
}

function dur(mins: number | null) {
  if (!mins) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ─── Pricing overlay component ────────────────────────────────────────────────

function PricingOverlay({
  supplierMinor,
  currency,
  onConfirm,
  onCancel,
}: {
  supplierMinor: number
  currency: string
  onConfirm: (cost: number, markup: number, fee: number, selling: number) => void
  onCancel: () => void
}) {
  const [markup, setMarkup] = useState<number>(0)
  const [fee, setFee]       = useState<number>(0)
  const selling = supplierMinor + markup + fee

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Set Pricing</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Supplier Cost</label>
            <div className="font-mono text-xl font-semibold text-gray-900">{fmt(supplierMinor, currency)}</div>
            <p className="text-xs text-gray-400 mt-0.5">Internal only — never shown to client</p>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Markup (minor units)</label>
            <input
              type="number" min={0} value={markup}
              onChange={e => setMarkup(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Service Fee (minor units)</label>
            <input
              type="number" min={0} value={fee}
              onChange={e => setFee(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono"
            />
          </div>
          <div className="bg-indigo-50 rounded-lg p-3">
            <div className="text-sm text-indigo-700">Client Selling Price</div>
            <div className="font-mono text-2xl font-bold text-indigo-900">{fmt(selling, currency)}</div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(supplierMinor, markup, fee, selling)}
            className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-indigo-700"
          >
            Add to Quote
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cart sidebar ─────────────────────────────────────────────────────────────

function CartSidebar({
  items,
  quoteId,
  onRemove,
  onSave,
  saving,
}: {
  items: CartItem[]
  quoteId: string | null
  onRemove: (id: string) => void
  onSave: () => void
  saving: boolean
}) {
  const total = items.reduce((s, i) => s + i.selling, 0)

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-40 bg-white shadow-2xl rounded-2xl w-80 border border-gray-200">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-gray-900">
          <ShoppingCart className="w-4 h-4 text-indigo-600" />
          Quote Cart ({items.length})
        </div>
        <span className="font-mono font-bold text-indigo-700">{fmt(total)}</span>
      </div>
      <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
        {items.map(item => (
          <div key={item.id} className="flex items-start gap-2 p-3">
            <span className="text-xs uppercase tracking-wide font-medium text-gray-400 pt-0.5 w-16 shrink-0">{item.type}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">{item.title}</div>
              <div className="text-xs text-gray-400 font-mono">{fmt(item.selling, item.currency)}</div>
            </div>
            <button onClick={() => onRemove(item.id)} className="text-gray-300 hover:text-red-400 shrink-0 mt-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="p-3">
        {!quoteId && (
          <p className="text-xs text-amber-600 mb-2 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Open a quote to save items
          </p>
        )}
        <button
          onClick={onSave}
          disabled={!quoteId || saving}
          className="w-full bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save to Quote'}
        </button>
      </div>
    </div>
  )
}

// ─── Flight result card ────────────────────────────────────────────────────────

function FlightCard({ offer, onAdd }: { offer: NormalizedFlightOffer; onAdd: (o: NormalizedFlightOffer) => void }) {
  const [open, setOpen] = useState(false)
  const seg0 = offer.segments[0]
  const segL = offer.segments[offer.segments.length - 1]
  const stops = offer.segments.length - 1

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:shadow-md transition-shadow">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-700 font-bold text-xs">
              {offer.airlineCode ?? offer.airline?.slice(0, 2)}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{offer.airline}</div>
              <div className="text-xs text-gray-500">{offer.cabinClass} · {offer.tripType}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono font-bold text-lg text-gray-900">
              {fmt(offer.supplierTotalMinor, offer.supplierCurrency)}
            </div>
            <div className="text-xs text-amber-600 font-medium">Supplier cost</div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-4 text-sm">
          <div className="text-center">
            <div className="font-semibold text-gray-900">{seg0?.departureAt?.slice(11, 16)}</div>
            <div className="text-xs text-gray-500">{seg0?.originCode}</div>
          </div>
          <div className="flex-1 flex flex-col items-center gap-0.5">
            <div className="text-xs text-gray-400">{dur(offer.segments.reduce((s, sg) => s + (sg.durationMinutes ?? 0), 0))}</div>
            <div className="w-full h-px bg-gray-300 relative">
              {stops > 0 && <span className="absolute inset-x-0 text-center text-xs text-amber-500 -top-3">{stops} stop{stops > 1 ? 's' : ''}</span>}
            </div>
            {stops === 0 && <div className="text-xs text-green-600">Direct</div>}
          </div>
          <div className="text-center">
            <div className="font-semibold text-gray-900">{segL?.arrivalAt?.slice(11, 16)}</div>
            <div className="text-xs text-gray-500">{segL?.destinationCode}</div>
          </div>
        </div>

        {offer.returnSegments?.length > 0 && (
          <div className="mt-2 flex items-center gap-4 text-sm bg-gray-50 rounded-lg p-2">
            <div className="text-center">
              <div className="font-semibold text-gray-900">{offer.returnSegments[0]?.departureAt?.slice(11, 16)}</div>
              <div className="text-xs text-gray-500">{offer.returnSegments[0]?.originCode}</div>
            </div>
            <div className="flex-1 text-center text-xs text-gray-400">Return</div>
            <div className="text-center">
              <div className="font-semibold text-gray-900">{offer.returnSegments[offer.returnSegments.length - 1]?.arrivalAt?.slice(11, 16)}</div>
              <div className="text-xs text-gray-500">{offer.returnSegments[offer.returnSegments.length - 1]?.destinationCode}</div>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {offer.isRefundable && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Refundable</span>}
          {offer.checkedBaggage && (
            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Luggage className="w-3 h-3" />{offer.checkedBaggage}
            </span>
          )}
          {offer.seatsLeft != null && offer.seatsLeft <= 5 && (
            <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full">
              {offer.seatsLeft} seats left
            </span>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 px-4 py-2 flex items-center justify-between">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          Details {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => onAdd(offer)}
          className="flex items-center gap-1.5 bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-700 font-medium"
        >
          <Plus className="w-3.5 h-3.5" /> Add to Quote
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-2 bg-gray-50">
          {offer.segments.map((s, i) => (
            <div key={i} className="text-xs text-gray-600 flex gap-3">
              <span className="font-medium w-20">{s.flightNumber}</span>
              <span>{s.originCode} {s.departureAt?.slice(11, 16)} → {s.destinationCode} {s.arrivalAt?.slice(11, 16)}</span>
              <span className="text-gray-400">{dur(s.durationMinutes)}</span>
            </div>
          ))}
          {offer.offerExpiresAt && (
            <p className="text-xs text-amber-600 flex items-center gap-1 mt-2">
              <Clock className="w-3 h-3" />
              Offer expires {new Date(offer.offerExpiresAt).toLocaleString('en-GB')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Hotel result card ────────────────────────────────────────────────────────

function HotelCard({
  offer,
  onAdd,
}: {
  offer: NormalizedHotelOffer
  onAdd: (o: NormalizedHotelOffer, rateKey: string) => void
}) {
  const [rateKey, setRateKey] = useState(offer.rates[0]?.rateKey ?? '')
  const selectedRate = offer.rates.find(r => r.rateKey === rateKey) ?? offer.rates[0]

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:shadow-md transition-shadow">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-gray-900">{offer.hotelName}</div>
            <div className="flex items-center gap-1 mt-0.5">
              {offer.starRating && Array.from({ length: offer.starRating }).map((_, i) => (
                <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
              ))}
              {offer.city && <span className="text-xs text-gray-500 ml-1">{offer.city}</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono font-bold text-lg text-gray-900">
              {fmt(offer.supplierMinAmountMinor, offer.supplierCurrency)}
            </div>
            <div className="text-xs text-gray-400">from (supplier)</div>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-500 flex items-center gap-3">
          <span>{offer.checkIn} → {offer.checkOut}</span>
          <span>·</span>
          <span>{offer.nights}n · {offer.rooms}rm · {offer.adults}A{offer.children > 0 ? ` · ${offer.children}C` : ''}</span>
        </div>

        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1">Select rate</label>
          <select
            value={rateKey}
            onChange={e => setRateKey(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5"
          >
            {offer.rates.map(r => (
              <option key={r.rateKey} value={r.rateKey}>
                {r.boardName ?? r.boardCode ?? 'Room Only'} — {fmt(r.supplierAmountMinor, r.supplierCurrency)}
                {r.isRefundable ? ' · Refundable' : ' · Non-refundable'}
              </option>
            ))}
          </select>
          {selectedRate?.cancellationPolicy && (
            <p className="text-xs text-gray-400 mt-1">{selectedRate.cancellationPolicy}</p>
          )}
        </div>
      </div>
      <div className="border-t border-gray-100 px-4 py-2 flex justify-end">
        <button
          onClick={() => onAdd(offer, rateKey)}
          disabled={!rateKey}
          className="flex items-center gap-1.5 bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> Add to Quote
        </button>
      </div>
    </div>
  )
}

// ─── Activity card ────────────────────────────────────────────────────────────

function ActivityCard({ offer, onAdd }: { offer: NormalizedActivityOffer; onAdd: (o: NormalizedActivityOffer) => void }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:shadow-md transition-shadow flex">
      {offer.imageUrl && (
        <img src={offer.imageUrl} alt={offer.name} className="w-24 object-cover shrink-0" />
      )}
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-gray-900 text-sm">{offer.name}</div>
            <div className="text-xs text-gray-400">{offer.providerModalityName}</div>
            {offer.duration && (
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                <Clock className="w-3 h-3" />{offer.duration}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono font-bold text-gray-900">{fmt(offer.supplierAmountMinor, offer.supplierCurrency)}</div>
            <div className="text-xs text-gray-400">supplier</div>
          </div>
        </div>
        {offer.description && (
          <p className="text-xs text-gray-500 mt-2 line-clamp-2">{offer.description}</p>
        )}
        <button
          onClick={() => onAdd(offer)}
          className="mt-3 flex items-center gap-1 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-3.5 h-3.5" /> Add to Quote
        </button>
      </div>
    </div>
  )
}

// ─── Transfer card ────────────────────────────────────────────────────────────

function TransferCard({ offer, onAdd }: { offer: NormalizedTransferOffer; onAdd: (o: NormalizedTransferOffer) => void }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white hover:shadow-md transition-shadow flex items-start justify-between gap-4">
      <div>
        <div className="font-semibold text-gray-900 text-sm">{offer.name}</div>
        <div className="flex gap-2 mt-1 flex-wrap">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{offer.transferType}</span>
          {offer.vehicle && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{offer.vehicle}</span>}
          {offer.capacity && <span className="text-xs text-gray-500">Up to {offer.capacity} pax</span>}
        </div>
        <div className="text-xs text-gray-400 mt-1">{offer.pickupCode} → {offer.dropoffCode} · {offer.transferDate}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono font-bold text-gray-900">{fmt(offer.supplierAmountMinor, offer.supplierCurrency)}</div>
        <div className="text-xs text-gray-400 mb-2">supplier</div>
        <button
          onClick={() => onAdd(offer)}
          className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TravelSearchPage() {
  const params  = useSearchParams()
  const router  = useRouter()
  const quoteId = params.get('quoteId')

  const [tab,     setTab]     = useState<Tab>('flights')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const [flightResults,   setFlightResults]   = useState<NormalizedFlightOffer[]>([])
  const [hotelResults,    setHotelResults]     = useState<NormalizedHotelOffer[]>([])
  const [activityResults, setActivityResults]  = useState<NormalizedActivityOffer[]>([])
  const [transferResults, setTransferResults]  = useState<NormalizedTransferOffer[]>([])

  const [cart,    setCart]    = useState<CartItem[]>([])
  const [saving,  setSaving]  = useState(false)

  // Pricing overlay state
  const [pendingItem, setPendingItem] = useState<{
    type: ProductType
    offer: NormalizedFlightOffer | NormalizedHotelOffer | NormalizedActivityOffer | NormalizedTransferOffer
    supplierMinor: number
    currency: string
    extra?: Record<string, string>
  } | null>(null)

  // Flight form
  const [fFrom,   setFFrom]   = useState('')
  const [fTo,     setFTo]     = useState('')
  const [fDepart, setFDepart] = useState('')
  const [fReturn, setFReturn] = useState('')
  const [fTrip,   setFTrip]   = useState('one-way')
  const [fCabin,  setFCabin]  = useState('economy')
  const [fAdults, setFAdults] = useState(1)

  // Hotel form
  const [hDest,    setHDest]    = useState('')
  const [hIn,      setHIn]      = useState('')
  const [hOut,     setHOut]     = useState('')
  const [hAdults,  setHAdults]  = useState(2)
  const [hRooms,   setHRooms]   = useState(1)

  // Activity form
  const [aCode, setACode] = useState('')
  const [aFrom, setAFrom] = useState('')
  const [aTo,   setATo]   = useState('')

  // Transfer form
  const [tPickupType,  setTPickupType]  = useState('IATA')
  const [tPickupCode,  setTPickupCode]  = useState('')
  const [tDropType,    setTDropType]    = useState('HOTEL')
  const [tDropCode,    setTDropCode]    = useState('')
  const [tDate,        setTDate]        = useState('')
  const [tAdults,      setTAdults]      = useState(2)

  const searchFlights = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/travel-search/flights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fFrom, to: fTo, depart: fDepart, return: fReturn, trip: fTrip, cabin: fCabin, adults: fAdults }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setFlightResults(data.offers ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [fFrom, fTo, fDepart, fReturn, fTrip, fCabin, fAdults])

  const searchHotels = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/travel-search/hotels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: hDest, checkIn: hIn, checkOut: hOut, adults: hAdults, rooms: hRooms }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setHotelResults(data.offers ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [hDest, hIn, hOut, hAdults, hRooms])

  const searchActivities = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/travel-search/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationCode: aCode, from: aFrom, to: aTo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setActivityResults(data.offers ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [aCode, aFrom, aTo])

  const searchTransfers = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/travel-search/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickupType: tPickupType, pickupCode: tPickupCode, dropoffType: tDropType, dropoffCode: tDropCode, transferDate: tDate, adults: tAdults }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setTransferResults(data.offers ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [tPickupType, tPickupCode, tDropType, tDropCode, tDate, tAdults])

  const openPricing = (
    type: ProductType,
    offer: NormalizedFlightOffer | NormalizedHotelOffer | NormalizedActivityOffer | NormalizedTransferOffer,
    supplierMinor: number,
    currency: string,
    extra?: Record<string, string>,
  ) => setPendingItem({ type, offer, supplierMinor, currency, extra })

  const confirmAdd = (cost: number, markup: number, fee: number, selling: number) => {
    if (!pendingItem) return
    const { type, offer, currency, extra } = pendingItem
    const flightOffer   = offer as NormalizedFlightOffer
    const hotelOffer    = offer as NormalizedHotelOffer
    const activityOffer = offer as NormalizedActivityOffer
    const transferOffer = offer as NormalizedTransferOffer
    let title = ''
    if (type === 'flight')   title = `${flightOffer.airline} · ${flightOffer.segments[0]?.originCode} → ${flightOffer.segments[flightOffer.segments.length - 1]?.destinationCode}`
    else if (type === 'hotel')    title = hotelOffer.hotelName
    else if (type === 'activity') title = activityOffer.name
    else                          title = transferOffer.name

    const offerRef =
      type === 'flight'    ? flightOffer.providerOfferId :
      type === 'hotel'     ? hotelOffer.providerHotelCode :
      type === 'activity'  ? activityOffer.providerCode :
      transferOffer.providerRateKey

    setCart(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type, title, cost, markup, serviceFee: fee, selling, currency, offerRef, offer, extra,
    }])
    setPendingItem(null)
  }

  const saveCart = async () => {
    if (!quoteId || cart.length === 0) return
    setSaving(true)
    try {
      for (const item of cart) {
        const base = {
          quoteId,
          costMinor:         item.cost,
          markupMinor:       item.markup,
          serviceFeeMinor:   item.serviceFee,
          sellingPriceMinor: item.selling,
          currency:          item.currency,
        }
        const body =
          item.type === 'flight'   ? { type: 'flight',   offer: item.offer, ...base } :
          item.type === 'hotel'    ? { type: 'hotel',    offer: item.offer, selectedRateKey: item.extra?.rateKey ?? '', ...base } :
          item.type === 'activity' ? { type: 'activity', offer: item.offer, ...base } :
                                     { type: 'transfer', offer: item.offer, ...base }

        const res = await fetch('/api/admin/travel-search/add-to-quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error ?? 'Failed to save item')
        }
      }
      setCart([])
      if (quoteId) router.push(`/admin/quotes/${quoteId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactElement }[] = [
    { id: 'flights',    label: 'Flights',    icon: <Plane className="w-4 h-4" />    },
    { id: 'hotels',     label: 'Hotels',     icon: <Hotel className="w-4 h-4" />    },
    { id: 'activities', label: 'Activities', icon: <Activity className="w-4 h-4" /> },
    { id: 'transfers',  label: 'Transfers',  icon: <Car className="w-4 h-4" />      },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {pendingItem && (
        <PricingOverlay
          supplierMinor={pendingItem.supplierMinor}
          currency={pendingItem.currency}
          onConfirm={confirmAdd}
          onCancel={() => setPendingItem(null)}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Live Travel Search</h1>
          {quoteId && (
            <p className="text-sm text-indigo-600 mt-0.5">
              Adding to quote — <a href={`/admin/quotes/${quoteId}`} className="underline">back to quote</a>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {cart.length > 0 && (
            <span className="bg-indigo-600 text-white text-xs px-2.5 py-1 rounded-full font-semibold">
              {cart.length} in cart
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-6 max-w-5xl mx-auto">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {/* ── FLIGHTS ── */}
        {tab === 'flights' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">From</label>
                  <input value={fFrom} onChange={e => setFFrom(e.target.value.toUpperCase())} placeholder="LHR" maxLength={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To</label>
                  <input value={fTo} onChange={e => setFTo(e.target.value.toUpperCase())} placeholder="DXB" maxLength={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Depart</label>
                  <input type="date" value={fDepart} onChange={e => setFDepart(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Return</label>
                  <input type="date" value={fReturn} onChange={e => setFReturn(e.target.value)} disabled={fTrip === 'one-way'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:opacity-40" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Trip</label>
                  <select value={fTrip} onChange={e => setFTrip(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="one-way">One-way</option>
                    <option value="round-trip">Round-trip</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cabin</label>
                  <select value={fCabin} onChange={e => setFCabin(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="economy">Economy</option>
                    <option value="premium_economy">Premium Economy</option>
                    <option value="business">Business</option>
                    <option value="first">First</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Adults</label>
                  <input type="number" min={1} max={9} value={fAdults} onChange={e => setFAdults(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex items-end">
                  <button onClick={searchFlights} disabled={loading}
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Search
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {flightResults.map((o, i) => (
                <FlightCard key={i} offer={o} onAdd={offer => openPricing('flight', offer, offer.supplierTotalMinor, offer.supplierCurrency)} />
              ))}
              {flightResults.length === 0 && !loading && (
                <div className="text-center py-16 text-gray-400 text-sm">Search for flights above to see results</div>
              )}
            </div>
          </>
        )}

        {/* ── HOTELS ── */}
        {tab === 'hotels' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Destination Code</label>
                  <input value={hDest} onChange={e => setHDest(e.target.value.toUpperCase())} placeholder="PMI"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Check-in</label>
                  <input type="date" value={hIn} onChange={e => setHIn(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Check-out</label>
                  <input type="date" value={hOut} onChange={e => setHOut(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Adults</label>
                  <input type="number" min={1} max={9} value={hAdults} onChange={e => setHAdults(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Rooms</label>
                  <input type="number" min={1} max={9} value={hRooms} onChange={e => setHRooms(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex items-end">
                  <button onClick={searchHotels} disabled={loading}
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Search
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {hotelResults.map((o, i) => (
                <HotelCard key={i} offer={o}
                  onAdd={(offer, rateKey) => {
                    const rate = offer.rates.find(r => r.rateKey === rateKey) ?? offer.rates[0]
                    openPricing('hotel', offer, rate?.supplierAmountMinor ?? 0, offer.supplierCurrency, { rateKey })
                  }}
                />
              ))}
              {hotelResults.length === 0 && !loading && (
                <div className="text-center py-16 text-gray-400 text-sm">Search for hotels above to see results</div>
              )}
            </div>
          </>
        )}

        {/* ── ACTIVITIES ── */}
        {tab === 'activities' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Destination Code</label>
                  <input value={aCode} onChange={e => setACode(e.target.value.toUpperCase())} placeholder="PMI"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">From Date</label>
                  <input type="date" value={aFrom} onChange={e => setAFrom(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To Date</label>
                  <input type="date" value={aTo} onChange={e => setATo(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex items-end">
                  <button onClick={searchActivities} disabled={loading}
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Search
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {activityResults.map((o, i) => (
                <ActivityCard key={i} offer={o} onAdd={offer => openPricing('activity', offer, offer.supplierAmountMinor, offer.supplierCurrency)} />
              ))}
              {activityResults.length === 0 && !loading && (
                <div className="text-center py-16 text-gray-400 text-sm">Search for activities above to see results</div>
              )}
            </div>
          </>
        )}

        {/* ── TRANSFERS ── */}
        {tab === 'transfers' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pickup Type</label>
                  <select value={tPickupType} onChange={e => setTPickupType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option>IATA</option><option>ATLAS</option><option>RESORT</option><option>PORT</option><option>STATION</option><option>HOTEL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pickup Code</label>
                  <input value={tPickupCode} onChange={e => setTPickupCode(e.target.value.toUpperCase())} placeholder="PMI"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dropoff Type</label>
                  <select value={tDropType} onChange={e => setTDropType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option>HOTEL</option><option>IATA</option><option>ATLAS</option><option>RESORT</option><option>PORT</option><option>STATION</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dropoff Code</label>
                  <input value={tDropCode} onChange={e => setTDropCode(e.target.value.toUpperCase())} placeholder="Hotel ID"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Transfer Date</label>
                  <input type="date" value={tDate} onChange={e => setTDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Adults</label>
                  <input type="number" min={1} max={20} value={tAdults} onChange={e => setTAdults(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex items-end col-span-2">
                  <button onClick={searchTransfers} disabled={loading}
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Search
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {transferResults.map((o, i) => (
                <TransferCard key={i} offer={o} onAdd={offer => openPricing('transfer', offer, offer.supplierAmountMinor, offer.supplierCurrency)} />
              ))}
              {transferResults.length === 0 && !loading && (
                <div className="text-center py-16 text-gray-400 text-sm">Search for transfers above to see results</div>
              )}
            </div>
          </>
        )}
      </div>

      <CartSidebar
        items={cart}
        quoteId={quoteId}
        onRemove={id => setCart(prev => prev.filter(i => i.id !== id))}
        onSave={saveCart}
        saving={saving}
      />
    </div>
  )
}
