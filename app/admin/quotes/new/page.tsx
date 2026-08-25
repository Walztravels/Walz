'use client'

import { useState, useCallback, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  onConfirm: (markup: number, fee: number, tax: number, selling: number, note: string, recommended: boolean) => void
  onCancel: () => void
}) {
  const [markup,      setMarkup]      = useState(0)
  const [fee,         setFee]         = useState(0)
  const [tax,         setTax]         = useState(0)
  const [note,        setNote]        = useState('')
  const [recommended, setRecommended] = useState(false)
  const selling = supplierMinor + markup + fee + tax

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
          <button onClick={() => onConfirm(markup, fee, tax, selling, note, recommended)}
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

function FlightCard({
  offer, onAdd, badge,
}: {
  offer: NormalizedFlightOffer; onAdd: () => void; badge?: 'recommended' | 'lowest'
}) {
  const [open, setOpen] = useState(false)
  const seg0 = offer.segments[0]
  const segL = offer.segments[offer.segments.length - 1]
  const stops = offer.segments.length - 1
  const totalMins = offer.segments.reduce((s, sg) => s + (sg.durationMinutes ?? 0), 0)
  const flightNums = offer.segments.map(s => s.flightNumber).filter(Boolean).join(' | ')

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

        <div className="mt-3 flex items-center gap-3">
          <div className="text-center min-w-[60px]">
            <div className="font-bold text-gray-900 text-lg leading-none">{seg0?.departureAt?.slice(11, 16)}</div>
            <div className="text-sm font-bold text-gray-700 mt-0.5">{seg0?.originCode}</div>
            <div className="text-xs text-gray-400 leading-tight">{seg0?.originCity ?? ''}</div>
            <div className="text-xs text-gray-400">{seg0?.departureAt?.slice(5, 10).replace('-', ' ')}</div>
          </div>
          <div className="flex-1 text-center">
            <div className="text-xs text-gray-400 mb-1">{dur(totalMins)}</div>
            <div className="relative flex items-center">
              <div className="flex-1 h-px bg-gray-300" />
              <div className={`w-2 h-2 rounded-full mx-1 ${stops > 0 ? 'bg-amber-400' : 'bg-gray-300'}`} />
              <div className="flex-1 h-px bg-gray-300" />
            </div>
            {stops > 0 ? (
              <div className="text-xs text-amber-600 mt-1">
                {stops} stop {seg0?.destinationCode}<br />
                {stops === 1 && seg0?.durationMinutes ? dur(seg0.durationMinutes) + ' layover' : ''}
              </div>
            ) : (
              <div className="text-xs text-green-600 mt-1">Direct</div>
            )}
          </div>
          <div className="text-center min-w-[60px]">
            <div className="font-bold text-gray-900 text-lg leading-none">{segL?.arrivalAt?.slice(11, 16)}</div>
            <div className="text-sm font-bold text-gray-700 mt-0.5">{segL?.destinationCode}</div>
            <div className="text-xs text-gray-400 leading-tight">{segL?.destinationCity ?? ''}</div>
            <div className="text-xs text-gray-400">{segL?.arrivalAt?.slice(5, 10).replace('-', ' ')}</div>
          </div>
        </div>

        {offer.returnSegments?.length > 0 && (() => {
          const r0 = offer.returnSegments[0]
          const rL = offer.returnSegments[offer.returnSegments.length - 1]
          const rMins = offer.returnSegments.reduce((s, sg) => s + (sg.durationMinutes ?? 0), 0)
          return (
            <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-3">
              <div className="text-center">
                <div className="text-sm font-bold text-gray-700">{r0?.departureAt?.slice(11, 16)}</div>
                <div className="text-xs text-gray-500">{r0?.originCode}</div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs text-gray-400">{dur(rMins)}</div>
                <div className="flex items-center mt-0.5"><div className="flex-1 h-px bg-gray-300" /><span className="text-xs text-gray-400 px-1">↩</span><div className="flex-1 h-px bg-gray-300" /></div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-gray-700">{rL?.arrivalAt?.slice(11, 16)}</div>
                <div className="text-xs text-gray-500">{rL?.destinationCode}</div>
              </div>
            </div>
          )
        })()}

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
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Outbound</p>
          {offer.segments.map((s, i) => (
            <div key={i} className="flex items-center gap-3 text-xs text-gray-600 bg-white rounded px-3 py-2">
              <span className="font-mono font-medium w-16 shrink-0">{s.flightNumber ?? '—'}</span>
              <span>{s.originCode} {s.departureAt?.slice(11, 16)} → {s.destinationCode} {s.arrivalAt?.slice(11, 16)}</span>
              <span className="text-gray-400 ml-auto">{dur(s.durationMinutes)}</span>
            </div>
          ))}
          {offer.returnSegments?.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2 mb-1">Return</p>
              {offer.returnSegments.map((s, i) => (
                <div key={i} className="flex items-center gap-3 text-xs text-gray-600 bg-white rounded px-3 py-2">
                  <span className="font-mono font-medium w-16 shrink-0">{s.flightNumber ?? '—'}</span>
                  <span>{s.originCode} {s.departureAt?.slice(11, 16)} → {s.destinationCode} {s.arrivalAt?.slice(11, 16)}</span>
                  <span className="text-gray-400 ml-auto">{dur(s.durationMinutes)}</span>
                </div>
              ))}
            </>
          )}
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
        res = await fetch('/api/admin/travel-search/flights', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: fFrom, to: fTo, depart: fDepart, return: fReturn, trip: fTrip, cabin: fCabin, adults: fAdults, children: fChildren, infants: fInfants }),
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
  }, [tab, fFrom, fTo, fDepart, fReturn, fTrip, fCabin, fAdults, fChildren, fInfants,
      hDest, hIn, hOut, hAdults, hChildren, hRooms, aCode, aFrom, aTo,
      tPickupType, tPickupCode, tDropType, tDropCode, tDate, tAdults, currency])

  const confirmAdd = (markup: number, fee: number, tax: number, selling: number, note: string, recommended: boolean) => {
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
      offer, extra,
    })
    setPending(null)
  }

  const openPricing = (
    type: Exclude<ProductType, 'custom'>,
    offer: NormalizedFlightOffer | NormalizedHotelOffer | NormalizedActivityOffer | NormalizedTransferOffer,
    supplierMinor: number, extra?: Record<string, string>,
  ) => setPending({ type, offer, supplierMinor, extra })

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
                <button onClick={search} disabled={loading || !fFrom || !fTo || !fDepart}
                  className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Search Flights
                </button>
              </div>
            </div>

            {/* Filter bar */}
            {flightResults.length > 0 && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-xs text-gray-700 font-semibold">{flightResults.length} results found</span>
                <span className="text-xs text-gray-400">· Prices include taxes and fees</span>
                <div className="ml-auto flex items-center gap-1.5">
                  {['Stops', 'Airlines', 'Departure Time', 'Baggage', 'Price'].map(f => (
                    <button key={f} className="text-xs border border-gray-300 px-2.5 py-1 rounded-full hover:bg-gray-50">{f}</button>
                  ))}
                  <button className="text-xs border border-gray-300 px-2.5 py-1 rounded-full hover:bg-gray-50 flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3" /> More Filters
                  </button>
                  <span className="text-xs text-gray-500 ml-2">Sort by:</span>
                  <select className="text-xs border border-gray-300 px-2 py-1 rounded-full bg-white">
                    <option>Recommended</option><option>Price</option><option>Duration</option>
                  </select>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {flightResults.map((o, i) => (
                <FlightCard key={i} offer={o}
                  badge={i === 0 ? 'recommended' : i === flightResults.length - 1 ? 'lowest' : undefined}
                  onAdd={() => openPricing('flight', o, o.supplierTotalMinor)} />
              ))}
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

function NewQuoteInner() {
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

  const validUntil = (() => {
    const d = new Date(); d.setDate(d.getDate() + validDays); return d
  })()

  const addToCart    = (item: CartItem) => setCart(prev => [...prev, item])
  const removeFromCart = (id: string)  => setCart(prev => prev.filter(i => i.id !== id))

  const submit = async (send = false) => {
    setSaving(true); setSaveError(null)
    try {
      const flightOptions = cart.filter(i => i.type === 'flight' && i.offer).map(i => {
        const fo = i.offer as NormalizedFlightOffer
        const allSegs = [...fo.segments, ...(fo.returnSegments ?? [])]
        return {
          label: i.title, isRecommended: i.isRecommended,
          airline: fo.airline, airlineCode: fo.airlineCode ?? '',
          tripType: fo.tripType === 'round-trip' ? 'roundtrip' : fo.tripType === 'multi-city' ? 'multicity' : 'oneway',
          cabinClass: fo.cabinClass, isRefundable: fo.isRefundable, changesAllowed: fo.isChangeable,
          personalItem: fo.personalItem ?? '', cabinBaggage: fo.cabinBaggage ?? '',
          checkedBaggage: fo.checkedBaggage ?? '', checkedPieces: fo.checkedPieces ?? null, checkedWeight: fo.checkedWeight ?? '',
          duffelOfferId: fo.providerOfferId, fareExpiresAt: fo.offerExpiresAt ?? '',
          costMinor: i.costMinor, markupMinor: i.markupMinor, serviceFeeMinor: i.feeMinor,
          sellingPriceMinor: i.sellingMinor, clientNote: i.clientNote, sourceType: 'live_search',
          segments: allSegs.map((s, si) => ({
            segmentOrder: si,
            originCode: s.originCode, originCity: s.originCity ?? '', originTerminal: s.originTerminal ?? '',
            departureAt: s.departureAt, destinationCode: s.destinationCode,
            destinationCity: s.destinationCity ?? '', destinationTerminal: s.destinationTerminal ?? '',
            arrivalAt: s.arrivalAt, flightNumber: s.flightNumber ?? '', aircraft: s.aircraft ?? '',
            durationMinutes: s.durationMinutes ?? 0, stops: s.stops,
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
        .filter(i => !(i.type === 'flight' && i.offer) && !(i.type === 'hotel' && i.offer))
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

export default function NewQuotePage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400 text-sm">Loading…</div>}>
      <NewQuoteInner />
    </Suspense>
  )
}
