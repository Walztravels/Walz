'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Data ──────────────────────────────────────────────────────────────────────

const PREVIEWS = [
  {
    flag: '🇬🇧',
    city: 'London',
    duration: '7 Days',
    days: [
      {
        n: 1, title: 'Arrival',
        items: ['✈ Heathrow Terminal 5', '🏨 Central London hotel', '🍽 Borough Market evening'],
      },
      {
        n: 2, title: 'Royal London',
        items: ['🏰 Tower of London', '🌉 Tower Bridge walk', '🎭 West End show'],
      },
      {
        n: 3, title: 'Culture',
        items: ['🏛 British Museum', '🛍 Covent Garden', '🌆 Soho dining'],
      },
    ],
  },
  {
    flag: '🇦🇪',
    city: 'Dubai',
    duration: '5 Days',
    days: [
      {
        n: 1, title: 'Arrival',
        items: ['✈ Dubai International', '🏨 Downtown hotel', '🌆 Burj Khalifa sunset'],
      },
      {
        n: 2, title: 'The City',
        items: ['🕌 Old Dubai tour', '🛍 Gold Souk', '🍽 Creek dining'],
      },
    ],
  },
  {
    flag: '🇨🇦',
    city: 'Toronto & Niagara',
    duration: '7 Days',
    days: [
      {
        n: 1, title: 'Arrival',
        items: ['✈ Pearson International', '🏨 Downtown Toronto', '🍁 CN Tower evening'],
      },
      {
        n: 2, title: 'Niagara Falls',
        items: ['🌊 Private VIP boat tour', '🍷 Wine tasting', '🌅 Falls at golden hour'],
      },
    ],
  },
]

const STEPS = [
  { num: '01', text: 'Tell Jade your destination and travel preferences' },
  { num: '02', text: 'Jade builds your complete day by day itinerary' },
  { num: '03', text: 'Walz Travels books every detail for you' },
]

const QUICK = [
  { label: '🇬🇧 London',  value: 'London'  },
  { label: '🇦🇪 Dubai',   value: 'Dubai'   },
  { label: '🇨🇦 Toronto', value: 'Toronto' },
]

const FLOAT_CARDS: Array<{
  city: string; top: string; left?: string; right?: string
  speed: number; opacity: number
}> = [
  { city: 'London',   top: '10%', left:  '3%',  speed: 0.15, opacity: 0.07 },
  { city: 'Paris',    top: '18%', right: '4%',  speed: 0.25, opacity: 0.05 },
  { city: 'Toronto',  top: '68%', left:  '4%',  speed: 0.20, opacity: 0.06 },
  { city: 'Dubai',    top: '74%', right: '5%',  speed: 0.18, opacity: 0.08 },
]

const TRUST = [
  { icon: '⚡', text: 'AI Powered by Jade'   },
  { icon: '✈',  text: '5,000+ Trips Planned' },
  { icon: '📱', text: 'Book in Minutes'       },
]

// ── Headline word structure ────────────────────────────────────────────────────
//   Line 1: Plan  Your
//   Line 2: Perfect  Trip.
//   Line 3: Jade  Builds  It.
const HEADLINE_LINES = [
  ['Plan', 'Your'],
  ['Perfect', 'Trip.'],
  ['Jade', 'Builds', 'It.'],
]

// ── Component ─────────────────────────────────────────────────────────────────

export function JadePlannerSection() {
  const sectionRef  = useRef<HTMLDivElement>(null)
  const accentRef   = useRef<HTMLDivElement>(null)
  const mapRef      = useRef<HTMLDivElement>(null)
  const floatRefs   = useRef<(HTMLDivElement | null)[]>([])
  const eyebrowRef  = useRef<HTMLParagraphElement>(null)
  const wordRefs    = useRef<(HTMLSpanElement | null)[]>([])
  const subRef      = useRef<HTMLParagraphElement>(null)
  const stepsRef    = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLDivElement>(null)
  const avatarRef   = useRef<HTMLDivElement>(null)
  const cardRef     = useRef<HTMLDivElement>(null)
  const trustRef    = useRef<HTMLDivElement>(null)

  const [dest,       setDest]       = useState('')
  const [previewIdx, setPreviewIdx] = useState(0)
  const [fading,     setFading]     = useState(false)

  // ── Itinerary cycling (CSS crossfade) ────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setFading(true)
      const t = setTimeout(() => {
        setPreviewIdx(i => (i + 1) % PREVIEWS.length)
        setFading(false)
      }, 600)
      return () => clearTimeout(t)
    }, 3500)
    return () => clearInterval(id)
  }, [])

  // ── GSAP animations ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    gsap.registerPlugin(ScrollTrigger)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const section = sectionRef.current
    if (!section) return

    const isMobile = window.innerWidth < 1024
    const created: ScrollTrigger[] = []

    // ── Gold accent line: scrub from scaleX 0 → 1 ───────────────────────────
    if (accentRef.current) {
      const st = ScrollTrigger.create({
        trigger: section,
        start: 'top 90%',
        end: 'top 30%',
        scrub: 2,
        animation: gsap.fromTo(accentRef.current,
          { scaleX: 0, transformOrigin: 'left center' },
          { scaleX: 1, ease: 'none' },
        ),
      })
      created.push(st)
    }

    // ── World map parallax (desktop only) ───────────────────────────────────
    if (!isMobile && mapRef.current) {
      const st = ScrollTrigger.create({
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1,
        animation: gsap.to(mapRef.current, { yPercent: -18, ease: 'none' }),
      })
      created.push(st)
    }

    // ── Floating cards parallax (desktop only) ───────────────────────────────
    if (!isMobile) {
      floatRefs.current.forEach((el, i) => {
        if (!el) return
        const speed = FLOAT_CARDS[i]?.speed ?? 0.2
        const st = ScrollTrigger.create({
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1,
          animation: gsap.to(el, { yPercent: -speed * 120, ease: 'none' }),
        })
        created.push(st)
      })
    }

    // ── Entry reveal timeline ────────────────────────────────────────────────
    // Set initial state for all animated elements
    const words = wordRefs.current.filter(Boolean) as HTMLSpanElement[]
    const steps  = stepsRef.current
      ? Array.from(stepsRef.current.children) as HTMLElement[]
      : []
    const trust  = trustRef.current
      ? Array.from(trustRef.current.children) as HTMLElement[]
      : []

    gsap.set([eyebrowRef.current, subRef.current, inputRef.current, cardRef.current], {
      opacity: 0, y: 30,
    })
    gsap.set(words, { yPercent: 110, opacity: 0 })
    gsap.set(steps, { opacity: 0, y: 40 })
    gsap.set(trust,  { opacity: 0, y: 20 })
    gsap.set(avatarRef.current, { scale: 0.8, opacity: 0 })

    const st = ScrollTrigger.create({
      trigger: section,
      start: 'top 60%',
      once: true,
      onEnter() {
        const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })

        // t=0: Eyebrow
        tl.to(eyebrowRef.current, { opacity: 1, y: 0, duration: 0.8 }, 0)

        // t=0.3: Headline words, clip-path reveal, staggered
        tl.to(words, { yPercent: 0, opacity: 1, duration: 1.05, stagger: 0.08 }, 0.3)

        // t=1.2: Subheadline
        tl.to(subRef.current, { opacity: 1, y: 0, duration: 0.7 }, 1.2)

        // t=1.6: Steps stagger
        tl.to(steps, { opacity: 1, y: 0, duration: 0.7, stagger: 0.15 }, 1.6)

        // t=2.2: Input form
        tl.to(inputRef.current, { opacity: 1, y: 0, duration: 0.7 }, 2.2)

        // t=2.5: Trust strip
        tl.to(trust, { opacity: 1, y: 0, duration: 0.5, stagger: 0.12 }, 2.5)

        // t=0.5: Right — avatar scales in
        tl.to(avatarRef.current, {
          scale: 1, opacity: 1, duration: 0.9,
          ease: 'back.out(1.4)',
        }, 0.5)

        // t=0.8: Right — itinerary card slides up
        tl.to(cardRef.current, { opacity: 1, y: 0, duration: 0.85 }, 0.8)
      },
    })
    created.push(st)

    return () => created.forEach(t => t.kill())
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dest.trim()) return
    window.location.href = `/plan/new?destination=${encodeURIComponent(dest.trim())}`
  }

  function handleQuick(value: string) {
    setDest(value)
    window.location.href = `/plan/new?destination=${encodeURIComponent(value)}`
  }

  const preview = PREVIEWS[previewIdx]

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-[#0B1F3A]"
      style={{ minHeight: '100svh' }}
    >

      {/* ── Gold accent line (top) — scaleX animated by GSAP ────────────────── */}
      <div
        ref={accentRef}
        className="absolute top-0 left-0 right-0 h-px origin-left"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #C9A84C 30%, #C9A84C 70%, transparent 100%)',
        }}
      />

      {/* ── Layer 2: World map outline ─ very subtle, parallax ──────────────── */}
      <div
        ref={mapRef}
        className="absolute inset-0 pointer-events-none select-none"
        aria-hidden
      >
        <svg
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* Latitude lines */}
          {[90, 180, 270, 360, 450, 540, 630, 720, 810].map(y => (
            <line key={`lat-${y}`} x1="0" y1={y} x2="1440" y2={y}
              stroke="white" strokeOpacity="0.035" strokeWidth="0.8" />
          ))}
          {/* Longitude lines */}
          {[144, 288, 432, 576, 720, 864, 1008, 1152, 1296].map(x => (
            <line key={`lng-${x}`} x1={x} y1="0" x2={x} y2="900"
              stroke="white" strokeOpacity="0.035" strokeWidth="0.8" />
          ))}
          {/* Globe arcs */}
          <ellipse cx="720" cy="450" rx="680" ry="360" stroke="white" strokeOpacity="0.025" strokeWidth="0.8" fill="none" />
          <ellipse cx="720" cy="450" rx="450" ry="360" stroke="white" strokeOpacity="0.02" strokeWidth="0.8" fill="none" />
          <ellipse cx="720" cy="450" rx="200" ry="360" stroke="white" strokeOpacity="0.018" strokeWidth="0.8" fill="none" />
          {/* Rough continent silhouettes */}
          {/* Europe / Africa */}
          <path
            d="M560 160 C590 140 640 135 670 155 C700 175 720 210 710 250 C700 290 670 310 640 330 C610 350 580 340 560 310 C530 280 500 260 510 220 C520 180 540 170 560 160 Z"
            stroke="white" strokeOpacity="0.04" strokeWidth="0.8" fill="none"
          />
          {/* Africa */}
          <path
            d="M600 340 C625 330 650 340 665 360 C680 385 680 430 670 480 C660 530 640 570 615 590 C590 610 565 600 550 575 C530 545 520 500 525 455 C530 410 545 380 560 360 C572 342 590 345 600 340 Z"
            stroke="white" strokeOpacity="0.04" strokeWidth="0.8" fill="none"
          />
          {/* Americas */}
          <path
            d="M230 180 C260 165 290 175 310 200 C330 225 340 265 325 300 C310 335 280 355 250 340 C215 325 195 290 195 255 C195 215 210 190 230 180 Z"
            stroke="white" strokeOpacity="0.035" strokeWidth="0.8" fill="none"
          />
          <path
            d="M250 350 C275 340 300 355 315 380 C330 410 335 455 320 495 C305 535 275 555 248 540 C220 525 205 490 210 450 C215 410 232 358 250 350 Z"
            stroke="white" strokeOpacity="0.03" strokeWidth="0.8" fill="none"
          />
          {/* Asia */}
          <path
            d="M860 150 C900 135 960 145 1000 175 C1040 205 1060 250 1050 295 C1040 340 1005 365 960 355 C915 345 870 315 855 270 C840 225 845 165 860 150 Z"
            stroke="white" strokeOpacity="0.035" strokeWidth="0.8" fill="none"
          />
          {/* Australia */}
          <path
            d="M1050 540 C1080 525 1120 535 1145 560 C1170 590 1175 635 1155 665 C1135 695 1100 705 1065 690 C1030 675 1010 640 1015 605 C1020 568 1030 548 1050 540 Z"
            stroke="white" strokeOpacity="0.03" strokeWidth="0.8" fill="none"
          />
          {/* Destination dots */}
          <circle cx="420"  cy="220" r="3" fill="#C9A84C" fillOpacity="0.18" />
          <circle cx="785"  cy="310" r="3" fill="#C9A84C" fillOpacity="0.18" />
          <circle cx="290"  cy="250" r="3" fill="#C9A84C" fillOpacity="0.18" />
          <circle cx="660"  cy="245" r="3" fill="#C9A84C" fillOpacity="0.18" />
          {/* Connector lines between dots */}
          <line x1="420" y1="220" x2="785" y2="310" stroke="#C9A84C" strokeOpacity="0.07" strokeWidth="0.6" strokeDasharray="4 6" />
          <line x1="290" y1="250" x2="420" y2="220" stroke="#C9A84C" strokeOpacity="0.07" strokeWidth="0.6" strokeDasharray="4 6" />
          <line x1="660" y1="245" x2="785" y2="310" stroke="#C9A84C" strokeOpacity="0.07" strokeWidth="0.6" strokeDasharray="4 6" />
        </svg>
      </div>

      {/* ── Layer 3: Floating destination cards ─ parallax depth ────────────── */}
      {FLOAT_CARDS.map((fc, i) => (
        <div
          key={fc.city}
          ref={el => { floatRefs.current[i] = el }}
          className="absolute pointer-events-none select-none hidden lg:block"
          style={{
            top:     fc.top,
            left:    fc.left,
            right:   fc.right,
            opacity: fc.opacity,
            filter:  'blur(1.5px)',
          }}
          aria-hidden
        >
          <div
            className="rounded-xl px-5 py-3"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <p className="text-white text-sm font-semibold">{fc.city}</p>
            <p className="text-white/40 text-xs mt-0.5">AI Itinerary</p>
          </div>
        </div>
      ))}

      {/* ── Layer 4: Foreground content ─────────────────────────────────────── */}
      <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 py-24 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">

          {/* ────────── LEFT COLUMN ────────────────────────────────────────── */}
          <div>

            {/* Eyebrow */}
            <p
              ref={eyebrowRef}
              className="text-[#C9A84C] text-[10px] font-bold tracking-[0.28em] uppercase mb-5"
            >
              Jade AI Trip Planner
            </p>

            {/* Headline — word-by-word clip reveal */}
            <h2 className="font-display font-bold text-white leading-[1.06] mb-7"
              style={{ fontSize: 'clamp(2.6rem, 5.5vw, 4.6rem)' }}>
              {HEADLINE_LINES.map((line, li) => (
                <div key={li} className="overflow-hidden block">
                  {line.map((word, wi) => {
                    // Global word index for wordRefs
                    const idx = HEADLINE_LINES
                      .slice(0, li)
                      .reduce((acc, l) => acc + l.length, 0) + wi
                    return (
                      <span
                        key={wi}
                        ref={el => { wordRefs.current[idx] = el }}
                        className="inline-block"
                        style={{ marginRight: '0.28em' }}
                      >
                        {word}
                      </span>
                    )
                  })}
                </div>
              ))}
            </h2>

            {/* Subheadline */}
            <p
              ref={subRef}
              className="text-white/50 text-base lg:text-lg leading-[1.75] mb-10 max-w-md"
            >
              Tell Jade where you want to go and she will create a complete day by
              day itinerary — flights, hotels, visa, tours and transfers all planned
              in minutes.
            </p>

            {/* Three steps */}
            <div ref={stepsRef} className="space-y-5 mb-10">
              {STEPS.map(({ num, text }) => (
                <div key={num} className="flex items-start gap-5">
                  <span
                    className="font-mono text-[11px] font-bold tracking-widest flex-shrink-0 mt-[3px]"
                    style={{ color: 'rgba(201,168,76,0.55)' }}
                  >
                    {num}
                  </span>
                  <p className="text-white/65 text-sm leading-relaxed">{text}</p>
                </div>
              ))}
            </div>

            {/* Destination input */}
            <div ref={inputRef}>
              <form onSubmit={handleSubmit}>
                <div
                  className="rounded-xl p-5 mb-4"
                  style={{
                    background:     'rgba(255,255,255,0.05)',
                    backdropFilter: 'blur(10px)',
                    border:         '1px solid rgba(201,168,76,0.3)',
                  }}
                >
                  <label className="block text-[9px] font-bold tracking-[0.26em] uppercase mb-3"
                    style={{ color: '#C9A84C' }}>
                    Where do you want to go?
                  </label>
                  <div className="flex gap-3 items-center">
                    <input
                      type="text"
                      value={dest}
                      onChange={e => setDest(e.target.value)}
                      placeholder="London, Dubai, Toronto…"
                      className="flex-1 bg-transparent text-white placeholder-white/25 text-sm outline-none py-1.5 min-w-0 transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}
                      onFocus={e => {
                        e.currentTarget.style.borderBottomColor = 'rgba(201,168,76,0.65)'
                      }}
                      onBlur={e => {
                        e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.15)'
                      }}
                    />
                    <button
                      type="submit"
                      className={cn(
                        'group flex items-center gap-2 font-bold text-sm px-5 py-2.5 rounded-lg transition-all flex-shrink-0',
                        'bg-[#C9A84C] text-[#0B1F3A] hover:brightness-110 hover:scale-[1.03]',
                      )}
                    >
                      Start Planning
                      <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </button>
                  </div>
                </div>
              </form>

              {/* Quick destination pills */}
              <div className="flex flex-wrap gap-2.5">
                {QUICK.map(({ label, value }) => (
                  <button
                    key={value}
                    onClick={() => handleQuick(value)}
                    className={cn(
                      'text-sm px-4 py-1.5 rounded-full font-medium transition-all duration-200',
                      'border border-[#C9A84C]/40 text-white/55',
                      'hover:bg-[#C9A84C] hover:text-[#0B1F3A] hover:border-[#C9A84C]',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ────────── RIGHT COLUMN ───────────────────────────────────────── */}
          <div className="flex flex-col items-center gap-8">

            {/* Jade avatar with pulsing glow ring */}
            <div ref={avatarRef} className="flex flex-col items-center gap-4">
              <div className="relative">

                {/* Outer ping ring */}
                <div
                  className="absolute rounded-full border border-[#C9A84C]/25 animate-ping"
                  style={{
                    inset: '-18px',
                    animationDuration: '3s',
                  }}
                />

                {/* Static ring */}
                <div
                  className="absolute rounded-full border border-[#C9A84C]/20"
                  style={{ inset: '-9px' }}
                />

                {/* Avatar circle */}
                <div
                  className="w-[180px] h-[180px] lg:w-[280px] lg:h-[280px] rounded-full overflow-hidden relative z-10"
                  style={{
                    background: 'radial-gradient(circle at 50% 30%, #dceaf5 0%, #c8dff0 60%, #a8cce8 100%)',
                    border:    '2.5px solid rgba(201,168,76,0.55)',
                    boxShadow:
                      '0 0 80px rgba(201,168,76,0.22), 0 0 160px rgba(201,168,76,0.10), inset 0 0 30px rgba(201,168,76,0.06)',
                  }}
                >
                  <Image
                    src="/jade-avatar.jpg"
                    alt="Jade — Your AI Travel Advisor"
                    fill
                    className="object-cover"
                    style={{ objectPosition: '50% 8%' }}
                    sizes="(max-width: 1024px) 180px, 280px"
                    priority
                  />
                </div>
              </div>

              {/* Name */}
              <div className="text-center">
                <p className="text-white font-bold tracking-[0.22em] uppercase text-sm">
                  Jade
                </p>
                <p className="text-[10px] font-semibold tracking-[0.18em] uppercase mt-0.5"
                  style={{ color: 'rgba(201,168,76,0.7)' }}>
                  Your AI Travel Advisor
                </p>
              </div>
            </div>

            {/* Itinerary preview card */}
            <div
              ref={cardRef}
              className="w-full max-w-[340px] rounded-2xl overflow-hidden"
              style={{
                background:     'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(20px)',
                border:         '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {/* Card header */}
              <div
                className="flex items-center gap-2.5 px-5 py-3.5"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
              >
                <span
                  className="w-2 h-2 rounded-full bg-[#C9A84C] flex-shrink-0 animate-pulse"
                  style={{ animationDuration: '2s' }}
                />
                <p className="text-white/50 text-xs">
                  Jade is building your itinerary
                  <LoadingDots />
                </p>
              </div>

              {/* Crossfading content */}
              <div
                className="px-5 py-5 transition-opacity"
                style={{
                  opacity:          fading ? 0 : 1,
                  transitionDuration: '600ms',
                }}
              >
                {/* Destination header */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl leading-none">{preview.flag}</span>
                  <div>
                    <p className="text-white font-bold text-sm leading-none">{preview.city}</p>
                    <p className="text-white/40 text-[11px] mt-1">{preview.duration}</p>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-white/8 mb-4" style={{ background: 'rgba(255,255,255,0.08)' }} />

                {/* Days */}
                <div className="space-y-4">
                  {preview.days.map(day => (
                    <div key={day.n}>
                      <p className="text-[10px] font-bold tracking-wider uppercase mb-1.5"
                        style={{ color: 'rgba(201,168,76,0.85)' }}>
                        Day {day.n} — {day.title}
                      </p>
                      <div className="space-y-0.5 pl-0.5">
                        {day.items.map((item, i) => (
                          <p key={i} className="text-white/52 text-[11px] leading-relaxed"
                            style={{ color: 'rgba(255,255,255,0.52)' }}>
                            {item}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Progress dots */}
              <div
                className="flex items-center justify-center gap-2 py-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
              >
                {PREVIEWS.map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full transition-all duration-300"
                    style={{
                      width:      i === previewIdx ? '16px' : '6px',
                      height:     '6px',
                      background: i === previewIdx ? '#C9A84C' : 'rgba(255,255,255,0.2)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Trust strip ───────────────────────────────────────────────────── */}
        <div
          ref={trustRef}
          className="mt-16 lg:mt-24 flex flex-wrap items-center justify-center gap-8 lg:gap-20 pt-10"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          {TRUST.map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-2.5">
              <span className="text-lg" style={{ color: '#C9A84C' }}>{icon}</span>
              <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.38)' }}>
                {text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Loading dots animation ────────────────────────────────────────────────────
function LoadingDots() {
  const [dots, setDots] = useState('.')
  useEffect(() => {
    const id = setInterval(() => {
      setDots(d => d.length >= 3 ? '.' : d + '.')
    }, 500)
    return () => clearInterval(id)
  }, [])
  return <span className="inline-block w-4">{dots}</span>
}
