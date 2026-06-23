'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Slide {
  id: string
  bg: string
  pill: string
  line1: string
  line2: string
  line3: string
  sub: string
  cta1Label: string
  cta1Href: string
  cta2Label: string
  cta2Href: string
}

const FALLBACK_SLIDES: Slide[] = [
  {
    id: 'flights',
    bg: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1600&q=80',
    pill: 'EMIRATES · QATAR · BRITISH AIRWAYS',
    line1: 'Fly Higher.',
    line2: 'Fly Further.',
    line3: 'Fly Smarter.',
    sub: '900+ airlines. Business to economy. Real-time fares. Instant ticketing.',
    cta1Label: 'Search Flights →',
    cta1Href: '/flights',
    cta2Label: 'Ask Jade ✦',
    cta2Href: '#jade',
  },
  {
    id: 'visas',
    bg: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1600&q=80',
    pill: 'UK · CANADA · SCHENGEN · UAE · USA',
    line1: 'Your Visa.',
    line2: 'Your Journey.',
    line3: 'Handled.',
    sub: 'Expert processing from £120. 90%+ approval rate. Results in 3–8 weeks.',
    cta1Label: 'Apply for Visa →',
    cta1Href: '/visa',
    cta2Label: 'Check Requirements',
    cta2Href: '/visa',
  },
  {
    id: 'hotels',
    bg: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1600&q=80',
    pill: 'HILTON · MARRIOTT · HYATT · IHG',
    line1: 'Every Hotel.',
    line2: 'Every City.',
    line3: 'Every Budget.',
    sub: '500,000+ hotels worldwide. Best rate guarantee. Free cancellation.',
    cta1Label: 'Browse Hotels →',
    cta1Href: '/hotels',
    cta2Label: 'Get a Deal',
    cta2Href: '/hotels',
  },
]

export function MultiSlideHero() {
  const [slides, setSlides] = useState<Slide[]>(FALLBACK_SLIDES)
  const [current, setCurrent] = useState(0)
  const [fading, setFading] = useState(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    fetch('/api/public/homepage')
      .then(r => r.json())
      .then((d: { content?: { hero_slides?: Slide[] } }) => {
        const s = d.content?.hero_slides
        if (Array.isArray(s) && s.length > 0) setSlides(s)
      })
      .catch(() => {})
  }, [])

  const goTo = useCallback((index: number) => {
    if (index === current) return
    setFading(true)
    setTimeout(() => {
      setCurrent(index)
      setFading(false)
    }, 350)
  }, [current])

  useEffect(() => {
    if (paused) return
    const timer = setInterval(() => {
      goTo((current + 1) % slides.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [current, paused, slides.length, goTo])

  const slide = slides[current]

  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Preloaded background images — crossfade via opacity */}
      {slides.map((s, i) => (
        <div
          key={s.id}
          className={cn(
            'absolute inset-0 transition-opacity duration-700 ease-in-out',
            i === current ? 'opacity-100' : 'opacity-0',
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={s.bg}
            alt=""
            className="w-full h-full object-cover"
            loading={i === 0 ? 'eager' : 'lazy'}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, rgba(10,22,40,0.35) 0%, rgba(10,22,40,0.15) 40%, rgba(10,22,40,0.65) 75%, rgba(10,22,40,0.95) 100%)',
            }}
          />
          <div className="absolute inset-0 bg-[#0a1628]/20" />
        </div>
      ))}

      {/* Hero content */}
      <div
        className={cn(
          'relative z-10 text-center px-4 max-w-5xl mx-auto w-full',
          'transition-all duration-350',
          fading ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0',
        )}
      >
        {/* Animated pill */}
        <div className="inline-flex items-center gap-2.5 mb-6 bg-white/8 backdrop-blur-md border border-white/15 rounded-full px-5 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          <span className="text-white/75 text-xs font-medium tracking-[0.15em] uppercase">
            {slide.pill}
          </span>
        </div>

        {/* Headline */}
        <h1 className="mb-6 leading-none">
          <span
            className="block text-white font-bold leading-none"
            style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}
          >
            {slide.line1}
          </span>
          <span
            className="block text-amber-400 font-bold leading-none"
            style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}
          >
            {slide.line2}
          </span>
          <span
            className="block text-white/40 font-bold leading-none"
            style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}
          >
            {slide.line3}
          </span>
        </h1>

        {/* Sub text */}
        <p className="text-white/55 text-base md:text-lg mb-10 max-w-xl mx-auto leading-relaxed">
          {slide.sub}
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
          <Link
            href={slide.cta1Href}
            className="inline-flex items-center justify-center gap-2
              bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm
              px-8 py-4 rounded-xl transition-all duration-150
              shadow-xl shadow-amber-500/30 active:scale-[0.97]"
          >
            {slide.cta1Label}
          </Link>
          <Link
            href={slide.cta2Href}
            className="inline-flex items-center justify-center gap-2
              bg-white/10 hover:bg-white/18 backdrop-blur-sm
              text-white font-semibold text-sm
              px-8 py-4 rounded-xl transition-all duration-150
              border border-white/20 hover:border-white/35
              active:scale-[0.97]"
          >
            {slide.cta2Label}
          </Link>
        </div>

        {/* Slide dot indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={cn(
                'transition-all duration-300 rounded-full',
                i === current
                  ? 'w-8 h-1.5 bg-amber-400'
                  : 'w-1.5 h-1.5 bg-white/25 hover:bg-white/50',
              )}
            />
          ))}
        </div>

        {/* Trust line */}
        <p className="text-white/25 text-xs tracking-wider">
          90%+ visa approval · 900+ airlines · 500K+ hotels · 24/7 expert support
        </p>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 animate-bounce">
        <div className="w-px h-8 bg-gradient-to-b from-white/40 to-transparent" />
        <div className="w-1 h-1 rounded-full bg-white/40" />
      </div>
    </section>
  )
}
