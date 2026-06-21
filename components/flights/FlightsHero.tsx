'use client'

import { useEffect, useState } from 'react'

const SLIDES = [
  {
    image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1920&h=1080&fit=crop&q=85',
    label: 'Emirates · Qatar · British Airways',
    headline: ['Fly Higher.', 'Further.', 'Better.'],
  },
  {
    image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1920&h=1080&fit=crop&q=85',
    label: 'London · Lagos · Dubai · New York',
    headline: ['Every Route.', 'Every Class.', 'Every Dream.'],
  },
  {
    image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=1920&h=1080&fit=crop&q=85',
    label: 'Africa · Caribbean · Middle East',
    headline: ['Home is', 'A Flight', 'Away.'],
  },
]

export function FlightsHero() {
  const [active, setActive] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setActive(a => (a + 1) % SLIDES.length)
        setFading(false)
      }, 700)
    }, 6000)
    return () => clearInterval(interval)
  }, [])

  const slide = SLIDES[active]

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-[#050E1A]">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
        style={{
          backgroundImage: `url(${slide.image})`,
          opacity: fading ? 0 : 1,
        }}
      />

      {/* Cinematic layered overlays */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to bottom, rgba(5,14,26,0.35) 0%, rgba(5,14,26,0.2) 40%, rgba(5,14,26,0.72) 100%)',
      }} />
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to right, rgba(5,14,26,0.6) 0%, transparent 60%)',
      }} />

      {/* Slide indicators */}
      <div className="absolute bottom-44 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        {SLIDES.map((_, i) => (
          <button key={i} onClick={() => { setActive(i); setFading(false) }}
            className={`h-0.5 rounded-full transition-all duration-500 ${i === active ? 'w-8 bg-[#C9A84C]' : 'w-3 bg-white/30'}`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Hero copy */}
      <div className="absolute inset-0 flex flex-col justify-center px-6 sm:px-12 lg:px-20 pb-44 pt-20">
        <div
          className="transition-all duration-700"
          style={{ opacity: fading ? 0 : 1, transform: fading ? 'translateY(10px)' : 'translateY(0)' }}
        >
          {/* Eyebrow */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center gap-2 border border-[#C9A84C]/40 rounded-full px-4 py-1.5 backdrop-blur-sm bg-black/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" />
              <span className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.25em] uppercase">
                {slide.label}
              </span>
            </div>
          </div>

          {/* Headline */}
          <h1 className="font-display font-bold leading-none tracking-tight mb-6 max-w-3xl">
            {slide.headline.map((line, i) => (
              <span key={i} className={`block ${i === 0 ? 'text-white text-6xl sm:text-7xl lg:text-[7rem] xl:text-[8.5rem]' : i === 1 ? 'text-6xl sm:text-7xl lg:text-[7rem] xl:text-[8.5rem]' : 'text-5xl sm:text-6xl lg:text-7xl xl:text-8xl text-white/70 font-light mt-2'}`}
                style={i === 1 ? {
                  background: 'linear-gradient(100deg, #C9A84C 0%, #F0D98A 50%, #C9A84C 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                } : undefined}
              >
                {line}
              </span>
            ))}
          </h1>

          <p className="text-white/55 text-base lg:text-lg max-w-md leading-relaxed mb-8">
            900+ airlines. Business class to economy. Real-time fares.
            Managed by Walz Travels&apos; expert concierge team — 24/7.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => document.getElementById('search-widget')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="px-8 py-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm tracking-wide hover:bg-[#E0B95A] active:scale-[0.97] transition-all shadow-lg shadow-[#C9A84C]/30"
            >
              Search Flights
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('jade:open', { detail: { service: 'Flight', page: '/flights' } }))}
              className="px-8 py-4 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-semibold hover:bg-white/20 active:scale-[0.97] transition-all backdrop-blur-sm flex items-center gap-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Chat with Jade AI
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('popular-routes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="px-8 py-4 rounded-xl border border-white/25 text-white text-sm font-medium hover:border-white/50 hover:bg-white/8 transition-all backdrop-blur-sm"
            >
              Explore Routes
            </button>
          </div>

          {/* Trust badges */}
          <div className="mt-10 flex flex-wrap items-center gap-6">
            {[
              { label: 'IATA Certified' },
              { label: '900+ Airlines' },
              { label: 'Price Guarantee' },
              { label: '24/7 Concierge' },
            ].map(({ label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-[#C9A84C]" />
                <span className="text-white/40 text-xs font-medium tracking-wide">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
