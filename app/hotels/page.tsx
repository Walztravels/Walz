'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Hotel,
  Star,
  MapPin,
  Wifi,
  Coffee,
  Car,
  Waves,
  AlertCircle,
  SortAsc,
  SlidersHorizontal,
} from 'lucide-react'
import { HotelSearchForm } from '@/components/search/HotelSearchForm'
import { HotelPromos } from '@/components/promos/HotelPromos'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { HotelResult, SortOption } from '@/types/booking'

export const dynamic = 'force-dynamic'

const AMENITY_ICONS: Record<string, React.ElementType> = {
  WIFI: Wifi,
  RESTAURANT: Coffee,
  PARKING: Car,
  POOL: Waves,
}

function HotelCardSkeleton() {
  return (
    <div className="card-luxury overflow-hidden flex flex-col">
      <Skeleton className="h-48 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="flex justify-between items-center pt-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

function HotelCard({ hotel }: { hotel: HotelResult }) {
  const router = useRouter()

  return (
    <div className="card-luxury overflow-hidden group flex flex-col">
      {/* Image */}
      <div className="relative h-48 overflow-hidden flex-shrink-0">
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundImage: `url('${hotel.images[0] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80'}')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-walz-deep-navy/40 to-transparent" />
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1 flex items-center gap-1">
          <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
          <span className="text-xs font-bold text-walz-deep-navy">
            {hotel.stars}.0
          </span>
        </div>
        {hotel.isRefundable && (
          <div className="absolute top-3 left-3">
            <span className="badge-gold text-[10px]">Free Cancellation</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex-1">
          <h3 className="font-display text-lg font-bold text-walz-deep-navy leading-tight mb-1 line-clamp-2">
            {hotel.name}
          </h3>

          {/* Star Rating */}
          <div className="flex items-center gap-0.5 mb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  'w-3 h-3',
                  i < hotel.stars ? 'text-yellow-400 fill-yellow-400' : 'text-walz-border'
                )}
              />
            ))}
            {hotel.rating && (
              <span className="text-xs text-walz-muted ml-1">
                {hotel.rating}/5
                {hotel.reviewCount && ` (${hotel.reviewCount})`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-walz-muted mb-3">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-walz-gold" />
            <span className="truncate">
              {[hotel.address.lines[0], hotel.address.city, hotel.address.country]
                .filter(Boolean)
                .join(', ')}
            </span>
          </div>

          {/* Amenities */}
          {hotel.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {hotel.amenities.slice(0, 4).map((amenity) => {
                const Icon = AMENITY_ICONS[amenity.code] || Coffee
                return (
                  <div
                    key={amenity.code}
                    className="flex items-center gap-1 text-xs text-walz-muted bg-walz-off-white px-2 py-1 rounded-full"
                    title={amenity.description}
                  >
                    <Icon className="w-3 h-3 text-walz-gold" />
                    <span className="truncate max-w-[60px]">{amenity.description}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Price & Book */}
        <div className="flex items-end justify-between pt-3 border-t border-walz-border mt-3">
          <div>
            <div className="text-xs text-walz-muted">from</div>
            <div className="text-xl font-bold text-walz-gold">
              {formatPrice(hotel.pricePerNight.amount, hotel.pricePerNight.currency)}
            </div>
            <div className="text-xs text-walz-muted">per night</div>
          </div>
          <Button
            variant="gold"
            size="sm"
            onClick={() => router.push(`/book?hotel=${encodeURIComponent(JSON.stringify(hotel))}`)}
          >
            Book Now
          </Button>
        </div>
      </div>
    </div>
  )
}

function HotelsPageContent() {
  const searchParams = useSearchParams()
  const [hotels, setHotels] = useState<HotelResult[]>([])
  const [filteredHotels, setFilteredHotels] = useState<HotelResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [sort, setSort] = useState<SortOption>('price_asc')
  const [starFilter, setStarFilter] = useState<number[]>([])

  useEffect(() => {
    let filtered = [...hotels]
    if (starFilter.length > 0) {
      filtered = filtered.filter((h) => starFilter.includes(h.stars))
    }
    switch (sort) {
      case 'price_asc':
        filtered.sort((a, b) => a.pricePerNight.amount - b.pricePerNight.amount)
        break
      case 'price_desc':
        filtered.sort((a, b) => b.pricePerNight.amount - a.pricePerNight.amount)
        break
      case 'rating_desc':
        filtered.sort((a, b) => (b.stars || 0) - (a.stars || 0))
        break
    }
    setFilteredHotels(filtered)
  }, [hotels, sort, starFilter])

  useEffect(() => {
    const destination = searchParams.get('destination')
    const checkIn = searchParams.get('checkIn')
    const checkOut = searchParams.get('checkOut')

    if (destination && checkIn && checkOut) {
      searchHotels({
        destination,
        checkIn,
        checkOut,
        rooms: parseInt(searchParams.get('rooms') || '1', 10),
        adults: parseInt(searchParams.get('adults') || '2', 10),
        children: parseInt(searchParams.get('children') || '0', 10),
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const searchHotels = async (searchData: {
    destination: string
    checkIn: string
    checkOut: string
    rooms: number
    adults: number
    children: number
  }) => {
    setIsLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      const response = await fetch('/api/search/hotels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchData),
      })

      if (!response.ok) {
        const data = await response.json() as { error?: string }
        throw new Error(data.error || 'Hotel search failed')
      }

      const results = await response.json() as HotelResult[]
      setHotels(results)
      setStarFilter([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-walz-off-white">
      {/* Search Bar */}
      <div className="bg-walz-deep-navy shadow-luxury">
        <div className="container-walz pt-6 pb-2">
          <h1 className="font-display text-walz-white font-bold text-2xl lg:text-3xl mb-1">
            Book Hotels
          </h1>
          <p className="text-walz-muted text-sm mb-4">
            Global inventory · free cancellation options · 24/7 support
          </p>
        </div>
        <div className="container-walz pb-6">
          <HotelSearchForm onResults={(results) => {
            setHotels(results)
            setHasSearched(true)
            setStarFilter([])
          }} />
        </div>
      </div>

      <div className="container-walz py-8">
        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <HotelCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="text-center py-16 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-walz-error" />
            </div>
            <h3 className="font-display text-xl font-bold text-walz-deep-navy mb-2">Search Failed</h3>
            <p className="text-walz-muted mb-6">{error}</p>
            <Button variant="gold" onClick={() => setError(null)}>Try Again</Button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && !hasSearched && (
          <HotelPromos />
        )}

        {/* Results */}
        {!isLoading && !error && hasSearched && (
          <>
            {/* Results Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="font-semibold text-walz-deep-navy">
                  {filteredHotels.length} hotel{filteredHotels.length !== 1 ? 's' : ''} found
                </h2>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Star Filter */}
                <div className="flex items-center gap-1">
                  <SlidersHorizontal className="w-4 h-4 text-walz-muted" />
                  <div className="flex gap-1">
                    {[3, 4, 5].map((stars) => (
                      <button
                        key={stars}
                        onClick={() => {
                          setStarFilter((prev) =>
                            prev.includes(stars) ? prev.filter((s) => s !== stars) : [...prev, stars]
                          )
                        }}
                        className={cn(
                          'px-2.5 py-1 rounded-full border text-xs font-medium transition-colors flex items-center gap-1',
                          starFilter.includes(stars)
                            ? 'bg-walz-gold border-walz-gold text-walz-deep-navy'
                            : 'border-walz-border text-walz-muted hover:border-walz-gold'
                        )}
                      >
                        {stars} <Star className="w-3 h-3 fill-current" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort */}
                <div className="flex items-center gap-2">
                  <SortAsc className="w-4 h-4 text-walz-muted" />
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortOption)}
                    className="text-sm border border-walz-border rounded-lg px-3 py-2 bg-white text-walz-deep-navy focus:outline-none focus:ring-2 focus:ring-walz-gold"
                  >
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="rating_desc">Rating: Best first</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredHotels.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-walz-border">
                <Hotel className="w-12 h-12 text-walz-muted mx-auto mb-4" />
                <h3 className="font-display text-xl font-bold text-walz-deep-navy mb-2">
                  No hotels match your filters
                </h3>
                <button
                  onClick={() => setStarFilter([])}
                  className="text-walz-gold text-sm font-medium hover:underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filteredHotels.map((hotel) => (
                  <HotelCard key={hotel.id} hotel={hotel} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function HotelsPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-walz-gold border-t-transparent rounded-full animate-spin" /></div>}>
      <HotelsPageContent />
    </Suspense>
  )
}
