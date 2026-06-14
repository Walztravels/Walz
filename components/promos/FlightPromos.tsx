'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PromoPhotoSlider } from './PromoPhotoSlider'
import { Plane, ArrowRight, Zap, Star } from 'lucide-react'

interface Deal {
  id: string
  origin: string
  destination: string
  fromLabel: string
  toLabel: string
  tripType: string
  departDate?: string | null
  returnDate?: string | null
  price: number
  currency: string
  airline?: string | null
  caption?: string | null
  badge?: string | null
  photos: string
  imageUrl?: string | null
}

function parsedPhotos(deal: Deal): string[] {
  try {
    const arr = JSON.parse(deal.photos)
    if (Array.isArray(arr) && arr.length > 0) return arr
  } catch {}
  if (deal.imageUrl) return [deal.imageUrl]
  return []
}

const BADGE_STYLES: Record<string, string> = {
  'Hot Deal':  'bg-red-500 text-white',
  'Featured':  'bg-[#C9A84C] text-[#0B1F3A]',
  'Limited':   'bg-purple-600 text-white',
  'New Route': 'bg-blue-500 text-white',
}

export function FlightPromos({ onSearch }: { onSearch?: (params: Record<string, string>) => void }) {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/promos/flights')
      .then(r => r.json())
      .then(d => { setDeals(d ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleClick = (deal: Deal) => {
    const params = new URLSearchParams({
      from: deal.origin,
      to: deal.destination,
      type: deal.tripType ?? 'ROUNDTRIP',
      adults: '1',
      cabin: 'ECONOMY',
    })
    if (deal.departDate) params.set('depart', deal.departDate)
    if (deal.returnDate && deal.tripType !== 'ONEWAY') params.set('return', deal.returnDate)

    if (onSearch) {
      onSearch(Object.fromEntries(params))
    } else {
      router.push(`/flights?${params.toString()}`)
    }
  }

  if (loading) {
    return (
      <div className="py-12">
        <div className="h-6 w-48 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-72 bg-gray-100 rounded animate-pulse mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-64 rounded-2xl bg-gray-200 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (deals.length === 0) return null

  const featured = deals.find(d => d.badge === 'Featured') ?? deals[0]
  const rest = deals.filter(d => d.id !== featured.id).slice(0, 7)

  return (
    <section className="py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Plane className="w-4 h-4 text-[#C9A84C]" />
          <span className="text-xs font-semibold text-[#C9A84C] uppercase tracking-widest">Featured Flights</span>
        </div>
        <h2 className="text-2xl lg:text-3xl font-bold text-[#0B1F3A]">
          Popular routes from our clients
        </h2>
        <p className="text-gray-500 mt-1 text-sm">Hand-picked routes. Click any card to search live fares.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 auto-rows-[220px]">
        {/* Featured card — spans 2 cols + 2 rows */}
        <button
          onClick={() => handleClick(featured)}
          className="col-span-2 row-span-2 relative rounded-2xl overflow-hidden group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]"
        >
          <PromoPhotoSlider photos={parsedPhotos(featured)} alt={featured.toLabel} interval={5000} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10" />

          {featured.badge && (
            <div className={`absolute top-4 left-4 z-20 px-2.5 py-1 rounded-full text-xs font-bold ${BADGE_STYLES[featured.badge] ?? 'bg-[#C9A84C] text-[#0B1F3A]'}`}>
              {featured.badge === 'Hot Deal' && <Zap className="inline w-3 h-3 mr-1" />}
              {featured.badge === 'Featured' && <Star className="inline w-3 h-3 mr-1" />}
              {featured.badge}
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 p-6 z-20">
            {featured.caption && <p className="text-white/70 text-sm mb-2">{featured.caption}</p>}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-white text-2xl font-bold">{featured.fromLabel || featured.origin}</span>
              <ArrowRight className="w-5 h-5 text-[#C9A84C]" />
              <span className="text-white text-2xl font-bold">{featured.toLabel || featured.destination}</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                {featured.departDate && (
                  <p className="text-white/60 text-xs">
                    {new Date(featured.departDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {featured.returnDate && ` – ${new Date(featured.returnDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                    {' · '}{featured.tripType === 'ONEWAY' ? 'One way' : 'Round trip'}
                  </p>
                )}
                <p className="text-[#C9A84C] font-bold text-lg mt-0.5">
                  From {featured.currency} {featured.price.toLocaleString()}
                </p>
              </div>
              <div className="bg-[#C9A84C] text-[#0B1F3A] px-4 py-2 rounded-xl text-sm font-bold group-hover:bg-white transition-colors flex items-center gap-1.5">
                Search <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </button>

        {/* Regular cards */}
        {rest.map(deal => (
          <button
            key={deal.id}
            onClick={() => handleClick(deal)}
            className="relative rounded-2xl overflow-hidden group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]"
          >
            <PromoPhotoSlider photos={parsedPhotos(deal)} alt={deal.toLabel} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent z-10" />

            {deal.badge && (
              <div className={`absolute top-3 left-3 z-20 px-2 py-0.5 rounded-full text-xs font-bold ${BADGE_STYLES[deal.badge] ?? 'bg-[#C9A84C] text-[#0B1F3A]'}`}>
                {deal.badge}
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-white font-semibold text-sm">{deal.fromLabel || deal.origin}</span>
                <ArrowRight className="w-3 h-3 text-[#C9A84C]" />
                <span className="text-white font-semibold text-sm">{deal.toLabel || deal.destination}</span>
              </div>
              <p className="text-[#C9A84C] font-bold text-sm">
                From {deal.currency} {deal.price.toLocaleString()}
              </p>
              {deal.departDate && (
                <p className="text-white/50 text-xs mt-0.5">
                  {new Date(deal.departDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  {deal.tripType !== 'ONEWAY' && deal.returnDate
                    ? ` – ${new Date(deal.returnDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                    : ''}
                </p>
              )}
              <div className="mt-2 text-xs text-white/70 font-medium group-hover:text-[#C9A84C] transition-colors flex items-center gap-1">
                Check fares <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
