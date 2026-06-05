'use client'

import { useState, useEffect } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SearchFilters, CabinClass } from '@/types/booking'

interface FlightFiltersProps {
  filters: SearchFilters
  onChange: (filters: SearchFilters) => void
  airlines?: string[]
  priceRange?: { min: number; max: number }
  totalResults?: number
}

const STOP_OPTIONS = [
  { label: 'Non-stop', value: 0 },
  { label: '1 Stop', value: 1 },
  { label: '2+ Stops', value: 2 },
]

const CABIN_OPTIONS: { label: string; value: CabinClass }[] = [
  { label: 'Economy', value: 'ECONOMY' },
  { label: 'Premium Economy', value: 'PREMIUM_ECONOMY' },
  { label: 'Business', value: 'BUSINESS' },
  { label: 'First Class', value: 'FIRST' },
]

const DEPARTURE_TIMES = [
  { label: 'Early Morning', sublabel: '00:00 – 06:00', value: 'early' },
  { label: 'Morning', sublabel: '06:00 – 12:00', value: 'morning' },
  { label: 'Afternoon', sublabel: '12:00 – 18:00', value: 'afternoon' },
  { label: 'Evening', sublabel: '18:00 – 24:00', value: 'evening' },
]

export function FlightFilters({
  filters,
  onChange,
  airlines = [],
  priceRange = { min: 0, max: 5000 },
  totalResults = 0,
}: FlightFiltersProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [localFilters, setLocalFilters] = useState<SearchFilters>(filters)

  useEffect(() => {
    setLocalFilters(filters)
  }, [filters])

  const updateFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    const updated = { ...localFilters, [key]: value }
    setLocalFilters(updated)
    onChange(updated)
  }

  const toggleArrayFilter = <T,>(key: keyof SearchFilters, value: T) => {
    const current = (localFilters[key] as T[] | undefined) || []
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    updateFilter(key, updated as SearchFilters[typeof key])
  }

  const clearFilters = () => {
    const cleared: SearchFilters = {}
    setLocalFilters(cleared)
    onChange(cleared)
  }

  const hasActiveFilters = Object.values(localFilters).some(
    (v) => v !== undefined && (Array.isArray(v) ? v.length > 0 : true)
  )

  const FilterContent = () => (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-walz-deep-navy flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-walz-gold" />
          Filters
          {totalResults > 0 && (
            <span className="text-xs text-walz-muted font-normal">({totalResults} results)</span>
          )}
        </h3>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-walz-gold hover:text-walz-gold-light transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Price Range */}
      <div>
        <h4 className="text-sm font-semibold text-walz-deep-navy mb-3">Price Range</h4>
        <div className="space-y-2">
          <input
            type="range"
            min={priceRange.min}
            max={priceRange.max}
            step={10}
            value={localFilters.priceMax ?? priceRange.max}
            onChange={(e) => updateFilter('priceMax', Number(e.target.value))}
            className="w-full accent-walz-gold"
          />
          <div className="flex justify-between text-xs text-walz-muted">
            <span>£{priceRange.min}</span>
            <span className="font-medium text-walz-deep-navy">
              Up to £{localFilters.priceMax ?? priceRange.max}
            </span>
          </div>
        </div>
      </div>

      <div className="h-px bg-walz-border" />

      {/* Stops */}
      <div>
        <h4 className="text-sm font-semibold text-walz-deep-navy mb-3">Stops</h4>
        <div className="space-y-2">
          {STOP_OPTIONS.map(({ label, value }) => {
            const isSelected = (localFilters.stops || []).includes(value)
            return (
              <label
                key={value}
                className="flex items-center gap-3 cursor-pointer group"
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
                    isSelected
                      ? 'bg-walz-gold border-walz-gold'
                      : 'border-walz-border group-hover:border-walz-gold'
                  )}
                  onClick={() => toggleArrayFilter('stops', value)}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-walz-deep-navy" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M3.707 5.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414L5 6.586 3.707 5.293z" />
                    </svg>
                  )}
                </div>
                <span
                  className="text-sm text-walz-slate"
                  onClick={() => toggleArrayFilter('stops', value)}
                >
                  {label}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="h-px bg-walz-border" />

      {/* Departure Time */}
      <div>
        <h4 className="text-sm font-semibold text-walz-deep-navy mb-3">Departure Time</h4>
        <div className="grid grid-cols-2 gap-2">
          {DEPARTURE_TIMES.map(({ label, sublabel, value }) => {
            const isSelected = (localFilters.departureTimes || []).includes(
              value as 'morning' | 'afternoon' | 'evening' | 'night'
            )
            return (
              <button
                key={value}
                onClick={() => toggleArrayFilter('departureTimes', value as 'morning' | 'afternoon' | 'evening' | 'night')}
                className={cn(
                  'p-2 rounded-lg border text-left transition-all',
                  isSelected
                    ? 'border-walz-gold bg-walz-gold/10 text-walz-deep-navy'
                    : 'border-walz-border hover:border-walz-gold/50 text-walz-slate'
                )}
              >
                <div className="text-xs font-medium">{label}</div>
                <div className="text-[10px] text-walz-muted">{sublabel}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="h-px bg-walz-border" />

      {/* Cabin Class */}
      <div>
        <h4 className="text-sm font-semibold text-walz-deep-navy mb-3">Cabin Class</h4>
        <div className="space-y-2">
          {CABIN_OPTIONS.map(({ label, value }) => {
            const isSelected = (localFilters.cabinClass || []).includes(value)
            return (
              <label
                key={value}
                className="flex items-center gap-3 cursor-pointer group"
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
                    isSelected
                      ? 'bg-walz-gold border-walz-gold'
                      : 'border-walz-border group-hover:border-walz-gold'
                  )}
                  onClick={() => toggleArrayFilter('cabinClass', value)}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-walz-deep-navy" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M3.707 5.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414L5 6.586 3.707 5.293z" />
                    </svg>
                  )}
                </div>
                <span
                  className="text-sm text-walz-slate"
                  onClick={() => toggleArrayFilter('cabinClass', value)}
                >
                  {label}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Airlines */}
      {airlines.length > 0 && (
        <>
          <div className="h-px bg-walz-border" />
          <div>
            <h4 className="text-sm font-semibold text-walz-deep-navy mb-3">Airlines</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {airlines.map((airline) => {
                const isSelected = (localFilters.airlines || []).includes(airline)
                return (
                  <label
                    key={airline}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
                        isSelected
                          ? 'bg-walz-gold border-walz-gold'
                          : 'border-walz-border group-hover:border-walz-gold'
                      )}
                      onClick={() => toggleArrayFilter('airlines', airline)}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-walz-deep-navy" fill="currentColor" viewBox="0 0 12 12">
                          <path d="M3.707 5.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414L5 6.586 3.707 5.293z" />
                        </svg>
                      )}
                    </div>
                    <span
                      className="text-sm text-walz-slate"
                      onClick={() => toggleArrayFilter('airlines', airline)}
                    >
                      {airline}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )

  return (
    <>
      {/* Mobile Filter Toggle */}
      <div className="lg:hidden mb-4">
        <Button
          variant="navy"
          onClick={() => setIsMobileOpen(true)}
          className="w-full"
        >
          <SlidersHorizontal className="w-4 h-4 mr-2" />
          Filters {hasActiveFilters && '(active)'}
        </Button>
      </div>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsMobileOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-luxury overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-walz-border px-4 py-3 flex justify-between items-center">
              <h3 className="font-semibold text-walz-deep-navy">Filters</h3>
              <button
                onClick={() => setIsMobileOpen(false)}
                className="p-1 rounded text-walz-muted hover:text-walz-deep-navy"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <FilterContent />
            </div>
            <div className="sticky bottom-0 p-4 bg-white border-t border-walz-border">
              <Button
                variant="gold"
                className="w-full"
                onClick={() => setIsMobileOpen(false)}
              >
                Show {totalResults} Results
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className="hidden lg:block sticky top-24">
        <div className="bg-white rounded-2xl border border-walz-border p-5 shadow-card">
          <FilterContent />
        </div>
      </div>
    </>
  )
}
