'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, ArrowLeftRight, Plus, Minus, Loader2, X, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { FlightResult, CabinClass } from '@/types/booking'

// ─── Static airport list ──────────────────────────────────────────────────────
const airports = [
  // ── UK ──────────────────────────────────────────────────────────────────────
  { code: 'LHR', city: 'London',        country: 'United Kingdom', name: 'Heathrow Airport' },
  { code: 'LGW', city: 'London',        country: 'United Kingdom', name: 'Gatwick Airport' },
  { code: 'STN', city: 'London',        country: 'United Kingdom', name: 'Stansted Airport' },
  { code: 'MAN', city: 'Manchester',    country: 'United Kingdom', name: 'Manchester Airport' },
  { code: 'BHX', city: 'Birmingham',    country: 'United Kingdom', name: 'Birmingham Airport' },
  { code: 'EDI', city: 'Edinburgh',     country: 'United Kingdom', name: 'Edinburgh Airport' },
  { code: 'GLA', city: 'Glasgow',       country: 'United Kingdom', name: 'Glasgow Airport' },
  // ── Nigeria ─────────────────────────────────────────────────────────────────
  { code: 'LOS', city: 'Lagos',         country: 'Nigeria',        name: 'Murtala Muhammed International Airport' },
  { code: 'ABV', city: 'Abuja',         country: 'Nigeria',        name: 'Nnamdi Azikiwe International Airport' },
  { code: 'PHC', city: 'Port Harcourt', country: 'Nigeria',        name: 'Port Harcourt International Airport' },
  { code: 'KAN', city: 'Kano',          country: 'Nigeria',        name: 'Mallam Aminu Kano International Airport' },
  // ── Ghana ───────────────────────────────────────────────────────────────────
  { code: 'ACC', city: 'Accra',         country: 'Ghana',          name: 'Kotoka International Airport' },
  { code: 'KMS', city: 'Kumasi',        country: 'Ghana',          name: 'Kumasi Airport' },
  // ── East Africa ─────────────────────────────────────────────────────────────
  { code: 'NBO', city: 'Nairobi',       country: 'Kenya',          name: 'Jomo Kenyatta International Airport' },
  { code: 'ADD', city: 'Addis Ababa',   country: 'Ethiopia',       name: 'Bole International Airport' },
  { code: 'DAR', city: 'Dar es Salaam', country: 'Tanzania',       name: 'Julius Nyerere International Airport' },
  { code: 'EBB', city: 'Entebbe',       country: 'Uganda',         name: 'Entebbe International Airport' },
  // ── Southern & North Africa ─────────────────────────────────────────────────
  { code: 'JNB', city: 'Johannesburg',  country: 'South Africa',   name: 'O.R. Tambo International' },
  { code: 'CMN', city: 'Casablanca',    country: 'Morocco',        name: 'Mohammed V International Airport' },
  { code: 'CAI', city: 'Cairo',         country: 'Egypt',          name: 'Cairo International Airport' },
  // ── Middle East ─────────────────────────────────────────────────────────────
  { code: 'DXB', city: 'Dubai',         country: 'UAE',            name: 'Dubai International Airport' },
  { code: 'AUH', city: 'Abu Dhabi',     country: 'UAE',            name: 'Abu Dhabi International Airport' },
  { code: 'DOH', city: 'Doha',          country: 'Qatar',          name: 'Hamad International Airport' },
  // ── USA ─────────────────────────────────────────────────────────────────────
  { code: 'JFK', city: 'New York',      country: 'USA',            name: 'John F. Kennedy International' },
  { code: 'EWR', city: 'Newark',        country: 'USA',            name: 'Newark Liberty International' },
  { code: 'LAX', city: 'Los Angeles',   country: 'USA',            name: 'Los Angeles International' },
  { code: 'ORD', city: 'Chicago',       country: 'USA',            name: "O'Hare International Airport" },
  { code: 'MIA', city: 'Miami',         country: 'USA',            name: 'Miami International Airport' },
  { code: 'IAD', city: 'Washington DC', country: 'USA',            name: 'Dulles International Airport' },
  { code: 'ATL', city: 'Atlanta',       country: 'USA',            name: 'Hartsfield-Jackson Atlanta International' },
  { code: 'IAH', city: 'Houston',       country: 'USA',            name: 'George Bush Intercontinental Airport' },
  // ── Canada ──────────────────────────────────────────────────────────────────
  { code: 'YYZ', city: 'Toronto',       country: 'Canada',         name: 'Toronto Pearson International' },
  { code: 'YUL', city: 'Montreal',      country: 'Canada',         name: 'Montréal-Trudeau International Airport' },
  // ── Europe ──────────────────────────────────────────────────────────────────
  { code: 'CDG', city: 'Paris',         country: 'France',         name: 'Charles de Gaulle Airport' },
  { code: 'AMS', city: 'Amsterdam',     country: 'Netherlands',    name: 'Amsterdam Schiphol' },
  { code: 'FRA', city: 'Frankfurt',     country: 'Germany',        name: 'Frankfurt Airport' },
  { code: 'MAD', city: 'Madrid',        country: 'Spain',          name: 'Adolfo Suárez Madrid–Barajas' },
  { code: 'BCN', city: 'Barcelona',     country: 'Spain',          name: 'Barcelona–El Prat Airport' },
  { code: 'FCO', city: 'Rome',          country: 'Italy',          name: 'Leonardo da Vinci Airport' },
  { code: 'MXP', city: 'Milan',         country: 'Italy',          name: 'Malpensa Airport' },
  { code: 'ZRH', city: 'Zurich',        country: 'Switzerland',    name: 'Zurich Airport' },
  { code: 'DUB', city: 'Dublin',        country: 'Ireland',        name: 'Dublin Airport' },
  // ── Asia ────────────────────────────────────────────────────────────────────
  { code: 'SIN', city: 'Singapore',     country: 'Singapore',      name: 'Changi Airport' },
  { code: 'HKG', city: 'Hong Kong',     country: 'China',          name: 'Hong Kong International Airport' },
  { code: 'NRT', city: 'Tokyo',         country: 'Japan',          name: 'Narita International Airport' },
  { code: 'HND', city: 'Tokyo',         country: 'Japan',          name: 'Haneda Airport' },
  { code: 'BKK', city: 'Bangkok',       country: 'Thailand',       name: 'Suvarnabhumi Airport' },
  { code: 'KUL', city: 'Kuala Lumpur',  country: 'Malaysia',       name: 'Kuala Lumpur International' },
  { code: 'DEL', city: 'Delhi',         country: 'India',          name: 'Indira Gandhi International Airport' },
  { code: 'BOM', city: 'Mumbai',        country: 'India',          name: 'Chhatrapati Shivaji Maharaj International' },
  // ── Oceania ─────────────────────────────────────────────────────────────────
  { code: 'SYD', city: 'Sydney',        country: 'Australia',      name: 'Kingsford Smith Airport' },
  { code: 'MEL', city: 'Melbourne',     country: 'Australia',      name: 'Melbourne Airport' },
  // ── South America ───────────────────────────────────────────────────────────
  { code: 'GRU', city: 'São Paulo',     country: 'Brazil',         name: 'Guarulhos International Airport' },
  // ── Other ───────────────────────────────────────────────────────────────────
  { code: 'MLE', city: 'Malé',          country: 'Maldives',       name: 'Velana International Airport' },
]

// ─── Zod schema (one-way / round-trip only; multi-city is handled separately) ─
const flightSchema = z.object({
  origin: z.string().min(3, 'Select departure airport'),
  destination: z.string().min(3, 'Select destination airport'),
  departureDate: z.string().min(1, 'Select departure date'),
  returnDate: z.string().optional(),
  adults: z.number().min(1).max(9),
  children: z.number().min(0).max(8),
  infants: z.number().min(0).max(4),
  cabinClass: z.enum(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']),
})

type FlightFormData = z.infer<typeof flightSchema>

type TripType = 'roundtrip' | 'oneway' | 'multicity'

interface MultiCityLeg {
  origin: string
  destination: string
  departureDate: string
}

interface FlightSearchFormProps {
  onResults?: (results: FlightResult[]) => void
  initialValues?: Partial<FlightFormData & { tripType?: TripType }>
}

// ─── Airport Combobox ─────────────────────────────────────────────────────────
interface AirportComboboxProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  error?: string
}

function AirportCombobox({ value, onChange, placeholder, error }: AirportComboboxProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [liveResults, setLiveResults] = useState<typeof airports>([])
  const [isFetching, setIsFetching] = useState(false)
  const [cachedSelection, setCachedSelection] = useState<typeof airports[0] | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 2) { setLiveResults([]); return }

    debounceRef.current = setTimeout(async () => {
      setIsFetching(true)
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(query)}`)
        if (res.ok) {
          const json = await res.json() as { data: typeof airports }
          setLiveResults(json.data ?? [])
        }
      } catch { /* fall back to static */ }
      finally { setIsFetching(false) }
    }, 280)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const selected = (cachedSelection?.code === value ? cachedSelection : null)
    ?? airports.find((a) => a.code === value)
    ?? (value ? { code: value, city: value, name: value, country: '' } : null)

  const filtered = query.length >= 2
    ? (liveResults.length > 0
        ? liveResults
        : airports.filter(
            (a) =>
              a.code.toLowerCase().includes(query.toLowerCase()) ||
              a.city.toLowerCase().includes(query.toLowerCase()) ||
              a.name.toLowerCase().includes(query.toLowerCase()) ||
              a.country.toLowerCase().includes(query.toLowerCase())
          ).slice(0, 8))
    : []

  return (
    <div className="relative">
      <div
        className={cn(
          'flex items-center gap-2 h-12 px-4 rounded-lg border bg-white cursor-text transition-all',
          isOpen ? 'border-walz-gold ring-2 ring-walz-gold/20' : 'border-walz-border',
          error && 'border-walz-error'
        )}
        onClick={() => { setIsOpen(true); setQuery('') }}
      >
        {selected && !isOpen ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="bg-walz-deep-navy text-walz-gold text-xs font-bold px-1.5 py-0.5 rounded font-mono flex-shrink-0">
              {selected.code}
            </span>
            <span className="text-walz-deep-navy text-sm truncate">{selected.city}</span>
          </div>
        ) : (
          <input
            autoFocus={isOpen}
            type="text"
            value={isOpen ? query : ''}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true) }}
            onFocus={() => setIsOpen(true)}
            placeholder={selected && !isOpen ? selected.city : placeholder}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-walz-deep-navy placeholder:text-walz-muted"
          />
        )}
      </div>
      {error && <p className="text-walz-error text-xs mt-1">{error}</p>}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-walz-border rounded-xl shadow-luxury z-20 overflow-hidden max-h-56 overflow-y-auto">
            {isFetching ? (
              <div className="px-4 py-3 text-sm text-walz-muted text-center">Searching airports…</div>
            ) : query.length < 2 ? (
              <div className="px-4 py-3 text-sm text-walz-muted text-center">Type to search airports</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-walz-muted text-center">No airports found</div>
            ) : (
              filtered.map((airport) => (
                <button
                  key={airport.code}
                  type="button"
                  onClick={() => {
                    setCachedSelection(airport)
                    onChange(airport.code)
                    setIsOpen(false)
                    setQuery('')
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-walz-off-white transition-colors text-left"
                >
                  <span className="bg-walz-deep-navy text-walz-gold text-xs font-bold px-1.5 py-0.5 rounded font-mono flex-shrink-0 w-12 text-center">
                    {airport.code}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-walz-deep-navy">{airport.city}</div>
                    <div className="text-xs text-walz-muted truncate">{airport.name}</div>
                  </div>
                  <span className="text-xs text-walz-muted ml-auto flex-shrink-0">{airport.country}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Passenger counter ────────────────────────────────────────────────────────
interface PassengerCounterProps {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void
}

function PassengerCounter({ label, value, min, max, onChange }: PassengerCounterProps) {
  return (
    <div className="flex items-center justify-between h-12 px-3 rounded-lg border border-walz-border bg-white">
      <span className="text-sm text-walz-muted">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
          className="w-6 h-6 rounded-full border border-walz-border flex items-center justify-center hover:border-walz-gold hover:text-walz-gold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          <Minus className="w-3 h-3" />
        </button>
        <span className="text-sm font-semibold text-walz-deep-navy w-4 text-center">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
          className="w-6 h-6 rounded-full border border-walz-border flex items-center justify-center hover:border-walz-gold hover:text-walz-gold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ─── Main form ────────────────────────────────────────────────────────────────
export function FlightSearchForm({ onResults, initialValues }: FlightSearchFormProps) {
  const router = useRouter()
  const [tripType, setTripType] = useState<TripType>(initialValues?.tripType ?? 'roundtrip')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Multi-city legs (managed outside react-hook-form)
  const [mcLegs, setMcLegs] = useState<MultiCityLeg[]>([
    { origin: '', destination: '', departureDate: '' },
    { origin: '', destination: '', departureDate: '' },
  ])
  const [mcError, setMcError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FlightFormData>({
    resolver: zodResolver(flightSchema),
    defaultValues: {
      origin: initialValues?.origin || '',
      destination: initialValues?.destination || '',
      departureDate: initialValues?.departureDate || '',
      returnDate: initialValues?.returnDate || '',
      adults: initialValues?.adults || 1,
      children: initialValues?.children || 0,
      infants: initialValues?.infants || 0,
      cabinClass: initialValues?.cabinClass || 'ECONOMY',
    },
  })

  const adults = watch('adults')
  const children = watch('children')
  const origin = watch('origin')
  const destination = watch('destination')

  const today = new Date().toISOString().split('T')[0]

  // ── Multi-city leg helpers ──────────────────────────────────────────────────
  const updateMcLeg = (index: number, field: keyof MultiCityLeg, value: string) => {
    setMcLegs((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      // Auto-populate next leg's origin when current destination changes
      if (field === 'destination' && index < prev.length - 1) {
        updated[index + 1] = { ...updated[index + 1], origin: value }
      }
      return updated
    })
  }

  const addMcLeg = () => {
    if (mcLegs.length < 5) {
      setMcLegs((prev) => [
        ...prev,
        { origin: prev[prev.length - 1].destination, destination: '', departureDate: '' },
      ])
    }
  }

  const removeMcLeg = (index: number) => {
    if (mcLegs.length > 2) {
      setMcLegs((prev) => prev.filter((_, i) => i !== index))
    }
  }

  // ── Multi-city search ───────────────────────────────────────────────────────
  const handleMultiCitySearch = async () => {
    setMcError(null)
    for (let i = 0; i < mcLegs.length; i++) {
      const leg = mcLegs[i]
      if (!leg.origin) { setMcError(`Leg ${i + 1}: select a departure airport`); return }
      if (!leg.destination) { setMcError(`Leg ${i + 1}: select a destination airport`); return }
      if (!leg.departureDate) { setMcError(`Leg ${i + 1}: choose a departure date`); return }
    }

    setIsLoading(true)
    setError(null)
    const payload = {
      tripType: 'multicity',
      segments: mcLegs,
      adults,
      children,
      infants: 0,
      cabinClass: watch('cabinClass'),
    }

    try {
      if (onResults) {
        const res = await fetch('/api/search/flights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const d = await res.json() as { error?: string }
          throw new Error(d.error || 'Search failed')
        }
        onResults(await res.json() as FlightResult[])
      } else {
        sessionStorage.setItem('multiCitySearch', JSON.stringify(payload))
        router.push('/flights?tripType=multicity')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Regular (one-way / round-trip) search ──────────────────────────────────
  const onSubmit = async (data: FlightFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      const payload = {
        origin: data.origin,
        destination: data.destination,
        departureDate: data.departureDate,
        ...(tripType === 'roundtrip' && data.returnDate ? { returnDate: data.returnDate } : {}),
        adults: data.adults,
        children: data.children,
        infants: data.infants,
        cabinClass: data.cabinClass,
      }

      if (onResults) {
        const response = await fetch('/api/search/flights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!response.ok) {
          const errorData = await response.json() as { error?: string }
          throw new Error(errorData.error || 'Failed to search flights')
        }
        onResults(await response.json() as FlightResult[])
      } else {
        const params = new URLSearchParams({
          from: data.origin,
          to: data.destination,
          depart: data.departureDate,
          adults: String(data.adults),
          children: String(data.children),
          infants: String(data.infants),
          cabin: data.cabinClass,
          type: tripType,
          ...(tripType === 'roundtrip' && data.returnDate ? { return: data.returnDate } : {}),
        })
        router.push(`/flights?${params.toString()}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Unified form submit handler ─────────────────────────────────────────────
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (tripType === 'multicity') {
      handleMultiCitySearch()
    } else {
      handleSubmit(onSubmit)(e)
    }
  }

  const swapAirports = () => {
    const temp = origin
    setValue('origin', destination)
    setValue('destination', temp)
  }

  return (
    <form onSubmit={handleFormSubmit} className="p-5 lg:p-6">
      {/* Trip type tabs */}
      <div className="flex gap-1 mb-5 bg-walz-off-white rounded-lg p-1 w-fit">
        {(['roundtrip', 'oneway', 'multicity'] as TripType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setTripType(type)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
              tripType === type
                ? 'bg-white text-walz-deep-navy shadow-sm'
                : 'text-walz-muted hover:text-walz-deep-navy'
            )}
          >
            {type === 'roundtrip' ? 'Round Trip' : type === 'oneway' ? 'One Way' : 'Multi-city'}
          </button>
        ))}
      </div>

      {/* ── Multi-city legs ── */}
      {tripType === 'multicity' ? (
        <div className="space-y-3 mb-4">
          {mcLegs.map((leg, i) => (
            <div key={i} className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_160px_auto] gap-2 items-end">
              {/* From */}
              <div>
                {i === 0 && <label className="label-walz">From</label>}
                <AirportCombobox
                  value={leg.origin}
                  onChange={(v) => updateMcLeg(i, 'origin', v)}
                  placeholder="City or airport"
                />
              </div>

              {/* Arrow */}
              <div className={cn('flex items-center justify-center pb-0.5', i === 0 ? 'mt-6' : '')}>
                <ArrowRight className="w-4 h-4 text-walz-muted" />
              </div>

              {/* To */}
              <div>
                {i === 0 && <label className="label-walz">To</label>}
                <AirportCombobox
                  value={leg.destination}
                  onChange={(v) => updateMcLeg(i, 'destination', v)}
                  placeholder="City or airport"
                />
              </div>

              {/* spacer for date column alignment */}
              <div className={cn('hidden lg:block', i === 0 ? 'mt-6' : '')} />

              {/* Departure date */}
              <div>
                {i === 0 && <label className="label-walz">Depart</label>}
                <Input
                  type="date"
                  min={i === 0 ? today : (mcLegs[i - 1].departureDate || today)}
                  value={leg.departureDate}
                  onChange={(e) => updateMcLeg(i, 'departureDate', e.target.value)}
                  className="h-12"
                />
              </div>

              {/* Remove button */}
              <div className={cn('flex items-center', i === 0 ? 'mt-6' : '')}>
                {mcLegs.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => removeMcLeg(i)}
                    className="w-10 h-10 flex items-center justify-center rounded-full border border-walz-border hover:border-walz-error hover:text-walz-error transition-colors text-walz-muted"
                    aria-label={`Remove leg ${i + 1}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="w-10" /> /* placeholder to keep grid aligned */
                )}
              </div>
            </div>
          ))}

          {/* Add leg button */}
          {mcLegs.length < 5 && (
            <button
              type="button"
              onClick={addMcLeg}
              className="flex items-center gap-2 text-sm font-medium text-walz-gold hover:text-walz-gold-light transition-colors mt-1"
            >
              <Plus className="w-4 h-4" />
              Add another flight
            </button>
          )}

          {mcError && (
            <div className="p-3 bg-red-50 border border-walz-error/20 rounded-lg text-walz-error text-sm">
              {mcError}
            </div>
          )}

          {/* Passengers + cabin for multi-city */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            <PassengerCounter label="Adults" value={adults} min={1} max={9} onChange={(v) => setValue('adults', v)} />
            <PassengerCounter label="Children" value={children} min={0} max={8} onChange={(v) => setValue('children', v)} />
            <div className="col-span-2">
              <select className="input-walz h-12 w-full" {...register('cabinClass')}>
                <option value="ECONOMY">Economy</option>
                <option value="PREMIUM_ECONOMY">Premium Economy</option>
                <option value="BUSINESS">Business</option>
                <option value="FIRST">First Class</option>
              </select>
            </div>
          </div>
        </div>
      ) : (
        /* ── One-way / Round-trip ── */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Origin */}
          <div className="lg:col-span-3 relative">
            <label className="label-walz">From</label>
            <AirportCombobox
              value={origin}
              onChange={(v) => setValue('origin', v, { shouldValidate: true })}
              placeholder="City or airport"
              error={errors.origin?.message}
            />
          </div>

          {/* Swap */}
          <div className="lg:col-span-1 flex items-end justify-center pb-0.5">
            <button
              type="button"
              onClick={swapAirports}
              className="p-2.5 rounded-full border border-walz-border bg-white hover:bg-walz-gold hover:border-walz-gold hover:text-walz-deep-navy transition-all group mt-6"
              aria-label="Swap airports"
            >
              <ArrowLeftRight className="w-4 h-4 text-walz-muted group-hover:text-walz-deep-navy" />
            </button>
          </div>

          {/* Destination */}
          <div className="lg:col-span-3">
            <label className="label-walz">To</label>
            <AirportCombobox
              value={destination}
              onChange={(v) => setValue('destination', v, { shouldValidate: true })}
              placeholder="City or airport"
              error={errors.destination?.message}
            />
          </div>

          {/* Departure Date */}
          <div className="lg:col-span-2">
            <label className="label-walz">Depart</label>
            <Input type="date" min={today} className="h-12" {...register('departureDate')} />
            {errors.departureDate && (
              <p className="text-walz-error text-xs mt-1">{errors.departureDate.message}</p>
            )}
          </div>

          {/* Return Date */}
          {tripType === 'roundtrip' && (
            <div className="lg:col-span-2">
              <label className="label-walz">Return</label>
              <Input type="date" min={watch('departureDate') || today} className="h-12" {...register('returnDate')} />
            </div>
          )}

          {/* Passengers */}
          <div className={cn('relative', tripType === 'roundtrip' ? 'lg:col-span-4' : 'lg:col-span-5')}>
            <label className="label-walz">Passengers &amp; Class</label>
            <div className="grid grid-cols-2 gap-2">
              <PassengerCounter label="Adults" value={adults} min={1} max={9} onChange={(v) => setValue('adults', v)} />
              <PassengerCounter label="Children" value={children} min={0} max={8} onChange={(v) => setValue('children', v)} />
            </div>
          </div>

          {/* Cabin Class */}
          <div className="lg:col-span-3">
            <label className="label-walz">Cabin Class</label>
            <select className="input-walz h-12" {...register('cabinClass')}>
              <option value="ECONOMY">Economy</option>
              <option value="PREMIUM_ECONOMY">Premium Economy</option>
              <option value="BUSINESS">Business</option>
              <option value="FIRST">First Class</option>
            </select>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-walz-error/20 rounded-lg text-walz-error text-sm">
          {error}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button type="submit" variant="gold" size="lg" disabled={isLoading} className="min-w-[160px]">
          {isLoading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Searching...</>
          ) : (
            <><Search className="w-4 h-4 mr-2" />Search Flights</>
          )}
        </Button>
      </div>
    </form>
  )
}
