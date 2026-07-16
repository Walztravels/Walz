'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, Loader2, Plus, Minus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { HotelResult } from '@/types/booking'

const popularDestinations = [
  // ── Nigeria ──────────────────────────────────────────
  { code: 'LOS', city: 'Lagos',           country: 'Nigeria' },
  { code: 'ABV', city: 'Abuja',           country: 'Nigeria' },
  { code: 'PHC', city: 'Port Harcourt',   country: 'Nigeria' },
  // ── Ghana ────────────────────────────────────────────
  { code: 'ACC', city: 'Accra',           country: 'Ghana' },
  { code: 'KMS', city: 'Kumasi',          country: 'Ghana' },
  // ── East Africa ──────────────────────────────────────
  { code: 'NBO', city: 'Nairobi',         country: 'Kenya' },
  { code: 'MBA', city: 'Mombasa',         country: 'Kenya' },
  { code: 'DAR', city: 'Dar es Salaam',   country: 'Tanzania' },
  { code: 'ZNZ', city: 'Zanzibar',        country: 'Tanzania' },
  { code: 'ADD', city: 'Addis Ababa',     country: 'Ethiopia' },
  { code: 'KGL', city: 'Kigali',          country: 'Rwanda' },
  // ── Southern Africa ──────────────────────────────────
  { code: 'JNB', city: 'Johannesburg',    country: 'South Africa' },
  { code: 'CPT', city: 'Cape Town',       country: 'South Africa' },
  { code: 'DUR', city: 'Durban',          country: 'South Africa' },
  // ── West Africa ──────────────────────────────────────
  { code: 'DKR', city: 'Dakar',           country: 'Senegal' },
  { code: 'ABJ', city: 'Abidjan',         country: 'Ivory Coast' },
  { code: 'CMN', city: 'Casablanca',      country: 'Morocco' },
  { code: 'CAI', city: 'Cairo',           country: 'Egypt' },
  // ── UK ───────────────────────────────────────────────
  { code: 'LON', city: 'London',          country: 'UK' },
  { code: 'MAN', city: 'Manchester',      country: 'UK' },
  { code: 'BHX', city: 'Birmingham',      country: 'UK' },
  { code: 'EDI', city: 'Edinburgh',       country: 'UK' },
  { code: 'LBA', city: 'Leeds',           country: 'UK' },
  { code: 'BRS', city: 'Bristol',         country: 'UK' },
  // ── Canada ───────────────────────────────────────────
  { code: 'YTO', city: 'Toronto',         country: 'Canada' },
  { code: 'YVR', city: 'Vancouver',       country: 'Canada' },
  { code: 'YMQ', city: 'Montreal',        country: 'Canada' },
  { code: 'YYC', city: 'Calgary',         country: 'Canada' },
  { code: 'YOW', city: 'Ottawa',          country: 'Canada' },
  // ── UAE ──────────────────────────────────────────────
  { code: 'DXB', city: 'Dubai',           country: 'UAE' },
  { code: 'AUH', city: 'Abu Dhabi',       country: 'UAE' },
  { code: 'SHJ', city: 'Sharjah',         country: 'UAE' },
  // ── USA ──────────────────────────────────────────────
  { code: 'NYC', city: 'New York',        country: 'USA' },
  { code: 'LAX', city: 'Los Angeles',     country: 'USA' },
  { code: 'MIA', city: 'Miami',           country: 'USA' },
  { code: 'CHI', city: 'Chicago',         country: 'USA' },
  { code: 'HOU', city: 'Houston',         country: 'USA' },
  { code: 'ATL', city: 'Atlanta',         country: 'USA' },
  { code: 'LAS', city: 'Las Vegas',       country: 'USA' },
  { code: 'WAS', city: 'Washington DC',   country: 'USA' },
  // ── Europe ───────────────────────────────────────────
  { code: 'PAR', city: 'Paris',           country: 'France' },
  { code: 'AMS', city: 'Amsterdam',       country: 'Netherlands' },
  { code: 'BCN', city: 'Barcelona',       country: 'Spain' },
  { code: 'MAD', city: 'Madrid',          country: 'Spain' },
  { code: 'ROM', city: 'Rome',            country: 'Italy' },
  { code: 'MIL', city: 'Milan',           country: 'Italy' },
  { code: 'FRA', city: 'Frankfurt',       country: 'Germany' },
  { code: 'BER', city: 'Berlin',          country: 'Germany' },
  { code: 'IST', city: 'Istanbul',        country: 'Turkey' },
  { code: 'ATH', city: 'Athens',          country: 'Greece' },
  { code: 'LIS', city: 'Lisbon',          country: 'Portugal' },
  { code: 'VIE', city: 'Vienna',          country: 'Austria' },
  { code: 'ZRH', city: 'Zurich',          country: 'Switzerland' },
  { code: 'DUB', city: 'Dublin',          country: 'Ireland' },
  { code: 'CPH', city: 'Copenhagen',      country: 'Denmark' },
  { code: 'STO', city: 'Stockholm',       country: 'Sweden' },
  // ── Middle East ──────────────────────────────────────
  { code: 'DOH', city: 'Doha',            country: 'Qatar' },
  { code: 'RUH', city: 'Riyadh',          country: 'Saudi Arabia' },
  { code: 'JED', city: 'Jeddah',          country: 'Saudi Arabia' },
  { code: 'AMM', city: 'Amman',           country: 'Jordan' },
  // ── Asia & Pacific ───────────────────────────────────
  { code: 'SIN', city: 'Singapore',       country: 'Singapore' },
  { code: 'BKK', city: 'Bangkok',         country: 'Thailand' },
  { code: 'KUL', city: 'Kuala Lumpur',    country: 'Malaysia' },
  { code: 'HKG', city: 'Hong Kong',       country: 'Hong Kong' },
  { code: 'NRT', city: 'Tokyo',            country: 'Japan' },
  { code: 'SYD', city: 'Sydney',          country: 'Australia' },
  { code: 'MEL', city: 'Melbourne',       country: 'Australia' },
  { code: 'MLE', city: 'Maldives',        country: 'Maldives' },
  { code: 'BOM', city: 'Mumbai',          country: 'India' },
  { code: 'DEL', city: 'Delhi',           country: 'India' },
  // ── Americas ─────────────────────────────────────────
  { code: 'CUN', city: 'Cancun',          country: 'Mexico' },
  { code: 'GRU', city: 'São Paulo',       country: 'Brazil' },
  { code: 'GIG', city: 'Rio de Janeiro',  country: 'Brazil' },
]

const hotelSchema = z.object({
  destination: z.string().min(2, 'Enter a destination'),
  checkIn: z.string().min(1, 'Select check-in date'),
  checkOut: z.string().min(1, 'Select check-out date'),
  rooms: z.number().min(1).max(10),
  adults: z.number().min(1).max(20),
  children: z.number().min(0).max(10),
})

type HotelFormData = z.infer<typeof hotelSchema>

export interface HotelSearchMeta {
  checkIn: string
  checkOut: string
  adults: number
  rooms: number
  children?: number
  childAges?: number[]
}

interface HotelSearchFormProps {
  onResults?: (results: HotelResult[], meta: HotelSearchMeta) => void
  initialValues?: Partial<HotelFormData>
}

export function HotelSearchForm({ onResults, initialValues }: HotelSearchFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [destQuery, setDestQuery] = useState('')
  const [isDestOpen, setIsDestOpen] = useState(false)
  const [resolvedCode, setResolvedCode] = useState<string | null>(null)
  const [childAges, setChildAges] = useState<number[]>([])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<HotelFormData>({
    resolver: zodResolver(hotelSchema),
    defaultValues: {
      destination: initialValues?.destination || '',
      checkIn: initialValues?.checkIn || '',
      checkOut: initialValues?.checkOut || '',
      rooms: initialValues?.rooms || 1,
      adults: initialValues?.adults || 2,
      children: initialValues?.children || 0,
    },
  })

  const destination = watch('destination')
  const rooms = watch('rooms')
  const adults = watch('adults')
  const children = watch('children')

  const filteredDests = destQuery.length >= 1
    ? popularDestinations
        .filter(d =>
          d.city.toLowerCase().includes(destQuery.toLowerCase()) ||
          d.country.toLowerCase().includes(destQuery.toLowerCase()) ||
          d.code.toLowerCase().startsWith(destQuery.toLowerCase())
        )
        .slice(0, 8)
    : []

  const onSubmit = async (data: HotelFormData) => {
    setIsLoading(true)
    setError(null)

    // Resolve destination to a valid Hotelbeds code
    let destCode = resolvedCode ?? data.destination
    if (!popularDestinations.some(d => d.code === destCode)) {
      const q = destQuery.toLowerCase()
      const match = popularDestinations.find(d =>
        d.city.toLowerCase() === q ||
        d.city.toLowerCase().startsWith(q) ||
        d.code.toLowerCase() === q
      )
      if (match) {
        destCode = match.code
      } else {
        setError('Please select a destination from the suggestions list.')
        setIsLoading(false)
        return
      }
    }

    // Validate child ages when children > 0 (cert §3.3 — mandatory)
    if (data.children > 0 && childAges.length !== data.children) {
      setError(`Please enter the age for each child (${data.children} required).`)
      setIsLoading(false)
      return
    }

    try {
      if (onResults) {
        const response = await fetch('/api/search/hotels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, destination: destCode, childAges }),
        })

        if (!response.ok) {
          const errorData = await response.json() as { error?: string }
          throw new Error(errorData.error || 'Failed to search hotels')
        }

        const results = await response.json() as HotelResult[]
        onResults(results, {
          checkIn: data.checkIn, checkOut: data.checkOut,
          adults: data.adults, rooms: data.rooms,
          children: data.children, childAges,
        })
      } else {
        const params = new URLSearchParams({
          destination: destCode,
          checkIn: data.checkIn,
          checkOut: data.checkOut,
          rooms: String(data.rooms),
          adults: String(data.adults),
          children: String(data.children),
        })
        router.push(`/hotels?${params.toString()}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-5 lg:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Destination */}
        <div className="lg:col-span-4 relative">
          <label className="label-walz">Destination</label>
          <div className="relative">
            <input
              type="text"
              value={destination || destQuery}
              onChange={(e) => {
                setDestQuery(e.target.value)
                setValue('destination', e.target.value)
                setResolvedCode(null)
                setIsDestOpen(e.target.value.length > 0)
              }}
              onFocus={() => { if (destQuery.length > 0) setIsDestOpen(true) }}
              placeholder="City, hotel or destination"
              className="input-walz h-12"
            />
            {errors.destination && (
              <p className="text-walz-error text-xs mt-1">{errors.destination.message}</p>
            )}

            {isDestOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsDestOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-walz-border rounded-xl shadow-luxury z-20 overflow-hidden max-h-56 overflow-y-auto">
                  {filteredDests.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-walz-muted text-center">No destinations found</div>
                  ) : (
                    filteredDests.map((dest) => (
                      <button
                        key={dest.code}
                        type="button"
                        onClick={() => {
                          setValue('destination', dest.code)
                          setDestQuery(dest.city)
                          setResolvedCode(dest.code)
                          setIsDestOpen(false)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-walz-off-white transition-colors text-left"
                      >
                        <span className="text-base">🏨</span>
                        <div>
                          <div className="text-sm font-medium text-walz-deep-navy">{dest.city}</div>
                          <div className="text-xs text-walz-muted">{dest.country}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Check-in */}
        <div className="lg:col-span-2">
          <label className="label-walz">Check-in</label>
          <Input
            type="date"
            min={today}
            className="h-12"
            {...register('checkIn')}
          />
          {errors.checkIn && (
            <p className="text-walz-error text-xs mt-1">{errors.checkIn.message}</p>
          )}
        </div>

        {/* Check-out */}
        <div className="lg:col-span-2">
          <label className="label-walz">Check-out</label>
          <Input
            type="date"
            min={watch('checkIn') || today}
            className="h-12"
            {...register('checkOut')}
          />
          {errors.checkOut && (
            <p className="text-walz-error text-xs mt-1">{errors.checkOut.message}</p>
          )}
        </div>

        {/* Rooms */}
        <div className="lg:col-span-2">
          <label className="label-walz">Rooms</label>
          <CounterField
            value={rooms}
            min={1}
            max={10}
            onChange={(v) => setValue('rooms', v)}
            label="Room"
          />
        </div>

        {/* Adults */}
        <div className="lg:col-span-1">
          <label className="label-walz">Adults</label>
          <CounterField
            value={adults}
            min={1}
            max={20}
            onChange={(v) => setValue('adults', v)}
            label="Adult"
          />
        </div>

        {/* Children */}
        <div className="lg:col-span-1">
          <label className="label-walz">Children</label>
          <CounterField
            value={children}
            min={0}
            max={10}
            onChange={(v) => {
              setValue('children', v)
              setChildAges(prev => {
                if (v > prev.length) return [...prev, ...Array(v - prev.length).fill(7)]
                return prev.slice(0, v)
              })
            }}
            label="Child"
          />
        </div>
      </div>

      {/* Child age inputs — cert §3.3 mandatory when children > 0 */}
      {children > 0 && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1">
            <Users className="w-3 h-3" /> Child ages required (at time of travel)
          </p>
          <div className="flex flex-wrap gap-2">
            {childAges.map((age, i) => (
              <div key={i} className="flex items-center gap-1">
                <label className="text-xs text-amber-700">Child {i + 1}:</label>
                <select
                  value={age}
                  onChange={e => setChildAges(prev => prev.map((a, j) => j === i ? Number(e.target.value) : a))}
                  className="border border-amber-300 rounded-lg px-2 py-1 text-sm bg-white outline-none focus:border-amber-500"
                >
                  {Array.from({ length: 17 }, (_, k) => k + 1).map(a => (
                    <option key={a} value={a}>{a} yr{a !== 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-walz-error/20 rounded-lg text-walz-error text-sm">
          {error}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm text-walz-muted">
          {adults} adult{adults !== 1 ? 's' : ''}{children > 0 ? `, ${children} child${children !== 1 ? 'ren' : ''}` : ''} · {rooms} room{rooms !== 1 ? 's' : ''}
        </p>
        <Button
          type="submit"
          variant="gold"
          size="lg"
          disabled={isLoading}
          className="min-w-[160px]"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Search className="w-4 h-4 mr-2" />
              Search Hotels
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

interface CounterFieldProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  label: string
}

function CounterField({ value, min, max, onChange, label }: CounterFieldProps) {
  return (
    <div className="flex items-center justify-between h-12 px-3 rounded-lg border border-walz-border bg-white">
      <span className="text-sm text-walz-deep-navy font-medium">
        {value} {label}{value !== 1 ? 's' : ''}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-6 h-6 rounded-full border border-walz-border flex items-center justify-center hover:border-walz-gold transition-colors disabled:opacity-40"
        >
          <Minus className="w-3 h-3 text-walz-muted" />
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-6 h-6 rounded-full border border-walz-border flex items-center justify-center hover:border-walz-gold transition-colors disabled:opacity-40"
        >
          <Plus className="w-3 h-3 text-walz-muted" />
        </button>
      </div>
    </div>
  )
}
