'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Star, MapPin, ChevronLeft, ChevronRight, Shield, Coffee,
  AlertCircle, SlidersHorizontal, X, Search, Loader2, Utensils,
} from 'lucide-react'
import { HotelSearchForm, type HotelSearchMeta } from '@/components/search/HotelSearchForm'
import { cn, formatPrice } from '@/lib/utils'
import type { HotelResult } from '@/types/booking'

export const dynamic = 'force-dynamic'

// ─── helpers ────────────────────────────────────────────────────────────────

function ratingLabel(r: number) {
  if (r >= 9)  return 'Exceptional'
  if (r >= 8)  return 'Superb'
  if (r >= 7)  return 'Very Good'
  if (r >= 6)  return 'Good'
  return 'Pleasant'
}
function ratingBg(r: number) {
  if (r >= 8) return 'bg-walz-success text-white'
  if (r >= 7) return 'bg-walz-gold text-walz-deep-navy'
  return 'bg-walz-muted text-white'
}
function mealLabel(plan?: string) {
  if (!plan) return 'Room Only'
  const p = plan.toLowerCase()
  if (p.includes('all inclusive'))              return 'All Inclusive'
  if (p.includes('full board'))                 return 'Full Board'
  if (p.includes('half board'))                 return 'Half Board'
  if (p.includes('breakfast') || p.includes('bb')) return 'Breakfast included'
  return plan
}
function mealIcon(plan?: string) {
  if (!plan) return null
  const p = plan.toLowerCase()
  if (p.includes('breakfast') || p.includes('bb')) return <Coffee className="w-3 h-3" />
  if (p.includes('board') || p.includes('all'))    return <Utensils className="w-3 h-3" />
  return null
}

// ─── skeleton ────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-walz-border overflow-hidden flex animate-pulse" style={{ height: 210 }}>
      <div className="w-60 flex-shrink-0 bg-walz-border/40" />
      <div className="flex-1 p-5 space-y-3">
        <div className="h-5 bg-walz-border/60 rounded w-2/3" />
        <div className="h-3 bg-walz-border/40 rounded w-1/3" />
        <div className="h-3 bg-walz-border/40 rounded w-1/2" />
        <div className="flex gap-2 mt-2">
          <div className="h-5 bg-walz-border/40 rounded-full w-24" />
          <div className="h-5 bg-walz-border/40 rounded-full w-20" />
        </div>
        <div className="flex items-end justify-between pt-4">
          <div className="space-y-1">
            <div className="h-7 bg-walz-border/60 rounded w-28" />
            <div className="h-3 bg-walz-border/40 rounded w-20" />
          </div>
          <div className="h-10 bg-walz-border/60 rounded-xl w-28" />
        </div>
      </div>
    </div>
  )
}

// ─── image carousel ──────────────────────────────────────────────────────────

function HotelImage({ images, name }: { images: string[]; name: string }) {
  const [idx, setIdx] = useState(0)
  const [ok,  setOk]  = useState(true)
  const FALLBACK = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80'
  const src = (images[idx] && ok) ? images[idx] : FALLBACK

  return (
    <div className="relative w-60 flex-shrink-0 overflow-hidden group bg-walz-off-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt={name}
        onError={() => setOk(false)}
        onLoad={() => setOk(true)}
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      {images.length > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + images.length) % images.length); setOk(true) }}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % images.length); setOk(true) }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-10">
            {images.slice(0, 5).map((_, i) => (
              <span key={i} className={cn('w-1.5 h-1.5 rounded-full transition-colors', i === idx ? 'bg-walz-gold' : 'bg-white/50')} />
            ))}
          </div>
        </>
      )}
      {images.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center"><span className="text-5xl">🏨</span></div>
      )}
    </div>
  )
}

// ─── hotel card ──────────────────────────────────────────────────────────────

function HotelCard({ hotel, nights, onBook }: { hotel: HotelResult; nights: number; onBook: (h: HotelResult) => void }) {
  return (
    <div className="bg-white rounded-2xl border border-walz-border overflow-hidden flex flex-col sm:flex-row hover:shadow-card hover:border-walz-gold/30 transition-all group"
      style={{ minHeight: 210 }}>
      <HotelImage images={hotel.images} name={hotel.name} />

      <div className="flex-1 p-5 flex flex-col gap-2 min-w-0">
        {/* Name + rating */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display font-bold text-walz-deep-navy text-lg leading-snug line-clamp-2 group-hover:text-walz-gold transition-colors">
              {hotel.name}
            </h3>
            <div className="flex items-center gap-0.5 mt-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={cn('w-3 h-3', i < hotel.stars ? 'text-walz-gold fill-walz-gold' : 'text-walz-border fill-walz-border')} />
              ))}
              <span className="text-xs text-walz-muted ml-1">{hotel.stars}-star hotel</span>
            </div>
          </div>
          {hotel.rating != null && hotel.rating > 0 && (
            <div className="flex-shrink-0 text-right">
              <div className="text-xs text-walz-muted mb-0.5">{ratingLabel(hotel.rating)}</div>
              <div className={cn('text-sm font-bold px-2.5 py-1 rounded-lg inline-block', ratingBg(hotel.rating))}>
                {hotel.rating.toFixed(1)}
              </div>
              {hotel.reviewCount && (
                <div className="text-[10px] text-walz-muted mt-0.5">{hotel.reviewCount.toLocaleString()} reviews</div>
              )}
            </div>
          )}
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 text-xs text-walz-muted">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-walz-gold" />
          <span className="truncate">{[hotel.address.lines[0], hotel.address.city, hotel.address.country].filter(Boolean).join(', ')}</span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {hotel.roomType && (
            <span className="text-[11px] text-walz-deep-navy bg-walz-off-white border border-walz-border px-2.5 py-0.5 rounded-full">
              {hotel.roomType}
            </span>
          )}
          <span className="text-[11px] text-walz-deep-navy bg-walz-off-white border border-walz-border px-2.5 py-0.5 rounded-full flex items-center gap-1">
            {mealIcon(hotel.mealPlan)}
            {mealLabel(hotel.mealPlan)}
          </span>
        </div>

        {/* Cancellation */}
        {hotel.isRefundable ? (
          <div className="flex items-center gap-1 text-[11px] text-walz-success font-semibold">
            <Shield className="w-3 h-3" /> Free cancellation
          </div>
        ) : (
          <div className="text-[11px] text-walz-muted">{hotel.cancellationPolicy ?? 'Non-refundable rate'}</div>
        )}

        {/* Price + CTA */}
        <div className="flex items-end justify-between mt-auto pt-3 border-t border-walz-border">
          <div>
            <p className="text-[10px] text-walz-muted uppercase tracking-wider">{nights} night{nights !== 1 ? 's' : ''}</p>
            <p className="text-2xl font-extrabold text-walz-deep-navy leading-none">
              {formatPrice(hotel.pricePerNight.amount, hotel.pricePerNight.currency)}
              <span className="text-xs font-normal text-walz-muted ml-1">/night</span>
            </p>
            <p className="text-xs text-walz-muted">{formatPrice(hotel.totalPrice.amount, hotel.totalPrice.currency)} total</p>
          </div>
          <button
            onClick={() => onBook(hotel)}
            className="bg-walz-gold hover:bg-walz-gold-light text-walz-deep-navy font-bold text-sm px-6 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            See details →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── filter sidebar ──────────────────────────────────────────────────────────

interface Filters { stars: number[]; maxPrice: number; freeCancel: boolean; mealPlans: string[] }
const MEAL_OPTIONS = ['Room Only', 'Breakfast included', 'Half Board', 'Full Board', 'All Inclusive']

function FilterPanel({ filters, setFilters, priceMax, onClose }: {
  filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>; priceMax: number; onClose?: () => void
}) {
  const toggle = <T,>(key: keyof Filters, val: T) =>
    setFilters(f => {
      const arr = f[key] as T[]
      return { ...f, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] }
    })

  return (
    <div>
      {onClose && (
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-walz-deep-navy">Filters</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-walz-muted" /></button>
        </div>
      )}

      {/* Stars */}
      <div className="mb-5">
        <p className="text-[11px] font-semibold text-walz-muted uppercase tracking-widest mb-2.5">Star Rating</p>
        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map(s => (
            <label key={s} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={filters.stars.includes(s)} onChange={() => toggle('stars', s)}
                className="w-4 h-4 rounded border-walz-border accent-walz-gold" />
              <span className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={cn('w-3 h-3', i < s ? 'text-walz-gold fill-walz-gold' : 'text-walz-border fill-walz-border')} />
                ))}
              </span>
              <span className="text-sm text-walz-deep-navy">{s} star{s !== 1 ? 's' : ''}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Price */}
      <div className="mb-5">
        <p className="text-[11px] font-semibold text-walz-muted uppercase tracking-widest mb-2.5">Max Price / Night</p>
        <input type="range" min={0} max={priceMax} step={10}
          value={filters.maxPrice}
          onChange={e => setFilters(f => ({ ...f, maxPrice: +e.target.value }))}
          className="w-full accent-walz-gold" />
        <div className="flex justify-between text-xs text-walz-muted mt-1">
          <span>£0</span>
          <span className="font-bold text-walz-gold">£{filters.maxPrice}</span>
          <span>£{priceMax}</span>
        </div>
      </div>

      {/* Free cancel */}
      <div className="mb-5">
        <p className="text-[11px] font-semibold text-walz-muted uppercase tracking-widest mb-2.5">Cancellation</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={filters.freeCancel}
            onChange={e => setFilters(f => ({ ...f, freeCancel: e.target.checked }))}
            className="w-4 h-4 rounded border-walz-border accent-walz-gold" />
          <span className="text-sm text-walz-deep-navy flex items-center gap-1">
            <Shield className="w-3 h-3 text-walz-success" /> Free cancellation only
          </span>
        </label>
      </div>

      {/* Meal plan */}
      <div className="mb-2">
        <p className="text-[11px] font-semibold text-walz-muted uppercase tracking-widest mb-2.5">Meal Plan</p>
        <div className="space-y-2">
          {MEAL_OPTIONS.map(m => (
            <label key={m} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={filters.mealPlans.includes(m)} onChange={() => toggle('mealPlans', m)}
                className="w-4 h-4 rounded border-walz-border accent-walz-gold" />
              <span className="text-sm text-walz-deep-navy">{m}</span>
            </label>
          ))}
        </div>
      </div>

      <button onClick={() => setFilters({ stars: [], maxPrice: priceMax, freeCancel: false, mealPlans: [] })}
        className="mt-4 text-xs text-walz-gold hover:underline">
        Reset all filters
      </button>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

type Sort = 'price_asc' | 'price_desc' | 'rating_desc' | 'stars_desc'

function HotelsPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [hotels,      setHotels]      = useState<HotelResult[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [sort,        setSort]        = useState<Sort>('price_asc')
  const [showFilters, setShowFilters] = useState(false)
  const [meta, setMeta] = useState<HotelSearchMeta>({ checkIn: '', checkOut: '', adults: 2, rooms: 1 })

  const priceMax = useMemo(() => {
    const mx = Math.max(0, ...hotels.map(h => h.pricePerNight.amount))
    return Math.ceil((mx + 50) / 50) * 50 || 500
  }, [hotels])

  const [filters, setFilters] = useState<Filters>({ stars: [], maxPrice: priceMax, freeCancel: false, mealPlans: [] })
  useEffect(() => setFilters(f => ({ ...f, maxPrice: priceMax })), [priceMax])

  const nights = useMemo(() => {
    if (!meta.checkIn || !meta.checkOut) return 1
    return Math.max(1, Math.ceil((new Date(meta.checkOut).getTime() - new Date(meta.checkIn).getTime()) / 86400000))
  }, [meta.checkIn, meta.checkOut])

  const displayed = useMemo(() => {
    let list = [...hotels]
    if (filters.stars.length)      list = list.filter(h => filters.stars.includes(h.stars))
    if (filters.freeCancel)         list = list.filter(h => h.isRefundable)
    if (filters.maxPrice < priceMax) list = list.filter(h => h.pricePerNight.amount <= filters.maxPrice)
    if (filters.mealPlans.length)  list = list.filter(h => filters.mealPlans.includes(mealLabel(h.mealPlan)))
    switch (sort) {
      case 'price_asc':   list.sort((a, b) => a.pricePerNight.amount - b.pricePerNight.amount); break
      case 'price_desc':  list.sort((a, b) => b.pricePerNight.amount - a.pricePerNight.amount); break
      case 'rating_desc': list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)); break
      case 'stars_desc':  list.sort((a, b) => b.stars - a.stars); break
    }
    return list
  }, [hotels, filters, sort, priceMax])

  useEffect(() => {
    const dest    = searchParams.get('destination')
    const checkIn  = searchParams.get('checkIn')
    const checkOut = searchParams.get('checkOut')
    if (dest && checkIn && checkOut) {
      const adults   = parseInt(searchParams.get('adults')   ?? '2', 10)
      const rooms    = parseInt(searchParams.get('rooms')    ?? '1', 10)
      const children = parseInt(searchParams.get('children') ?? '0', 10)
      setMeta({ checkIn, checkOut, adults, rooms })
      doSearch({ destination: dest, checkIn, checkOut, rooms, adults, children })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function doSearch(params: { destination: string; checkIn: string; checkOut: string; rooms: number; adults: number; children: number }) {
    setLoading(true); setError(null); setHasSearched(true)
    try {
      const res = await fetch('/api/search/hotels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, maxResults: 50 }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Search failed') }
      const data: HotelResult[] = await res.json()
      setHotels(data)
      setFilters(f => ({ ...f, stars: [], freeCancel: false, mealPlans: [] }))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function openDetail(hotel: HotelResult) {
    try {
      sessionStorage.setItem('walz_hotel_booking', JSON.stringify({ hotel, meta }))
    } catch { /* storage unavailable */ }
    router.push('/hotels/book')
  }

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
  const activeFilterCount = filters.stars.length + (filters.freeCancel ? 1 : 0) + filters.mealPlans.length

  return (
    <div className="min-h-screen bg-walz-off-white">

      {/* Search bar */}
      <div className="bg-walz-deep-navy shadow-luxury">
        <div className="container-walz py-4">
          <h1 className="font-display text-walz-white font-bold text-2xl mb-1">Hotel Search</h1>
          <p className="text-walz-muted text-sm mb-4">Live rates · global inventory · free cancellation options</p>
          <HotelSearchForm onResults={(results, m) => {
            setHotels(results); setHasSearched(true)
            setMeta(m)
            setFilters(f => ({ ...f, stars: [], freeCancel: false, mealPlans: [] }))
          }} />
        </div>
      </div>

      <div className="container-walz py-8">

        {/* Empty state */}
        {!hasSearched && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Search className="w-14 h-14 text-walz-muted/30 mb-4" />
            <h2 className="font-display text-xl font-bold text-walz-deep-navy mb-1">Search for Hotels</h2>
            <p className="text-walz-muted text-sm max-w-xs">Enter a destination and dates above to browse live Hotelbeds availability.</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-walz-error rounded-xl px-5 py-4 mb-6">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Search failed</p>
              <p className="text-sm mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Results layout */}
        {(loading || (hasSearched && !error)) && (
          <div className="flex gap-6 items-start">

            {/* Desktop sidebar */}
            <aside className="hidden lg:block w-64 flex-shrink-0 bg-white rounded-2xl border border-walz-border p-5 sticky top-4">
              <h2 className="font-display font-bold text-walz-deep-navy mb-4">Filter results</h2>
              <FilterPanel filters={filters} setFilters={setFilters} priceMax={priceMax} />
            </aside>

            <div className="flex-1 min-w-0">

              {/* Sort + count bar */}
              {!loading && (
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                  <div>
                    <p className="font-bold text-walz-deep-navy text-lg">
                      {displayed.length} propert{displayed.length !== 1 ? 'ies' : 'y'} found
                    </p>
                    {meta.checkIn && (
                      <p className="text-xs text-walz-muted">
                        {fmtDate(meta.checkIn)} – {fmtDate(meta.checkOut)} · {meta.adults} guest{meta.adults !== 1 ? 's' : ''} · {meta.rooms} room{meta.rooms !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowFilters(true)}
                      className="lg:hidden flex items-center gap-1.5 text-sm border border-walz-border rounded-xl px-3 py-2 bg-white text-walz-deep-navy">
                      <SlidersHorizontal className="w-4 h-4 text-walz-gold" /> Filters
                      {activeFilterCount > 0 && (
                        <span className="bg-walz-gold text-walz-deep-navy text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>
                    <select value={sort} onChange={e => setSort(e.target.value as Sort)}
                      className="text-sm border border-walz-border rounded-xl px-3 py-2 bg-white text-walz-deep-navy focus:outline-none focus:ring-2 focus:ring-walz-gold">
                      <option value="price_asc">Price: Low → High</option>
                      <option value="price_desc">Price: High → Low</option>
                      <option value="rating_desc">Top rated first</option>
                      <option value="stars_desc">Stars: 5 → 1</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Skeletons */}
              {loading && <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}</div>}

              {/* Cards */}
              {!loading && displayed.length > 0 && (
                <div className="space-y-4">
                  {displayed.map(h => <HotelCard key={h.id} hotel={h} nights={nights} onBook={openDetail} />)}
                </div>
              )}

              {/* No match after filter */}
              {!loading && hasSearched && hotels.length > 0 && displayed.length === 0 && (
                <div className="bg-white rounded-2xl border border-walz-border text-center py-16">
                  <SlidersHorizontal className="w-10 h-10 text-walz-muted/30 mx-auto mb-3" />
                  <p className="font-bold text-walz-deep-navy">No properties match your filters</p>
                  <button onClick={() => setFilters({ stars: [], maxPrice: priceMax, freeCancel: false, mealPlans: [] })}
                    className="mt-3 text-sm text-walz-gold hover:underline">Clear all filters</button>
                </div>
              )}

              {/* No results from API */}
              {!loading && hasSearched && !error && hotels.length === 0 && (
                <div className="bg-white rounded-2xl border border-walz-border text-center py-16">
                  <span className="text-5xl block mb-4">🏨</span>
                  <p className="font-display font-bold text-walz-deep-navy text-xl mb-1">No hotels available</p>
                  <p className="text-sm text-walz-muted">Try different dates or a nearby destination.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile filter drawer */}
      {showFilters && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowFilters(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-luxury p-5 overflow-y-auto">
            <FilterPanel filters={filters} setFilters={setFilters} priceMax={priceMax} onClose={() => setShowFilters(false)} />
            <button onClick={() => setShowFilters(false)}
              className="mt-6 w-full bg-walz-gold text-walz-deep-navy font-bold py-3 rounded-xl">
              Show {displayed.length} propert{displayed.length !== 1 ? 'ies' : 'y'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function HotelsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-walz-off-white flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-walz-gold" /></div>}>
      <HotelsPageContent />
    </Suspense>
  )
}
