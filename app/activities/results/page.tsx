'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Search, MapPin, ArrowLeft, Loader2, Calendar, Users, SlidersHorizontal, MessageCircle, Star, Clock, CreditCard } from 'lucide-react'
import { STATIC_ACTIVITIES } from '@/lib/activities-data'
import '@/lib/useJadeChat'

const CATEGORIES = [
  { id: 'beach',     label: 'Beach & Water' },
  { id: 'culture',   label: 'Culture & History' },
  { id: 'wildlife',  label: 'Wildlife & Safari' },
  { id: 'adventure', label: 'Adventure & Sports' },
  { id: 'food',      label: 'Food & Drink' },
  { id: 'air',       label: 'Helicopter & Air' },
]

const SYM: Record<string, string> = { GBP:'£', USD:'$', EUR:'€', CAD:'CA$', NGN:'₦', GHS:'₵', AED:'AED ' }

interface Activity {
  id?: string; slug: string; title: string; shortDesc?: string; description: string
  image: string; price: number; currency: string; duration: string
  location: string; category: string; badge?: string | null
}

function ResultsContent() {
  const searchParams  = useSearchParams()
  const router        = useRouter()

  const initDest     = searchParams.get('destination') ?? ''
  const initCategory = searchParams.get('category') ?? ''
  const initFrom     = searchParams.get('from') ?? ''
  const initTo       = searchParams.get('to') ?? ''
  const initAdults   = searchParams.get('adults') ?? '2'

  const [destination, setDestination] = useState(initDest)
  const [category,    setCategory]    = useState(initCategory)
  const [fromDate,    setFromDate]    = useState(initFrom)
  const [toDate,      setToDate]      = useState(initTo)
  const [adults,      setAdults]      = useState(initAdults)
  const [results,     setResults]     = useState<Activity[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  async function search(dest: string, cat: string) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dest) params.set('destination', dest)
      if (cat)  params.set('category', cat)
      const res  = await fetch(`/api/activities?${params}`)
      const data = await res.json()

      if (Array.isArray(data.activities) && data.activities.length > 0) {
        setResults(data.activities)
      } else {
        // Fall back to static data filtered locally
        let filtered = STATIC_ACTIVITIES
        if (dest) filtered = filtered.filter(a =>
          a.location.toLowerCase().includes(dest.toLowerCase()) ||
          a.title.toLowerCase().includes(dest.toLowerCase()) ||
          a.description.toLowerCase().includes(dest.toLowerCase())
        )
        if (cat) filtered = filtered.filter(a =>
          a.category.toLowerCase().includes(cat.toLowerCase())
        )
        setResults(filtered)
      }
    } catch {
      setResults(STATIC_ACTIVITIES)
    }
    setLoading(false)
  }

  useEffect(() => { search(initDest, initCategory) }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams({ destination, from: fromDate, to: toDate, adults })
    if (category) params.set('category', category)
    router.push(`/activities/results?${params}`)
    search(destination, category)
  }

  return (
    <div className="min-h-screen bg-[#0B1F3A]">

      {/* Header */}
      <div className="bg-[#0B1F3A]/95 border-b border-white/10 sticky top-0 z-30 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/activities" className="text-white/50 hover:text-white transition-colors flex-shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-white font-bold text-lg flex-1 truncate">
              {initDest ? `Experiences in ${initDest}` : 'All Experiences'}
            </h1>
            <button onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-[#C9A84C] text-sm font-semibold">
              <SlidersHorizontal className="w-4 h-4" />
              Filters
            </button>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSearch} className={`${showFilters ? 'block' : 'hidden sm:block'}`}>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C9A84C]" />
                <input value={destination} onChange={e => setDestination(e.target.value)}
                  placeholder="Destination…"
                  className="w-full bg-white/10 border border-white/20 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#C9A84C]" />
              </div>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#C9A84C] [color-scheme:dark]">
                <option value="" className="bg-[#0B1F3A]">All categories</option>
                {CATEGORIES.map(c => <option key={c.id} value={c.id} className="bg-[#0B1F3A]">{c.label}</option>)}
              </select>
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

      {/* Results */}
      <div className="max-w-6xl mx-auto px-4 py-8">

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">🔍</p>
            <p className="text-white font-bold text-xl mb-2">No experiences found</p>
            <p className="text-white/40 text-sm mb-6">
              {destination ? `Nothing matched "${destination}" yet.` : 'Try a different search.'}
            </p>
            <Link href="/activities"
              className="inline-flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-6 py-3 rounded-full text-sm">
              Browse all experiences
            </Link>
          </div>
        ) : (
          <>
            <p className="text-white/40 text-sm mb-6">
              {results.length} experience{results.length !== 1 ? 's' : ''}
              {initDest ? ` near "${initDest}"` : ''}
              {category ? ` · ${CATEGORIES.find(c => c.id === category)?.label}` : ''}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {results.map(act => {
                const isHotelbeds = act.slug?.startsWith('hb-')
                const priceLabel  = act.price > 0
                  ? `From ${SYM[act.currency] ?? act.currency}${Number(act.price).toLocaleString()}`
                  : 'Get Quote'

                function openJade() {
                  if (typeof window !== 'undefined' && window.$chatwoot) {
                    window.$chatwoot.setCustomAttributes({
                      source:       'activity_search',
                      activity:     act.title,
                      price:        `${act.currency} ${act.price}`,
                      location:     act.location,
                      enquiry_type: 'activity_booking',
                    })
                    window.$chatwoot.toggle('open')
                  }
                }

                async function handleStripe(e: React.MouseEvent) {
                  e.preventDefault()
                  try {
                    const res = await fetch('/api/stripe/activity-checkout', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        activitySlug:  act.slug,
                        activityTitle: act.title,
                        price:         act.price,
                        currency:      act.currency?.toLowerCase() || 'gbp',
                        quantity:      1,
                      }),
                    })
                    const data = await res.json()
                    if (data.url) window.location.href = data.url
                  } catch { /* ignore */ }
                }

                const cardContent = (
                  <>
                    {/* Image */}
                    <div className="relative h-44 overflow-hidden">
                      {act.image ? (
                        <Image src={act.image} alt={act.title} fill
                          className="object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full bg-white/5 flex items-center justify-center">
                          <MapPin className="w-8 h-8 text-white/10" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                      {/* Category badge */}
                      {act.category && (
                        <div className="absolute top-2.5 left-2.5">
                          <span className="bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize">
                            {act.category}
                          </span>
                        </div>
                      )}

                      {/* Live / badge tag */}
                      {(act.badge || isHotelbeds) && (
                        <div className="absolute top-2.5 right-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            act.badge
                              ? 'bg-[#C9A84C] text-[#0B1F3A] uppercase tracking-wider'
                              : 'bg-white/10 backdrop-blur-sm text-white/70'
                          }`}>
                            {act.badge ?? 'Live'}
                          </span>
                        </div>
                      )}

                      {/* Price badge */}
                      <div className="absolute bottom-0 left-0 right-0 px-3 py-2.5">
                        <span className="text-[#C9A84C] font-bold text-sm">{priceLabel}</span>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="p-3.5 flex flex-col gap-2">
                      <h3 className="text-white font-bold text-sm leading-snug line-clamp-2 group-hover:text-[#C9A84C] transition-colors">
                        {act.title}
                      </h3>

                      <div className="flex items-center gap-3 text-white/40 text-xs">
                        {act.duration && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />{act.duration}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{act.location}
                        </span>
                      </div>

                      {/* 4-star rating */}
                      <div className="flex items-center gap-0.5">
                        {[1,2,3,4].map(i => (
                          <Star key={i} className="w-3 h-3 fill-[#C9A84C] text-[#C9A84C]" />
                        ))}
                        <Star className="w-3 h-3 text-white/20" />
                        <span className="text-white/30 text-[10px] ml-1">4.0</span>
                      </div>

                      {/* CTA */}
                      {isHotelbeds ? (
                        <button
                          onClick={openJade}
                          className="mt-1 w-full flex items-center justify-center gap-1.5 bg-white/5 hover:bg-[#C9A84C]/20 border border-white/10 hover:border-[#C9A84C]/40 text-[#C9A84C] font-semibold text-xs py-2 rounded-xl transition-all"
                        >
                          <MessageCircle className="w-3.5 h-3.5" /> Book with Jade
                        </button>
                      ) : (
                        <button
                          onClick={handleStripe}
                          className="mt-1 w-full flex items-center justify-center gap-1.5 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-xs py-2 rounded-xl transition-all"
                        >
                          <CreditCard className="w-3.5 h-3.5" /> Book Now
                        </button>
                      )}
                    </div>
                  </>
                )

                return isHotelbeds ? (
                  <div
                    key={act.slug}
                    className="group relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 hover:border-[#C9A84C]/40 hover:shadow-[0_0_24px_rgba(201,168,76,0.12)] transition-all duration-300 cursor-pointer flex flex-col"
                  >
                    {cardContent}
                  </div>
                ) : (
                  <div
                    key={act.slug}
                    className="group relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 hover:border-[#C9A84C]/40 hover:shadow-[0_0_24px_rgba(201,168,76,0.12)] transition-all duration-300 flex flex-col"
                  >
                    {cardContent}
                  </div>
                )
              })}
            </div>
          </>
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
