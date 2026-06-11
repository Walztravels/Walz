'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export interface SpotlightPackage {
  id: string
  slug: string
  title: string
  destination: string
  country_iso2: string | null
  tagline: string | null
  images: string[]
  price_per_person: number
  original_price: number | null
  currency: string
  duration_days: number
  duration_nights: number | null
  departure_date: string | null
  departure_city: string | null
  total_seats: number | null
  seats_booked: number
  package_type: string
  visa_included: boolean
  flight_included: boolean
  hotel_included: boolean
}

interface Props {
  initialPackages: SpotlightPackage[]
}

const INTERVAL = 7000
const FADE_MS = 800

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1600&q=85'

function safeImages(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[]
  if (typeof val === 'string') {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : [] } catch { return [] }
  }
  return []
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function FeaturedDepartureSlider({ initialPackages }: Props) {
  const [packages, setPackages] = useState<SpotlightPackage[]>(
    initialPackages.map(p => ({ ...p, images: safeImages(p.images) }))
  )
  const [current, setCurrent] = useState(0)
  const [visible, setVisible] = useState(true)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())

  // Hydrate from API (picks up any admin changes after SSR)
  useEffect(() => {
    fetch('/api/packages/spotlight')
      .then(r => r.ok ? r.json() : { packages: [] })
      .then(({ packages: data }: { packages: SpotlightPackage[] }) => {
        if (data && data.length > 0) {
          setPackages(data.map(p => ({ ...p, images: safeImages(p.images) })))
          setCurrent(0)
        }
      })
      .catch(() => {})
  }, [])

  function goTo(idx: number) {
    setVisible(false)
    setTimeout(() => {
      setCurrent(idx)
      setVisible(true)
      setProgress(0)
      startTimeRef.current = Date.now()
    }, FADE_MS)
  }

  function advance() {
    setPackages(prev => {
      const next = (current + 1) % prev.length
      goTo(next)
      return prev
    })
  }

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (progressRef.current) clearInterval(progressRef.current)
    startTimeRef.current = Date.now()
    setProgress(0)

    timerRef.current = setInterval(() => {
      advance()
    }, INTERVAL)

    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      setProgress(Math.min(100, (elapsed / INTERVAL) * 100))
    }, 50)
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (progressRef.current) clearInterval(progressRef.current)
  }

  useEffect(() => {
    if (packages.length <= 1 || paused) { stopTimer(); return }
    startTimer()
    return stopTimer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages.length, paused, current])

  if (packages.length === 0) return null

  const pkg = packages[current]
  const coverImage = pkg.images[0] || FALLBACK_IMAGE
  const seatsLeft = pkg.total_seats != null ? pkg.total_seats - pkg.seats_booked : null
  const seatsPercent = pkg.total_seats ? Math.min(100, (pkg.seats_booked / pkg.total_seats) * 100) : 0
  const isLowSeats = seatsLeft != null && seatsLeft <= 5

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="rounded-3xl overflow-hidden relative shadow-2xl min-h-[480px] h-auto lg:h-[420px]"
    >
      {/* Image layers — all stacked, crossfade via opacity */}
      {packages.map((p, i) => (
        <div
          key={p.id}
          className="absolute inset-0 transition-opacity duration-[800ms] ease-in-out"
          style={{ opacity: i === current ? 1 : 0, zIndex: i === current ? 1 : 0 }}
        >
          <Image
            src={safeImages(p.images)[0] || FALLBACK_IMAGE}
            fill
            alt={p.title}
            sizes="(max-width: 1280px) 100vw, 1280px"
            priority={i === 0}
            className={`object-cover transition-transform ease-linear ${
              i === current ? 'scale-105 duration-[7000ms]' : 'scale-100 duration-0'
            }`}
          />
        </div>
      ))}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/95 via-[#0B1F3A]/70 to-[#0B1F3A]/20 z-10" />

      {/* Content — fades in/out on each slide */}
      <div
        key={current}
        className="absolute inset-0 z-20 flex items-center px-8 lg:px-12 py-10"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(12px)',
          transition: `opacity ${FADE_MS}ms ease-in-out, transform ${FADE_MS}ms ease-out`,
        }}
      >
        <div className="max-w-xl w-full">
          {/* Badge */}
          <span className="inline-block bg-[#C9A84C] text-[#0B1F3A] text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
            Featured Departure
          </span>

          {/* Title */}
          <h2 className="font-display text-3xl lg:text-4xl text-white font-bold leading-tight mb-2">
            {pkg.title}
          </h2>

          {/* Tagline */}
          {pkg.tagline && (
            <p className="text-white/75 text-base mb-3">{pkg.tagline}</p>
          )}

          {/* Meta */}
          <p className="text-white/60 text-sm mb-4">
            {pkg.duration_days} Days
            {pkg.duration_nights ? ` · ${pkg.duration_nights} Nights` : ''}
            {pkg.departure_city ? ` · Departs ${pkg.departure_city}` : ''}
            {pkg.departure_date ? ` · ${formatDate(pkg.departure_date)}` : ''}
          </p>

          {/* Inclusion pills */}
          {(pkg.flight_included || pkg.hotel_included || pkg.visa_included) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {pkg.flight_included && (
                <span className="px-2.5 py-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white text-xs font-medium">
                  ✈️ Flights
                </span>
              )}
              {pkg.hotel_included && (
                <span className="px-2.5 py-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white text-xs font-medium">
                  🏨 Hotel
                </span>
              )}
              {pkg.visa_included && (
                <span className="px-2.5 py-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white text-xs font-medium">
                  🛂 Visa
                </span>
              )}
            </div>
          )}

          {/* Seats bar */}
          {pkg.total_seats != null && seatsLeft != null && (
            <div className="mb-4">
              <p className={`text-xs mb-1.5 ${isLowSeats ? 'text-red-400 font-semibold' : 'text-white/60'}`}>
                {seatsLeft} of {pkg.total_seats} seats remaining
              </p>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden w-48">
                <div
                  className="h-full bg-[#C9A84C] rounded-full transition-all duration-500"
                  style={{ width: `${seatsPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Price */}
          <div className="flex items-baseline gap-2 mb-5">
            {pkg.original_price != null && (
              <span className="text-white/50 line-through text-sm">
                {pkg.currency} {pkg.original_price.toLocaleString()}
              </span>
            )}
            <span className="text-[#C9A84C] text-2xl font-bold">
              From {pkg.currency} {pkg.price_per_person.toLocaleString()}
            </span>
            <span className="text-white/60 text-xs">per person</span>
          </div>

          <Link
            href={`/packages/${pkg.slug}`}
            className="inline-block px-6 py-3 rounded-xl font-bold text-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#C9A84C', color: '#0B1F3A' }}
          >
            View Package →
          </Link>
        </div>
      </div>

      {/* Dots + progress — bottom right */}
      {packages.length > 1 && (
        <div className="absolute bottom-5 right-6 z-30 flex items-center gap-2">
          {packages.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="relative overflow-hidden rounded-full transition-all duration-300 cursor-pointer"
              style={{
                width: i === current ? 24 : 6,
                height: 6,
                backgroundColor: i === current ? '#C9A84C' : 'rgba(255,255,255,0.35)',
              }}
              aria-label={`Go to slide ${i + 1}`}
            >
              {i === current && (
                <span
                  className="absolute inset-y-0 left-0 bg-white/40 rounded-full"
                  style={{ width: `${progress}%`, transition: 'width 50ms linear' }}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
