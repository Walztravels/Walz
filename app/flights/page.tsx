'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plane, SortAsc, AlertCircle } from 'lucide-react'
import { FlightSearchForm } from '@/components/search/FlightSearchForm'
import { FlightCard } from '@/components/flights/FlightCard'
import { FlightFilters } from '@/components/flights/FlightFilters'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import type { FlightResult, SearchFilters, SortOption } from '@/types/booking'

export const dynamic = 'force-dynamic'

function FlightSkeleton() {
  return (
    <div className="card-luxury p-5 mb-4">
      <div className="flex items-center gap-4">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <div className="flex-1 grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="space-y-2 flex flex-col items-center">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="space-y-2 flex flex-col items-end">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </div>
    </div>
  )
}

function applyFilters(flights: FlightResult[], filters: SearchFilters): FlightResult[] {
  return flights.filter((flight) => {
    if (filters.priceMax !== undefined && flight.price.amount > filters.priceMax) return false
    if (filters.priceMin !== undefined && flight.price.amount < filters.priceMin) return false
    if (filters.stops && filters.stops.length > 0) {
      const stopMatch = filters.stops.some((s) => {
        if (s === 2) return flight.stops >= 2
        return flight.stops === s
      })
      if (!stopMatch) return false
    }
    if (filters.airlines && filters.airlines.length > 0) {
      if (!filters.airlines.includes(flight.validatingCarrier)) return false
    }
    if (filters.cabinClass && filters.cabinClass.length > 0) {
      if (!filters.cabinClass.includes(flight.cabinClass)) return false
    }
    return true
  })
}

function applySorting(flights: FlightResult[], sort: SortOption): FlightResult[] {
  const sorted = [...flights]
  switch (sort) {
    case 'price_asc':
      return sorted.sort((a, b) => a.price.amount - b.price.amount)
    case 'price_desc':
      return sorted.sort((a, b) => b.price.amount - a.price.amount)
    case 'duration_asc':
      return sorted.sort((a, b) => a.totalDuration - b.totalDuration)
    case 'departure_asc':
      return sorted.sort(
        (a, b) =>
          new Date(a.outbound[0].departureTime).getTime() -
          new Date(b.outbound[0].departureTime).getTime()
      )
    default:
      return sorted
  }
}

function FlightsPageContent() {
  const searchParams = useSearchParams()
  const [allFlights, setAllFlights] = useState<FlightResult[]>([])
  const [filteredFlights, setFilteredFlights] = useState<FlightResult[]>([])
  const [filters, setFilters] = useState<SearchFilters>({})
  const [sort, setSort] = useState<SortOption>('price_asc')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const airlines = [...new Set(allFlights.map((f) => f.validatingCarrier))]
  const priceRange = allFlights.length > 0
    ? {
        min: Math.floor(Math.min(...allFlights.map((f) => f.price.amount))),
        max: Math.ceil(Math.max(...allFlights.map((f) => f.price.amount))),
      }
    : { min: 0, max: 5000 }

  const applyFiltersAndSort = useCallback(
    (flights: FlightResult[], f: SearchFilters, s: SortOption) => {
      const filtered = applyFilters(flights, f)
      const sorted = applySorting(filtered, s)
      setFilteredFlights(sorted)
    },
    []
  )

  useEffect(() => {
    applyFiltersAndSort(allFlights, filters, sort)
  }, [allFlights, filters, sort, applyFiltersAndSort])

  // Auto-search if URL has params (regular) or sessionStorage (multi-city)
  useEffect(() => {
    const tripType = searchParams.get('type') || searchParams.get('tripType')

    if (tripType === 'multicity') {
      // Multi-city: params were stored in sessionStorage by the home page form
      const stored = sessionStorage.getItem('multiCitySearch')
      if (stored) {
        sessionStorage.removeItem('multiCitySearch')
        const payload = JSON.parse(stored) as Record<string, unknown>
        setIsLoading(true)
        setHasSearched(true)
        fetch('/api/search/flights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then((r) => r.json())
          .then((results: FlightResult[]) => { setAllFlights(results); setFilters({}); setSort('price_asc') })
          .catch((err: Error) => setError(err.message))
          .finally(() => setIsLoading(false))
      }
      return
    }

    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const depart = searchParams.get('depart')

    if (from && to && depart) {
      handleSearch({
        origin: from,
        destination: to,
        departureDate: depart,
        returnDate: searchParams.get('return') || undefined,
        adults: parseInt(searchParams.get('adults') || '1', 10),
        children: parseInt(searchParams.get('children') || '0', 10),
        infants: parseInt(searchParams.get('infants') || '0', 10),
        cabinClass: (searchParams.get('cabin') as FlightResult['cabinClass']) || 'ECONOMY',
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = async (searchData: {
    origin: string
    destination: string
    departureDate: string
    returnDate?: string
    adults: number
    children: number
    infants: number
    cabinClass: FlightResult['cabinClass']
  }) => {
    setIsLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      const response = await fetch('/api/search/flights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchData),
      })

      if (!response.ok) {
        const data = await response.json() as { error?: string }
        throw new Error(data.error || 'Search failed')
      }

      const results = await response.json() as FlightResult[]
      setAllFlights(results)
      setFilters({})
      setSort('price_asc')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const searchFrom = searchParams.get('from')
  const searchTo = searchParams.get('to')
  const searchDepart = searchParams.get('depart')

  return (
    <div className="min-h-screen bg-walz-off-white">
      {/* Search Bar */}
      <div className="bg-walz-deep-navy shadow-luxury">
        <div className="container-walz pt-6 pb-2">
          <h1 className="font-display text-walz-white font-bold text-2xl lg:text-3xl mb-1">
            Search Flights Worldwide
          </h1>
          <p className="text-walz-muted text-sm mb-4">
            400+ airlines · Sabre GDS · Best available fares
          </p>
        </div>
        <div className="container-walz pb-6">
          <FlightSearchForm
            onResults={(results) => {
              setAllFlights(results)
              setHasSearched(true)
              setFilters({})
              setSort('price_asc')
            }}
            initialValues={{
              origin: searchFrom || '',
              destination: searchTo || '',
              departureDate: searchDepart || '',
            }}
          />
        </div>
      </div>

      <div className="container-walz py-8">
        {/* Results State: Loading */}
        {isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <Skeleton className="h-96 rounded-2xl" />
            </div>
            <div className="lg:col-span-3">
              <Skeleton className="h-8 w-48 mb-4" />
              {Array.from({ length: 5 }).map((_, i) => (
                <FlightSkeleton key={i} />
              ))}
            </div>
          </div>
        )}

        {/* Results State: Error */}
        {!isLoading && error && (
          <div className="max-w-lg mx-auto text-center py-16">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-walz-error" />
            </div>
            <h3 className="font-display text-xl font-bold text-walz-deep-navy mb-2">
              Search Failed
            </h3>
            <p className="text-walz-muted mb-6">{error}</p>
            <button
              onClick={() => setError(null)}
              className="btn-gold px-6 py-3 rounded-lg text-sm font-semibold"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Results State: Empty (no search yet) */}
        {!isLoading && !error && !hasSearched && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full walz-gold-gradient flex items-center justify-center mx-auto mb-4 shadow-gold-glow">
              <Plane className="w-8 h-8 text-walz-deep-navy" />
            </div>
            <h2 className="font-display text-2xl font-bold text-walz-deep-navy mb-2">
              Ready to Fly?
            </h2>
            <p className="text-walz-muted max-w-sm mx-auto">
              Use the search form above to find the best available flights for your journey.
            </p>
          </div>
        )}

        {/* Results State: Results */}
        {!isLoading && !error && hasSearched && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Filters Sidebar */}
            <div className="lg:col-span-1">
              <FlightFilters
                filters={filters}
                onChange={setFilters}
                airlines={airlines}
                priceRange={priceRange}
                totalResults={filteredFlights.length}
              />
            </div>

            {/* Results List */}
            <div className="lg:col-span-3">
              {/* Results Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="font-semibold text-walz-deep-navy">
                    {filteredFlights.length === 0
                      ? 'No flights found'
                      : `${filteredFlights.length} flight${filteredFlights.length !== 1 ? 's' : ''} found`}
                  </h2>
                  {searchFrom && searchTo && searchDepart && (
                    <p className="text-walz-muted text-sm mt-0.5">
                      {searchFrom} → {searchTo} · {formatDate(searchDepart)}
                    </p>
                  )}
                </div>

                {/* Sort */}
                <div className="flex items-center gap-2">
                  <SortAsc className="w-4 h-4 text-walz-muted" />
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortOption)}
                    className="text-sm border border-walz-border rounded-lg px-3 py-2 bg-white text-walz-deep-navy focus:outline-none focus:ring-2 focus:ring-walz-gold"
                  >
                    <option value="price_asc">Price: Lowest first</option>
                    <option value="price_desc">Price: Highest first</option>
                    <option value="duration_asc">Duration: Shortest first</option>
                    <option value="departure_asc">Departure: Earliest first</option>
                  </select>
                </div>
              </div>

              {/* Flight Cards */}
              {filteredFlights.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-walz-border">
                  <Plane className="w-12 h-12 text-walz-muted mx-auto mb-4" />
                  {allFlights.length === 0 ? (
                    <>
                      <h3 className="font-display text-xl font-bold text-walz-deep-navy mb-2">
                        No flights found
                      </h3>
                      <p className="text-walz-muted">
                        No available flights for this route and date. Try different dates or airports.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="font-display text-xl font-bold text-walz-deep-navy mb-2">
                        No results match your filters
                      </h3>
                      <p className="text-walz-muted mb-4">Try adjusting or clearing your filters</p>
                      <button
                        onClick={() => setFilters({})}
                        className="text-walz-gold text-sm font-medium hover:text-walz-gold-light transition-colors"
                      >
                        Clear all filters
                      </button>
                    </>
                  )}
                </div>
              ) : (
                filteredFlights.map((flight) => (
                  <FlightCard key={flight.id} flight={flight} />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FlightsPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-walz-gold border-t-transparent rounded-full animate-spin" /></div>}>
      <FlightsPageContent />
    </Suspense>
  )
}
