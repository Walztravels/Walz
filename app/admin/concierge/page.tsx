'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Sparkles, Search, ChevronDown, ChevronUp, Clock,
  CheckCircle, XCircle, AlertCircle, Loader2, User, FileText,
  Plus, Upload, RotateCcw, ImageIcon, ArrowLeft,
  Plane, Briefcase, Car, Moon, Luggage, Star, Lock,
  Pencil, Trash2, ToggleLeft, ToggleRight, LayoutGrid, AlertTriangle,
} from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConciergeRequest {
  id:               string
  reference:        string
  status:           string
  sla:              string
  intent_fields:    Record<string, unknown>
  created_at:       string
  updated_at:       string
  client_name:      string | null
  client_email:     string | null
  chatwoot_conv_id: number | null
  assigned_to:      string | null
  internal_notes:   string | null
  category:         { name: string; slug: string } | null
}

interface WalzAirport { code: string; name: string; city: string; country: string }
interface WalzService  { code: string; name: string; type: string; airportCode: string; terminal?: string; description?: string }
interface Passenger    { firstName: string; lastName: string; type: 'adult' | 'child' | 'infant' }

interface ConciergeImage {
  slug:       string
  label:      string
  currentUrl: string
  defaultUrl: string
  isCustom:   boolean
  fileName:   string | null
  updatedAt:  string | null
  updatedBy:  string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ['ALL', 'PENDING', 'QUOTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

const STATUS_STYLES: Record<string, string> = {
  PENDING:     'bg-amber-50 text-amber-700 border-amber-200',
  QUOTED:      'bg-blue-50 text-blue-700 border-blue-200',
  CONFIRMED:   'bg-green-50 text-green-700 border-green-200',
  IN_PROGRESS: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED:   'bg-gray-50 text-gray-600 border-gray-200',
  CANCELLED:   'bg-red-50 text-red-600 border-red-200',
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING:     <Clock className="w-3 h-3" />,
  QUOTED:      <AlertCircle className="w-3 h-3" />,
  CONFIRMED:   <CheckCircle className="w-3 h-3" />,
  IN_PROGRESS: <Loader2 className="w-3 h-3" />,
  COMPLETED:   <CheckCircle className="w-3 h-3" />,
  CANCELLED:   <XCircle className="w-3 h-3" />,
}

const SERVICE_TYPES = [
  { key: 'lounge',         label: 'Airport Lounge',    icon: <Star    className="w-5 h-5" />, requiresFlight: true  },
  { key: 'meet-greet',     label: 'Meet & Greet',      icon: <User    className="w-5 h-5" />, requiresFlight: true  },
  { key: 'transfer',       label: 'Airport Transfer',  icon: <Car     className="w-5 h-5" />, requiresFlight: false },
  { key: 'sleeping-pod',   label: 'Sleeping Pods',     icon: <Moon    className="w-5 h-5" />, requiresFlight: false },
  { key: 'baggage',        label: 'Baggage Delivery',  icon: <Luggage className="w-5 h-5" />, requiresFlight: false },
  { key: 'private-aviation', label: 'Private Aviation', icon: <Plane  className="w-5 h-5" />, requiresFlight: false },
]

const AIRCRAFT_CATEGORIES = [
  { key: 'very_light',       label: 'Very Light Jet',    seats: '4–6'  },
  { key: 'light',            label: 'Light Jet',         seats: '6–8'  },
  { key: 'midsize',          label: 'Midsize Jet',       seats: '8–9'  },
  { key: 'super_midsize',    label: 'Super Midsize Jet', seats: '9–11' },
  { key: 'heavy',            label: 'Heavy Jet',         seats: '10–16' },
  { key: 'ultra_long_range', label: 'Ultra Long Range',  seats: '10–19' },
]

// ── Shared input helpers ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
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
      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]"
    />
  )
}

// ── Airport picker ────────────────────────────────────────────────────────────

function AirportPicker({ label, selected, onSelect }: {
  label:    string
  selected: WalzAirport | null
  onSelect: (a: WalzAirport) => void
}) {
  const [q,       setQ]       = useState('')
  const [results, setResults] = useState<WalzAirport[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)

  const search = async () => {
    if (q.trim().length < 2) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/concierge/airport-services/search?mode=airports&q=${encodeURIComponent(q)}`)
      const data = await res.json() as { airports?: WalzAirport[] }
      setResults(data.airports ?? [])
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Field label={label}>
      <div className="relative">
        <div className="flex gap-2">
          <input
            value={selected ? `${selected.name} (${selected.code})` : q}
            onChange={e => { setQ(e.target.value); if (selected) { setQ(''); onSelect(null as unknown as WalzAirport) } }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search() } }}
            placeholder="e.g. Lagos, LOS…"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]"
          />
          <button
            onClick={() => void search()}
            disabled={loading || q.trim().length < 2}
            className="px-3 py-2 bg-[#0B1F3A] text-[#C9A84C] rounded-lg text-xs font-semibold hover:bg-[#162d52] transition-colors disabled:opacity-40">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </div>
        {open && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
            {results.map(a => (
              <button
                key={a.code}
                onClick={() => { onSelect(a); setOpen(false); setResults([]) }}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                <p className="text-sm font-medium text-[#0B1F3A]">{a.name}</p>
                <p className="text-xs text-gray-400">{a.city}, {a.country} · {a.code}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </Field>
  )
}

// ── New Request panel ─────────────────────────────────────────────────────────

function NewRequestPanel() {
  type Step = 'type' | 'details' | 'passengers' | 'submitting' | 'done'

  const [step,          setStep]          = useState<Step>('type')
  const [serviceType,   setServiceType]   = useState<typeof SERVICE_TYPES[number] | null>(null)
  const [airport,       setAirport]       = useState<WalzAirport | null>(null)
  const [date,          setDate]          = useState('')
  const [time,          setTime]          = useState('10:00')
  const [flightNum,     setFlightNum]     = useState('')
  const [pax,           setPax]           = useState(1)
  const [services,      setServices]      = useState<WalzService[]>([])
  const [svcLoading,    setSvcLoading]    = useState(false)
  const [selService,    setSelService]    = useState<WalzService | null>(null)
  const [passengers,    setPassengers]    = useState<Passenger[]>([{ firstName: '', lastName: '', type: 'adult' }])
  const [clientName,    setClientName]    = useState('')
  const [clientEmail,   setClientEmail]   = useState('')
  const [clientPhone,   setClientPhone]   = useState('')
  const [avFrom,        setAvFrom]        = useState('')
  const [avTo,          setAvTo]          = useState('')
  const [avReturnDate,  setAvReturnDate]  = useState('')
  const [avCategory,    setAvCategory]    = useState('')
  const [avNotes,       setAvNotes]       = useState('')
  const [error,         setError]         = useState('')
  const [result,        setResult]        = useState<{ reference: string; bookingNumber?: number; quoteId?: number } | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const selectType = (svc: typeof SERVICE_TYPES[number]) => {
    setServiceType(svc)
    setStep('details')
    setError('')
  }

  const findServices = async () => {
    if (!airport || !date) return
    setSvcLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams({ mode: 'services', airport: airport.code, serviceType: serviceType!.key, date, pax: String(pax) })
      const res  = await fetch(`/api/concierge/airport-services/search?${qs}`)
      const data = await res.json() as { services?: WalzService[]; error?: string }
      if (data.error) { setError(data.error); return }
      setServices(data.services ?? [])
    } catch {
      setError('Service search failed.')
    } finally {
      setSvcLoading(false)
    }
  }

  const goToPassengers = (svc: WalzService) => {
    setSelService(svc)
    setPassengers(Array.from({ length: pax }, (_, i) => passengers[i] ?? { firstName: '', lastName: '', type: 'adult' }))
    setStep('passengers')
  }

  const submit = async () => {
    setStep('submitting')
    setError('')
    try {
      let body: Record<string, unknown>

      if (serviceType?.key === 'private-aviation') {
        body = {
          serviceType:  'private-aviation',
          from:         avFrom.trim().toUpperCase(),
          to:           avTo.trim().toUpperCase(),
          date,
          returnDate:   avReturnDate || undefined,
          passengers:   pax,
          category:     avCategory || undefined,
          notes:        avNotes || undefined,
          clientName,
          clientEmail,
          clientPhone:  clientPhone || undefined,
        }
      } else {
        body = {
          serviceType:  serviceType?.key,
          serviceCode:  selService?.code,
          airportCode:  airport?.code,
          date,
          time,
          flightNumber: flightNum || undefined,
          passengers,
          clientName:   clientName || undefined,
          clientEmail,
          clientPhone:  clientPhone || undefined,
        }
      }

      const res  = await fetch('/api/admin/concierge/book', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json() as { success?: boolean; reference?: string; bookingNumber?: number; quoteId?: number; error?: string }

      if (!data.success) {
        setError(data.error ?? 'Booking failed.')
        setStep(serviceType?.key === 'private-aviation' ? 'details' : 'passengers')
        return
      }

      setResult({ reference: data.reference!, bookingNumber: data.bookingNumber, quoteId: data.quoteId })
      setStep('done')
    } catch {
      setError('Network error. Please try again.')
      setStep(serviceType?.key === 'private-aviation' ? 'details' : 'passengers')
    }
  }

  if (step === 'done' && result) {
    return (
      <div className="max-w-lg mx-auto text-center py-12 space-y-4">
        <div className="w-14 h-14 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto">
          <CheckCircle className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="text-lg font-bold text-[#0B1F3A]">
          {result.bookingNumber ? 'Booking Confirmed' : 'Enquiry Submitted'}
        </h3>
        <p className="text-sm text-gray-500">Reference: <span className="font-bold text-[#0B1F3A]">{result.reference}</span></p>
        {result.bookingNumber && <p className="text-sm text-gray-500">CP Booking #{result.bookingNumber}</p>}
        {result.quoteId       && <p className="text-sm text-gray-500">Aviapages Quote #{result.quoteId}</p>}
        <button
          onClick={() => { setStep('type'); setServiceType(null); setAirport(null); setServices([]); setSelService(null); setResult(null); setError('') }}
          className="mt-4 px-6 py-2 bg-[#0B1F3A] text-[#C9A84C] text-sm font-bold rounded-lg hover:bg-[#162d52] transition-colors">
          New Request
        </button>
      </div>
    )
  }

  if (step === 'submitting') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        <p className="text-sm text-gray-500">Processing booking…</p>
      </div>
    )
  }

  if (step === 'type') {
    return (
      <div className="max-w-2xl mx-auto">
        <h3 className="text-base font-bold text-[#0B1F3A] mb-4">Select Service Type</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {SERVICE_TYPES.map(svc => (
            <button
              key={svc.key}
              onClick={() => selectType(svc)}
              className="flex flex-col items-center gap-2 p-5 bg-white border border-gray-100 rounded-2xl hover:border-[#C9A84C]/50 hover:shadow-md transition-all text-center group">
              <span className="text-[#C9A84C] group-hover:scale-110 transition-transform">{svc.icon}</span>
              <span className="text-xs font-semibold text-[#0B1F3A]">{svc.label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'details') {
    const isAviation = serviceType?.key === 'private-aviation'

    return (
      <div className="max-w-lg mx-auto space-y-4">
        <button onClick={() => setStep('type')} className="flex items-center gap-1.5 text-gray-400 hover:text-[#C9A84C] text-xs transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <h3 className="text-base font-bold text-[#0B1F3A]">{serviceType?.label}</h3>

        {isAviation ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From (ICAO/IATA)">
                <TextInput value={avFrom} onChange={setAvFrom} placeholder="LOS" />
              </Field>
              <Field label="To (ICAO/IATA)">
                <TextInput value={avTo} onChange={setAvTo} placeholder="LHR" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Departure date">
                <TextInput type="date" value={date} onChange={setDate} />
              </Field>
              <Field label="Return date (optional)">
                <TextInput type="date" value={avReturnDate} onChange={setAvReturnDate} />
              </Field>
            </div>
            <Field label="Passengers">
              <input
                type="number" min={1} max={99}
                value={pax} onChange={e => setPax(Number(e.target.value))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]"
              />
            </Field>
            <Field label="Aircraft category (optional)">
              <select
                value={avCategory}
                onChange={e => setAvCategory(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A] bg-white">
                <option value="">Any</option>
                {AIRCRAFT_CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.label} ({c.seats} seats)</option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <textarea
                value={avNotes} onChange={e => setAvNotes(e.target.value)}
                placeholder="Special requirements, preferred operators…"
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A] resize-none"
              />
            </Field>
            {/* Client details */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Client Details</p>
              <div className="space-y-3">
                <Field label="Full name"><TextInput value={clientName} onChange={setClientName} placeholder="Seyi Adeyemi" /></Field>
                <Field label="Email"><TextInput type="email" value={clientEmail} onChange={setClientEmail} placeholder="client@example.com" /></Field>
                <Field label="Phone (optional)"><TextInput value={clientPhone} onChange={setClientPhone} placeholder="+234 …" /></Field>
              </div>
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button
              onClick={() => void submit()}
              disabled={!avFrom || !avTo || !date || !clientName || !clientEmail}
              className="w-full py-3 bg-[#0B1F3A] text-[#C9A84C] font-bold text-sm rounded-xl hover:bg-[#162d52] transition-colors disabled:opacity-40">
              Submit Enquiry
            </button>
          </>
        ) : (
          <>
            <AirportPicker label="Airport" selected={airport} onSelect={setAirport} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <TextInput type="date" value={date} onChange={setDate} />
              </Field>
              {serviceType?.requiresFlight && (
                <Field label="Flight time">
                  <TextInput type="time" value={time} onChange={setTime} />
                </Field>
              )}
            </div>
            <Field label="Passengers">
              <input
                type="number" min={1} max={9}
                value={pax} onChange={e => setPax(Number(e.target.value))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]"
              />
            </Field>
            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button
              onClick={() => void findServices()}
              disabled={svcLoading || !airport || !date}
              className="w-full py-3 bg-[#0B1F3A] text-[#C9A84C] font-bold text-sm rounded-xl hover:bg-[#162d52] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {svcLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Searching…</> : 'Search Services'}
            </button>

            {services.length > 0 && (
              <div className="space-y-2 mt-2">
                <p className="text-xs text-gray-500">{services.length} option{services.length !== 1 ? 's' : ''} at {airport?.name}</p>
                {services.map(svc => (
                  <div key={svc.code} className="bg-white border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0B1F3A] truncate">{svc.name}</p>
                      {svc.terminal && <p className="text-xs text-[#C9A84C]">Terminal {svc.terminal}</p>}
                      {svc.description && <p className="text-xs text-gray-400 truncate">{svc.description}</p>}
                    </div>
                    <button
                      onClick={() => goToPassengers(svc)}
                      className="flex-shrink-0 px-3 py-1.5 bg-[#C9A84C] text-[#0B1F3A] text-xs font-bold rounded-lg hover:bg-[#d4b86e] transition-colors">
                      Select
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // step === 'passengers'
  return (
    <div className="max-w-lg mx-auto space-y-4">
      <button onClick={() => setStep('details')} className="flex items-center gap-1.5 text-gray-400 hover:text-[#C9A84C] text-xs transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-xl px-4 py-3">
        <p className="text-sm font-semibold text-[#0B1F3A]">{selService?.name}</p>
        <p className="text-xs text-gray-500">{airport?.name} · {date}</p>
      </div>

      {/* Passengers */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Passenger Details</p>
        {passengers.map((p, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
            <p className="text-xs text-gray-400 font-semibold">Passenger {i + 1}{i === 0 ? ' (Lead)' : ''}</p>
            <div className="grid grid-cols-2 gap-2">
              <TextInput value={p.firstName} onChange={v => setPassengers(prev => prev.map((x, j) => j === i ? { ...x, firstName: v } : x))} placeholder="First name" />
              <TextInput value={p.lastName}  onChange={v => setPassengers(prev => prev.map((x, j) => j === i ? { ...x, lastName:  v } : x))} placeholder="Last name"  />
            </div>
            <select
              value={p.type}
              onChange={e => setPassengers(prev => prev.map((x, j) => j === i ? { ...x, type: e.target.value as Passenger['type'] } : x))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A] bg-white">
              <option value="adult">Adult</option>
              <option value="child">Child</option>
              <option value="infant">Infant</option>
            </select>
          </div>
        ))}
      </div>

      {/* Flight details */}
      {serviceType?.requiresFlight && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Flight Details</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Flight number"><TextInput value={flightNum} onChange={setFlightNum} placeholder="EK001" /></Field>
            <Field label="Time"><TextInput type="time" value={time} onChange={setTime} /></Field>
          </div>
        </div>
      )}

      {/* Client info */}
      <div className="border-t border-gray-100 pt-3 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client Contact</p>
        <Field label="Client name (optional)"><TextInput value={clientName} onChange={setClientName} placeholder="Full name" /></Field>
        <Field label="Email *"><TextInput type="email" value={clientEmail} onChange={setClientEmail} placeholder="client@example.com" /></Field>
        <Field label="Phone (optional)"><TextInput value={clientPhone} onChange={setClientPhone} placeholder="+234 …" /></Field>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <button
        onClick={() => void submit()}
        disabled={!passengers.every(p => p.firstName && p.lastName) || !clientEmail}
        className="w-full py-3 bg-[#0B1F3A] text-[#C9A84C] font-bold text-sm rounded-xl hover:bg-[#162d52] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
        <Briefcase className="w-4 h-4" />
        Confirm Booking
      </button>
    </div>
  )
}

// ── Image manager ─────────────────────────────────────────────────────────────

function ImageManagerPanel() {
  const { role, loading: permLoading } = useStaffPermissions()
  const isSuperAdmin = role === 'super_admin'

  const [images,    setImages]    = useState<ConciergeImage[]>([])
  const [loading,   setLoading]   = useState(true)
  const [dragging,  setDragging]  = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [resetting, setResetting] = useState<string | null>(null)
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/concierge/images')
      const data = await res.json() as { images?: ConciergeImage[] }
      setImages(data.images ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const upload = async (slug: string, file: File) => {
    setUploading(slug)
    try {
      const fd = new FormData()
      fd.append('slug', slug)
      fd.append('file', file)
      const res  = await fetch('/api/admin/concierge/images', { method: 'POST', body: fd })
      const data = await res.json() as { success?: boolean; customUrl?: string; error?: string }
      if (data.success && data.customUrl) {
        setImages(prev => prev.map(img => img.slug === slug ? { ...img, currentUrl: data.customUrl!, isCustom: true, fileName: file.name } : img))
        showToast('Image updated')
      } else {
        showToast(data.error ?? 'Upload failed', false)
      }
    } catch {
      showToast('Upload failed — check network', false)
    } finally {
      setUploading(null)
      setDragging(null)
    }
  }

  const reset = async (slug: string) => {
    setResetting(slug)
    try {
      const res  = await fetch('/api/admin/concierge/images', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) })
      const data = await res.json() as { success?: boolean; defaultUrl?: string }
      if (data.success) {
        setImages(prev => prev.map(img => img.slug === slug ? { ...img, currentUrl: img.defaultUrl, isCustom: false, fileName: null } : img))
        showToast('Reset to default')
      }
    } finally {
      setResetting(null)
    }
  }

  const handleDrop = (slug: string, e: React.DragEvent) => {
    e.preventDefault()
    setDragging(null)
    const file = e.dataTransfer.files[0]
    if (file) void upload(slug, file)
  }

  const handleFileChange = (slug: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void upload(slug, file)
    e.target.value = ''
  }

  if (permLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center">
          <Lock className="w-6 h-6 text-gray-300" />
        </div>
        <p className="text-sm font-semibold text-gray-400">Super Admin access required</p>
        <p className="text-xs text-gray-300 max-w-xs">Only Super Admins can edit concierge page images.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[#0B1F3A]">Concierge Page Images</h3>
          <p className="text-xs text-gray-500 mt-0.5">Drag a photo onto any category or click to upload. Max 10 MB · JPG / PNG / WebP.</p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`text-xs px-4 py-2 rounded-lg font-semibold inline-flex items-center gap-2 ${toast.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {images.map(img => {
          const isUp  = uploading === img.slug
          const isRes = resetting === img.slug
          const isDrag = dragging === img.slug

          return (
            <div
              key={img.slug}
              className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-all ${isDrag ? 'border-[#C9A84C] shadow-lg scale-[1.02]' : 'border-gray-100 hover:shadow-md'}`}
              onDragOver={e => { e.preventDefault(); setDragging(img.slug) }}
              onDragLeave={() => setDragging(null)}
              onDrop={e => handleDrop(img.slug, e)}>

              {/* Image */}
              <div className="relative h-40 bg-gray-100 overflow-hidden group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.currentUrl}
                  alt={img.label}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0' }}
                />
                {isDrag && (
                  <div className="absolute inset-0 bg-[#C9A84C]/20 flex items-center justify-center">
                    <Upload className="w-8 h-8 text-[#C9A84C]" />
                  </div>
                )}
                {(isUp || isRes) && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-[#C9A84C] animate-spin" />
                  </div>
                )}
                {img.isCustom && (
                  <span className="absolute top-2 left-2 text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full">Custom</span>
                )}
              </div>

              {/* Info + actions */}
              <div className="p-3">
                <p className="text-xs font-bold text-[#0B1F3A] mb-0.5">{img.label}</p>
                {img.isCustom && img.fileName && (
                  <p className="text-[10px] text-gray-400 truncate mb-2">{img.fileName}</p>
                )}
                {!img.isCustom && (
                  <p className="text-[10px] text-gray-400 mb-2">Using default Unsplash</p>
                )}

                <div className="flex gap-1.5">
                  <button
                    onClick={() => fileRefs.current[img.slug]?.click()}
                    disabled={isUp || isRes}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-[#0B1F3A] text-[#C9A84C] text-[10px] font-bold rounded-lg hover:bg-[#162d52] transition-colors disabled:opacity-40">
                    <Upload className="w-3 h-3" />
                    Upload
                  </button>
                  {img.isCustom && (
                    <button
                      onClick={() => void reset(img.slug)}
                      disabled={isUp || isRes}
                      title="Reset to default"
                      className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40">
                      <RotateCcw className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  )}
                </div>
                {img.updatedAt && (
                  <p className="text-[10px] text-gray-300 mt-1.5">Updated by {img.updatedBy ?? '—'}</p>
                )}
              </div>

              <input
                ref={el => { fileRefs.current[img.slug] = el }}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={e => handleFileChange(img.slug, e)}
              />
            </div>
          )
        })}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        <strong>Note:</strong> After uploading, run this SQL once in Supabase to create the <code>concierge_images</code> table if it doesn't exist:<br />
        <code className="mt-1 block font-mono bg-amber-100 px-2 py-1 rounded text-[10px] break-all">
          CREATE TABLE IF NOT EXISTS concierge_images (slug TEXT PRIMARY KEY, label TEXT, current_url TEXT, custom_url TEXT, file_name TEXT, updated_at TIMESTAMPTZ, updated_by TEXT);
        </code>
      </div>
    </div>
  )
}

// ── Requests list (original content) ─────────────────────────────────────────

function RequestsPanel() {
  const [requests,    setRequests]    = useState<ConciergeRequest[]>([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [status,      setStatus]      = useState('ALL')
  const [search,      setSearch]      = useState('')
  const [page,        setPage]        = useState(1)
  const [totalPages,  setTotalPages]  = useState(1)
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [saving,      setSaving]      = useState<string | null>(null)
  const [noteEdits,   setNoteEdits]   = useState<Record<string, string>>({})
  const [assignEdits, setAssignEdits] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs   = new URLSearchParams({ status, page: String(page) })
      if (search) qs.set('search', search)
      const res  = await fetch(`/api/admin/concierge?${qs}`)
      const data = await res.json() as { requests: ConciergeRequest[]; total: number; totalPages: number }
      setRequests(data.requests ?? [])
      setTotal(data.total ?? 0)
      setTotalPages(data.totalPages ?? 1)
    } catch {
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [status, search, page])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setPage(1) }, [status, search])

  const handleUpdate = async (id: string, updates: Record<string, unknown>) => {
    setSaving(id)
    try {
      const res = await fetch(`/api/admin/concierge/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
      })
      if (res.ok) {
        const { request } = await res.json() as { request: ConciergeRequest }
        setRequests(prev => prev.map(r => r.id === id ? request : r))
      }
    } finally {
      setSaving(null)
    }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <>
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search reference, client name, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A]"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map(s => (
            <button key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                status === s
                  ? 'bg-[#0B1F3A] text-[#C9A84C] border-[#0B1F3A]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}>
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" /></div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Sparkles className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No concierge requests found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(req => {
            const isExpanded  = expanded === req.id
            const isSaving    = saving === req.id
            const statusStyle = STATUS_STYLES[req.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'
            const noteValue   = noteEdits[req.id]   ?? (req.internal_notes ?? '')
            const assignValue = assignEdits[req.id] ?? (req.assigned_to    ?? '')

            return (
              <div key={req.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-gray-50/50 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : req.id)}>
                  <div className="flex-shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusStyle}`}>
                      {STATUS_ICONS[req.status]}{req.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#0B1F3A] tracking-wider">{req.reference}</p>
                    <p className="text-xs text-gray-500 truncate">{req.category?.name ?? 'Concierge'} · {req.client_name ?? req.client_email ?? 'Anonymous'}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-400 flex-shrink-0">
                    <Clock className="w-3 h-3" /><span>{req.sla}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 flex-shrink-0 hidden md:block">{fmt(req.created_at)}</div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-50 bg-gray-50/30">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-4">
                      <div className="lg:col-span-2 space-y-3">
                        <div className="bg-white rounded-lg border border-gray-100 p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <FileText className="w-3.5 h-3.5 text-[#C9A84C]" />
                            <p className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider">Request Details</p>
                          </div>
                          <dl className="space-y-1.5">
                            {Object.entries(req.intent_fields ?? {}).map(([k, v]) => (
                              <div key={k} className="grid grid-cols-2 gap-2">
                                <dt className="text-[11px] text-gray-500 capitalize">{k.replace(/_/g, ' ')}</dt>
                                <dd className="text-[11px] font-medium text-[#0B1F3A]">{String(v)}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-100 p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <User className="w-3.5 h-3.5 text-[#C9A84C]" />
                            <p className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider">Client</p>
                          </div>
                          <dl className="space-y-1">
                            {req.client_name  && <div className="grid grid-cols-2 gap-2"><dt className="text-[11px] text-gray-500">Name</dt><dd className="text-[11px] font-medium text-[#0B1F3A]">{req.client_name}</dd></div>}
                            {req.client_email && <div className="grid grid-cols-2 gap-2"><dt className="text-[11px] text-gray-500">Email</dt><dd className="text-[11px] font-medium text-[#0B1F3A]">{req.client_email}</dd></div>}
                            {req.chatwoot_conv_id && (
                              <div className="mt-2">
                                <a href={`https://chat.walztravels.com/app/accounts/1/conversations/${req.chatwoot_conv_id}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#C9A84C] font-semibold hover:underline">View in Chatwoot →</a>
                              </div>
                            )}
                          </dl>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="bg-white rounded-lg border border-gray-100 p-3">
                          <p className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">Update Status</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {STATUSES.filter(s => s !== 'ALL').map(s => (
                              <button key={s}
                                disabled={isSaving || req.status === s}
                                onClick={() => void handleUpdate(req.id, { status: s })}
                                className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all disabled:opacity-50 ${
                                  req.status === s ? 'bg-[#0B1F3A] text-[#C9A84C] border-[#0B1F3A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                }`}>
                                {s.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-100 p-3">
                          <p className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">Assigned To</p>
                          <input type="text" placeholder="Staff name or email…" value={assignValue}
                            onChange={e => setAssignEdits(prev => ({ ...prev, [req.id]: e.target.value }))}
                            className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A] mb-2"
                          />
                          <button disabled={isSaving} onClick={() => void handleUpdate(req.id, { assigned_to: assignValue || null })}
                            className="w-full py-1.5 text-[11px] font-bold bg-[#0B1F3A] text-[#C9A84C] rounded-lg hover:bg-[#162d52] transition-colors disabled:opacity-50">
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Save Assignment'}
                          </button>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-100 p-3">
                          <p className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">Internal Notes</p>
                          <textarea rows={3} placeholder="Add notes for the team…" value={noteValue}
                            onChange={e => setNoteEdits(prev => ({ ...prev, [req.id]: e.target.value }))}
                            className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] text-[#0B1F3A] resize-none mb-2"
                          />
                          <button disabled={isSaving} onClick={() => void handleUpdate(req.id, { internal_notes: noteValue || null })}
                            className="w-full py-1.5 text-[11px] font-bold bg-[#0B1F3A] text-[#C9A84C] rounded-lg hover:bg-[#162d52] transition-colors disabled:opacity-50">
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Save Notes'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </>
  )
}

// ── Categories panel ─────────────────────────────────────────────────────────

interface AdminCategory {
  id:               string
  slug:             string
  name:             string
  description:      string | null
  icon:             string | null
  fulfilment_modes: string[]
  required_fields:  unknown[]
  is_active:        boolean
  sort_order:       number
}

function CategoriesPanel() {
  const { role, loading: permLoading } = useStaffPermissions()
  const isSuperAdmin = role === 'super_admin'

  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState<string | null>(null)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [editId,     setEditId]     = useState<string | null>(null)
  const [editDraft,  setEditDraft]  = useState<Partial<AdminCategory>>({})
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/concierge/categories')
      const data = await res.json() as { categories?: AdminCategory[] }
      setCategories(data.categories ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Find slugs that appear more than once
  const slugCounts = categories.reduce<Record<string, number>>((acc, c) => {
    acc[c.slug] = (acc[c.slug] ?? 0) + 1
    return acc
  }, {})
  const duplicateSlugs = new Set(Object.entries(slugCounts).filter(([, n]) => n > 1).map(([s]) => s))

  const startEdit = (cat: AdminCategory) => {
    setEditId(cat.id)
    setEditDraft({ name: cat.name, description: cat.description ?? '', icon: cat.icon ?? '' })
  }

  const cancelEdit = () => { setEditId(null); setEditDraft({}) }

  const saveEdit = async (id: string) => {
    setSaving(id)
    try {
      const res = await fetch(`/api/admin/concierge/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      })
      if (res.ok) {
        const { category } = await res.json() as { category: AdminCategory }
        setCategories(prev => prev.map(c => c.id === id ? category : c))
        setEditId(null)
        showToast('Saved')
      } else {
        showToast('Save failed', false)
      }
    } catch {
      showToast('Network error', false)
    } finally {
      setSaving(null)
    }
  }

  const toggleActive = async (cat: AdminCategory) => {
    setSaving(cat.id)
    try {
      const res = await fetch(`/api/admin/concierge/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !cat.is_active }),
      })
      if (res.ok) {
        const { category } = await res.json() as { category: AdminCategory }
        setCategories(prev => prev.map(c => c.id === cat.id ? category : c))
        showToast(category.is_active ? 'Shown on page' : 'Hidden from page')
      }
    } finally {
      setSaving(null)
    }
  }

  const deleteCategory = async (cat: AdminCategory) => {
    if (!confirm(`Permanently delete "${cat.name}"? This cannot be undone.`)) return
    setDeleting(cat.id)
    try {
      const res = await fetch(`/api/admin/concierge/categories/${cat.id}`, { method: 'DELETE' })
      if (res.ok) {
        setCategories(prev => prev.filter(c => c.id !== cat.id))
        showToast(`"${cat.name}" deleted`)
      } else {
        showToast('Delete failed', false)
      }
    } catch {
      showToast('Network error', false)
    } finally {
      setDeleting(null)
    }
  }

  if (permLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center">
          <Lock className="w-6 h-6 text-gray-300" />
        </div>
        <p className="text-sm font-semibold text-gray-400">Super Admin access required</p>
        <p className="text-xs text-gray-300 max-w-xs">Only Super Admins can edit or delete concierge categories.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[#0B1F3A]">Concierge Categories</h3>
          <p className="text-xs text-gray-500 mt-0.5">{categories.length} total · {categories.filter(c => c.is_active).length} active on page</p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`text-xs px-4 py-2 rounded-lg font-semibold inline-flex items-center gap-2 ${toast.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          {toast.msg}
        </div>
      )}

      {/* Duplicate warning */}
      {duplicateSlugs.size > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold mb-0.5">Duplicate slugs detected</p>
            <p>These slugs appear more than once: <span className="font-mono">{[...duplicateSlugs].join(', ')}</span>. Delete the extras below — only the first will show on the public page.</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {categories.map(cat => {
          const isDuplicate = duplicateSlugs.has(cat.slug)
          const isEditing   = editId === cat.id
          const isSaving    = saving === cat.id
          const isDeleting  = deleting === cat.id

          return (
            <div
              key={cat.id}
              className={`bg-white rounded-xl border overflow-hidden shadow-sm transition-all ${isDuplicate ? 'border-amber-300' : 'border-gray-100'}`}
            >
              {/* Row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl w-8 text-center flex-shrink-0">{cat.icon ?? '✦'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-[#0B1F3A]">{cat.name}</p>
                    {isDuplicate && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full">Duplicate</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 font-mono">{cat.slug}</p>
                  {cat.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-sm">{cat.description}</p>}
                </div>

                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${cat.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {cat.is_active ? 'Visible' : 'Hidden'}
                </span>

                {/* Toggle */}
                <button
                  onClick={() => void toggleActive(cat)}
                  disabled={isSaving || isDeleting}
                  title={cat.is_active ? 'Hide from page' : 'Show on page'}
                  className="text-gray-400 hover:text-[#0B1F3A] transition-colors disabled:opacity-40 flex-shrink-0"
                >
                  {isSaving
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : cat.is_active
                      ? <ToggleRight className="w-5 h-5 text-green-500" />
                      : <ToggleLeft className="w-5 h-5" />
                  }
                </button>

                {/* Edit */}
                <button
                  onClick={() => isEditing ? cancelEdit() : startEdit(cat)}
                  disabled={isDeleting}
                  className="flex-shrink-0 p-1.5 rounded-lg border border-gray-200 hover:border-[#C9A84C] text-gray-400 hover:text-[#C9A84C] transition-colors disabled:opacity-40"
                >
                  {isEditing ? <XCircle className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                </button>

                {/* Delete */}
                <button
                  onClick={() => void deleteCategory(cat)}
                  disabled={isSaving || isDeleting}
                  className="flex-shrink-0 p-1.5 rounded-lg border border-red-100 hover:border-red-300 text-red-300 hover:text-red-600 transition-colors disabled:opacity-40"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin text-red-500" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>

              {/* Inline edit panel */}
              {isEditing && (
                <div className="px-4 pb-4 border-t border-gray-50 bg-gray-50/40 pt-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      placeholder="Display name"
                      value={editDraft.name ?? ''}
                      onChange={e => setEditDraft(p => ({ ...p, name: e.target.value }))}
                      className="sm:col-span-2 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] bg-white text-[#0B1F3A]"
                    />
                    <input
                      placeholder="Icon emoji"
                      value={editDraft.icon ?? ''}
                      onChange={e => setEditDraft(p => ({ ...p, icon: e.target.value }))}
                      className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] bg-white text-[#0B1F3A]"
                    />
                    <input
                      placeholder="Description"
                      value={editDraft.description ?? ''}
                      onChange={e => setEditDraft(p => ({ ...p, description: e.target.value }))}
                      className="sm:col-span-3 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A84C] bg-white text-[#0B1F3A]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void saveEdit(cat.id)}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] text-[#C9A84C] text-xs font-bold rounded-lg hover:bg-[#162d52] disabled:opacity-50 transition-colors"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-4 py-2 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {categories.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">No categories found</div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'requests' | 'new' | 'media' | 'categories'

export default function AdminConciergePage() {
  const [tab, setTab] = useState<Tab>('requests')

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'requests',   label: 'Requests',    icon: <FileText    className="w-4 h-4" /> },
    { key: 'new',        label: 'New Request', icon: <Plus        className="w-4 h-4" /> },
    { key: 'categories', label: 'Categories',  icon: <LayoutGrid  className="w-4 h-4" /> },
    { key: 'media',      label: 'Page Images', icon: <ImageIcon   className="w-4 h-4" /> },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-[#C9A84C]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#0B1F3A]">Walz Concierge</h1>
          <p className="text-sm text-gray-500">Manage requests, create bookings, update page images</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key
                ? 'bg-white text-[#0B1F3A] shadow-sm'
                : 'text-gray-500 hover:text-[#0B1F3A]'
            }`}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'requests' && <RequestsPanel />}
      {tab === 'new'      && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <NewRequestPanel />
        </div>
      )}
      {tab === 'categories' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <CategoriesPanel />
        </div>
      )}
      {tab === 'media'    && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <ImageManagerPanel />
        </div>
      )}
    </div>
  )
}
