'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Search, ArrowRight } from 'lucide-react'

const POPULAR = [
  { flag: '🇬🇧', name: 'United Kingdom' },
  { flag: '🇦🇪', name: 'UAE' },
  { flag: '🇯🇵', name: 'Japan' },
  { flag: '🇳🇬', name: 'Nigeria' },
  { flag: '🇫🇷', name: 'France' },
  { flag: '🇹🇭', name: 'Thailand' },
  { flag: '🇺🇸', name: 'United States' },
  { flag: '🇩🇪', name: 'Germany' },
]

export function EsimHero() {
  const [query,   setQuery]   = useState('')
  const [visible, setVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setVisible(true) }, [])

  function go(q?: string) {
    const val = (q ?? query).trim()
    if (val) sessionStorage.setItem('esim-hero-q', val)
    document.getElementById('esim-search')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section
      className="relative overflow-hidden flex flex-col items-center justify-center"
      style={{ minHeight: '90vh', background: '#071523' }}
    >
      {/* Layered background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {/* Navy gradient */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 100% 80% at 50% 35%, #0B1F3A 0%, #071523 100%)',
        }} />
        {/* Gold radial glow */}
        <div style={{
          position: 'absolute',
          width: '80vw', height: '80vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(201,168,76,0.07) 0%, transparent 60%)',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -65%)',
        }} />
        {/* Dot grid */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(rgba(201,168,76,0.07) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
      </div>

      {/* Content */}
      <div
        className="relative z-10 text-center px-5 sm:px-8 max-w-3xl mx-auto py-32"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease' }}
      >
        {/* Jade Connect eyebrow */}
        <div className="inline-flex items-center gap-2.5 mb-10 px-4 py-2 rounded-full"
          style={{ background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.18)' }}>
          <div className="w-5 h-5 rounded-full overflow-hidden relative flex-shrink-0"
            style={{ border: '1px solid rgba(201,168,76,0.4)' }}>
            <Image src="/jade-avatar.jpg" alt="" fill className="object-cover"
              style={{ objectPosition: '50% 8%' }} sizes="20px" />
          </div>
          <span className="text-[#C9A84C] text-xs font-semibold tracking-[0.15em] uppercase">Jade Connect</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
        </div>

        {/* Headline */}
        <h1
          className="font-display font-bold text-white leading-[1.06] mb-6"
          style={{ fontSize: 'clamp(2.6rem, 7.5vw, 5rem)', textWrap: 'balance' }}
        >
          Travel data.{' '}
          <em style={{
            fontStyle: 'normal',
            background: 'linear-gradient(92deg, #C9A84C 0%, #FFD66B 55%, #C9A84C 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundSize: '200% 100%',
            animation: 'goldShimmer 3.5s linear infinite',
          }}>
            Anywhere. Instantly.
          </em>
        </h1>

        <p
          className="text-white/45 leading-relaxed mb-10 mx-auto max-w-lg"
          style={{ fontSize: 'clamp(1rem, 2.2vw, 1.18rem)', textWrap: 'balance' }}
        >
          eSIM for 215+ countries powered by Airalo. No roaming charges,
          no physical SIM, no queues. Connect before you land — from&nbsp;$9.99.
        </p>

        {/* Search bar */}
        <form onSubmit={e => { e.preventDefault(); go() }} className="mb-7">
          <div className="flex items-center gap-2 p-1.5 rounded-2xl max-w-xl mx-auto"
            style={{
              background: 'rgba(255,255,255,0.05)',
              backdropFilter: 'blur(20px)',
              border: '1.5px solid rgba(201,168,76,0.22)',
            }}>
            <Search className="w-4 h-4 text-[#C9A84C] ml-3 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Where are you travelling?"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-white placeholder:text-white/28 text-[15px] outline-none py-3 px-2"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-3 rounded-xl font-bold text-sm flex-shrink-0 transition-all hover:brightness-110 active:scale-95"
              style={{ background: '#C9A84C', color: '#0B1F3A' }}
            >
              Search <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Popular destinations */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-14">
          <span className="text-white/22 text-[11px] mr-1">Popular:</span>
          {POPULAR.map(p => (
            <button
              key={p.name}
              onClick={() => go(p.name)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.09)',
                color: 'rgba(255,255,255,0.55)',
              }}
            >
              {p.flag} {p.name}
            </button>
          ))}
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {[
            ['215+', 'countries'],
            ['4G/5G', 'speeds'],
            ['Instant', 'delivery'],
            ['24/7', 'support'],
          ].map(([v, l]) => (
            <div key={l} className="text-center">
              <p className="font-bold text-white text-base leading-none mb-0.5">{v}</p>
              <p className="text-white/25 text-xs">{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll hint */}
      <button
        onClick={() => go()}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-22 hover:opacity-50 transition-opacity"
        aria-label="Browse plans"
      >
        <div className="w-5 h-8 rounded-full border border-white/35 flex items-start justify-center pt-1.5">
          <div className="w-1 h-2 bg-white rounded-full" style={{ animation: 'scrollDot 2s ease-in-out infinite' }} />
        </div>
      </button>

      <style>{`
        @keyframes goldShimmer  { 0%{background-position:0% 50%}  100%{background-position:200% 50%} }
        @keyframes scrollDot    { 0%,100%{transform:translateY(0);opacity:.4} 50%{transform:translateY(10px);opacity:1} }
        @keyframes pulse        { 0%,100%{opacity:1} 50%{opacity:.45} }
        @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important}}
      `}</style>
    </section>
  )
}
