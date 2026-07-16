'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Star, MapPin, ChevronLeft, ChevronRight, Shield, Coffee,
  AlertCircle, SlidersHorizontal, X, Search, Loader2, Utensils,
  RefreshCw, CreditCard, Headphones,
} from 'lucide-react'
import { DatePickerField } from '@/components/ui/DatePicker'
import { cn, formatPrice } from '@/lib/utils'
import { format } from 'date-fns'
import type { HotelResult } from '@/types/booking'

export const dynamic = 'force-dynamic'

// ─── destination data ────────────────────────────────────────────────────────

const DESTINATIONS = [
  { code: 'LOS', city: 'Lagos',          country: 'Nigeria'     },
  { code: 'ABV', city: 'Abuja',          country: 'Nigeria'     },
  { code: 'PHC', city: 'Port Harcourt',  country: 'Nigeria'     },
  { code: 'ACC', city: 'Accra',          country: 'Ghana'       },
  { code: 'KMS', city: 'Kumasi',         country: 'Ghana'       },
  { code: 'NBO', city: 'Nairobi',        country: 'Kenya'       },
  { code: 'MBA', city: 'Mombasa',        country: 'Kenya'       },
  { code: 'DAR', city: 'Dar es Salaam',  country: 'Tanzania'    },
  { code: 'ZNZ', city: 'Zanzibar',       country: 'Tanzania'    },
  { code: 'ADD', city: 'Addis Ababa',    country: 'Ethiopia'    },
  { code: 'KGL', city: 'Kigali',         country: 'Rwanda'      },
  { code: 'JNB', city: 'Johannesburg',   country: 'South Africa'},
  { code: 'CPT', city: 'Cape Town',      country: 'South Africa'},
  { code: 'DKR', city: 'Dakar',          country: 'Senegal'     },
  { code: 'CMN', city: 'Casablanca',     country: 'Morocco'     },
  { code: 'CAI', city: 'Cairo',          country: 'Egypt'       },
  { code: 'LON', city: 'London',         country: 'UK'          },
  { code: 'MAN', city: 'Manchester',     country: 'UK'          },
  { code: 'BHX', city: 'Birmingham',     country: 'UK'          },
  { code: 'EDI', city: 'Edinburgh',      country: 'UK'          },
  { code: 'YTO', city: 'Toronto',        country: 'Canada'      },
  { code: 'YVR', city: 'Vancouver',      country: 'Canada'      },
  { code: 'YMQ', city: 'Montreal',       country: 'Canada'      },
  { code: 'DXB', city: 'Dubai',          country: 'UAE'         },
  { code: 'AUH', city: 'Abu Dhabi',      country: 'UAE'         },
  { code: 'DOH', city: 'Doha',           country: 'Qatar'       },
  { code: 'RUH', city: 'Riyadh',         country: 'Saudi Arabia'},
  { code: 'NYC', city: 'New York',       country: 'USA'         },
  { code: 'LAX', city: 'Los Angeles',    country: 'USA'         },
  { code: 'MIA', city: 'Miami',          country: 'USA'         },
  { code: 'LAS', city: 'Las Vegas',      country: 'USA'         },
  { code: 'PAR', city: 'Paris',          country: 'France'      },
  { code: 'AMS', city: 'Amsterdam',      country: 'Netherlands' },
  { code: 'BCN', city: 'Barcelona',      country: 'Spain'       },
  { code: 'ROM', city: 'Rome',           country: 'Italy'       },
  { code: 'IST', city: 'Istanbul',       country: 'Turkey'      },
  { code: 'ATH', city: 'Athens',         country: 'Greece'      },
  { code: 'LIS', city: 'Lisbon',         country: 'Portugal'    },
  { code: 'SIN', city: 'Singapore',      country: 'Singapore'   },
  { code: 'BKK', city: 'Bangkok',        country: 'Thailand'    },
  { code: 'KUL', city: 'Kuala Lumpur',   country: 'Malaysia'    },
  { code: 'NRT', city: 'Tokyo',          country: 'Japan'       },
  { code: 'SYD', city: 'Sydney',         country: 'Australia'   },
  { code: 'MLE', city: 'Maldives',       country: 'Maldives'    },
  { code: 'BOM', city: 'Mumbai',         country: 'India'       },
  { code: 'CUN', city: 'Cancun',         country: 'Mexico'      },
  { code: 'GIG', city: 'Rio de Janeiro', country: 'Brazil'      },
]

interface FeaturedDest {
  city: string; country: string; fromPrice: string; tag: string; imageUrl: string | null
}

const FALLBACK_FEATURED: FeaturedDest[] = [
  { city: 'Dubai',    country: 'UAE',     fromPrice: '£89/night',  tag: 'MOST BOOKED', imageUrl: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600&q=80' },
  { city: 'London',   country: 'UK',      fromPrice: '£120/night', tag: 'HOT DEAL',    imageUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&q=80' },
  { city: 'Maldives', country: 'Maldives',fromPrice: '£250/night', tag: 'LUXURY',      imageUrl: 'https://images.unsplash.com/photo-1544550285-f813152fb2fd?w=600&q=80' },
  { city: 'Toronto',  country: 'Canada',  fromPrice: '£95/night',  tag: 'POPULAR',     imageUrl: 'https://images.unsplash.com/photo-1517090504586-fde19ea6066f?w=600&q=80' },
  { city: 'New York', country: 'USA',     fromPrice: '£180/night', tag: 'POPULAR',     imageUrl: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=600&q=80' },
  { city: 'Lagos',    country: 'Nigeria', fromPrice: '£65/night',  tag: 'BEST VALUE',  imageUrl: 'https://images.unsplash.com/photo-1555990793-da11153b2473?w=600&q=80' },
]

// ─── helpers ────────────────────────────────────────────────────────────────

function ratingLabel(r: number) {
  if (r >= 9) return 'Exceptional'
  if (r >= 8) return 'Superb'
  if (r >= 7) return 'Very Good'
  if (r >= 6) return 'Good'
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
  if (p.includes('all inclusive'))                   return 'All Inclusive'
  if (p.includes('full board'))                      return 'Full Board'
  if (p.includes('half board'))                      return 'Half Board'
  if (p.includes('breakfast') || p.includes('bb'))   return 'Breakfast included'
  return plan
}
function mealIcon(plan?: string) {
  if (!plan) return null
  const p = plan.toLowerCase()
  if (p.includes('breakfast') || p.includes('bb'))  return <Coffee className="w-3 h-3" />
  if (p.includes('board')     || p.includes('all')) return <Utensils className="w-3 h-3" />
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
      <img key={src} src={src} alt={name}
        onError={() => setOk(false)} onLoad={() => setOk(true)}
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
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
        <div className="flex items-center gap-1.5 text-xs text-walz-muted">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-walz-gold" />
          <span className="truncate">{[hotel.address.lines[0], hotel.address.city, hotel.address.country].filter(Boolean).join(', ')}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {hotel.roomType && (
            <span className="text-[11px] text-walz-deep-navy bg-walz-off-white border border-walz-border px-2.5 py-0.5 rounded-full">{hotel.roomType}</span>
          )}
          <span className="text-[11px] text-walz-deep-navy bg-walz-off-white border border-walz-border px-2.5 py-0.5 rounded-full flex items-center gap-1">
            {mealIcon(hotel.mealPlan)}{mealLabel(hotel.mealPlan)}
          </span>
        </div>
        {hotel.isRefundable
          ? <div className="flex items-center gap-1 text-[11px] text-walz-success font-semibold"><Shield className="w-3 h-3" /> {hotel.cancellationPolicy ?? 'Free cancellation'}</div>
          : <div className="text-[11px] text-walz-muted">Non-refundable</div>}
        <div className="flex items-end justify-between mt-auto pt-3 border-t border-walz-border">
          <div>
            <p className="text-[10px] text-walz-muted uppercase tracking-wider">{nights} night{nights !== 1 ? 's' : ''}</p>
            <p className="text-2xl font-extrabold text-walz-deep-navy leading-none">
              {formatPrice(hotel.pricePerNight.amount, hotel.pricePerNight.currency)}
              <span className="text-xs font-normal text-walz-muted ml-1">/night</span>
            </p>
            <p className="text-xs text-walz-muted">{formatPrice(hotel.totalPrice.amount, hotel.totalPrice.currency)} total</p>
          </div>
          <button onClick={() => onBook(hotel)}
            className="bg-walz-gold hover:bg-walz-gold-light text-walz-deep-navy font-bold text-sm px-6 py-2.5 rounded-xl transition-colors shadow-sm">
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
      <div className="mb-5">
        <p className="text-[11px] font-semibold text-walz-muted uppercase tracking-widest mb-2.5">Max Price / Night</p>
        <input type="range" min={0} max={priceMax} step={10} value={filters.maxPrice}
          onChange={e => setFilters(f => ({ ...f, maxPrice: +e.target.value }))}
          className="w-full accent-walz-gold" />
        <div className="flex justify-between text-xs text-walz-muted mt-1">
          <span>£0</span>
          <span className="font-bold text-walz-gold">£{filters.maxPrice}</span>
          <span>£{priceMax}</span>
        </div>
      </div>
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
  const router       = useRouter()

  // ── Featured destinations (DB-driven, falls back to hardcoded) ────────────
  const [featuredDests, setFeaturedDests] = useState<FeaturedDest[]>([])
  useEffect(() => {
    fetch('/api/public/hotel-destinations')
      .then(r => r.json())
      .then((d: { destinations?: FeaturedDest[] }) => {
        if (d.destinations && d.destinations.length > 0) setFeaturedDests(d.destinations)
      })
      .catch(() => { /* silently fall back to FALLBACK_FEATURED */ })
  }, [])

  // ── Search form state ──────────────────────────────────────────────────────
  const [destInput,    setDestInput]    = useState('')
  const [destSugs,     setDestSugs]     = useState<typeof DESTINATIONS>([])
  const [showDestDrop, setShowDestDrop] = useState(false)
  const [resolvedCode, setResolvedCode] = useState('')
  const [checkIn,      setCheckIn]      = useState<Date | undefined>()
  const [checkOut,     setCheckOut]     = useState<Date | undefined>()
  const [guests,       setGuests]       = useState(2)
  const [rooms,        setRooms]        = useState(1)
  const [formError,    setFormError]    = useState<string | null>(null)

  // ── Results state ──────────────────────────────────────────────────────────
  const [hotels,      setHotels]      = useState<HotelResult[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [sort,        setSort]        = useState<Sort>('price_asc')
  const [showFilters, setShowFilters] = useState(false)
  const [meta,        setMeta]        = useState({ checkIn: '', checkOut: '', adults: 2, rooms: 1, children: 0, childAges: [] as number[] })

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
    if (filters.stars.length)       list = list.filter(h => filters.stars.includes(h.stars))
    if (filters.freeCancel)          list = list.filter(h => h.isRefundable)
    if (filters.maxPrice < priceMax) list = list.filter(h => h.pricePerNight.amount <= filters.maxPrice)
    if (filters.mealPlans.length)   list = list.filter(h => filters.mealPlans.includes(mealLabel(h.mealPlan)))
    switch (sort) {
      case 'price_asc':   list.sort((a, b) => a.pricePerNight.amount - b.pricePerNight.amount); break
      case 'price_desc':  list.sort((a, b) => b.pricePerNight.amount - a.pricePerNight.amount); break
      case 'rating_desc': list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)); break
      case 'stars_desc':  list.sort((a, b) => b.stars - a.stars); break
    }
    return list
  }, [hotels, filters, sort, priceMax])

  // ── URL param auto-search on mount ─────────────────────────────────────────
  useEffect(() => {
    const dest = searchParams.get('destination')
    const cin  = searchParams.get('checkIn')
    const cout = searchParams.get('checkOut')
    if (dest && cin && cout) {
      const adl = parseInt(searchParams.get('adults')   ?? '2', 10)
      const rms = parseInt(searchParams.get('rooms')    ?? '1', 10)
      const chl = parseInt(searchParams.get('children') ?? '0', 10)
      const info = DESTINATIONS.find(d => d.code === dest)
      setDestInput(info?.city ?? dest)
      setResolvedCode(dest)
      setCheckIn(new Date(cin  + 'T00:00:00'))
      setCheckOut(new Date(cout + 'T00:00:00'))
      setGuests(adl)
      setRooms(rms)
      setMeta({ checkIn: cin, checkOut: cout, adults: adl, rooms: rms, children: chl, childAges: [] })
      doSearch({ destination: dest, checkIn: cin, checkOut: cout, rooms: rms, adults: adl, children: chl })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Search functions ───────────────────────────────────────────────────────
  async function doSearch(params: { destination: string; checkIn: string; checkOut: string; rooms: number; adults: number; children: number }) {
    setLoading(true); setError(null); setHasSearched(true)
    try {
      const res = await fetch('/api/search/hotels', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...params, maxResults: 50 }),
      })
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Search failed') }
      const data: HotelResult[] = await res.json() as HotelResult[]
      setHotels(data)
      setFilters(f => ({ ...f, stars: [], freeCancel: false, mealPlans: [] }))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  function handleDestInput(val: string) {
    setDestInput(val)
    setResolvedCode('')
    if (val.length >= 1) {
      const q = val.toLowerCase()
      setDestSugs(DESTINATIONS.filter(d =>
        d.city.toLowerCase().includes(q) ||
        d.country.toLowerCase().includes(q) ||
        d.code.toLowerCase().startsWith(q)
      ).slice(0, 8))
      setShowDestDrop(true)
    } else {
      setDestSugs([])
      setShowDestDrop(false)
    }
  }

  function selectDest(d: typeof DESTINATIONS[0]) {
    setDestInput(d.city)
    setResolvedCode(d.code)
    setShowDestDrop(false)
    setDestSugs([])
  }

  async function handleSearch() {
    setFormError(null)
    if (!destInput.trim()) { setFormError('Please enter a destination'); return }
    let code = resolvedCode
    if (!code) {
      const match = DESTINATIONS.find(d => d.city.toLowerCase() === destInput.toLowerCase())
      if (match) { code = match.code; setResolvedCode(match.code) }
      else { setFormError('Please select a destination from the list'); return }
    }
    if (!checkIn)  { setFormError('Please select a check-in date');  return }
    if (!checkOut) { setFormError('Please select a check-out date'); return }
    const cin  = format(checkIn,  'yyyy-MM-dd')
    const cout = format(checkOut, 'yyyy-MM-dd')
    setMeta({ checkIn: cin, checkOut: cout, adults: guests, rooms, children: 0, childAges: [] })
    await doSearch({ destination: code, checkIn: cin, checkOut: cout, rooms, adults: guests, children: 0 })
    setTimeout(() => document.getElementById('hotel-results')?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  function handleFeaturedClick(code: string, city: string) {
    setDestInput(city)
    setResolvedCode(code)
    document.getElementById('hotel-search')?.scrollIntoView({ behavior: 'smooth' })
  }

  function openDetail(hotel: HotelResult) {
    try { sessionStorage.setItem('walz_hotel_booking', JSON.stringify({ hotel, meta })) } catch { /* storage unavailable */ }
    router.push('/hotels/book')
  }

  const fmtDate          = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
  const activeFilterCount = filters.stars.length + (filters.freeCancel ? 1 : 0) + filters.mealPlans.length

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#060f1e]">

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1 — HERO + SEARCH FORM
      ═══════════════════════════════════════════════════════════════════════ */}
      <section id="hotel-search" className="relative overflow-hidden flex flex-col">
        {/* Background image */}
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1920&q=80"
            alt="Luxury hotel pool and accommodation"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0B1F3A]/75 via-[#0B1F3A]/65 to-[#060f1e]" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-4 pt-28 md:pt-36 pb-16">

          {/* Brand pill */}
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" />
            <span className="text-white/60 text-[11px] font-medium tracking-[0.18em] uppercase">
              Hilton · Marriott · Hyatt · IHG
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] mb-4">
            <span className="block text-white">Every Hotel.</span>
            <span className="block text-[#C9A84C]">Every City.</span>
            <span className="block text-white/50">Every Budget.</span>
          </h1>

          <p className="text-white/50 text-sm md:text-base mb-10 max-w-sm">
            500,000+ hotels worldwide. Best rate guarantee. Free cancellation.
          </p>

          {/* ── Search card ─────────────────────────────────────────────────── */}
          <div className="w-full max-w-2xl bg-[#0d1e35] rounded-2xl border border-white/10 shadow-2xl p-5 text-left">

            {/* Destination */}
            <div className="relative mb-3">
              <p className="text-white/40 text-xs uppercase tracking-wider font-medium mb-1.5">Destination</p>
              <input
                value={destInput}
                onChange={e => handleDestInput(e.target.value)}
                onFocus={() => destInput.length > 0 && setShowDestDrop(true)}
                placeholder="City, hotel or destination"
                className="w-full bg-white/5 rounded-xl px-4 py-3.5 text-white text-sm placeholder-white/25 border border-white/[0.08] focus:border-amber-500/40 focus:outline-none transition-colors"
              />
              {showDestDrop && destSugs.length > 0 && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowDestDrop(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#112240] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden max-h-56 overflow-y-auto">
                    {destSugs.map(d => (
                      <button key={d.code} type="button" onClick={() => selectDest(d)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left">
                        <span className="text-lg">🏨</span>
                        <div>
                          <div className="text-white text-sm font-medium">{d.city}</div>
                          <div className="text-white/40 text-xs">{d.country}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wider font-medium mb-1.5">Check-in</p>
                <DatePickerField label="" value={checkIn} onChange={setCheckIn} minDate={new Date()} placeholder="Select date" />
              </div>
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wider font-medium mb-1.5">Check-out</p>
                <DatePickerField label="" value={checkOut} onChange={setCheckOut} minDate={checkIn ?? new Date()} placeholder="Select date" />
              </div>
            </div>

            {/* Guests + Rooms */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wider font-medium mb-1.5">Guests</p>
                <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/[0.08]">
                  <span className="text-white text-sm">{guests} Adult{guests > 1 ? 's' : ''}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setGuests(g => Math.max(1, g - 1))}
                      className="w-11 h-11 rounded-lg bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all text-base leading-none select-none">
                      −
                    </button>
                    <button type="button" onClick={() => setGuests(g => Math.min(10, g + 1))}
                      className="w-11 h-11 rounded-lg bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all text-base leading-none select-none">
                      +
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wider font-medium mb-1.5">Rooms</p>
                <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/[0.08]">
                  <span className="text-white text-sm">{rooms} Room{rooms > 1 ? 's' : ''}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setRooms(r => Math.max(1, r - 1))}
                      className="w-11 h-11 rounded-lg bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all text-base leading-none select-none">
                      −
                    </button>
                    <button type="button" onClick={() => setRooms(r => Math.min(10, r + 1))}
                      className="w-11 h-11 rounded-lg bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all text-base leading-none select-none">
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Form error */}
            {formError && <p className="text-red-400 text-xs mb-3">{formError}</p>}

            {/* Search button */}
            <button onClick={handleSearch} disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold text-sm rounded-xl py-4 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mb-4">
              {loading
                ? <><Loader2 size={16} className="animate-spin" />Searching...</>
                : <><Search size={16} strokeWidth={2} />Search Hotels</>}
            </button>

            {/* Trust badges */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { icon: Shield,     text: 'Best Rate Guarantee' },
                { icon: RefreshCw,  text: 'Free Cancellation'   },
                { icon: CreditCard, text: 'Secure Payment'      },
                { icon: Headphones, text: '24/7 Support'        },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5 border border-white/[0.08]">
                  <Icon size={14} className="text-amber-400 flex-shrink-0" strokeWidth={1.5} />
                  <span className="text-white/60 text-xs">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTIONS 3–5 — Landing content (hidden once user searches)
      ═══════════════════════════════════════════════════════════════════════ */}
      {!hasSearched && !loading && (
        <>
          {/* Popular Destinations */}
          <section className="py-16 px-4 max-w-6xl mx-auto">
            <div className="mb-8">
              <p className="text-[#C9A84C] text-xs uppercase tracking-widest font-medium mb-2">TOP DESTINATIONS</p>
              <h2 className="text-white text-3xl font-bold">Where to next?</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {(featuredDests.length > 0 ? featuredDests : FALLBACK_FEATURED).map(dest => {
                const code = DESTINATIONS.find(d => d.city.toLowerCase() === dest.city.toLowerCase())?.code ?? ''
                return (
                  <button key={dest.city} onClick={() => handleFeaturedClick(code, dest.city)}
                    className="relative rounded-2xl overflow-hidden aspect-square group cursor-pointer text-left">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#112240] to-[#0a1628]" />
                    {dest.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={dest.imageUrl} alt={dest.city}
                        className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-75 group-hover:scale-105 transition-all duration-500" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute top-3 left-3 bg-amber-500 text-black text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full">
                      {dest.tag}
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <p className="text-white font-bold text-lg leading-tight">{dest.city}</p>
                      <p className="text-white/60 text-xs">{dest.country}</p>
                      <p className="text-amber-400 text-xs font-medium mt-1">From {dest.fromPrice}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Why Walz Hotels */}
          <section className="py-16 bg-[#060f1e]">
            <div className="max-w-6xl mx-auto px-4">
              <div className="text-center mb-12">
                <p className="text-[#C9A84C] text-xs uppercase tracking-widest mb-2">WHY WALZ HOTELS</p>
                <h2 className="text-white text-3xl font-bold">Book smarter</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { icon: '🏨', title: 'Global Inventory',    desc: '500,000+ hotels in 190+ countries via Hotelbeds' },
                  { icon: '💰', title: 'Best Rate Guarantee', desc: 'Find it cheaper elsewhere? We match it' },
                  { icon: '✈️', title: 'Visa + Hotel Bundle', desc: 'Book your hotel and visa together — one team, zero stress' },
                  { icon: '🔄', title: 'Free Cancellation',   desc: 'Most hotels offer free cancellation up to 24 hours' },
                  { icon: '⭐', title: 'Jade Miles Rewards',  desc: 'Earn 10 Jade Miles for every £1 spent on hotels' },
                  { icon: '💬', title: 'Expert Support',      desc: 'Named travel expert assigned to every booking' },
                ].map(f => (
                  <div key={f.title} className="bg-[#0d1e35] rounded-2xl p-5 border border-white/5">
                    <span className="text-2xl block mb-3">{f.icon}</span>
                    <h3 className="text-white font-semibold text-sm mb-1.5">{f.title}</h3>
                    <p className="text-white/40 text-xs leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Jade Miles */}
          <section className="py-16 px-4 max-w-2xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center justify-center">
                <Star size={14} className="text-[#0B1F3A]" fill="#0B1F3A" />
              </div>
              <div className="text-left">
                <p className="text-amber-400 text-xs font-semibold">Jade Miles</p>
                <p className="text-white/30 text-xs">LOYALTY PROGRAMME</p>
              </div>
            </div>
            <h2 className="text-white text-2xl font-bold mb-2">
              Every stay<br />
              <span className="text-amber-400">earns rewards</span>
            </h2>
            <p className="text-white/50 text-sm leading-relaxed">
              Earn 10 Jade Miles for every £1 spent on hotels. Redeem for flights, visa services and more.
            </p>
          </section>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          RESULTS SECTION
      ═══════════════════════════════════════════════════════════════════════ */}
      {(loading || hasSearched) && (
        <div id="hotel-results" className="bg-walz-off-white min-h-[60vh]">
          <div className="container-walz py-8">

            {/* Error */}
            {!loading && error && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 mb-6">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Search failed</p>
                  <p className="text-sm mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {(loading || (hasSearched && !error)) && (
              <div className="flex gap-6 items-start">

                {/* Desktop filter sidebar */}
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
                  {loading && (
                    <div className="space-y-4">
                      {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
                    </div>
                  )}

                  {/* Hotel cards */}
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
        </div>
      )}

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
    <Suspense fallback={
      <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    }>
      <HotelsPageContent />
    </Suspense>
  )
}
