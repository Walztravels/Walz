'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, Loader2, Plus, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { HotelResult } from '@/types/booking'

const popularDestinations = [
  { code: 'DXB', city: 'Dubai', country: 'UAE' },
  { code: 'LON', city: 'London', country: 'UK' },
  { code: 'NYC', city: 'New York', country: 'USA' },
  { code: 'PAR', city: 'Paris', country: 'France' },
  { code: 'TYO', city: 'Tokyo', country: 'Japan' },
  { code: 'SYD', city: 'Sydney', country: 'Australia' },
  { code: 'SIN', city: 'Singapore', country: 'Singapore' },
  { code: 'MLE', city: 'Maldives', country: 'Maldives' },
  { code: 'DUB', city: 'Dublin', country: 'Ireland' },
  { code: 'BCN', city: 'Barcelona', country: 'Spain' },
  { code: 'ROM', city: 'Rome', country: 'Italy' },
  { code: 'AMS', city: 'Amsterdam', country: 'Netherlands' },
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

interface HotelSearchFormProps {
  onResults?: (results: HotelResult[]) => void
  initialValues?: Partial<HotelFormData>
}

export function HotelSearchForm({ onResults, initialValues }: HotelSearchFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [destQuery, setDestQuery] = useState('')
  const [isDestOpen, setIsDestOpen] = useState(false)

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
    ? popularDestinations.filter(
        (d) =>
          d.city.toLowerCase().includes(destQuery.toLowerCase()) ||
          d.country.toLowerCase().includes(destQuery.toLowerCase()) ||
          d.code.toLowerCase().includes(destQuery.toLowerCase())
      )
    : popularDestinations.slice(0, 8)

  const onSubmit = async (data: HotelFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      if (onResults) {
        const response = await fetch('/api/search/hotels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })

        if (!response.ok) {
          const errorData = await response.json() as { error?: string }
          throw new Error(errorData.error || 'Failed to search hotels')
        }

        const results = await response.json() as HotelResult[]
        onResults(results)
      } else {
        const params = new URLSearchParams({
          destination: data.destination,
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
                setIsDestOpen(true)
              }}
              onFocus={() => setIsDestOpen(true)}
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

        {/* Guests */}
        <div className="lg:col-span-2">
          <label className="label-walz">Guests</label>
          <div className="flex items-center gap-1">
            <CounterField
              value={adults}
              min={1}
              max={20}
              onChange={(v) => setValue('adults', v)}
              label="Adult"
            />
          </div>
        </div>
      </div>

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
