'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DoNotBookWarning } from '@/components/admin/DoNotBookWarning'
import Link from 'next/link'
import {
  Plane, Building2 as Hotel, Activity, Car, Plus, Star,
  Clock, AlertCircle, Check, X, Loader2,
  ChevronDown, ChevronUp, FileText, Search,
  ArrowLeft, Eye, Send, Copy, ArrowLeftRight,
  Luggage, SlidersHorizontal, Trash2,
} from 'lucide-react'
import type {
  NormalizedFlightOffer, NormalizedHotelOffer,
  NormalizedActivityOffer, NormalizedTransferOffer,
} from '@/lib/travel-search/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchTab   = 'flights' | 'hotels' | 'activities' | 'transfers' | 'manual'
type ProductType = 'flight' | 'hotel' | 'activity' | 'transfer' | 'custom'
type TripType    = 'round-trip' | 'one-way' | 'multi-city'
// V1.4 route fix — global stops preference, sent verbatim as `stops` in the
// travel-search flights POST body (see app/api/admin/travel-search/flights/
// route.ts's STOPS_MAP). Applies to every trip type (round-trip/one-way/
// multi-city all constrain EVERY journey/leg independently server-side) —
// it is a single request-level field, never per-leg.
type StopsPref = 'any' | 'direct' | 'max-1-stop' | 'max-2-stops'

// V1.4 route fix — one leg of a multi-city search (LEG 1, LEG 2, …), or of
// a manually-entered flight's journey. `date` is a plain 'YYYY-MM-DD'
// string, matching the server's segments[].date contract.
interface MCLeg { from: string; to: string; date: string }
function emptyMCLeg(): MCLeg { return { from: '', to: '', date: '' } }
const MC_MIN_LEGS = 2
const MC_MAX_LEGS = 5

// V1.4 route fix — one structured leg of a MANUAL flight entry (no
// supplier offer behind it). Distinct from MCLeg (adds flight number and a
// full departure/arrival timestamp — a real QuoteFlightSegment needs both
// ends' date+time, not just a search date) but otherwise the same
// min-2/max-5 ordered-legs convention.
interface ManualFlightLeg {
  from: string; to: string
  departDate: string; departTime: string
  arriveDate: string; arriveTime: string
  flightNumber: string
}
function emptyManualFlightLeg(): ManualFlightLeg {
  return { from: '', to: '', departDate: '', departTime: '', arriveDate: '', arriveTime: '', flightNumber: '' }
}
// V1.4 route fix — the structured data a manual (no-offer) flight CartItem
// carries so submit() can build a real QuoteFlightOption + QuoteFlightSegment
// entry for it (a flightOptions[] entry), instead of the generic items[]
// catch-all every other manual entry uses. Chosen over JSON-stringifying
// into CartItem.extra (which stays a Record<string,string>) because this
// keeps the shape type-checked end-to-end from the form to submit()'s
// payload builder — see the report for the exact rationale.
interface ManualFlightDetails {
  airline:     string
  airlineCode: string
  cabinClass:  string
  tripType:    TripType
  legs:        ManualFlightLeg[]
}

interface CartItem {
  id:            string
  type:          ProductType
  title:         string
  subtitle:      string
  costMinor:     number
  markupMinor:   number
  feeMinor:      number
  taxMinor:      number
  sellingMinor:  number
  currency:      string
  isRecommended: boolean
  clientNote:    string
  offer?: NormalizedFlightOffer | NormalizedHotelOffer | NormalizedActivityOffer | NormalizedTransferOffer
  extra?: Record<string, string>
  // V1.4 route fix — set only for a manual (no-offer) flight entry; see
  // ManualFlightDetails above.
  manualFlight?: ManualFlightDetails
  // V1.4 route fix — which pricing path produced sellingMinor for this item
  // ('markup' = supplierMinor + markup + fee + tax, unchanged default;
  // 'manual' = staff typed sellingMinor directly). Carried through to
  // submit()'s flightOptions[] payload as an additive, backward-compatible
  // field — see the report's contract-question answer for why.
  pricingMode?: 'markup' | 'manual'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _seq = 1
function uid() { return `item-${_seq++}-${Math.random().toString(36).slice(2, 6)}` }

function fmt(minor: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(minor / 100)
}

function dur(mins: number | null) {
  if (!mins) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// V1.4 route fix — client-side pre-check mirroring the server's own
// chronology rule (app/api/admin/travel-search/flights/route.ts rejects a
// multi-city search whose segments aren't strictly chronological). A UI
// convenience only — the server check always still runs — but it lets the
// Search button disable with an inline error instead of a round-trip 400.
// Exported for unit testing. Only legs with BOTH dates filled are compared,
// so an in-progress incomplete leg never falsely triggers it.
export function mcLegsChronologyError(legs: { date: string }[]): string | null {
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1].date
    const cur  = legs[i].date
    if (prev && cur && cur < prev) {
      return `Leg ${i + 1}: departure date cannot be before Leg ${i}'s departure date.`
    }
  }
  return null
}

function placeholderRef() {
  const now = new Date()
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `WT-Q-${ymd}-XXXX`
}

// ─── Airport Data ─────────────────────────────────────────────────────────────

interface Airport { code: string; name: string; city: string; country: string }

const AIRPORTS: Airport[] = [
  // Nigeria
  { code: 'LOS', name: 'Murtala Muhammed Intl', city: 'Lagos', country: 'Nigeria' },
  { code: 'ABV', name: 'Nnamdi Azikiwe Intl', city: 'Abuja', country: 'Nigeria' },
  { code: 'KAN', name: 'Mallam Aminu Kano Intl', city: 'Kano', country: 'Nigeria' },
  { code: 'PHC', name: 'Port Harcourt Intl', city: 'Port Harcourt', country: 'Nigeria' },
  { code: 'ENU', name: 'Akanu Ibiam Intl', city: 'Enugu', country: 'Nigeria' },
  { code: 'CBQ', name: 'Margaret Ekpo Intl', city: 'Calabar', country: 'Nigeria' },
  { code: 'ILR', name: 'Ilorin Intl Airport', city: 'Ilorin', country: 'Nigeria' },
  // Africa
  { code: 'ACC', name: 'Kotoka Intl', city: 'Accra', country: 'Ghana' },
  { code: 'ABJ', name: 'Félix-Houphouët-Boigny Intl', city: 'Abidjan', country: "Côte d'Ivoire" },
  { code: 'CMN', name: 'Mohammed V Intl', city: 'Casablanca', country: 'Morocco' },
  { code: 'CAI', name: 'Cairo Intl', city: 'Cairo', country: 'Egypt' },
  { code: 'HRE', name: 'Robert Gabriel Mugabe Intl', city: 'Harare', country: 'Zimbabwe' },
  { code: 'NBO', name: 'Jomo Kenyatta Intl', city: 'Nairobi', country: 'Kenya' },
  { code: 'JNB', name: 'O.R. Tambo Intl', city: 'Johannesburg', country: 'South Africa' },
  { code: 'CPT', name: 'Cape Town Intl', city: 'Cape Town', country: 'South Africa' },
  { code: 'DUR', name: 'King Shaka Intl', city: 'Durban', country: 'South Africa' },
  { code: 'ADD', name: 'Addis Ababa Bole Intl', city: 'Addis Ababa', country: 'Ethiopia' },
  { code: 'DAR', name: 'Julius Nyerere Intl', city: 'Dar es Salaam', country: 'Tanzania' },
  { code: 'KGL', name: 'Kigali Intl', city: 'Kigali', country: 'Rwanda' },
  { code: 'EBB', name: 'Entebbe Intl', city: 'Entebbe', country: 'Uganda' },
  { code: 'LUN', name: 'Kenneth Kaunda Intl', city: 'Lusaka', country: 'Zambia' },
  { code: 'LBV', name: "Léon M'ba Intl", city: 'Libreville', country: 'Gabon' },
  { code: 'DLA', name: 'Douala Intl', city: 'Douala', country: 'Cameroon' },
  { code: 'FIH', name: "N'djili Airport", city: 'Kinshasa', country: 'DR Congo' },
  { code: 'DKR', name: 'Blaise Diagne Intl', city: 'Dakar', country: 'Senegal' },
  { code: 'BKO', name: 'Bamako-Sénou Intl', city: 'Bamako', country: 'Mali' },
  { code: 'OUA', name: 'Ouagadougou Airport', city: 'Ouagadougou', country: 'Burkina Faso' },
  { code: 'LFW', name: 'Lomé-Tokoin Intl', city: 'Lomé', country: 'Togo' },
  { code: 'COO', name: 'Cotonou Cadjehoun Airport', city: 'Cotonou', country: 'Benin' },
  { code: 'MRU', name: 'Sir Seewoosagur Ramgoolam Intl', city: 'Mauritius', country: 'Mauritius' },
  { code: 'TUN', name: 'Tunis Carthage Intl', city: 'Tunis', country: 'Tunisia' },
  { code: 'ALG', name: 'Houari Boumediene Airport', city: 'Algiers', country: 'Algeria' },
  { code: 'NKC', name: 'Nouakchott–Oumtounsy Intl', city: 'Nouakchott', country: 'Mauritania' },
  { code: 'SEZ', name: 'Seychelles Intl', city: 'Mahé', country: 'Seychelles' },
  { code: 'TNR', name: 'Ivato Intl', city: 'Antananarivo', country: 'Madagascar' },
  // Europe
  { code: 'LHR', name: 'Heathrow Airport', city: 'London', country: 'UK' },
  { code: 'LGW', name: 'Gatwick Airport', city: 'London', country: 'UK' },
  { code: 'STN', name: 'Stansted Airport', city: 'London', country: 'UK' },
  { code: 'LCY', name: 'London City Airport', city: 'London', country: 'UK' },
  { code: 'MAN', name: 'Manchester Airport', city: 'Manchester', country: 'UK' },
  { code: 'BHX', name: 'Birmingham Airport', city: 'Birmingham', country: 'UK' },
  { code: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France' },
  { code: 'ORY', name: 'Orly Airport', city: 'Paris', country: 'France' },
  { code: 'AMS', name: 'Amsterdam Schiphol', city: 'Amsterdam', country: 'Netherlands' },
  { code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany' },
  { code: 'MUC', name: 'Munich Airport', city: 'Munich', country: 'Germany' },
  { code: 'ZRH', name: 'Zurich Airport', city: 'Zurich', country: 'Switzerland' },
  { code: 'GVA', name: 'Geneva Airport', city: 'Geneva', country: 'Switzerland' },
  { code: 'BRU', name: 'Brussels Airport', city: 'Brussels', country: 'Belgium' },
  { code: 'MAD', name: 'Madrid Barajas Airport', city: 'Madrid', country: 'Spain' },
  { code: 'BCN', name: 'Barcelona El Prat Airport', city: 'Barcelona', country: 'Spain' },
  { code: 'FCO', name: 'Fiumicino Airport', city: 'Rome', country: 'Italy' },
  { code: 'MXP', name: 'Milan Malpensa Airport', city: 'Milan', country: 'Italy' },
  { code: 'LIS', name: 'Lisbon Airport', city: 'Lisbon', country: 'Portugal' },
  { code: 'VIE', name: 'Vienna Intl Airport', city: 'Vienna', country: 'Austria' },
  { code: 'CPH', name: 'Copenhagen Airport', city: 'Copenhagen', country: 'Denmark' },
  { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey' },
  { code: 'SAW', name: 'Sabiha Gökçen Intl', city: 'Istanbul', country: 'Turkey' },
  { code: 'ATH', name: 'Athens Intl Airport', city: 'Athens', country: 'Greece' },
  { code: 'WAW', name: 'Warsaw Chopin Airport', city: 'Warsaw', country: 'Poland' },
  { code: 'OSL', name: 'Oslo Gardermoen Airport', city: 'Oslo', country: 'Norway' },
  { code: 'ARN', name: 'Stockholm Arlanda Airport', city: 'Stockholm', country: 'Sweden' },
  { code: 'HEL', name: 'Helsinki Airport', city: 'Helsinki', country: 'Finland' },
  // Middle East
  { code: 'DXB', name: 'Dubai Intl Airport', city: 'Dubai', country: 'UAE' },
  { code: 'AUH', name: 'Abu Dhabi Intl Airport', city: 'Abu Dhabi', country: 'UAE' },
  { code: 'DOH', name: 'Hamad Intl Airport', city: 'Doha', country: 'Qatar' },
  { code: 'KWI', name: 'Kuwait Intl Airport', city: 'Kuwait City', country: 'Kuwait' },
  { code: 'RUH', name: 'King Khalid Intl Airport', city: 'Riyadh', country: 'Saudi Arabia' },
  { code: 'JED', name: 'King Abdulaziz Intl Airport', city: 'Jeddah', country: 'Saudi Arabia' },
  { code: 'MED', name: 'Prince Mohammad bin Abdulaziz Airport', city: 'Medina', country: 'Saudi Arabia' },
  { code: 'BAH', name: 'Bahrain Intl Airport', city: 'Manama', country: 'Bahrain' },
  { code: 'MCT', name: 'Muscat Intl Airport', city: 'Muscat', country: 'Oman' },
  { code: 'BEY', name: 'Rafic Hariri Intl Airport', city: 'Beirut', country: 'Lebanon' },
  { code: 'AMM', name: 'Queen Alia Intl Airport', city: 'Amman', country: 'Jordan' },
  { code: 'TLV', name: 'Ben Gurion Intl Airport', city: 'Tel Aviv', country: 'Israel' },
  // North America
  { code: 'JFK', name: 'John F. Kennedy Intl', city: 'New York', country: 'USA' },
  { code: 'EWR', name: 'Newark Liberty Intl', city: 'New York', country: 'USA' },
  { code: 'LGA', name: 'LaGuardia Airport', city: 'New York', country: 'USA' },
  { code: 'ORD', name: "O'Hare Intl Airport", city: 'Chicago', country: 'USA' },
  { code: 'MDW', name: 'Chicago Midway Intl', city: 'Chicago', country: 'USA' },
  { code: 'LAX', name: 'Los Angeles Intl', city: 'Los Angeles', country: 'USA' },
  { code: 'SFO', name: 'San Francisco Intl', city: 'San Francisco', country: 'USA' },
  { code: 'MIA', name: 'Miami Intl Airport', city: 'Miami', country: 'USA' },
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta Intl', city: 'Atlanta', country: 'USA' },
  { code: 'DFW', name: 'Dallas Fort Worth Intl', city: 'Dallas', country: 'USA' },
  { code: 'IAH', name: 'George Bush Intercontinental', city: 'Houston', country: 'USA' },
  { code: 'BOS', name: 'Logan Intl Airport', city: 'Boston', country: 'USA' },
  { code: 'IAD', name: 'Dulles Intl Airport', city: 'Washington DC', country: 'USA' },
  { code: 'DCA', name: 'Ronald Reagan Washington National', city: 'Washington DC', country: 'USA' },
  { code: 'YYZ', name: 'Toronto Pearson Intl', city: 'Toronto', country: 'Canada' },
  { code: 'YUL', name: 'Montréal-Trudeau Intl', city: 'Montreal', country: 'Canada' },
  { code: 'YVR', name: 'Vancouver Intl Airport', city: 'Vancouver', country: 'Canada' },
  { code: 'MEX', name: 'Mexico City Intl', city: 'Mexico City', country: 'Mexico' },
  // Asia Pacific
  { code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore' },
  { code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand' },
  { code: 'KUL', name: 'Kuala Lumpur Intl', city: 'Kuala Lumpur', country: 'Malaysia' },
  { code: 'HKG', name: 'Hong Kong Intl Airport', city: 'Hong Kong', country: 'Hong Kong' },
  { code: 'NRT', name: 'Narita Intl Airport', city: 'Tokyo', country: 'Japan' },
  { code: 'HND', name: 'Haneda Airport', city: 'Tokyo', country: 'Japan' },
  { code: 'ICN', name: 'Incheon Intl Airport', city: 'Seoul', country: 'South Korea' },
  { code: 'DEL', name: 'Indira Gandhi Intl Airport', city: 'New Delhi', country: 'India' },
  { code: 'BOM', name: 'Chhatrapati Shivaji Intl', city: 'Mumbai', country: 'India' },
  { code: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country: 'Australia' },
  { code: 'MEL', name: 'Melbourne Airport', city: 'Melbourne', country: 'Australia' },
  { code: 'PVG', name: 'Shanghai Pudong Intl', city: 'Shanghai', country: 'China' },
  { code: 'PEK', name: 'Beijing Capital Intl', city: 'Beijing', country: 'China' },
  { code: 'CGK', name: 'Soekarno-Hatta Intl', city: 'Jakarta', country: 'Indonesia' },
  { code: 'MNL', name: 'Ninoy Aquino Intl', city: 'Manila', country: 'Philippines' },
  { code: 'AKL', name: 'Auckland Airport', city: 'Auckland', country: 'New Zealand' },
]

function AirportInput({ value, onChange, label }: {
  value: string; onChange: (code: string) => void; label: string
}) {
  const [query, setQuery] = useState(value)
  const [open,  setOpen]  = useState(false)
  const prevValue = useRef(value)

  useEffect(() => {
    if (value !== prevValue.current) { setQuery(value); prevValue.current = value }
  }, [value])

  const exact = AIRPORTS.find(a => a.code === query.toUpperCase())

  const filtered = query.length >= 1
    ? AIRPORTS.filter(a =>
        a.code.startsWith(query.toUpperCase()) ||
        a.city.toLowerCase().startsWith(query.toLowerCase()) ||
        a.city.toLowerCase().includes(query.toLowerCase()) ||
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        a.country.toLowerCase().startsWith(query.toLowerCase())
      ).slice(0, 8)
    : AIRPORTS.filter(a => ['LOS','ABV','LHR','DXB','LGW','JFK','CDG','AMS'].includes(a.code))

  return (
    <div className="relative flex-1">
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className={`border rounded-lg px-3 py-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-200 ${open ? 'border-indigo-400' : 'border-gray-300'}`}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('') }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder="City or airport code…"
          autoComplete="off"
          className="w-full text-sm font-bold text-gray-900 outline-none bg-transparent placeholder-gray-400 leading-tight"
        />
        <div className="text-xs text-gray-400 mt-0.5 min-h-[16px]">
          {exact ? `${exact.name} · ${exact.city}, ${exact.country}` : query.length >= 3 && !exact ? 'No match — try another code or city' : ''}
        </div>
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-auto">
          {filtered.map(a => (
            <button key={a.code} onMouseDown={() => { onChange(a.code); setQuery(a.code); setOpen(false) }}
              className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 flex items-center gap-3 border-b border-gray-50 last:border-0">
              <span className="font-mono font-bold text-indigo-600 text-sm w-10 shrink-0">{a.code}</span>
              <div className="min-w-0">
                <div className="text-sm text-gray-900 truncate">{a.name}</div>
                <div className="text-xs text-gray-400">{a.city}, {a.country}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Client',       sub: '' },
  { label: 'Search & Add', sub: 'Flights, Hotels, etc.' },
  { label: 'Quote Details',sub: 'Pricing & Notes' },
  { label: 'Preview',      sub: 'Review Quote' },
  { label: 'Send',         sub: 'To Client' },
] as const

type Step = 1 | 2 | 3 | 4 | 5

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center">
      {STEPS.map((s, idx) => {
        const n = (idx + 1) as Step
        const done   = n < current
        const active = n === current
        return (
          <div key={n} className="flex items-center">
            <div className="flex items-center gap-2 px-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                done ? 'bg-green-500 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {done ? <Check className="w-3.5 h-3.5" /> : n}
              </div>
              <div className="hidden sm:block">
                <div className={`text-xs font-semibold whitespace-nowrap ${active ? 'text-indigo-700' : done ? 'text-green-700' : 'text-gray-400'}`}>
                  {s.label}
                </div>
                {s.sub && <div className="text-xs text-gray-400">{s.sub}</div>}
              </div>
            </div>
            {idx < STEPS.length - 1 && <div className={`w-6 h-px ${done ? 'bg-green-300' : 'bg-gray-200'}`} />}
          </div>
        )
      })}
    </div>
  )
}

// ─── Pricing Overlay ──────────────────────────────────────────────────────────

function PricingOverlay({
  title, supplierMinor, currency, onConfirm, onCancel,
}: {
  title: string; supplierMinor: number; currency: string
  onConfirm: (markup: number, fee: number, tax: number, selling: number, note: string, recommended: boolean, pricingMode: 'markup' | 'manual') => void
  onCancel: () => void
}) {
  // V1.4 route fix — 'markup' (default) is byte-identical to pre-V1.4
  // behavior: selling = supplierMinor + markup + fee + tax. 'manual' lets
  // staff type the final client-facing total directly — selling becomes
  // EXACTLY that typed figure, never re-derived from markup/fee/tax.
  const [pricingMode, setPricingMode] = useState<'markup' | 'manual'>('markup')
  const [markup,      setMarkup]      = useState(0)
  const [manualPrice, setManualPrice] = useState(0)
  const [fee,         setFee]         = useState(0)
  const [tax,         setTax]         = useState(0)
  const [note,        setNote]        = useState('')
  const [recommended, setRecommended] = useState(false)
  const selling = pricingMode === 'manual' ? manualPrice : supplierMinor + markup + fee + tax
  // Only meaningful for display/record-keeping in manual mode — mirrors the
  // server's own `markupMinor = manualSellingPriceMinor - costMinor`
  // derivation (app/api/admin/travel-search/add-to-quote/route.ts).
  const effectiveMarkup = pricingMode === 'manual' ? selling - supplierMinor : markup

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Set Pricing</h3>
        <p className="text-sm text-gray-500 mb-4 truncate">{title}</p>
        <div className="space-y-4">
          <div className="bg-amber-50 rounded-xl p-3">
            <div className="text-amber-700 font-medium text-xs uppercase tracking-wide">Supplier Cost (internal only)</div>
            <div className="font-mono text-xl font-bold text-amber-900 mt-0.5">{fmt(supplierMinor, currency)}</div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Pricing Mode</label>
            <div role="group" aria-label="Pricing Mode" className="grid grid-cols-2 gap-1.5">
              {(['markup', 'manual'] as const).map(m => (
                <button key={m} type="button" onClick={() => setPricingMode(m)}
                  aria-pressed={pricingMode === m}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                    pricingMode === m ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {m === 'markup' ? 'Default Markup' : 'Manual Selling Price'}
                </button>
              ))}
            </div>
          </div>

          {pricingMode === 'markup' ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Markup</label>
                <input type="number" min={0} value={markup} onChange={e => setMarkup(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-2 py-2 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Service Fee</label>
                <input type="number" min={0} value={fee} onChange={e => setFee(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-2 py-2 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Taxes &amp; Fees</label>
                <input type="number" min={0} value={tax} onChange={e => setTax(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-2 py-2 font-mono text-sm" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="block text-xs text-gray-500 mb-1">Client Selling Price</label>
                <input type="number" min={0} value={manualPrice} onChange={e => setManualPrice(Number(e.target.value))}
                  className="w-full border border-indigo-300 rounded-lg px-2 py-2 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Service Fee</label>
                <input type="number" min={0} value={fee} onChange={e => setFee(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-2 py-2 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Taxes &amp; Fees</label>
                <input type="number" min={0} value={tax} onChange={e => setTax(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-2 py-2 font-mono text-sm" />
              </div>
            </div>
          )}

          <div className="bg-indigo-50 rounded-xl p-3">
            <div className="text-xs text-indigo-600">Client Selling Price</div>
            <div className="font-mono text-2xl font-bold text-indigo-900">{fmt(selling, currency)}</div>
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note for client (optional)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={recommended} onChange={e => setRecommended(e.target.checked)} className="rounded" />
            Mark as Recommended
          </label>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onCancel} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button onClick={() => onConfirm(effectiveMarkup, fee, tax, selling, note, recommended, pricingMode)}
            className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-indigo-700">Add to Quote</button>
        </div>
      </div>
    </div>
  )
}

// ─── Quote Summary Sidebar ────────────────────────────────────────────────────

function QuoteSummary({
  clientName, clientEmail, validUntil, cart, currency,
  onRemove, onPreview, onSave, onSend, saving,
}: {
  clientName: string; clientEmail: string; validUntil: Date
  cart: CartItem[]; currency: string
  onRemove: (id: string) => void
  onPreview: () => void; onSave: () => void; onSend: () => void; saving: boolean
}) {
  const subtotal  = cart.reduce((s, i) => s + i.costMinor,    0)
  const markupSum = cart.reduce((s, i) => s + i.markupMinor,  0)
  const feeSum    = cart.reduce((s, i) => s + i.feeMinor,     0)
  const taxSum    = cart.reduce((s, i) => s + i.taxMinor,     0)
  const total     = cart.reduce((s, i) => s + i.sellingMinor, 0)
  const [copied,  setCopied] = useState(false)
  const ref = placeholderRef()
  const copyRef = () => {
    navigator.clipboard.writeText(ref).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="w-[300px] shrink-0 rounded-xl border border-gray-200 bg-white overflow-hidden sticky top-6 self-start">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-800">Quote Summary</span>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">Draft</span>
      </div>

      <div className="px-4 pt-3 pb-3 border-b border-gray-100 space-y-2.5">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Quote Reference</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-gray-800">{ref}</span>
            <button onClick={copyRef} className="text-gray-400 hover:text-gray-600">
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        {clientName && (
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Client</div>
            <div className="text-sm font-semibold text-gray-900">{clientName}</div>
            {clientEmail && <div className="text-xs text-indigo-600">{clientEmail}</div>}
          </div>
        )}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Valid Until</div>
          <div className="text-xs text-gray-700">
            {validUntil.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, 11:59 PM
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-700">ITEMS ({cart.length})</span>
          {cart.length > 0 && <button className="text-xs text-indigo-600 hover:underline">Edit All</button>}
        </div>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {cart.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No items yet</p>}
          {cart.map(item => (
            <div key={item.id} className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center" style={{
                background: item.type === 'flight' ? '#EFF6FF' : item.type === 'hotel' ? '#FFFBEB' : item.type === 'activity' ? '#F0FDF4' : '#FAF5FF',
              }}>
                {item.type === 'flight'   && <Plane    className="w-3.5 h-3.5 text-blue-600"   />}
                {item.type === 'hotel'    && <Hotel    className="w-3.5 h-3.5 text-amber-600"  />}
                {item.type === 'activity' && <Activity className="w-3.5 h-3.5 text-green-600" />}
                {item.type === 'transfer' && <Car      className="w-3.5 h-3.5 text-purple-600"/>}
                {item.type === 'custom'   && <FileText className="w-3.5 h-3.5 text-gray-500"  />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-900 truncate">{item.title}</div>
                    {item.subtitle && (
                      <div className="text-xs text-gray-500 mt-0.5 leading-snug whitespace-pre-line">{item.subtitle}</div>
                    )}
                    {item.isRecommended && (
                      <span className="inline-block mt-0.5 text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">Recommended</span>
                    )}
                  </div>
                  <button onClick={() => onRemove(item.id)} className="shrink-0 text-gray-300 hover:text-red-400 mt-0.5">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-xs font-mono font-bold text-gray-900 mt-1 text-right">{fmt(item.sellingMinor, item.currency)}</div>
              </div>
            </div>
          ))}
        </div>
        <button className="mt-3 w-full border border-dashed border-indigo-300 text-indigo-600 text-xs py-2 rounded-lg hover:bg-indigo-50 flex items-center justify-center gap-1.5 font-medium">
          <Plus className="w-3.5 h-3.5" /> Add Item
        </button>
      </div>

      <div className="px-4 py-3 border-b border-gray-100 space-y-1.5">
        <div className="flex justify-between text-xs text-gray-600">
          <span>Subtotal</span><span className="font-mono">{fmt(subtotal, currency)}</span>
        </div>
        {feeSum > 0 && (
          <div className="flex justify-between text-xs text-gray-600">
            <span>Service Fee</span><span className="font-mono">{fmt(feeSum, currency)}</span>
          </div>
        )}
        {markupSum > 0 && (
          <div className="flex justify-between text-xs text-gray-600">
            <span>Markup</span><span className="font-mono">{fmt(markupSum, currency)}</span>
          </div>
        )}
        {taxSum > 0 && (
          <div className="flex justify-between text-xs text-gray-600">
            <span>Taxes &amp; Fees</span><span className="font-mono">{fmt(taxSum, currency)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <span className="text-sm font-bold text-gray-900">Total ({currency})</span>
          <span className="font-mono font-bold text-indigo-700 text-base">{fmt(total, currency)}</span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        <button onClick={onPreview}
          className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center justify-center gap-2">
          <Eye className="w-4 h-4" /> Preview Quote
        </button>
        <button onClick={onSend} disabled={saving || cart.length === 0}
          className="w-full border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2">
          <Send className="w-4 h-4" /> Send to Client
        </button>
        <button onClick={onSave} disabled={saving}
          className="w-full border border-gray-300 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save as Draft
        </button>
      </div>
    </div>
  )
}

// ─── Airline logo badge ───────────────────────────────────────────────────────

const AIRLINE_COLORS: Record<string, string> = {
  AC: '#c8102e', EK: '#c60c30', KL: '#00a1e4', TK: '#e30a17',
  QR: '#5c0632', BA: '#075aaa', LH: '#05164d', AF: '#002157',
  UA: '#003087', AA: '#0078d4', DL: '#e01933', SV: '#006341',
}

function AirlineLogo({ code, name }: { code: string; name: string }) {
  const bg = AIRLINE_COLORS[code] ?? '#4f46e5'
  const initials = code ? code.slice(0, 2) : (name ?? '').slice(0, 2).toUpperCase()
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ background: bg }}>
      {initials}
    </div>
  )
}

// ─── Flight Card ──────────────────────────────────────────────────────────────

// V1.4 route fix — offer.journeys is ALWAYS present on a current offer and
// has one entry per real leg, never truncated. The legacy segments/
// returnSegments fallback below only fires for an older/minimal fixture
// that predates journeys[] — defensive compatibility, not the normal path.
function journeysOf(offer: NormalizedFlightOffer) {
  if (offer.journeys && offer.journeys.length > 0) return offer.journeys
  const legacy: { direction: 'outbound' | 'return'; segments: typeof offer.segments; stops: number; durationMinutes: number | null }[] = [
    {
      direction: 'outbound', segments: offer.segments,
      stops: Math.max(0, offer.segments.length - 1),
      durationMinutes: offer.segments.reduce((s, sg) => s + (sg.durationMinutes ?? 0), 0) || null,
    },
  ]
  if (offer.returnSegments?.length > 0) {
    legacy.push({
      direction: 'return', segments: offer.returnSegments,
      stops: Math.max(0, offer.returnSegments.length - 1),
      durationMinutes: offer.returnSegments.reduce((s, sg) => s + (sg.durationMinutes ?? 0), 0) || null,
    })
  }
  return legacy
}

// V1.4 route fix — one leg's route/time/stops row. `primary` renders the
// larger original outbound-row style; otherwise the smaller boxed style
// the old fixed 2-leg return row used. `label` is only shown for genuine
// 3+ leg multi-city offers ("JOURNEY 1", "JOURNEY 2", …) — the normal 1-2
// leg round-trip/one-way case keeps the old unlabeled look.
function JourneyRow({ journey, label, primary }: {
  journey: { segments: NormalizedFlightOffer['segments']; stops: number; durationMinutes: number | null }
  label: string | null; primary: boolean
}) {
  const s0 = journey.segments[0]
  const sL = journey.segments[journey.segments.length - 1]
  const mins = journey.durationMinutes ?? journey.segments.reduce((s, sg) => s + (sg.durationMinutes ?? 0), 0)
  const stops = journey.stops
  // Every intermediate connection airport, generalized beyond the old
  // fixed "1 stop only" case (which only ever showed seg0's destination).
  const viaCodes = journey.segments.slice(0, -1).map(s => s.destinationCode).filter(Boolean).join(', ')
  const stopInfo = stops > 0 ? `${stops} stop${stops > 1 ? 's' : ''}${viaCodes ? ` via ${viaCodes}` : ''}` : 'Direct'

  if (primary) {
    return (
      <div>
        {label && <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>}
        <div className="flex items-center gap-3">
          <div className="text-center min-w-[60px]">
            <div className="font-bold text-gray-900 text-lg leading-none">{s0?.departureAt?.slice(11, 16)}</div>
            <div className="text-sm font-bold text-gray-700 mt-0.5">{s0?.originCode}</div>
            <div className="text-xs text-gray-400 leading-tight">{s0?.originCity ?? ''}</div>
            <div className="text-xs text-gray-400">{s0?.departureAt?.slice(5, 10).replace('-', ' ')}</div>
          </div>
          <div className="flex-1 text-center">
            <div className="text-xs text-gray-400 mb-1">{dur(mins)}</div>
            <div className="relative flex items-center">
              <div className="flex-1 h-px bg-gray-300" />
              <div className={`w-2 h-2 rounded-full mx-1 ${stops > 0 ? 'bg-amber-400' : 'bg-gray-300'}`} />
              <div className="flex-1 h-px bg-gray-300" />
            </div>
            <div className={`text-xs mt-1 ${stops > 0 ? 'text-amber-600' : 'text-green-600'}`}>{stopInfo}</div>
          </div>
          <div className="text-center min-w-[60px]">
            <div className="font-bold text-gray-900 text-lg leading-none">{sL?.arrivalAt?.slice(11, 16)}</div>
            <div className="text-sm font-bold text-gray-700 mt-0.5">{sL?.destinationCode}</div>
            <div className="text-xs text-gray-400 leading-tight">{sL?.destinationCity ?? ''}</div>
            <div className="text-xs text-gray-400">{sL?.arrivalAt?.slice(5, 10).replace('-', ' ')}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2">
      {label && <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>}
      <div className="flex items-center gap-3">
        <div className="text-center">
          <div className="text-sm font-bold text-gray-700">{s0?.departureAt?.slice(11, 16)}</div>
          <div className="text-xs text-gray-500">{s0?.originCode}</div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-xs text-gray-400">{dur(mins)}</div>
          <div className="flex items-center mt-0.5"><div className="flex-1 h-px bg-gray-300" /><span className="text-xs text-gray-400 px-1">↩</span><div className="flex-1 h-px bg-gray-300" /></div>
          <div className={`text-xs mt-0.5 ${stops > 0 ? 'text-amber-600' : 'text-green-600'}`}>{stopInfo}</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-gray-700">{sL?.arrivalAt?.slice(11, 16)}</div>
          <div className="text-xs text-gray-500">{sL?.destinationCode}</div>
        </div>
      </div>
    </div>
  )
}

function FlightCard({
  offer, onAdd, badge,
}: {
  offer: NormalizedFlightOffer; onAdd: () => void; badge?: 'recommended' | 'lowest'
}) {
  const [open, setOpen] = useState(false)
  const journeys = journeysOf(offer)
  const isMultiCity = journeys.length > 2
  const allSegsForHeader = journeys.flatMap(j => j.segments)
  const flightNums = allSegsForHeader.map(s => s.flightNumber).filter(Boolean).join(' | ')

  return (
    <div className={`border rounded-xl bg-white hover:shadow-md transition-shadow ${badge === 'recommended' ? 'border-indigo-400 ring-1 ring-indigo-100' : 'border-gray-200'}`}>
      {badge && (
        <div className={`px-3 py-1 rounded-t-xl text-xs font-bold ${badge === 'recommended' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          {badge === 'recommended' ? '★ RECOMMENDED' : '💰 LOWEST FARE'}
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <AirlineLogo code={offer.airlineCode ?? ''} name={offer.airline ?? ''} />
            <div>
              <div className="font-semibold text-gray-900 text-sm">{offer.airline}</div>
              {flightNums && <div className="text-xs text-gray-500">{flightNums}</div>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono font-bold text-gray-900 text-base">{fmt(offer.supplierTotalMinor, offer.supplierCurrency)}</div>
            <div className="text-xs text-gray-400">per person</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {offer.cabinClass}
              {offer.isRefundable && <span className="text-green-600 ml-1">· Refundable</span>}
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-1">
          {journeys.map((j, i) => (
            <JourneyRow key={i} journey={j} primary={i === 0} label={isMultiCity ? `JOURNEY ${i + 1}` : null} />
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3 flex-wrap">
          {offer.checkedBaggage && (
            <span className="flex items-center gap-1 text-xs text-gray-500"><Luggage className="w-3.5 h-3.5" />{offer.checkedBaggage}</span>
          )}
          {offer.seatsLeft != null && offer.seatsLeft <= 6 && (
            <span className="text-xs text-red-500 font-medium">{offer.seatsLeft} seats left</span>
          )}
          {offer.offerExpiresAt && (
            <span className="flex items-center gap-1 text-xs text-amber-600 ml-auto">
              <Clock className="w-3 h-3" />Expires {new Date(offer.offerExpiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          View Details {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <button onClick={onAdd} className="bg-indigo-600 text-white text-xs px-4 py-2 rounded-lg hover:bg-indigo-700 font-semibold">
          Add to Quote
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-1.5 rounded-b-xl">
          {journeys.map((j, ji) => (
            <div key={ji}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2 mb-1 first:mt-0">
                {isMultiCity ? `Journey ${ji + 1}` : ji === 0 ? 'Outbound' : 'Return'}
              </p>
              {j.segments.map((s, i) => (
                <div key={i} className="flex items-center gap-3 text-xs text-gray-600 bg-white rounded px-3 py-2">
                  <span className="font-mono font-medium w-16 shrink-0">{s.flightNumber ?? '—'}</span>
                  <span>{s.originCode} {s.departureAt?.slice(11, 16)} → {s.destinationCode} {s.arrivalAt?.slice(11, 16)}</span>
                  <span className="text-gray-400 ml-auto">{dur(s.durationMinutes)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Hotel Card ───────────────────────────────────────────────────────────────

function HotelCard({ offer, onAdd }: { offer: NormalizedHotelOffer; onAdd: (rk: string) => void }) {
  const [rateKey, setRateKey] = useState(offer.rates[0]?.rateKey ?? '')
  const rate = offer.rates.find(r => r.rateKey === rateKey) ?? offer.rates[0]
  return (
    <div className="border border-gray-200 rounded-xl bg-white hover:shadow-md transition-shadow">
      <div className="p-4">
        <div className="flex justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm">{offer.hotelName}</div>
            <div className="flex items-center gap-1 mt-0.5">
              {offer.starRating && Array.from({ length: offer.starRating }).map((_, i) => (
                <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
              ))}
              {offer.city && <span className="text-xs text-gray-500 ml-1">{offer.city}{offer.country ? `, ${offer.country}` : ''}</span>}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {offer.checkIn} → {offer.checkOut} · {offer.nights}n · {offer.rooms}rm · {offer.adults}A{offer.children > 0 ? ` · ${offer.children}C` : ''}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono font-bold text-gray-900">{fmt(offer.supplierMinAmountMinor, offer.supplierCurrency)}</div>
            <div className="text-xs text-amber-600">from (supplier)</div>
          </div>
        </div>
        <div className="mt-3">
          <select value={rateKey} onChange={e => setRateKey(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5">
            {offer.rates.map(r => (
              <option key={r.rateKey} value={r.rateKey}>
                {r.boardName ?? r.boardCode ?? 'Room Only'} — {fmt(r.supplierAmountMinor, r.supplierCurrency)}
                {r.isRefundable ? ' · Refundable' : ' · Non-refundable'}
              </option>
            ))}
          </select>
          {rate?.cancellationPolicy && <p className="text-xs text-gray-400 mt-1">{rate.cancellationPolicy}</p>}
        </div>
      </div>
      <div className="border-t border-gray-100 px-4 py-2.5 flex justify-end">
        <button onClick={() => onAdd(rateKey)} disabled={!rateKey}
          className="bg-indigo-600 text-white text-xs px-4 py-2 rounded-lg hover:bg-indigo-700 font-semibold disabled:opacity-50">
          Add to Quote
        </button>
      </div>
    </div>
  )
}

// ─── Activity Card ────────────────────────────────────────────────────────────

function ActivityCard({ offer, onAdd }: { offer: NormalizedActivityOffer; onAdd: () => void }) {
  return (
    <div className="border border-gray-200 rounded-xl bg-white hover:shadow-md transition-shadow flex overflow-hidden">
      {offer.imageUrl && <img src={offer.imageUrl} alt={offer.name} className="w-24 object-cover shrink-0" />}
      <div className="flex-1 p-4 flex flex-col justify-between">
        <div>
          <div className="font-semibold text-gray-900 text-sm">{offer.name}</div>
          <div className="text-xs text-gray-400">{offer.providerModalityName}</div>
          {offer.duration && <div className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{offer.duration}</div>}
        </div>
        <div className="flex items-center justify-between mt-3">
          <div>
            <div className="font-mono font-bold text-gray-900 text-sm">{fmt(offer.supplierAmountMinor, offer.supplierCurrency)}</div>
            <div className="text-xs text-amber-600">supplier</div>
          </div>
          <button onClick={onAdd} className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-700 font-semibold">
            Add to Quote
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Transfer Card ────────────────────────────────────────────────────────────

function TransferCard({ offer, onAdd }: { offer: NormalizedTransferOffer; onAdd: () => void }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white hover:shadow-md transition-shadow flex items-center justify-between gap-4">
      <div>
        <div className="font-semibold text-gray-900 text-sm">{offer.name}</div>
        <div className="flex gap-2 mt-1 flex-wrap">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{offer.transferType}</span>
          {offer.vehicle && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{offer.vehicle}</span>}
          {offer.capacity && <span className="text-xs text-gray-500">Up to {offer.capacity} pax</span>}
        </div>
        <div className="text-xs text-gray-400 mt-1">{offer.pickupCode} → {offer.dropoffCode}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono font-bold text-gray-900 text-sm">{fmt(offer.supplierAmountMinor, offer.supplierCurrency)}</div>
        <div className="text-xs text-amber-600 mb-2">supplier</div>
        <button onClick={onAdd} className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-700 font-semibold">
          Add to Quote
        </button>
      </div>
    </div>
  )
}

// ─── Manual Entry ─────────────────────────────────────────────────────────────

// V1.4 route fix — a manual FLIGHT needs airline/route/dates/cabin and a
// distinct supplier-cost-vs-client-price pair, which the generic Title+
// Price+Note form below cannot represent (it sets costMinor = sellingMinor,
// i.e. no supplier cost concept at all — correct for a truly generic manual
// item, wrong for a flight). This renders ONLY for type === 'flight',
// alongside (not replacing) the generic form used for hotel/activity/
// transfer/custom. One-way = 1 leg, Round Trip = exactly 2 legs, Multi-city
// = 2–5 ordered legs (same MC_MIN_LEGS/MC_MAX_LEGS convention as the live
// search form above) — always ONE resulting CartItem/flight, never one per
// leg.
function ManualFlightForm({ currency, onAdd }: { currency: string; onAdd: (item: CartItem) => void }) {
  const [airline,     setAirline]     = useState('')
  const [airlineCode, setAirlineCode] = useState('')
  const [cabinClass,  setCabinClass]  = useState('economy')
  const [tripType,    setTripType]    = useState<TripType>('one-way')
  const [legs,        setLegs]        = useState<ManualFlightLeg[]>([emptyManualFlightLeg()])
  const [costMajor,   setCostMajor]   = useState('')
  const [sellingMajor,setSellingMajor]= useState('')
  const [note,        setNote]        = useState('')

  const selectTripType = (t: TripType) => {
    setTripType(t)
    setLegs(prev => {
      if (t === 'one-way') return [prev[0] ?? emptyManualFlightLeg()]
      if (t === 'round-trip') {
        const next = prev.slice(0, 2)
        while (next.length < 2) next.push(emptyManualFlightLeg())
        return next
      }
      const next = prev.slice(0, MC_MAX_LEGS)
      while (next.length < MC_MIN_LEGS) next.push(emptyManualFlightLeg())
      return next
    })
  }
  const updateLeg = (i: number, patch: Partial<ManualFlightLeg>) =>
    setLegs(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const addLeg = () => setLegs(prev => prev.length >= MC_MAX_LEGS ? prev : [...prev, emptyManualFlightLeg()])
  const removeLeg = (i: number) => setLegs(prev => prev.length <= MC_MIN_LEGS ? prev : prev.filter((_, idx) => idx !== i))

  const legsComplete = legs.every(l => l.from.trim() && l.to.trim() && l.departDate && l.departTime && l.arriveDate && l.arriveTime)
  const canSubmit = airline.trim() !== '' && legsComplete && costMajor.trim() !== '' && sellingMajor.trim() !== ''

  const submit = () => {
    if (!canSubmit) return
    const costMinor    = Math.round(parseFloat(costMajor) * 100)
    const sellingMinor = Math.round(parseFloat(sellingMajor) * 100)
    const route = `${legs[0].from.toUpperCase()} → ${legs[legs.length - 1].to.toUpperCase()}`
    onAdd({
      id: uid(), type: 'flight', title: airline.trim(),
      subtitle: `${route}\n${legs[0].departDate}${legs.length > 1 ? ` – ${legs[legs.length - 1].departDate}` : ''}\n${cabinClass}`,
      costMinor, markupMinor: sellingMinor - costMinor, feeMinor: 0, taxMinor: 0,
      sellingMinor, currency, isRecommended: false, clientNote: note.trim(),
      manualFlight: {
        airline: airline.trim(), airlineCode: airlineCode.trim().toUpperCase(), cabinClass, tripType,
        legs: legs.map(l => ({ ...l, from: l.from.toUpperCase(), to: l.to.toUpperCase() })),
      },
    })
    setAirline(''); setAirlineCode(''); setCabinClass('economy'); setTripType('one-way')
    setLegs([emptyManualFlightLeg()]); setCostMajor(''); setSellingMajor(''); setNote('')
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Airline *</label>
          <input value={airline} onChange={e => setAirline(e.target.value)} placeholder="e.g. Emirates"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Airline Code</label>
          <input value={airlineCode} onChange={e => setAirlineCode(e.target.value.toUpperCase())} placeholder="EK" maxLength={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase" />
        </div>
      </div>

      <div>
        <span className="block text-xs text-gray-500 mb-1">Trip Type</span>
        <div className="flex gap-2 flex-wrap">
          {(['one-way', 'round-trip', 'multi-city'] as TripType[]).map(t => (
            <button key={t} type="button" onClick={() => selectTripType(t)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${tripType === t ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {t === 'round-trip' ? 'Round Trip' : t === 'one-way' ? 'One Way' : 'Multi-city'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {legs.map((leg, i) => (
          <div key={i} className="rounded-lg border border-dashed border-gray-300 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500">LEG {i + 1}</span>
              {tripType === 'multi-city' && i >= MC_MIN_LEGS && (
                <button type="button" onClick={() => removeLeg(i)} aria-label={`Remove leg ${i + 1}`}
                  className="text-gray-400 hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <input value={leg.from} onChange={e => updateLeg(i, { from: e.target.value.toUpperCase() })}
                placeholder="From" maxLength={3} aria-label={`Leg ${i + 1} origin`}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm font-mono uppercase" />
              <input value={leg.to} onChange={e => updateLeg(i, { to: e.target.value.toUpperCase() })}
                placeholder="To" maxLength={3} aria-label={`Leg ${i + 1} destination`}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm font-mono uppercase" />
              <input value={leg.flightNumber} onChange={e => updateLeg(i, { flightNumber: e.target.value })}
                placeholder="Flight #" aria-label={`Leg ${i + 1} flight number`}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <input type="date" value={leg.departDate} onChange={e => updateLeg(i, { departDate: e.target.value })}
                aria-label={`Leg ${i + 1} departure date`} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-xs" />
              <input type="time" value={leg.departTime} onChange={e => updateLeg(i, { departTime: e.target.value })}
                aria-label={`Leg ${i + 1} departure time`} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-xs" />
              <input type="date" value={leg.arriveDate} onChange={e => updateLeg(i, { arriveDate: e.target.value })}
                aria-label={`Leg ${i + 1} arrival date`} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-xs" />
              <input type="time" value={leg.arriveTime} onChange={e => updateLeg(i, { arriveTime: e.target.value })}
                aria-label={`Leg ${i + 1} arrival time`} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-xs" />
            </div>
          </div>
        ))}
        {tripType === 'multi-city' && legs.length < MC_MAX_LEGS && (
          <button type="button" onClick={addLeg} className="text-xs font-semibold text-indigo-600 hover:underline">
            + Add Leg
          </button>
        )}
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Cabin</label>
        <select value={cabinClass} onChange={e => setCabinClass(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="economy">Economy</option>
          <option value="premium_economy">Premium Economy</option>
          <option value="business">Business</option>
          <option value="first">First</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Supplier Cost ({currency}) *</label>
          <input type="number" min={0} step="0.01" value={costMajor} onChange={e => setCostMajor(e.target.value)}
            placeholder="0.00" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Client Selling Price ({currency}) *</label>
          <input type="number" min={0} step="0.01" value={sellingMajor} onChange={e => setSellingMajor(e.target.value)}
            placeholder="0.00" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Note for client</label>
        <input value={note} onChange={e => setNote(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>

      <button onClick={submit} disabled={!canSubmit}
        className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
        Add to Quote
      </button>
    </div>
  )
}

function ManualEntry({ currency, onAdd }: { currency: string; onAdd: (item: CartItem) => void }) {
  const [type,    setType]    = useState<ProductType>('custom')
  const [title,   setTitle]   = useState('')
  const [selling, setSelling] = useState('')
  const [note,    setNote]    = useState('')

  const submit = () => {
    if (!title.trim() || !selling.trim()) return
    const minor = Math.round(parseFloat(selling) * 100)
    onAdd({
      id: uid(), type, title: title.trim(), subtitle: note.trim() || type,
      costMinor: minor, markupMinor: 0, feeMinor: 0, taxMinor: 0,
      sellingMinor: minor, currency, isRecommended: false, clientNote: note.trim(),
    })
    setTitle(''); setSelling(''); setNote('')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Manual Entry</h3>
      <div className="flex gap-2 flex-wrap mb-4">
        {(['flight','hotel','activity','transfer','custom'] as ProductType[]).map(t => (
          <button key={t} onClick={() => setType(t)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors capitalize ${type === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t}
          </button>
        ))}
      </div>
      {type === 'flight' ? (
        <ManualFlightForm currency={currency} onAdd={onAdd} />
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. KLM KL585 LHR → AMS, 15 Sep"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Client Selling Price ({currency}) *</label>
            <input type="number" min={0} step="0.01" value={selling} onChange={e => setSelling(e.target.value)}
              placeholder="0.00" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Note for client</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={submit} disabled={!title.trim() || !selling.trim()}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            Add to Quote
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Search & Add Step ────────────────────────────────────────────────────────

type PendingItem = {
  type: Exclude<ProductType, 'custom'>
  offer: NormalizedFlightOffer | NormalizedHotelOffer | NormalizedActivityOffer | NormalizedTransferOffer
  supplierMinor: number
  extra?: Record<string, string>
}

function SearchAddStep({
  currency, cart, onAdd, onRemove,
  clientName, clientEmail, validUntil,
  onPreview, onSave, onSend, saving,
}: {
  currency: string; cart: CartItem[]
  onAdd: (item: CartItem) => void; onRemove: (id: string) => void
  clientName: string; clientEmail: string; validUntil: Date
  onPreview: () => void; onSave: () => void; onSend: () => void; saving: boolean
}) {
  const [tab,     setTab]     = useState<SearchTab>('flights')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, setPending] = useState<PendingItem | null>(null)

  const [flightResults,   setFlightResults]   = useState<NormalizedFlightOffer[]>([])
  const [hotelResults,    setHotelResults]     = useState<NormalizedHotelOffer[]>([])
  const [activityResults, setActivityResults]  = useState<NormalizedActivityOffer[]>([])
  const [transferResults, setTransferResults]  = useState<NormalizedTransferOffer[]>([])

  // Flight
  const [fFrom,     setFFrom]     = useState('')
  const [fTo,       setFTo]       = useState('')
  const [fDepart,   setFDepart]   = useState('')
  const [fReturn,   setFReturn]   = useState('')
  const [fTrip,     setFTrip]     = useState<TripType>('round-trip')
  const [fCabin,    setFCabin]    = useState('economy')
  const [fAdults,   setFAdults]   = useState(1)
  const [fChildren, setFChildren] = useState(0)
  const [fInfants,  setFInfants]  = useState(0)
  // V1.4 route fix — global stops preference (all trip types) and
  // multi-city leg rows, kept as SEPARATE state from fFrom/fTo/fDepart/
  // fReturn (per the route-fix brief: switching trip type must never
  // cross-populate the single-route fields and the leg rows).
  const [fStops,    setFStops]    = useState<StopsPref>('any')
  const [mcLegs,    setMcLegs]    = useState<MCLeg[]>([emptyMCLeg(), emptyMCLeg()])
  // Client-side result filter/sort — decorative-no-more "Stops" and "Price"
  // buttons in the results filter bar. Separate from fStops (the SERVER
  // request preference): this filters/sorts whatever flightResults already
  // came back, without a new search.
  const [resultStopsFilter, setResultStopsFilter] = useState<'any' | 'direct' | '1' | '2+'>('any')
  const [resultPriceSort,   setResultPriceSort]   = useState<'none' | 'asc' | 'desc'>('none')

  const updateMcLeg = (i: number, patch: Partial<MCLeg>) =>
    setMcLegs(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const addMcLeg = () => setMcLegs(prev => prev.length >= MC_MAX_LEGS ? prev : [...prev, emptyMCLeg()])
  const removeMcLeg = (i: number) => setMcLegs(prev => prev.length <= MC_MIN_LEGS ? prev : prev.filter((_, idx) => idx !== i))
  const mcChronoError = fTrip === 'multi-city' ? mcLegsChronologyError(mcLegs) : null

  // Hotel
  const [hDest,     setHDest]     = useState('')
  const [hIn,       setHIn]       = useState('')
  const [hOut,      setHOut]      = useState('')
  const [hAdults,   setHAdults]   = useState(2)
  const [hChildren, setHChildren] = useState(0)
  const [hRooms,    setHRooms]    = useState(1)

  // Activity
  const [aCode, setACode] = useState('')
  const [aFrom, setAFrom] = useState('')
  const [aTo,   setATo]   = useState('')

  // Transfer
  const [tPickupType, setTPickupType] = useState('IATA')
  const [tPickupCode, setTPickupCode] = useState('')
  const [tDropType,   setTDropType]   = useState('HOTEL')
  const [tDropCode,   setTDropCode]   = useState('')
  const [tDate,       setTDate]       = useState('')
  const [tAdults,     setTAdults]     = useState(2)

  const swapAirports = () => { const t = fFrom; setFFrom(fTo); setFTo(t) }

  const search = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      let res: Response, body: Record<string, unknown>
      if (tab === 'flights') {
        // V1.4 route fix — multi-city sends `segments` (2–5 ordered legs)
        // and OMITS from/to/depart/return entirely (the server ignores them
        // for trip: 'multi-city' but we don't send stale values either
        // way); round-trip/one-way keep sending the existing single-route
        // fields. `stops` is sent for every trip type — a single request-
        // level preference the server applies per-journey.
        const flightBody = fTrip === 'multi-city'
          ? {
              trip: 'multi-city' as const,
              segments: mcLegs.map(l => ({ from: l.from, to: l.to, date: l.date })),
              cabin: fCabin, adults: fAdults, children: fChildren, infants: fInfants, stops: fStops,
            }
          : {
              from: fFrom, to: fTo, depart: fDepart, return: fReturn, trip: fTrip,
              cabin: fCabin, adults: fAdults, children: fChildren, infants: fInfants, stops: fStops,
            }
        res = await fetch('/api/admin/travel-search/flights', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flightBody),
        })
        body = await res.json() as Record<string, unknown>
        if (!res.ok) throw new Error((body.error as string) ?? 'Search failed')
        setFlightResults((body.offers as NormalizedFlightOffer[]) ?? [])
      } else if (tab === 'hotels') {
        res = await fetch('/api/admin/travel-search/hotels', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination: hDest, checkIn: hIn, checkOut: hOut, adults: hAdults, children: hChildren, rooms: hRooms, currency }),
        })
        body = await res.json() as Record<string, unknown>
        if (!res.ok) throw new Error((body.error as string) ?? 'Search failed')
        setHotelResults((body.offers as NormalizedHotelOffer[]) ?? [])
      } else if (tab === 'activities') {
        res = await fetch('/api/admin/travel-search/activities', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destinationCode: aCode, from: aFrom, to: aTo }),
        })
        body = await res.json() as Record<string, unknown>
        if (!res.ok) throw new Error((body.error as string) ?? 'Search failed')
        setActivityResults((body.offers as NormalizedActivityOffer[]) ?? [])
      } else if (tab === 'transfers') {
        res = await fetch('/api/admin/travel-search/transfers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pickupType: tPickupType, pickupCode: tPickupCode, dropoffType: tDropType, dropoffCode: tDropCode, transferDate: tDate, adults: tAdults }),
        })
        body = await res.json() as Record<string, unknown>
        if (!res.ok) throw new Error((body.error as string) ?? 'Search failed')
        setTransferResults((body.offers as NormalizedTransferOffer[]) ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [tab, fFrom, fTo, fDepart, fReturn, fTrip, fCabin, fAdults, fChildren, fInfants, fStops, mcLegs,
      hDest, hIn, hOut, hAdults, hChildren, hRooms, aCode, aFrom, aTo,
      tPickupType, tPickupCode, tDropType, tDropCode, tDate, tAdults, currency])

  const confirmAdd = (markup: number, fee: number, tax: number, selling: number, note: string, recommended: boolean, pricingMode: 'markup' | 'manual') => {
    if (!pending) return
    const { type, offer, extra } = pending
    let title = '', subtitle = ''

    if (type === 'flight') {
      const fo = offer as NormalizedFlightOffer
      const segs = fo.segments
      title = fo.airline ?? ''
      const route = `${segs[0]?.originCode} → ${segs[segs.length - 1]?.destinationCode}`
      const d0 = segs[0]?.departureAt?.slice(0, 10) ?? ''
      const dL = fo.returnSegments?.length ? fo.returnSegments[fo.returnSegments.length - 1]?.arrivalAt?.slice(0, 10) ?? '' : ''
      subtitle = `${route}\n${d0}${dL ? ` – ${dL}` : ''}\n${fAdults} Adult${fAdults > 1 ? 's' : ''}, ${fo.cabinClass}`
    } else if (type === 'hotel') {
      const ho = offer as NormalizedHotelOffer
      const rate = ho.rates.find(r => r.rateKey === extra?.rateKey) ?? ho.rates[0]
      title = ho.hotelName
      subtitle = `${ho.city ?? ''}${ho.country ? `, ${ho.country}` : ''}${ho.starRating ? ` ${'★'.repeat(ho.starRating)}` : ''}\n${ho.nights} Nights (${ho.checkIn} – ${ho.checkOut})\n${ho.rooms} Room, ${ho.adults} Adults${ho.children > 0 ? `, ${ho.children} Children` : ''}${rate?.mealPlan ? `, ${rate.mealPlan}` : ''}`
    } else if (type === 'activity') {
      const ao = offer as NormalizedActivityOffer
      title = ao.name; subtitle = ao.providerModalityName ?? ''
    } else {
      const to = offer as NormalizedTransferOffer
      title = to.name; subtitle = `${to.pickupCode} → ${to.dropoffCode}`
    }

    onAdd({
      id: uid(), type, title, subtitle,
      costMinor: pending.supplierMinor, markupMinor: markup, feeMinor: fee, taxMinor: tax,
      sellingMinor: selling, currency, isRecommended: recommended, clientNote: note,
      offer, extra, pricingMode,
    })
    setPending(null)
  }

  const openPricing = (
    type: Exclude<ProductType, 'custom'>,
    offer: NormalizedFlightOffer | NormalizedHotelOffer | NormalizedActivityOffer | NormalizedTransferOffer,
    supplierMinor: number, extra?: Record<string, string>,
  ) => setPending({ type, offer, supplierMinor, extra })

  // V1.4 route fix — functional client-side Stops/Price filter+sort over
  // the already-fetched flightResults. Stops is evaluated against the
  // WORST (highest-stop) journey of the offer — a 3-leg multi-city offer
  // with one 2-stop leg is a "2+ stops" offer for filtering purposes.
  const visibleFlightResults = (() => {
    let list = flightResults
    if (resultStopsFilter !== 'any') {
      list = list.filter(o => {
        const journeys = o.journeys && o.journeys.length > 0 ? o.journeys : undefined
        const worst = journeys
          ? journeys.reduce((m, j) => Math.max(m, j.stops), 0)
          : Math.max(o.segments.length - 1, (o.returnSegments?.length ?? 0) - 1, 0)
        if (resultStopsFilter === 'direct') return worst === 0
        if (resultStopsFilter === '1') return worst <= 1
        return worst >= 2
      })
    }
    if (resultPriceSort !== 'none') {
      list = [...list].sort((a, b) =>
        resultPriceSort === 'asc' ? a.supplierTotalMinor - b.supplierTotalMinor : b.supplierTotalMinor - a.supplierTotalMinor)
    }
    return list
  })()

  const TABS: { id: SearchTab; label: string; icon: React.ReactElement }[] = [
    { id: 'flights',    label: 'Flights',     icon: <Plane    className="w-4 h-4" /> },
    { id: 'hotels',     label: 'Hotels',      icon: <Hotel    className="w-4 h-4" /> },
    { id: 'activities', label: 'Activities',  icon: <Activity className="w-4 h-4" /> },
    { id: 'transfers',  label: 'Transfers',   icon: <Car      className="w-4 h-4" /> },
    { id: 'manual',     label: 'Manual Entry',icon: <FileText className="w-4 h-4" /> },
  ]

  return (
    <div className="flex gap-5 items-start">
      {pending && (
        <PricingOverlay
          title={pending.type === 'flight' ? (pending.offer as NormalizedFlightOffer).airline ?? '' :
                 pending.type === 'hotel'  ? (pending.offer as NormalizedHotelOffer).hotelName :
                                            (pending.offer as NormalizedActivityOffer).name ?? ''}
          supplierMinor={pending.supplierMinor}
          currency={currency}
          onConfirm={confirmAdd}
          onCancel={() => setPending(null)}
        />
      )}

      <div className="flex-1 min-w-0">
        {/* Tab bar */}
        <div className="flex border-b border-gray-200 mb-5 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {/* ── Flights ── */}
        {tab === 'flights' && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
              {/* Trip type */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-gray-500 font-medium">Trip Type</span>
                {(['round-trip', 'one-way', 'multi-city'] as TripType[]).map(t => (
                  <button key={t} onClick={() => setFTrip(t)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${fTrip === t ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    {t === 'round-trip' ? 'Round Trip' : t === 'one-way' ? 'One Way' : 'Multi-city'}
                  </button>
                ))}
              </div>

              {/* V1.4 route fix — conditional render swap keyed on fTrip:
                  multi-city gets a dynamic LEG 1..5 list; round-trip/one-way
                  keep the single From/To/Departure/Return block exactly as
                  before. mcLegs and fFrom/fTo/fDepart/fReturn are separate
                  state (declared above) and are never cross-populated. */}
              {fTrip === 'multi-city' ? (
                <div className="space-y-2 mb-3">
                  {mcLegs.map((leg, i) => (
                    <div key={i} className="rounded-lg border border-dashed border-gray-300 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-500">LEG {i + 1}</span>
                        {i >= MC_MIN_LEGS && (
                          <button onClick={() => removeMcLeg(i)} aria-label={`Remove leg ${i + 1}`}
                            className="text-gray-400 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-end gap-2 mb-2">
                        <AirportInput label="From" value={leg.from} onChange={v => updateMcLeg(i, { from: v })} />
                        <AirportInput label="To" value={leg.to} onChange={v => updateMcLeg(i, { to: v })} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Date</label>
                        <input type="date" value={leg.date} onChange={e => updateMcLeg(i, { date: e.target.value })}
                          aria-label={`Leg ${i + 1} date`}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                  ))}
                  {mcLegs.length < MC_MAX_LEGS && (
                    <button onClick={addMcLeg} className="text-xs font-semibold text-indigo-600 hover:underline">
                      + Add Leg
                    </button>
                  )}
                  {mcChronoError && <p role="alert" className="text-xs text-red-600">{mcChronoError}</p>}
                </div>
              ) : (
                <>
                  {/* From / To with swap */}
                  <div className="flex items-end gap-2 mb-3">
                    <AirportInput label="From" value={fFrom} onChange={setFFrom} />
                    <button onClick={swapAirports} className="mb-8 p-2 rounded-full border border-gray-300 hover:bg-gray-50 flex-shrink-0">
                      <ArrowLeftRight className="w-4 h-4 text-gray-500" />
                    </button>
                    <AirportInput label="To" value={fTo} onChange={setFTo} />
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Departure</label>
                      <input type="date" value={fDepart} onChange={e => setFDepart(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Return</label>
                      <input type="date" value={fReturn} onChange={e => setFReturn(e.target.value)}
                        disabled={fTrip === 'one-way'}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:opacity-40 disabled:bg-gray-50" />
                    </div>
                  </div>
                </>
              )}

              {/* V1.4 route fix — Stops preference: one global request-level
                  field, visible for round-trip/one-way/multi-city alike. */}
              <div className="mb-3">
                <span className="block text-xs text-gray-500 mb-1" id="stops-pref-label">Stops</span>
                <div role="group" aria-labelledby="stops-pref-label" className="flex gap-1.5 flex-wrap">
                  {([
                    ['any', 'Any'], ['direct', 'Direct'], ['max-1-stop', 'Max 1 Stop'], ['max-2-stops', 'Max 2 Stops'],
                  ] as [StopsPref, string][]).map(([val, label]) => (
                    <button key={val} onClick={() => setFStops(val)} aria-pressed={fStops === val}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${fStops === val ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Passengers + Cabin + Search */}
              <div className="flex items-end gap-3">
                <div className="flex gap-2 flex-1">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Adults</label>
                    <input type="number" min={1} max={9} value={fAdults} onChange={e => setFAdults(Number(e.target.value))}
                      className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Children</label>
                    <input type="number" min={0} max={9} value={fChildren} onChange={e => setFChildren(Number(e.target.value))}
                      className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Infants</label>
                    <input type="number" min={0} max={9} value={fInfants} onChange={e => setFInfants(Number(e.target.value))}
                      className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cabin</label>
                  <select value={fCabin} onChange={e => setFCabin(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="economy">Economy</option>
                    <option value="premium_economy">Premium Economy</option>
                    <option value="business">Business</option>
                    <option value="first">First</option>
                  </select>
                </div>
                <button onClick={search} disabled={
                  loading || (
                    fTrip === 'multi-city'
                      ? mcLegs.some(l => !l.from || !l.to || !l.date) || mcChronoError != null
                      : !fFrom || !fTo || !fDepart
                  )
                }
                  className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Search Flights
                </button>
              </div>
            </div>

            {/* Filter bar — V1.4 route fix: Stops and Price are now
                functional (client-side filter/sort of the already-fetched
                flightResults). Airlines/Departure Time/Baggage/More Filters
                stay decorative — wiring a full filter framework for them is
                disproportionate to this fix's scope (see report). */}
            {flightResults.length > 0 && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-xs text-gray-700 font-semibold">{flightResults.length} results found</span>
                <span className="text-xs text-gray-400">· Prices include taxes and fees</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => setResultStopsFilter(f => f === 'any' ? 'direct' : f === 'direct' ? '1' : f === '1' ? '2+' : 'any')}
                    aria-pressed={resultStopsFilter !== 'any'}
                    className={`text-xs border px-2.5 py-1 rounded-full hover:bg-gray-50 ${resultStopsFilter !== 'any' ? 'border-indigo-400 text-indigo-700 bg-indigo-50' : 'border-gray-300'}`}>
                    Stops{resultStopsFilter !== 'any' ? `: ${resultStopsFilter === 'direct' ? 'Direct' : resultStopsFilter === '1' ? '≤1 stop' : '≤2 stops'}` : ''}
                  </button>
                  {['Airlines', 'Departure Time', 'Baggage'].map(f => (
                    <button key={f} className="text-xs border border-gray-300 px-2.5 py-1 rounded-full hover:bg-gray-50">{f}</button>
                  ))}
                  <button
                    onClick={() => setResultPriceSort(s => s === 'none' ? 'asc' : s === 'asc' ? 'desc' : 'none')}
                    aria-pressed={resultPriceSort !== 'none'}
                    className={`text-xs border px-2.5 py-1 rounded-full hover:bg-gray-50 ${resultPriceSort !== 'none' ? 'border-indigo-400 text-indigo-700 bg-indigo-50' : 'border-gray-300'}`}>
                    Price{resultPriceSort === 'asc' ? ' ↑' : resultPriceSort === 'desc' ? ' ↓' : ''}
                  </button>
                  <button className="text-xs border border-gray-300 px-2.5 py-1 rounded-full hover:bg-gray-50 flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3" /> More Filters
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {visibleFlightResults.map((o, i) => (
                <FlightCard key={i} offer={o}
                  badge={i === 0 ? 'recommended' : i === visibleFlightResults.length - 1 ? 'lowest' : undefined}
                  onAdd={() => openPricing('flight', o, o.supplierTotalMinor)} />
              ))}
              {!loading && flightResults.length > 0 && visibleFlightResults.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  <p className="text-sm">No flights match the current filters</p>
                </div>
              )}
              {!loading && flightResults.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  <Plane className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Enter route and departure date, then click Search Flights</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Hotels ── */}
        {tab === 'hotels' && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Destination Code</label>
                  <input value={hDest} onChange={e => setHDest(e.target.value.toUpperCase())} placeholder="LOS"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Check-in</label>
                  <input type="date" value={hIn} onChange={e => setHIn(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Check-out</label>
                  <input type="date" value={hOut} onChange={e => setHOut(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Adults / Children / Rooms</label>
                  <div className="flex gap-1">
                    <input type="number" min={1} max={9} value={hAdults} onChange={e => setHAdults(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-center" />
                    <input type="number" min={0} max={9} value={hChildren} onChange={e => setHChildren(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-center" />
                    <input type="number" min={1} max={9} value={hRooms} onChange={e => setHRooms(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-center" />
                  </div>
                </div>
                <div className="col-span-2">
                  <button onClick={search} disabled={loading || !hDest || !hIn || !hOut}
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Search Hotels
                  </button>
                </div>
              </div>
            </div>
            {hotelResults.length > 0 && <div className="text-xs text-gray-500 mb-3">{hotelResults.length} hotels found</div>}
            <div className="space-y-3">
              {hotelResults.map((o, i) => (
                <HotelCard key={i} offer={o} onAdd={rk => {
                  const rate = o.rates.find(r => r.rateKey === rk) ?? o.rates[0]
                  openPricing('hotel', o, rate?.supplierAmountMinor ?? 0, { rateKey: rk })
                }} />
              ))}
              {!loading && hotelResults.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  <Hotel className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Enter destination code and dates, then click Search Hotels</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Activities ── */}
        {tab === 'activities' && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Destination Code</label>
                  <input value={aCode} onChange={e => setACode(e.target.value.toUpperCase())} placeholder="LOS"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">From Date</label>
                  <input type="date" value={aFrom} onChange={e => setAFrom(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To Date</label>
                  <input type="date" value={aTo} onChange={e => setATo(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex items-end">
                  <button onClick={search} disabled={loading || !aCode || !aFrom || !aTo}
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Search
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {activityResults.map((o, i) => <ActivityCard key={i} offer={o} onAdd={() => openPricing('activity', o, o.supplierAmountMinor)} />)}
              {!loading && activityResults.length === 0 && (
                <div className="text-center py-16 text-gray-400"><p className="text-sm">Search activities by destination and date range</p></div>
              )}
            </div>
          </>
        )}

        {/* ── Transfers ── */}
        {tab === 'transfers' && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pickup Type</label>
                  <select value={tPickupType} onChange={e => setTPickupType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    {['IATA','ATLAS','HOTEL','PORT','STATION','RESORT'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pickup Code</label>
                  <input value={tPickupCode} onChange={e => setTPickupCode(e.target.value.toUpperCase())}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dropoff Type</label>
                  <select value={tDropType} onChange={e => setTDropType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    {['HOTEL','IATA','ATLAS','PORT','STATION','RESORT'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dropoff Code</label>
                  <input value={tDropCode} onChange={e => setTDropCode(e.target.value.toUpperCase())}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date</label>
                  <input type="date" value={tDate} onChange={e => setTDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Adults</label>
                  <input type="number" min={1} max={20} value={tAdults} onChange={e => setTAdults(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="col-span-2 flex items-end">
                  <button onClick={search} disabled={loading || !tPickupCode || !tDropCode || !tDate}
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Search Transfers
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {transferResults.map((o, i) => <TransferCard key={i} offer={o} onAdd={() => openPricing('transfer', o, o.supplierAmountMinor)} />)}
              {!loading && transferResults.length === 0 && (
                <div className="text-center py-16 text-gray-400"><p className="text-sm">Enter pickup and dropoff details to find transfers</p></div>
              )}
            </div>
          </>
        )}

        {tab === 'manual' && <ManualEntry currency={currency} onAdd={onAdd} />}
      </div>

      {/* Quote Summary */}
      <QuoteSummary
        clientName={clientName} clientEmail={clientEmail}
        validUntil={validUntil} cart={cart} currency={currency}
        onRemove={onRemove} onPreview={onPreview} onSave={onSave} onSend={onSend} saving={saving}
      />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// V1.4 route fix — exported so the test suite can mount the REAL
// route-level component tree directly, and so ./page.tsx (a Next.js page
// file, which may only have a default export) can import and render it
// inside <Suspense>. Not a new component: same function either way.
export function NewQuoteInner() {
  const router = useRouter()
  const params = useSearchParams()

  const [step, setStep] = useState<Step>(1)

  const [clientName,  setClientName]  = useState(params.get('client') ?? '')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [title,       setTitle]       = useState('')
  const [currency,    setCurrency]    = useState('GBP')
  const [validDays,   setValidDays]   = useState(14)
  const [cart,        setCart]        = useState<CartItem[]>([])
  const [deposit,     setDeposit]     = useState('')
  const [depositPct,  setDepositPct]  = useState('')
  const [internalNote,setInternalNote]= useState('')
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState<string | null>(null)
  // Do-Not-Book: pending blocked submit awaiting explicit logged acknowledgment
  const [dnbWarning,  setDnbWarning]  = useState<{ reason: string | null; send: boolean } | null>(null)
  const dnbAcknowledged = useRef(false)

  const validUntil = (() => {
    const d = new Date(); d.setDate(d.getDate() + validDays); return d
  })()

  const addToCart    = (item: CartItem) => setCart(prev => [...prev, item])
  const removeFromCart = (id: string)  => setCart(prev => prev.filter(i => i.id !== id))

  const submit = async (send = false) => {
    // Do-Not-Book hard-block: if the client email matches a blocked account,
    // require the explicit logged acknowledgment before the quote is created.
    if (!dnbAcknowledged.current && clientEmail.trim()) {
      try {
        const res  = await fetch(`/api/admin/clients/do-not-book?email=${encodeURIComponent(clientEmail.trim())}`)
        const data = await res.json() as { doNotBook?: boolean; reason?: string | null }
        if (data.doNotBook) {
          setDnbWarning({ reason: data.reason ?? null, send })
          return
        }
      } catch { /* check failure never blocks a normal client */ }
    }
    setSaving(true); setSaveError(null)
    try {
      const flightOptions = cart.filter(i => i.type === 'flight' && (i.offer || i.manualFlight)).map(i => {
        if (i.offer) {
          const fo = i.offer as NormalizedFlightOffer
          // V1.4 route fix (confirmed pre-existing bug) — the old
          // `[...fo.segments, ...(fo.returnSegments ?? [])]` silently
          // truncated a genuine 3+ leg multi-city offer to at most 2 legs'
          // worth of segments before POSTing. Build from EVERY journey
          // instead (offer.journeys is always present and never truncated);
          // the old 2-array concat is kept only as a defensive fallback for
          // an older/minimal offer shape with no journeys[] at all.
          const allSegs = fo.journeys && fo.journeys.length > 0
            ? fo.journeys.flatMap(j => j.segments)
            : [...fo.segments, ...(fo.returnSegments ?? [])]
          return {
            label: i.title, isRecommended: i.isRecommended,
            airline: fo.airline, airlineCode: fo.airlineCode ?? '',
            tripType: fo.tripType === 'round-trip' ? 'roundtrip' : fo.tripType === 'multi-city' ? 'multicity' : 'oneway',
            cabinClass: fo.cabinClass, isRefundable: fo.isRefundable, changesAllowed: fo.isChangeable,
            personalItem: fo.personalItem ?? '', cabinBaggage: fo.cabinBaggage ?? '',
            checkedBaggage: fo.checkedBaggage ?? '', checkedPieces: fo.checkedPieces ?? null, checkedWeight: fo.checkedWeight ?? '',
            duffelOfferId: fo.providerOfferId as string | null, fareExpiresAt: fo.offerExpiresAt ?? '',
            costMinor: i.costMinor, markupMinor: i.markupMinor, serviceFeeMinor: i.feeMinor,
            sellingPriceMinor: i.sellingMinor, clientNote: i.clientNote, sourceType: 'live_search',
            pricingMode: i.pricingMode ?? 'markup',
            // Orchestrator fix (post-review): segmentOrder must be RESET PER
            // JOURNEY (0-based within each leg), not renumbered continuously
            // across the flattened array. lib/action-centre/quote-to-itinerary.ts's
            // splitSegmentsIntoLegs() only reliably reconstructs journeys via
            // its "reset detected" branch (a lower/equal segmentOrder value
            // than the previous segment signals a new leg); a strictly
            // increasing 0..N-1 sequence never trips that signal, so it falls
            // through to the "no reset" branch, which BAILS OUT to a single
            // leg whenever the journeys don't all have an equal segment count
            // (e.g. one leg direct, another with a connection) — silently
            // collapsing a genuine multi-city/round-trip option back into one
            // journey downstream. Each segment here already carries its own
            // correct per-journey-local `segmentOrder` from
            // journeyToNormalized() in the shared search route (it resets to
            // 0 for every journey) — this exactly matches the convention
            // app/api/admin/travel-search/add-to-quote/route.ts's own
            // (already-shipped, already-tested) multi-city fix relies on, so
            // just forward it unchanged instead of recomputing it.
            segments: allSegs.map((s) => ({
              segmentOrder: s.segmentOrder,
              originCode: s.originCode, originCity: s.originCity ?? '', originTerminal: s.originTerminal ?? '',
              departureAt: s.departureAt, destinationCode: s.destinationCode,
              destinationCity: s.destinationCity ?? '', destinationTerminal: s.destinationTerminal ?? '',
              arrivalAt: s.arrivalAt, flightNumber: s.flightNumber ?? '', aircraft: s.aircraft ?? '',
              durationMinutes: s.durationMinutes ?? 0, stops: s.stops,
            })),
          }
        }
        // V1.4 route fix — manual (no-offer) flight entry, built from the
        // structured leg data captured on CartItem.manualFlight (see
        // ManualFlightForm). No supplier offer exists, so duffelOfferId is
        // null; sourceType 'manual' matches app/api/admin/quotes/route.ts's
        // own default for a flightOptions[] entry with no sourceType set.
        const mf = i.manualFlight!
        return {
          label: i.title, isRecommended: i.isRecommended,
          airline: mf.airline, airlineCode: mf.airlineCode || '',
          tripType: mf.tripType === 'round-trip' ? 'roundtrip' : mf.tripType === 'multi-city' ? 'multicity' : 'oneway',
          cabinClass: mf.cabinClass, isRefundable: false, changesAllowed: false,
          personalItem: '', cabinBaggage: '', checkedBaggage: '', checkedPieces: null as number | null, checkedWeight: '',
          duffelOfferId: null as string | null, fareExpiresAt: '',
          costMinor: i.costMinor, markupMinor: i.markupMinor, serviceFeeMinor: i.feeMinor,
          sellingPriceMinor: i.sellingMinor, clientNote: i.clientNote, sourceType: 'manual',
          pricingMode: i.pricingMode ?? 'manual',
          segments: mf.legs.map((l, si) => ({
            segmentOrder: si,
            originCode: l.from, originCity: '', originTerminal: '',
            departureAt: `${l.departDate}T${l.departTime}:00`, destinationCode: l.to,
            destinationCity: '', destinationTerminal: '',
            arrivalAt: `${l.arriveDate}T${l.arriveTime}:00`, flightNumber: l.flightNumber || '', aircraft: '',
            durationMinutes: 0, stops: 0,
          })),
        }
      })

      const hotelOptions = cart.filter(i => i.type === 'hotel' && i.offer).map(i => {
        const ho = i.offer as NormalizedHotelOffer
        const rate = ho.rates.find(r => r.rateKey === i.extra?.rateKey) ?? ho.rates[0]
        return {
          label: i.title, isRecommended: i.isRecommended,
          hotelName: ho.hotelName, starRating: ho.starRating ?? 0,
          city: ho.city ?? '', country: ho.country ?? '',
          checkIn: ho.checkIn, checkOut: ho.checkOut,
          nights: ho.nights, rooms: ho.rooms, adults: ho.adults, children: ho.children,
          mealPlan: rate?.mealPlan ?? '', breakfastIncluded: rate?.breakfastIncluded ?? false,
          isRefundable: rate?.isRefundable ?? true, cancellationPolicy: rate?.cancellationPolicy ?? '',
          costMinor: i.costMinor, markupMinor: i.markupMinor, serviceFeeMinor: i.feeMinor,
          sellingPriceMinor: i.sellingMinor, clientNote: i.clientNote, sourceType: 'live_search',
        }
      })

      const items = cart
        .filter(i => !(i.type === 'flight' && (i.offer || i.manualFlight)) && !(i.type === 'hotel' && i.offer))
        .map(i => ({
          type: i.type, title: i.title,
          sellingPriceMinor: i.sellingMinor, costMinor: i.costMinor,
          markupMinor: i.markupMinor, serviceFeeMinor: i.feeMinor,
          clientNote: i.clientNote, clientVisible: true,
          sourceType: i.offer ? 'live_search' : 'manual',
          metadata: i.offer ? JSON.parse(JSON.stringify(i.offer)) : {},
        }))

      const r = await fetch('/api/admin/quotes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientName.trim(), clientEmail: clientEmail.trim(),
          clientPhone: clientPhone.trim() || undefined,
          title: title.trim(), currency, validDays,
          depositMinor: deposit.trim() ? Math.round(parseFloat(deposit) * 100) : undefined,
          depositPercentage: depositPct.trim() ? parseFloat(depositPct) : undefined,
          depositCurrency: currency,
          internalNotes: internalNote.trim() || undefined,
          flightOptions, hotelOptions, items, sendEmail: send,
        }),
      })
      let d: { quote?: { id: string }; error?: string }
      try {
        d = await r.json()
      } catch {
        throw new Error(`Server error (HTTP ${r.status}) — please try again or contact support`)
      }
      if (!r.ok) throw new Error(d.error ?? 'Failed to save quote')
      router.push(`/admin/quotes/${d.quote!.id}`)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  const step1Valid = clientName.trim() && clientEmail.trim() && title.trim()

  return (
    <div className="min-h-screen bg-gray-50">
      {dnbWarning && (
        <DoNotBookWarning
          clientName={clientName}
          reason={dnbWarning.reason}
          email={clientEmail.trim()}
          context="quote creation"
          onCancel={() => setDnbWarning(null)}
          onOverride={() => {
            dnbAcknowledged.current = true
            const send = dnbWarning.send
            setDnbWarning(null)
            void submit(send)
          }}
        />
      )}
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-xs text-gray-400 mb-2">
            <Link href="/admin" className="hover:text-gray-700">Home</Link>
            {' › '}
            <Link href="/admin/quotes" className="hover:text-gray-700">Quotes</Link>
            {' › '}
            <span className="text-gray-600">New Quote</span>
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Link href="/admin/quotes" className="text-gray-400 hover:text-gray-700">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-base font-semibold text-gray-900">Quotes &amp; Proposals</h1>
            </div>
            <StepIndicator current={step} />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ─── Step 1: Client ─── */}
        {step === 1 && (
          <div className="max-w-xl mx-auto">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-5">Client Details</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Name *</label>
                  <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Full name"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@email.com"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+44 7xxx xxxxxx"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quote Title *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Dubai Holiday Package 2026"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                    <select value={currency} onChange={e => setCurrency(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm">
                      {[['GBP','GBP £'],['USD','USD $'],['EUR','EUR €'],['AED','AED'],['CAD','CAD'],['NGN','NGN ₦']].map(([v,l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Valid For (days)</label>
                    <input type="number" min={1} max={90} value={validDays} onChange={e => setValidDays(Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm" />
                  </div>
                </div>
              </div>
              <button onClick={() => setStep(2)} disabled={!step1Valid}
                className="w-full mt-6 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                Continue to Search &amp; Add →
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 2: Search & Add ─── */}
        {step === 2 && (
          <>
            <div className="mb-4 p-3 bg-white rounded-xl border border-gray-200 text-sm text-gray-600 flex items-center justify-between">
              <span><strong>{clientName}</strong> · {clientEmail} · {currency} · Valid {validDays} days</span>
              <button onClick={() => setStep(1)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Edit Client</button>
            </div>
            {saveError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />{saveError}
              </div>
            )}
            <SearchAddStep
              currency={currency} cart={cart} onAdd={addToCart} onRemove={removeFromCart}
              clientName={clientName} clientEmail={clientEmail} validUntil={validUntil}
              onPreview={() => setStep(4)} onSave={() => submit(false)} onSend={() => submit(true)} saving={saving}
            />
          </>
        )}

        {/* ─── Step 3: Quote Details ─── */}
        {step === 3 && (
          <div className="max-w-xl mx-auto">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-5">Pricing &amp; Notes</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Deposit Amount ({currency}) — optional</label>
                  <input type="number" min={0} step="0.01" value={deposit} onChange={e => setDeposit(e.target.value)}
                    placeholder="0.00" className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Deposit % — optional</label>
                  <input type="number" min={0} max={100} value={depositPct} onChange={e => setDepositPct(e.target.value)}
                    placeholder="e.g. 25" className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes (staff only)</label>
                  <textarea value={internalNote} onChange={e => setInternalNote(e.target.value)} rows={3}
                    placeholder="Not visible to the client"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm resize-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(2)} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">← Back</button>
                <button onClick={() => setStep(4)} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700">Preview Quote →</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Step 4: Preview ─── */}
        {step === 4 && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-5 flex items-center gap-2">
                <Eye className="w-5 h-5 text-indigo-600" /> Review Quote
              </h2>
              <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2">
                {[['Client', clientName],['Email', clientEmail],['Title', title],['Valid Until', validUntil.toLocaleDateString('en-GB')]].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-gray-500">{k}</span><span className="font-medium">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                  <span className="font-semibold">Total</span>
                  <span className="font-mono font-bold text-indigo-700">{fmt(cart.reduce((s, i) => s + i.sellingMinor, 0), currency)}</span>
                </div>
              </div>
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{cart.length} Items</h3>
                <div className="space-y-2">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <span className="text-gray-800">{item.title}</span>
                      <span className="font-mono text-gray-700">{fmt(item.sellingMinor, item.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />{saveError}
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">← Edit</button>
                <button onClick={() => submit(false)} disabled={saving || cart.length === 0}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save as Draft
                </button>
                <button onClick={() => submit(true)} disabled={saving || cart.length === 0}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Send className="w-4 h-4" /> Send to Client
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
