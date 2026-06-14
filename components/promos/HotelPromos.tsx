'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PromoPhotoSlider } from './PromoPhotoSlider'
import { Hotel, MapPin, Star, ArrowRight, Zap } from 'lucide-react'

interface FeaturedHotel {
  id: string
  name: string
  location: string
  searchQuery: string
  propertyType: string
  rating?: number | null
  reviewCount?: number | null
  reviewLabel?: string | null
  priceFrom?: number | null
  priceOriginal?: number | null
  currency: string
  caption?: string | null
  badge?: string | null
  photos: string
  bookingUrl?: string | null
}

function parsedPhotos(h: FeaturedHotel): string[] {
  try {
    const arr = JSON.parse(h.photos)
    if (Array.isArray(arr) && arr.length > 0) return arr
  } catch {}
  return []
}

function ratingLabel(r?: number | null) {
  if (!r) return null
  if (r >= 9) return 'Superb'
  if (r >= 8.5) return 'Fabulous'
  if (r >= 8) return 'Very good'
  if (r >= 7) return 'Good'
  return 'Pleasant'
}

const BADGE_STYLES: Record<string, string> = {
  'Featured':   'bg-[#C9A84C] text-[#0B1F3A]',
  'Hot deal':   'bg-red-500 text-white',
  'Last rooms': 'bg-purple-600 text-white',
  'Exclusive':  'bg-[#0B1F3A] text-white border border-[#C9A84C]',
}

export function HotelPromos() {
  const [hotels, setHotels] = useState<FeaturedHotel[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/promos/hotels')
      .then(r => r.json())
      .then(d => { setHotels(d ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleClick = (hotel: FeaturedHotel) => {
    if (hotel.bookingUrl) {
      window.open(hotel.bookingUrl, '_blank', 'noopener,noreferrer')
      return
    }
    router.push(`/hotels?destination=${encodeURIComponent(hotel.searchQuery)}`)
  }

  if (loading) {
    return (
      <div className="py-12">
        <div className="h-6 w-48 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-72 bg-gray-100 rounded animate-pulse mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-72 rounded-2xl bg-gray-200 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (hotels.length === 0) return null

  const featured = hotels.find(h => h.badge === 'Featured') ?? hotels[0]
  const rest = hotels.filter(h => h.id !== featured.id).slice(0, 5)

  return (
    <section className="py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Hotel className="w-4 h-4 text-[#C9A84C]" />
          <span className="text-xs font-semibold text-[#C9A84C] uppercase tracking-widest">Hotel Deals</span>
        </div>
        <h2 className="text-2xl lg:text-3xl font-bold text-[#0B1F3A]">
          Stay at our top properties
        </h2>
        <p className="text-gray-500 mt-1 text-sm">Hand-picked hotels and resorts. Click to search availability.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Featured hotel — large card */}
        <button
          onClick={() => handleClick(featured)}
          className="lg:col-span-2 relative rounded-2xl overflow-hidden group text-left h-[420px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]"
        >
          <PromoPhotoSlider photos={parsedPhotos(featured)} alt={featured.name} interval={5000} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent z-10" />

          {featured.badge && (
            <div className={`absolute top-4 left-4 z-20 px-3 py-1 rounded-full text-xs font-bold ${BADGE_STYLES[featured.badge] ?? 'bg-[#C9A84C] text-[#0B1F3A]'}`}>
              {featured.badge === 'Hot deal' && <Zap className="inline w-3 h-3 mr-1" />}
              {featured.badge}
            </div>
          )}

          <div className="absolute top-4 right-4 z-20 bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-medium px-2.5 py-1 rounded-full">
            {featured.propertyType}
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-6 z-20">
            {featured.caption && <p className="text-white/70 text-sm mb-2 italic">&ldquo;{featured.caption}&rdquo;</p>}
            <h3 className="text-white text-xl font-bold mb-1">{featured.name}</h3>
            <div className="flex items-center gap-1.5 text-white/70 text-sm mb-3">
              <MapPin className="w-3.5 h-3.5" />{featured.location}
            </div>
            <div className="flex items-end justify-between">
              <div className="flex items-center gap-3">
                {featured.rating && (
                  <div className="flex items-center gap-1.5">
                    <div className="bg-[#0B1F3A] text-white text-sm font-bold px-2.5 py-1 rounded-lg">
                      {featured.rating.toFixed(1)}
                    </div>
                    <div>
                      <p className="text-white text-xs font-semibold">{ratingLabel(featured.rating)}</p>
                      {featured.reviewCount && (
                        <p className="text-white/50 text-xs">{featured.reviewCount.toLocaleString()} reviews</p>
                      )}
                    </div>
                  </div>
                )}
                {featured.priceFrom && (
                  <div>
                    {featured.priceOriginal && featured.priceOriginal > featured.priceFrom && (
                      <p className="text-white/40 text-xs line-through">
                        {featured.currency} {featured.priceOriginal.toLocaleString()}
                      </p>
                    )}
                    <p className="text-[#C9A84C] font-bold">
                      Starting from {featured.currency} {featured.priceFrom.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
              <div className="bg-[#C9A84C] text-[#0B1F3A] px-4 py-2.5 rounded-xl text-sm font-bold group-hover:bg-white transition-colors flex items-center gap-1.5">
                View Hotel <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </button>

        {/* Right column — 2 stacked cards */}
        <div className="flex flex-col gap-4">
          {rest.slice(0, 2).map(hotel => (
            <button
              key={hotel.id}
              onClick={() => handleClick(hotel)}
              className="relative rounded-2xl overflow-hidden group text-left flex-1 min-h-[196px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]"
            >
              <PromoPhotoSlider photos={parsedPhotos(hotel)} alt={hotel.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent z-10" />

              {hotel.badge && (
                <div className={`absolute top-3 left-3 z-20 px-2 py-0.5 rounded-full text-xs font-bold ${BADGE_STYLES[hotel.badge] ?? 'bg-[#C9A84C] text-[#0B1F3A]'}`}>
                  {hotel.badge}
                </div>
              )}

              <div className="absolute top-3 right-3 z-20 bg-black/30 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full">
                {hotel.propertyType}
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
                <h3 className="text-white font-bold text-sm leading-snug">{hotel.name}</h3>
                <div className="flex items-center justify-between mt-1.5">
                  <div className="flex items-center gap-1.5 text-white/60 text-xs">
                    <MapPin className="w-3 h-3" /> {hotel.location}
                  </div>
                  {hotel.rating && (
                    <div className="flex items-center gap-1 bg-[#0B1F3A] text-white text-xs font-bold px-2 py-0.5 rounded-lg">
                      <Star className="w-2.5 h-2.5 fill-[#C9A84C] text-[#C9A84C]" />
                      {hotel.rating.toFixed(1)}
                    </div>
                  )}
                </div>
                {hotel.priceFrom && (
                  <div className="flex items-center justify-between mt-2">
                    <div>
                      {hotel.priceOriginal && hotel.priceOriginal > hotel.priceFrom && (
                        <span className="text-white/40 text-xs line-through mr-1">
                          {hotel.currency}{hotel.priceOriginal}
                        </span>
                      )}
                      <span className="text-[#C9A84C] text-sm font-bold">
                        {hotel.currency} {hotel.priceFrom.toLocaleString()}
                      </span>
                      <span className="text-white/50 text-xs"> /night</span>
                    </div>
                    <span className="text-white/60 text-xs group-hover:text-[#C9A84C] transition-colors flex items-center gap-1">
                      View <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom row — remaining cards */}
      {rest.length > 2 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
          {rest.slice(2).map(hotel => (
            <button
              key={hotel.id}
              onClick={() => handleClick(hotel)}
              className="relative rounded-2xl overflow-hidden group text-left h-52 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]"
            >
              <PromoPhotoSlider photos={parsedPhotos(hotel)} alt={hotel.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent z-10" />

              {hotel.badge && (
                <div className={`absolute top-3 left-3 z-20 px-2 py-0.5 rounded-full text-xs font-bold ${BADGE_STYLES[hotel.badge] ?? 'bg-[#C9A84C] text-[#0B1F3A]'}`}>
                  {hotel.badge}
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 p-3 z-20">
                <h3 className="text-white font-bold text-sm leading-snug">{hotel.name}</h3>
                <p className="text-white/60 text-xs mt-0.5">{hotel.location}</p>
                <div className="flex items-center justify-between mt-1.5">
                  {hotel.priceFrom ? (
                    <span className="text-[#C9A84C] text-sm font-bold">
                      {hotel.currency} {hotel.priceFrom.toLocaleString()}
                      <span className="text-white/40 text-xs font-normal"> /night</span>
                    </span>
                  ) : <span />}
                  {hotel.rating && (
                    <span className="text-xs font-bold bg-[#0B1F3A] text-white px-2 py-0.5 rounded-lg">
                      {hotel.rating.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
