'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search, Loader2, Users, Calendar, Clock, Plane, Check, Plus, Minus, ChevronDown } from 'lucide-react'

// ── Local types (mirrors server types — no server imports in client) ──────────

interface WalzAirport { code: string; name: string; city: string; country: string }
interface WalzService { code: string; name: string; type: string; airportCode: string; terminal?: string; description?: string; amenities?: string[] }
interface BaggageOption { code: string; label: string; description: string; displayPrice: string; perPerson: boolean }
interface Passenger { firstName: string; lastName: string; type: 'adult' | 'child' | 'infant' }

// ── Service type metadata ──────────────────────────────────────────────────────

const SERVICE_INFO: Record<string, { label: string; icon: string; requiresFlight: boolean }> = {
  'lounge':       { label: 'Airport Lounge',    icon: '🛋️', requiresFlight: true },
  'meet-greet':   { label: 'Meet & Greet',      icon: '🤝', requiresFlight: true },
  'transfer':     { label: 'Airport Transfer',  icon: '🚗', requiresFlight: false },
  'sleeping-pod': { label: 'Sleeping Pods',     icon: '😴', requiresFlight: false },
  'baggage':      { label: 'Baggage Delivery',  icon: '🧳', requiresFlight: false },
}

// ── Input helpers ──────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-white/60 text-xs font-semibold uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-white/5 border border-white/15 text-white placeholder:text-white/30
        rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#C9A84C]/60 transition-colors"
    />
  )
}

function Counter({ value, onChange, min = 1, max = 9 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-9 h-9 rounded-full border border-white/20 flex items-center justify-center
          text-white hover:border-[#C9A84C]/60 transition-colors disabled:opacity-30">
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="text-white font-bold text-lg w-6 text-center">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-9 h-9 rounded-full border border-white/20 flex items-center justify-center
          text-white hover:border-[#C9A84C]/60 transition-colors disabled:opacity-30">
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="bg-red-900/30 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-xl">
      {message}
    </div>
  )
}

// ── Airport autocomplete component ───────────────────────────────────────────

function AirportPicker({ selected, onSelect }: {
  selected: WalzAirport | null
  onSelect: (a: WalzAirport) => void
}) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<WalzAirport[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)

  const search = async () => {
    if (query.trim().length < 2) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/concierge/airport-services/search?mode=airports&q=${encodeURIComponent(query)}`)
      const data = await res.json() as { airports?: WalzAirport[] }
      setResults(data.airports ?? [])
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }

  const pick = (airport: WalzAirport) => {
    onSelect(airport)
    setQuery(`${airport.name} (${airport.code})`)
    setOpen(false)
    setResults([])
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); if (e.target.value.length < 2) setOpen(false) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search() } }}
          placeholder="e.g. London Heathrow or LHR"
          className="flex-1 bg-white/5 border border-white/15 text-white placeholder:text-white/30
            rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#C9A84C]/60 transition-colors"
        />
        <button
          onClick={() => void search()}
          disabled={loading || query.trim().length < 2}
          className="bg-[#C9A84C]/20 border border-[#C9A84C]/40 text-[#C9A84C] px-4 py-3 rounded-xl
            hover:bg-[#C9A84C]/30 transition-colors disabled:opacity-40 flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#0F2340] border border-white/15 rounded-xl
          shadow-xl z-20 overflow-hidden max-h-52 overflow-y-auto">
          {results.map(a => (
            <button
              key={a.code}
              onClick={() => pick(a)}
              className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
              <p className="text-white text-sm font-medium">{a.name}</p>
              <p className="text-white/40 text-xs">{a.city}, {a.country} · {a.code}</p>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <p className="mt-1.5 text-[#C9A84C] text-xs font-semibold">
          ✓ {selected.name} ({selected.code})
        </p>
      )}
    </div>
  )
}

// ── Passenger form ────────────────────────────────────────────────────────────

function PassengerForm({ passengers, onChange }: {
  passengers: Passenger[]
  onChange:   (passengers: Passenger[]) => void
}) {
  const update = (i: number, field: keyof Passenger, value: string) => {
    const next = passengers.map((p, idx) => idx === i ? { ...p, [field]: value } : p)
    onChange(next)
  }

  return (
    <div className="space-y-4">
      {passengers.map((p, i) => (
        <div key={i} className="bg-white/3 border border-white/8 rounded-xl p-4">
          <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">
            Passenger {i + 1} {i === 0 ? '(Lead)' : ''}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <TextInput value={p.firstName} onChange={v => update(i, 'firstName', v)} placeholder="First name" />
            <TextInput value={p.lastName}  onChange={v => update(i, 'lastName',  v)} placeholder="Last name"  />
            <div className="col-span-2">
              <div className="relative">
                <select
                  value={p.type}
                  onChange={e => update(i, 'type', e.target.value)}
                  className="w-full appearance-none bg-white/5 border border-white/15 text-white
                    rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#C9A84C]/60 pr-10">
                  <option value="adult">Adult</option>
                  <option value="child">Child</option>
                  <option value="infant">Infant</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Standard flow (lounge / meet-greet / transfer / sleeping-pod) ─────────────

function StandardFlow({ type, info }: { type: string; info: typeof SERVICE_INFO[string] }) {
  type Step = 'search' | 'results' | 'book' | 'review' | 'processing'

  const [step,    setStep]    = useState<Step>('search')
  const [error,   setError]   = useState('')

  // Search state
  const [selectedAirport, setSelectedAirport] = useState<WalzAirport | null>(null)
  const [date,       setDate]       = useState('')
  const [time,       setTime]       = useState('')
  const [pax,        setPax]        = useState(1)
  const [flightNum,  setFlightNum]  = useState('')

  // Results state
  const [services,        setServices]        = useState<WalzService[]>([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [selectedService, setSelectedService] = useState<WalzService | null>(null)
  const [servicePrice,    setServicePrice]    = useState('')
  const [priceLoading,    setPriceLoading]    = useState(false)

  // Booking state
  const [passengers, setPassengers] = useState<Passenger[]>([{ firstName: '', lastName: '', type: 'adult' }])
  const [leadEmail,  setLeadEmail]  = useState('')
  const [leadPhone,  setLeadPhone]  = useState('')

  // Checkout state
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const findServices = async () => {
    if (!selectedAirport || !date) return
    setServicesLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        mode: 'services', airport: selectedAirport.code, serviceType: type, date, pax: String(pax),
      })
      const res  = await fetch(`/api/concierge/airport-services/search?${params}`)
      const data = await res.json() as { services?: WalzService[]; error?: string }
      if (data.error) { setError(data.error); return }
      setServices(data.services ?? [])
      setStep('results')
    } catch {
      setError('Service search failed. Please try again.')
    } finally {
      setServicesLoading(false)
    }
  }

  const selectService = async (svc: WalzService) => {
    setSelectedService(svc)
    setPassengers(Array.from({ length: pax }, (_, i) => passengers[i] ?? { firstName: '', lastName: '', type: 'adult' }))
    setPriceLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ serviceCode: svc.code, pax: String(pax), date })
      const res  = await fetch(`/api/concierge/airport-services/quote?${params}`)
      const data = await res.json() as { price?: { displayPrice: string } }
      setServicePrice(data.price?.displayPrice ?? 'Price on request')
    } catch {
      setServicePrice('Price on request')
    } finally {
      setPriceLoading(false)
    }
    setStep('book')
  }

  const bookingValid = () =>
    passengers.every(p => p.firstName.trim() && p.lastName.trim()) &&
    leadEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail) &&
    (info.requiresFlight ? flightNum.trim() && time.trim() : true)

  const handleCheckout = async () => {
    setCheckoutLoading(true)
    setError('')
    try {
      const res = await fetch('/api/concierge/airport-services/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          serviceCode:  selectedService?.code,
          airportCode:  selectedAirport?.code,
          date, time: time || '00:00', flightNumber: flightNum,
          passengers, leadEmail, leadPhone,
        }),
      })
      const data = await res.json() as { reference?: string; checkoutUrl?: string; error?: string }
      if (!data.checkoutUrl) { setError(data.error ?? 'Checkout failed.'); setCheckoutLoading(false); return }
      setStep('processing')
      window.location.href = data.checkoutUrl
    } catch {
      setError('Checkout failed. Please try again.')
      setCheckoutLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (step === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 text-[#C9A84C] animate-spin" />
        <p className="text-white/60 text-sm">Redirecting to secure payment…</p>
      </div>
    )
  }

  if (step === 'search') {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <Field label="Airport">
          <AirportPicker selected={selectedAirport} onSelect={setSelectedAirport} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            <TextInput type="date" value={date} onChange={setDate} />
            {/* min prop handled via className — input type=date */}
          </Field>
          {info.requiresFlight && (
            <Field label="Flight time">
              <TextInput type="time" value={time} onChange={setTime} />
            </Field>
          )}
        </div>

        <Field label="Passengers">
          <div className="bg-white/5 border border-white/15 rounded-xl px-4 py-3 flex items-center gap-3">
            <Users className="w-4 h-4 text-white/40" />
            <Counter value={pax} onChange={v => { setPax(v) }} />
          </div>
        </Field>

        <ErrorBanner message={error} />

        <button
          onClick={() => void findServices()}
          disabled={servicesLoading || !selectedAirport || !date}
          className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-4 rounded-full
            hover:bg-[#d4b86e] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
          {servicesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {servicesLoading ? 'Searching…' : `Find ${info.label} Options`}
        </button>
      </div>
    )
  }

  if (step === 'results') {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <button onClick={() => setStep('search')} className="flex items-center gap-1.5 text-white/40 hover:text-[#C9A84C] text-xs transition-colors mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to search
        </button>
        <p className="text-white/60 text-sm">
          {services.length} {info.label}{services.length !== 1 ? ' options' : ''} at{' '}
          <span className="text-white font-medium">{selectedAirport?.name}</span>
        </p>

        {services.length === 0 && (
          <div className="bg-white/3 border border-white/10 rounded-2xl p-8 text-center">
            <p className="text-white/40 text-sm">No {info.label.toLowerCase()} services found for this airport and date.</p>
            <p className="text-white/30 text-xs mt-2">Try a different date or ask Jade for alternatives.</p>
          </div>
        )}

        {services.map(svc => (
          <div key={svc.code} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-[#C9A84C]/30 transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-bold text-base mb-1">{svc.name}</h3>
                {svc.terminal && <p className="text-[#C9A84C]/70 text-xs font-semibold mb-1">Terminal {svc.terminal}</p>}
                {svc.description && <p className="text-white/50 text-sm leading-relaxed">{svc.description}</p>}
                {svc.amenities && svc.amenities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {svc.amenities.slice(0, 4).map(a => (
                      <span key={a} className="text-[10px] bg-white/5 border border-white/10 text-white/50 px-2 py-0.5 rounded-full">{a}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => void selectService(svc)}
                disabled={priceLoading}
                className="flex-shrink-0 bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm px-5 py-2.5 rounded-full
                  hover:bg-[#d4b86e] transition-colors disabled:opacity-40">
                Select →
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (step === 'book') {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <button onClick={() => setStep('results')} className="flex items-center gap-1.5 text-white/40 hover:text-[#C9A84C] text-xs transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to options
        </button>

        {/* Selected service summary */}
        <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-white font-semibold text-sm">{selectedService?.name}</p>
            <p className="text-white/50 text-xs">{selectedAirport?.code} · {date}</p>
          </div>
          {priceLoading ? (
            <Loader2 className="w-4 h-4 text-[#C9A84C] animate-spin" />
          ) : (
            <p className="text-[#C9A84C] font-bold text-sm">{servicePrice}</p>
          )}
        </div>

        <PassengerForm passengers={passengers} onChange={setPassengers} />

        {/* Contact */}
        <div className="space-y-3">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Contact Details</p>
          <Field label="Email">
            <TextInput type="email" value={leadEmail} onChange={setLeadEmail} placeholder="your@email.com" />
          </Field>
          <Field label="Phone (optional)">
            <TextInput value={leadPhone} onChange={setLeadPhone} placeholder="+1 234 567 8900" />
          </Field>
        </div>

        {/* Flight details */}
        {(info.requiresFlight || !info.requiresFlight) && (
          <div className="space-y-3">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Flight Details</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Flight number">
                <TextInput value={flightNum} onChange={setFlightNum} placeholder="EK001" />
              </Field>
              <Field label="Flight time">
                <TextInput type="time" value={time} onChange={setTime} />
              </Field>
            </div>
          </div>
        )}

        <ErrorBanner message={error} />

        <button
          onClick={() => { setError(''); setStep('review') }}
          disabled={!bookingValid()}
          className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-4 rounded-full
            hover:bg-[#d4b86e] transition-colors disabled:opacity-40">
          Review Booking →
        </button>
      </div>
    )
  }

  // step === 'review'
  return (
    <div className="max-w-xl mx-auto space-y-6">
      <button onClick={() => setStep('book')} className="flex items-center gap-1.5 text-white/40 hover:text-[#C9A84C] text-xs transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Edit details
      </button>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-wider">Booking Summary</p>
        <dl className="space-y-2.5">
          {[
            ['Service',    selectedService?.name],
            ['Airport',    `${selectedAirport?.name} (${selectedAirport?.code})`],
            ['Date',       date],
            ['Time',       time || '—'],
            ['Flight',     flightNum || '—'],
            ['Passengers', String(passengers.length)],
            ['Price',      servicePrice],
            ['Email',      leadEmail],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-white/40 text-sm">{k}</dt>
              <dd className="text-white text-sm font-medium text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="text-white/30 text-xs text-center leading-relaxed">
        Your booking will be confirmed immediately after payment.
        You will receive a voucher by email.
      </p>

      <ErrorBanner message={error} />

      <button
        onClick={() => void handleCheckout()}
        disabled={checkoutLoading}
        className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-4 rounded-full
          hover:bg-[#d4b86e] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
        {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {checkoutLoading ? 'Processing…' : `Pay ${servicePrice}`}
      </button>
    </div>
  )
}

// ── Baggage flow ──────────────────────────────────────────────────────────────

function BaggageFlow() {
  type Step = 'search' | 'catalogue' | 'book' | 'review' | 'processing'

  const [step,  setStep]  = useState<Step>('search')
  const [error, setError] = useState('')

  // Search state
  const [selectedAirport, setSelectedAirport] = useState<WalzAirport | null>(null)
  const [date, setDate] = useState('')

  // Baggage service
  const [baggageServices, setBaggageServices] = useState<WalzService[]>([])
  const [selectedService, setSelectedService] = useState<WalzService | null>(null)
  const [servicesLoading, setServicesLoading] = useState(false)

  // Catalogue
  const [catalogue,    setCatalogue]    = useState<BaggageOption[]>([])
  const [catLoading,   setCatLoading]   = useState(false)
  const [selections,   setSelections]   = useState<Record<string, number>>({})
  const [quoteTotal,   setQuoteTotal]   = useState('')
  const [quoteLoading, setQuoteLoading] = useState(false)

  // Booking
  const [passengers, setPassengers] = useState<Passenger[]>([{ firstName: '', lastName: '', type: 'adult' }])
  const [leadEmail,  setLeadEmail]  = useState('')
  const [leadPhone,  setLeadPhone]  = useState('')
  const [flightNum,  setFlightNum]  = useState('')
  const [delivNotes, setDelivNotes] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const findBaggageServices = async () => {
    if (!selectedAirport || !date) return
    setServicesLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ mode: 'services', airport: selectedAirport.code, serviceType: 'baggage', date })
      const res  = await fetch(`/api/concierge/airport-services/search?${params}`)
      const data = await res.json() as { services?: WalzService[]; error?: string }
      if (data.error) { setError(data.error); return }
      const svcs = data.services ?? []
      setBaggageServices(svcs)
      if (svcs.length === 1) {
        // Auto-select single result → fetch catalogue
        await loadCatalogue(svcs[0])
      } else if (svcs.length > 1) {
        setStep('catalogue')
      } else {
        setError('No baggage services available at this airport for the selected date.')
      }
    } catch {
      setError('Search failed. Please try again.')
    } finally {
      setServicesLoading(false)
    }
  }

  const loadCatalogue = async (svc: WalzService) => {
    setSelectedService(svc)
    setCatLoading(true)
    setError('')
    try {
      const res  = await fetch(`/api/concierge/airport-services/baggage/catalogue?serviceCode=${svc.code}`)
      const data = await res.json() as { options?: BaggageOption[]; error?: string }
      if (data.error) { setError(data.error); return }
      setCatalogue(data.options ?? [])
      setSelections({})
      setStep('catalogue')
    } catch {
      setError('Failed to load baggage options.')
    } finally {
      setCatLoading(false)
    }
  }

  const updateSelection = (code: string, qty: number) => {
    setSelections(prev => {
      const next = { ...prev }
      if (qty <= 0) delete next[code]; else next[code] = qty
      return next
    })
  }

  const totalBags = Object.values(selections).reduce((a, b) => a + b, 0)

  const getQuote = async () => {
    if (!selectedService || totalBags === 0) return
    setQuoteLoading(true)
    setError('')
    try {
      const baggage = Object.entries(selections).map(([code, quantity]) => ({ code, quantity }))
      const res  = await fetch('/api/concierge/airport-services/baggage/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceCode: selectedService.code,
          passengers:  [{ type: 'adult', firstName: 'Guest', lastName: 'Traveller' }],
          baggage,
        }),
      })
      const data = await res.json() as { quote?: { displayTotal: string }; error?: string }
      if (data.error) { setError(data.error); return }
      setQuoteTotal(data.quote?.displayTotal ?? 'Price on request')
      setStep('book')
    } catch {
      setError('Quote failed. Please try again.')
    } finally {
      setQuoteLoading(false)
    }
  }

  const bookingValid = () =>
    passengers[0]?.firstName.trim() && passengers[0]?.lastName.trim() &&
    leadEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail)

  const handleCheckout = async () => {
    setCheckoutLoading(true)
    setError('')
    try {
      const baggage = Object.entries(selections).map(([code, quantity]) => ({ code, quantity }))
      const res = await fetch('/api/concierge/airport-services/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:        'baggage',
          serviceCode: selectedService?.code,
          airportCode: selectedAirport?.code,
          date, time: '00:00', flightNumber: flightNum || 'N/A',
          passengers, leadEmail, leadPhone,
          baggageItems: baggage,
        }),
      })
      const data = await res.json() as { checkoutUrl?: string; error?: string }
      if (!data.checkoutUrl) { setError(data.error ?? 'Checkout failed.'); setCheckoutLoading(false); return }
      setStep('processing')
      window.location.href = data.checkoutUrl
    } catch {
      setError('Checkout failed. Please try again.')
      setCheckoutLoading(false)
    }
  }

  if (step === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 text-[#C9A84C] animate-spin" />
        <p className="text-white/60 text-sm">Redirecting to secure payment…</p>
      </div>
    )
  }

  if (step === 'search') {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <Field label="Airport">
          <AirportPicker selected={selectedAirport} onSelect={setSelectedAirport} />
        </Field>
        <Field label="Collection / delivery date">
          <TextInput type="date" value={date} onChange={setDate} />
        </Field>
        <ErrorBanner message={error} />
        <button
          onClick={() => void findBaggageServices()}
          disabled={servicesLoading || !selectedAirport || !date}
          className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-4 rounded-full
            hover:bg-[#d4b86e] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
          {servicesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {servicesLoading ? 'Searching…' : 'Find Baggage Services'}
        </button>
      </div>
    )
  }

  if (step === 'catalogue') {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <button onClick={() => setStep('search')} className="flex items-center gap-1.5 text-white/40 hover:text-[#C9A84C] text-xs transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>

        {catLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
          </div>
        ) : catalogue.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-8">No baggage options available.</p>
        ) : (
          <>
            <p className="text-white/60 text-sm">Select the bags you want delivered:</p>
            <div className="space-y-3">
              {catalogue.map(opt => (
                <div key={opt.code} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">{opt.label}</p>
                    {opt.description && <p className="text-white/40 text-xs">{opt.description}</p>}
                    <p className="text-[#C9A84C] text-xs font-semibold mt-1">{opt.displayPrice}</p>
                  </div>
                  <Counter value={selections[opt.code] ?? 0} onChange={v => updateSelection(opt.code, v)} min={0} />
                </div>
              ))}
            </div>
            <ErrorBanner message={error} />
            <button
              onClick={() => void getQuote()}
              disabled={quoteLoading || totalBags === 0}
              className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-4 rounded-full
                hover:bg-[#d4b86e] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {quoteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {quoteLoading ? 'Getting quote…' : `Get Quote (${totalBags} bag${totalBags !== 1 ? 's' : ''})`}
            </button>
          </>
        )}
      </div>
    )
  }

  if (step === 'book') {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <button onClick={() => setStep('catalogue')} className="flex items-center gap-1.5 text-white/40 hover:text-[#C9A84C] text-xs transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to bag selection
        </button>

        <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-white font-semibold text-sm">{selectedService?.name}</p>
            <p className="text-white/50 text-xs">{totalBags} bag{totalBags !== 1 ? 's' : ''} · {date}</p>
          </div>
          <p className="text-[#C9A84C] font-bold text-sm">{quoteTotal}</p>
        </div>

        <PassengerForm passengers={passengers} onChange={setPassengers} />

        <div className="space-y-3">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Contact &amp; Delivery</p>
          <Field label="Email"><TextInput type="email" value={leadEmail} onChange={setLeadEmail} placeholder="your@email.com" /></Field>
          <Field label="Phone (optional)"><TextInput value={leadPhone} onChange={setLeadPhone} placeholder="+1 234 567 8900" /></Field>
          <Field label="Flight number (if applicable)"><TextInput value={flightNum} onChange={setFlightNum} placeholder="EK001" /></Field>
          <Field label="Delivery notes">
            <textarea
              value={delivNotes}
              onChange={e => setDelivNotes(e.target.value)}
              placeholder="Hotel name and address, room number, or home address…"
              rows={3}
              className="w-full bg-white/5 border border-white/15 text-white placeholder:text-white/30
                rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#C9A84C]/60 resize-none transition-colors"
            />
          </Field>
        </div>

        <ErrorBanner message={error} />
        <button
          onClick={() => { setError(''); setStep('review') }}
          disabled={!bookingValid()}
          className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-4 rounded-full
            hover:bg-[#d4b86e] transition-colors disabled:opacity-40">
          Review Booking →
        </button>
      </div>
    )
  }

  // step === 'review'
  return (
    <div className="max-w-xl mx-auto space-y-6">
      <button onClick={() => setStep('book')} className="flex items-center gap-1.5 text-white/40 hover:text-[#C9A84C] text-xs transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Edit details
      </button>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-wider">Booking Summary</p>
        <dl className="space-y-2.5">
          {[
            ['Service', selectedService?.name],
            ['Airport', `${selectedAirport?.name} (${selectedAirport?.code})`],
            ['Date',    date],
            ['Bags',    String(totalBags)],
            ['Price',   quoteTotal],
            ['Email',   leadEmail],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-white/40 text-sm">{k}</dt>
              <dd className="text-white text-sm font-medium text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ErrorBanner message={error} />

      <button
        onClick={() => void handleCheckout()}
        disabled={checkoutLoading}
        className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-4 rounded-full
          hover:bg-[#d4b86e] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
        {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {checkoutLoading ? 'Processing…' : `Pay ${quoteTotal}`}
      </button>
    </div>
  )
}

// ── Top-level export ──────────────────────────────────────────────────────────

export default function AirportServiceFlow({ type }: { type: string }) {
  const info = SERVICE_INFO[type] ?? SERVICE_INFO['lounge']

  return (
    <div>
      {type === 'baggage' ? <BaggageFlow /> : <StandardFlow type={type} info={info} />}
    </div>
  )
}
