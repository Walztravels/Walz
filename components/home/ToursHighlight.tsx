'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { MapPin, ArrowRight, ChevronLeft, ChevronRight, Clock, DollarSign } from 'lucide-react'

interface Tour {
  id: string
  name: string
  slug: string
  description: string
  location: string
  duration: string
  price: number
  currency: string
  photos: string[]
  imageUrl: string | null
}

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(price)
}

function getCover(tour: Tour): string {
  return tour.photos?.[0] ?? tour.imageUrl ?? ''
}

export function ToursHighlight() {
  const [tours, setTours] = useState<Tour[]>([])
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [kenKey, setKenKey] = useState(0)  // forces Ken Burns restart on slide change
  const [isPaused, setIsPaused] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch live tours
  useEffect(() => {
    fetch('/api/tours')
      .then((r) => r.json())
      .then((data: Tour[]) => {
        setTours(Array.isArray(data) ? data.filter((t) => getCover(t)) : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const advance = useCallback((dir: 1 | -1) => {
    setActiveIndex((i) => {
      const next = (i + dir + tours.length) % tours.length
      return next
    })
    setKenKey((k) => k + 1)
  }, [tours.length])

  // Auto-advance every 3.5s
  useEffect(() => {
    if (tours.length <= 1 || isPaused) return
    timerRef.current = setInterval(() => advance(1), 3500)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [tours.length, isPaused, advance])

  // Touch swipe
  function handleTouchStart(e: React.TouchEvent) {
    setTouchStart(e.touches[0].clientX)
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStart === null) return
    const diff = touchStart - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) advance(diff > 0 ? 1 : -1)
    setTouchStart(null)
  }

  if (loading) {
    return (
      <section className="py-16 lg:py-24 bg-[#0B1F3A]">
        <div className="container-walz">
          <div className="h-[500px] lg:h-[500px] rounded-3xl bg-gray-200 animate-pulse" />
        </div>
      </section>
    )
  }

  if (tours.length === 0) return null

  const tour = tours[activeIndex]
  const cover = getCover(tour)

  return (
    <section className="py-16 lg:py-24 bg-[#0B1F3A]">
      <div className="container-walz">
        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5 text-walz-gold" />
              <span className="text-walz-gold text-sm font-semibold tracking-wider uppercase">
                Private Tours
              </span>
            </div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-white">
              Exclusive Experiences
            </h2>
            <div className="divider-gold mt-3" />
          </div>
          <Link
            href="/tours"
            className="text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 self-start sm:self-auto"
          >
            All tours
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>

        {/* Cinematic slideshow card */}
        <div
          className="relative rounded-3xl overflow-hidden shadow-2xl"
          style={{ height: '500px' }}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Background image with Ken Burns */}
          {cover && (
            <div className="absolute inset-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={kenKey}
                src={cover}
                alt={tour.name}
                onError={e => { e.currentTarget.src = 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&auto=format&fit=crop' }}
                className="w-full h-full object-cover ken-burns slide-fade-in"
              />
            </div>
          )}

          {/* Gradient overlay — bottom-up for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/90 via-[#0B1F3A]/40 to-transparent" />

          {/* Photo strip — show if multiple photos for this tour */}
          {(tour.photos?.length ?? 0) > 1 && (
            <div className="absolute top-4 right-4 flex gap-1.5 z-10">
              {tour.photos.slice(0, 5).map((url, i) => (
                <div
                  key={url + i}
                  className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all ${i === 0 ? 'border-[#C9A84C]' : 'border-white/40'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Tour photo ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}

          {/* Content — slides up from bottom */}
          <div className="absolute inset-x-0 bottom-0 p-6 lg:p-10">
            <div className="max-w-2xl">
              {/* Tour name */}
              <h3 className="font-display text-2xl lg:text-4xl font-bold text-white mb-2 leading-tight slide-fade-in" key={'name' + activeIndex}>
                {tour.name}
              </h3>

              {/* Location + Duration */}
              <div className="flex flex-wrap items-center gap-4 text-white/70 text-sm mb-3">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#C9A84C]" />
                  {tour.location}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#C9A84C]" />
                  {tour.duration}
                </span>
              </div>

              {/* Description */}
              <p className="text-white/80 text-sm lg:text-base leading-relaxed mb-5 line-clamp-2 max-w-xl slide-fade-in" key={'desc' + activeIndex}>
                {tour.description}
              </p>

              {/* Price + CTA */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-baseline gap-1">
                  <span className="text-white/60 text-xs">From</span>
                  <span className="text-[#C9A84C] text-2xl font-bold">
                    {formatPrice(tour.price, tour.currency)}
                  </span>
                </div>

                <Link
                  href={`/tours/${tour.slug}`}
                  className="inline-flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
                >
                  <DollarSign className="w-4 h-4" />
                  Book Now
                </Link>

                <Link
                  href={`/tours/${tour.slug}`}
                  className="text-white/80 hover:text-white text-sm font-medium transition-colors flex items-center gap-1"
                >
                  View Details <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* Arrows — only visible on hover */}
          {tours.length > 1 && (
            <>
              <button
                onClick={() => advance(-1)}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 focus:opacity-100 z-10"
                aria-label="Previous tour"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => advance(1)}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 focus:opacity-100 z-10"
                aria-label="Next tour"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Dot indicators */}
          {tours.length > 1 && (
            <div className="absolute bottom-6 right-6 flex items-center gap-2 z-10">
              {tours.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setActiveIndex(i); setKenKey((k) => k + 1) }}
                  className={`transition-all rounded-full ${i === activeIndex ? 'w-6 h-2 bg-[#C9A84C]' : 'w-2 h-2 bg-white/40 hover:bg-white/70'}`}
                  aria-label={`Go to tour ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Mobile arrows — always visible below card */}
        {tours.length > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4 sm:hidden">
            <button
              onClick={() => advance(-1)}
              className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-white/60">{activeIndex + 1} / {tours.length}</span>
            <button
              onClick={() => advance(1)}
              className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
