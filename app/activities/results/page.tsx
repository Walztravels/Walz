'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  Search, MapPin, ArrowLeft, Loader2, Calendar, Users,
  SlidersHorizontal, Star, Clock, ShoppingCart,
} from 'lucide-react'
import { STATIC_ACTIVITIES } from '@/lib/activities-data'
import { useCart } from '@/lib/context/CartContext'
import '@/lib/useJadeChat'

const CATEGORY_FILTERS = [
  { id: '',          label: '✨ All' },
  { id: 'adventure', label: '🧗 Adventure' },
  { id: 'beach',     label: '🏊 Beach' },
  { id: 'culture',   label: '🏛️ Culture' },
  { id: 'wildlife',  label: '🦁 Wildlife' },
  { id: 'food',      label: '🍽️ Food' },
  { id: 'air',       label: '🚁 Air' },
]

const SORT_OPTIONS = [
  { value: 'default',    label: 'Recommended' },
  { value: 'price_asc',  label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'rating',     label: 'Top Rated' },
]

const SYM: Record<string, string> = { GBP:'£', USD:'$', EUR:'€', CAD:'CA$', NGN:'₦', GHS:'₵', AED:'AED ' }

interface Activity {
  id?: string; slug: string; title: string; shortDesc?: string; description: string
  image: string; price: number; currency: string; duration: string
  location: string; category: string; badge?: string | null
  freeCancel?: boolean; rating?: number
}

function parseDuration(dur: string): number {
  if (!dur) return 9999
  const d = dur.match(/(\d+)\s*day/)
  const h = dur.match(/(\d+)\s*h/)
  const m = dur.match(/(\d+)\s*m/)
  if (d) return parseInt(d[1]) * 1440
  if (h) return parseInt(h[1]) * 60
  if (m) return parseInt(m[1])
  const n = dur.match(/\d+/)
  return n ? parseInt(n[0]) : 9999
}

function ActivityCard({ act, fromDate, adults }: { act: Activity; fromDate: string; adults: string }) {
  const { addItem } = useCart()
  const router = useRouter()
  const [added, setAdded] = useState(false)
  const sym = SYM[act.currency] ?? act.currency

  function handleAddToCart(e: React.MouseEvent) {
    e.stopPropagation()
    addItem({
      id:       act.id ?? act.slug,
      type:     'activity',
      title:    act.title,
      price:    act.price > 0 ? act.price : 50,
      currency: act.currency ?? 'USD',
      quantity: 1,
      meta: {
        location: act.location,
        duration: act.duration ?? '',
        date:     fromDate,
        adults,
      },
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  function handleViewDetails(e: React.MouseEvent) {
    e.stopPropagation()
    router.push(`/activities/${act.slug}`)
  }

  return (
    <div
      onClick={() => router.push(`/activities/${act.slug}`)}
      className="group cursor-pointer bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col"
    >
      {/* Image */}
      <div className="relative h-48 overflow-hidden flex-shrink-0">
        {act.image ? (
          <Image src={act.image} alt={act.title} fill
            className="object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
            <MapPin className="w-8 h-8 text-gray-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

        {/* Top-left: category + freeCancel badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
          {act.category && (
            <span className="bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize">
              {act.category.replace(/_/g, ' ')}
            </span>
          )}
          {act.freeCancel && (
            <span className="bg-green-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
              Free cancel
            </span>
          )}
        </div>

        {/* Top-right: price badge — only shown when a real price exists */}
        {act.price > 0 && (
          <div className="absolute top-2.5 right-2.5">
            <span className="bg-[#C9A84C] text-[#0B1F3A] text-xs font-bold px-2.5 py-1 rounded-full">
              {sym}{Number(act.price).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-2.5 flex-1">
        <h3 className="text-[#0B1F3A] font-bold text-sm leading-snug line-clamp-2 group-hover:text-[#C9A84C] transition-colors">
          {act.title}
        </h3>

        <div className="flex items-center gap-3 text-gray-400 text-xs">
          {act.duration && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />{act.duration}
            </span>
          )}
          <span className="flex items-center gap-1 min-w-0">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{act.location}</span>
          </span>
        </div>

        {act.rating && act.rating > 0 ? (
          <div className="flex items-center gap-0.5">
            {[1,2,3,4,5].map(i => (
              <Star key={i} className={`w-3 h-3 ${
                i <= Math.round(act.rating!)
                  ? 'fill-[#C9A84C] text-[#C9A84C]'
                  : 'fill-gray-200 text-gray-200'
              }`} />
            ))}
            <span className="text-gray-400 text-[10px] ml-1">{act.rating.toFixed(1)}</span>
          </div>
        ) : null}

        {/* CTAs */}
        <div className="mt-auto pt-1 flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={handleViewDetails}
              className="flex-1 bg-[#0B1F3A] text-white text-xs font-bold py-2.5 rounded-xl hover:bg-[#162d52] transition-colors"
            >
              View Details
            </button>
            <button
              onClick={handleAddToCart}
              className={`flex-1 flex items-center justify-center gap-1 text-xs font-bold py-2.5 rounded-xl transition-colors ${
                added
                  ? 'bg-green-500 text-white'
                  : 'bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#b8973f]'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              {added ? 'Added!' : 'Add to Cart'}
            </button>
          </div>
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-[10px] text-gray-400 hover:text-[#C9A84C] transition-colors text-center"
          >
            Ask Jade on WhatsApp →
          </a>
        </div>
      </div>
    </div>
  )
}

function ResultsContent() {
  const searchParams  = useSearchParams()
  const router        = useRouter()

  const initDest     = searchParams.get('destination') ?? ''
  const initCategory = searchParams.get('category') ?? ''
  const initFrom     = searchParams.get('from') ?? ''
  const initTo       = searchParams.get('to') ?? ''
  const initAdults   = searchParams.get('adults') ?? '2'

  const [destination,    setDestination]    = useState(initDest)
  const [fromDate,       setFromDate]       = useState(initFrom)
  const [toDate,         setToDate]         = useState(initTo)
  const [adults,         setAdults]         = useState(initAdults)
  const [results,        setResults]        = useState<Activity[]>([])
  const [loading,        setLoading]        = useState(true)
  const [showFilters,    setShowFilters]    = useState(false)

  // Client-side filter/sort state — initialize category from URL param
  const [activeCategory, setActiveCategory] = useState(initCategory)
  const [sortBy,         setSortBy]         = useState('default')
  const [freeCancelOnly, setFreeCancelOnly] = useState(false)

  async function search(dest: string, from = initFrom, to = initTo) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dest) params.set('destination', dest)
      if (from) params.set('from', from)
      if (to)   params.set('to', to)
      const res  = await fetch(`/api/activities?${params}`)
      const data = await res.json()

      if (Array.isArray(data.activities) && data.activities.length > 0) {
        setResults(data.activities)
      } else {
        let filtered = STATIC_ACTIVITIES
        if (dest) filtered = filtered.filter(a =>
          a.location.toLowerCase().includes(dest.toLowerCase()) ||
          a.title.toLowerCase().includes(dest.toLowerCase()) ||
          a.description.toLowerCase().includes(dest.toLowerCase())
        )
        setResults(filtered)
      }
    } catch {
      setResults(STATIC_ACTIVITIES)
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { search(initDest) }, [])

  // Client-side filter + sort
  const filteredResults = useMemo(() => {
    let list = [...results]
    if (activeCategory) list = list.filter(a => a.category === activeCategory)
    if (freeCancelOnly) list = list.filter(a => a.freeCancel)
    switch (sortBy) {
      case 'price_asc':  list.sort((a, b) => a.price - b.price);                  break
      case 'price_desc': list.sort((a, b) => b.price - a.price);                  break
      case 'rating':     list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)); break
      case 'duration':   list.sort((a, b) => parseDuration(a.duration) - parseDuration(b.duration)); break
    }
    return list
  }, [results, activeCategory, freeCancelOnly, sortBy])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams({ destination, from: fromDate, to: toDate, adults })
    router.push(`/activities/results?${params}`)
    search(destination, fromDate, toDate)
  }

  return (
    <div className="min-h-screen bg-[#0B1F3A]">

      {/* Sticky search header */}
      <div className="bg-[#0B1F3A]/95 border-b border-white/10 sticky top-0 z-30 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/activities" className="text-white/50 hover:text-white transition-colors flex-shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h2 className="text-white font-bold text-lg flex-1 truncate">
              {initDest ? `Experiences in ${initDest}` : 'All Experiences'}
            </h2>
            <button onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-[#C9A84C] text-sm font-semibold lg:hidden">
              <SlidersHorizontal className="w-4 h-4" />
              Search
            </button>
          </div>

          <form onSubmit={handleSearch} className={`${showFilters ? 'block' : 'hidden lg:block'}`}>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C9A84C]" />
                <input value={destination} onChange={e => setDestination(e.target.value)}
                  placeholder="Destination…"
                  className="w-full bg-white/10 border border-white/20 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#C9A84C]" />
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C9A84C]" />
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="bg-white/10 border border-white/20 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#C9A84C] [color-scheme:dark]" />
              </div>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C9A84C]" />
                <select value={adults} onChange={e => setAdults(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#C9A84C] [color-scheme:dark]">
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <option key={n} value={n} className="bg-[#0B1F3A]">{n} adult{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
              <button type="submit"
                className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-white transition-colors flex-shrink-0">
                <Search className="w-4 h-4" /> Search
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Destination context banner */}
      {initDest && (
        <div className="bg-[#0B1F3A] border-b border-white/10 px-4 py-6">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-white font-bold text-2xl md:text-3xl mb-1">
              Things to do in {initDest}
            </h1>
            {!loading && (
              <p className="text-white/40 text-sm">
                {filteredResults.length} experience{filteredResults.length !== 1 ? 's' : ''} available
              </p>
            )}
          </div>
        </div>
      )}

      {/* Filter + sort bar */}
      {!loading && results.length > 0 && (
        <div className="border-b border-white/10 bg-[#0B1F3A]/90 sticky top-[72px] z-20 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
            {/* Scrollable category pills */}
            <div
              className="flex gap-2 overflow-x-auto flex-1 pb-0.5"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {CATEGORY_FILTERS.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    activeCategory === cat.id
                      ? 'bg-[#C9A84C] text-[#0B1F3A]'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Free cancel toggle */}
            <label className="flex items-center gap-2 flex-shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={freeCancelOnly}
                onChange={e => setFreeCancelOnly(e.target.checked)}
                className="w-4 h-4 accent-[#C9A84C]"
              />
              <span className="text-white/60 text-xs whitespace-nowrap hidden sm:inline">Free cancel</span>
            </label>

            {/* Sort select */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#C9A84C] [color-scheme:dark] flex-shrink-0"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-[#0B1F3A]">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">🔍</p>
            <p className="text-white font-bold text-xl mb-2">No experiences found</p>
            <p className="text-white/40 text-sm mb-6">
              {destination ? `Nothing matched "${destination}" yet.` : 'Try a different search or remove filters.'}
            </p>
            <button
              onClick={() => { setActiveCategory(''); setFreeCancelOnly(false) }}
              className="inline-flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-6 py-3 rounded-full text-sm mr-3"
            >
              Clear filters
            </button>
            <Link href="/activities"
              className="inline-flex items-center gap-2 border border-white/20 text-white/60 font-semibold px-6 py-3 rounded-full text-sm">
              Browse all
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredResults.map(act => (
              <ActivityCard
                key={act.slug}
                act={act}
                fromDate={initFrom}
                adults={initAdults}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ActivitiesResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    }>
      <ResultsContent />
    </Suspense>
  )
}
