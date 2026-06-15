'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Search, MapPin, Calendar, Users, ChevronDown, ArrowRight, Compass } from 'lucide-react'

// ─── Category data with cinematic imagery ────────────────────────────────────
const CATEGORIES = [
  {
    id:       'beach',
    label:    'Beach & Water',
    emoji:    '🏊',
    tagline:  'Dive into the deep',
    sub:      'Snorkelling · Diving · Sailing · Surfing',
    image:    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=85',
    color:    'from-blue-900/80',
  },
  {
    id:       'culture',
    label:    'Culture & History',
    emoji:    '🏛️',
    tagline:  'Walk through time',
    sub:      'Museums · Temples · Guided tours · Heritage',
    image:    'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=800&q=85',
    color:    'from-amber-900/80',
  },
  {
    id:       'wildlife',
    label:    'Wildlife & Safari',
    emoji:    '🦁',
    tagline:  'The wild calls',
    sub:      'Safaris · Bird watching · Conservation · Game drives',
    image:    'https://images.unsplash.com/photo-1516426122078-c23e76319801?w=800&q=85',
    color:    'from-green-900/80',
  },
  {
    id:       'adventure',
    label:    'Adventure & Sports',
    emoji:    '🧗',
    tagline:  'Push your limits',
    sub:      'Skydiving · Hiking · Rafting · Paragliding',
    image:    'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=85',
    color:    'from-red-900/80',
  },
  {
    id:       'food',
    label:    'Food & Drink',
    emoji:    '🍽️',
    tagline:  'Taste the world',
    sub:      'Cooking classes · Wine tours · Street food · Tastings',
    image:    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=85',
    color:    'from-orange-900/80',
  },
  {
    id:       'air',
    label:    'Helicopter & Air',
    emoji:    '🚁',
    tagline:  'Rise above it all',
    sub:      'Heli tours · Hot air balloons · Private flights',
    image:    'https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=800&q=85',
    color:    'from-slate-900/80',
  },
]

// ─── Featured experiences ─────────────────────────────────────────────────────
const FEATURED = [
  {
    title:       'Serengeti Safari — 3 Days',
    location:    'Tanzania',
    price:       'From USD 890',
    badge:       'Bestseller',
    description: 'Witness the Great Migration. Stay in a luxury tented camp under infinite stars.',
    image:       'https://images.unsplash.com/photo-1523805009345-7448845a9e53?w=900&q=90',
    duration:    '3 days · 2 nights',
    category:    'Wildlife & Safari',
  },
  {
    title:       'Dubai Desert Sunset Experience',
    location:    'UAE',
    price:       'From AED 350',
    badge:       'Top Rated',
    description: 'Dune bashing, camel riding, and a traditional Bedouin dinner under the stars.',
    image:       'https://images.unsplash.com/photo-1451337516015-6b6e9a44a8a3?w=900&q=90',
    duration:    '6 hours',
    category:    'Adventure & Sports',
  },
  {
    title:       'Zanzibar Spice & Culture Tour',
    location:    'Tanzania',
    price:       'From USD 55',
    badge:       'Walz Pick',
    description: 'Stone Town walking tour, spice farm visit, and sunset dhow cruise included.',
    image:       'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=900&q=90',
    duration:    '8 hours',
    category:    'Culture & History',
  },
  {
    title:       'London Thames at Sunset — Private Boat',
    location:    'United Kingdom',
    price:       'From GBP 120',
    badge:       'Private',
    description: 'A champagne cruise past Tower Bridge, Big Ben, and the City skyline.',
    image:       'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=900&q=90',
    duration:    '2 hours',
    category:    'Beach & Water',
  },
]

// ─── Stats ────────────────────────────────────────────────────────────────────
const STATS = [
  { number: '150+', label: 'Countries' },
  { number: '12K+', label: 'Experiences' },
  { number: '4.8★', label: 'Avg Rating' },
  { number: '24/7', label: 'Support' },
]

export default function ActivitiesPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [destination,    setDestination]    = useState('')
  const [fromDate,       setFromDate]       = useState('')
  const [toDate,         setToDate]         = useState('')
  const [adults,         setAdults]         = useState(2)
  const [heroLoaded,     setHeroLoaded]     = useState(false)
  const [visibleStats,   setVisibleStats]   = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleStats(true) },
      { threshold: 0.3 }
    )
    if (statsRef.current) observer.observe(statsRef.current)
    return () => observer.disconnect()
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams({
      destination,
      from:   fromDate,
      to:     toDate,
      adults: String(adults),
      ...(activeCategory ? { category: activeCategory } : {}),
    })
    window.location.href = `/activities/results?${params}`
  }

  return (
    <div className="bg-[#0B1F3A] min-h-screen">

      {/* ── CINEMATIC HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">

        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1920&q=90"
            alt="Adventures worldwide"
            fill
            priority
            className={`object-cover transition-all duration-[3000ms] ease-out
              ${heroLoaded ? 'scale-105 opacity-100' : 'scale-100 opacity-0'}`}
            onLoad={() => setHeroLoaded(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-[#0B1F3A]/30 to-[#0B1F3A]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/60 via-transparent to-[#0B1F3A]/40" />
        </div>

        {/* Floating particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-[#C9A84C]/30 rounded-full animate-pulse"
              style={{
                left:              `${10 + i * 8}%`,
                top:               `${20 + (i % 4) * 20}%`,
                animationDelay:    `${i * 0.4}s`,
                animationDuration: `${2 + i * 0.3}s`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-px w-12 bg-[#C9A84C]/60" />
            <span className="text-[#C9A84C] text-xs font-semibold uppercase tracking-[4px]">
              Tours &amp; Experiences
            </span>
            <div className="h-px w-12 bg-[#C9A84C]/60" />
          </div>

          <h1
            className="text-white font-bold leading-none mb-6"
            style={{ fontSize: 'clamp(3rem, 8vw, 7rem)' }}
          >
            The World Is{' '}
            <span className="text-[#C9A84C] italic">Full of</span>
            <br />Wonder
          </h1>

          <p className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            12,000+ curated experiences across 150 countries.
            Safari at dawn. Dive at dusk. Culture at noon.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={() => document.getElementById('search-form')?.scrollIntoView({ behavior: 'smooth' })}
              className="group flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A]
                font-bold px-8 py-4 rounded-full hover:bg-white transition-all duration-300
                text-sm uppercase tracking-widest"
            >
              <Search className="w-4 h-4" />
              Find Experiences
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-2 border border-white/30 text-white
                px-8 py-4 rounded-full hover:border-[#C9A84C] hover:text-[#C9A84C]
                transition-all duration-300 text-sm uppercase tracking-widest"
            >
              <Compass className="w-4 h-4" />
              Browse by type
            </button>
          </div>

          <div className="flex flex-col items-center gap-2 animate-bounce">
            <span className="text-white/30 text-xs tracking-widest uppercase">Discover</span>
            <ChevronDown className="w-5 h-5 text-white/30" />
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <div ref={statsRef} className="relative z-10 bg-[#0B1F3A]/95 border-y border-[#C9A84C]/20">
        <div className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              className={`text-center transition-all duration-700 ${
                visibleStats ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <p className="text-[#C9A84C] font-bold text-3xl md:text-4xl">{stat.number}</p>
              <p className="text-white/40 text-sm mt-1 uppercase tracking-wider">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── CATEGORY CARDS ── */}
      <section id="categories" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[#C9A84C] text-xs font-semibold uppercase tracking-[4px] mb-3">
              What moves you?
            </p>
            <h2 className="text-white font-bold" style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}>
              Choose your adventure
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORIES.map((cat, i) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                className={`group relative overflow-hidden rounded-2xl text-left transition-all duration-500
                  ${i === 0 ? 'md:col-span-2 lg:col-span-1' : ''}
                  ${activeCategory === cat.id
                    ? 'ring-2 ring-[#C9A84C] shadow-[0_0_40px_rgba(201,168,76,0.3)]'
                    : 'hover:shadow-2xl'}`}
                style={{ height: i < 2 ? '360px' : '280px' }}
              >
                <Image
                  src={cat.image}
                  alt={cat.label}
                  fill
                  loading="lazy"
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className={`absolute inset-0 bg-gradient-to-t ${cat.color} to-transparent
                  transition-opacity duration-300 group-hover:opacity-90`} />

                {activeCategory === cat.id && (
                  <div className="absolute top-4 right-4 w-7 h-7 bg-[#C9A84C] rounded-full
                    flex items-center justify-center text-xs font-bold text-[#0B1F3A]">
                    ✓
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="text-3xl mb-2">{cat.emoji}</div>
                  <h3 className="text-white font-bold text-xl mb-1">{cat.label}</h3>
                  <p className="text-white/60 text-sm italic mb-2">{cat.tagline}</p>
                  <p className={`text-white/40 text-xs transition-all duration-300
                    ${activeCategory === cat.id
                      ? 'opacity-100 max-h-8'
                      : 'opacity-0 max-h-0 overflow-hidden group-hover:opacity-100 group-hover:max-h-8'}`}>
                    {cat.sub}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── SEARCH FORM ── */}
      <section id="search-form" className="px-4 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
            <div className="text-center mb-8">
              <p className="text-[#C9A84C] text-xs uppercase tracking-[4px] mb-2">
                {activeCategory
                  ? `Searching: ${CATEGORIES.find(c => c.id === activeCategory)?.label}`
                  : 'All experiences'}
              </p>
              <h2 className="text-white font-bold text-2xl">Find your experience</h2>
            </div>

            <form onSubmit={handleSearch} className="space-y-4">
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#C9A84C]" />
                <input
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  placeholder="Where do you want to go? Dubai, Zanzibar, London…"
                  className="w-full bg-white/10 border border-white/20 rounded-2xl
                    pl-12 pr-4 py-4 text-white placeholder-white/30
                    focus:outline-none focus:border-[#C9A84C] transition-colors text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C9A84C]" />
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-white/10 border border-white/20 rounded-2xl
                      pl-11 pr-4 py-4 text-white text-sm
                      focus:outline-none focus:border-[#C9A84C] transition-colors [color-scheme:dark]"
                  />
                </div>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C9A84C]" />
                  <input
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    min={fromDate || new Date().toISOString().split('T')[0]}
                    className="w-full bg-white/10 border border-white/20 rounded-2xl
                      pl-11 pr-4 py-4 text-white text-sm
                      focus:outline-none focus:border-[#C9A84C] transition-colors [color-scheme:dark]"
                  />
                </div>
                <div className="relative">
                  <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C9A84C]" />
                  <select
                    value={adults}
                    onChange={e => setAdults(Number(e.target.value))}
                    className="w-full bg-white/10 border border-white/20 rounded-2xl
                      pl-11 pr-4 py-4 text-white text-sm appearance-none
                      focus:outline-none focus:border-[#C9A84C] transition-colors [color-scheme:dark]"
                  >
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <option key={n} value={n} className="bg-[#0B1F3A]">
                        {n} adult{n > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-4 rounded-2xl
                  hover:bg-white transition-all duration-300
                  text-sm uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                Search Activities
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ── FEATURED EXPERIENCES ── */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-12">
            <div>
              <p className="text-[#C9A84C] text-xs font-semibold uppercase tracking-[4px] mb-3">
                Handpicked for you
              </p>
              <h2 className="text-white font-bold" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 3rem)' }}>
                Experiences worth living
              </h2>
            </div>
            <button className="hidden md:flex items-center gap-2 text-[#C9A84C]
              text-sm hover:text-white transition-colors group">
              View all
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FEATURED.map((exp, i) => (
              <div
                key={exp.title}
                className={`group relative overflow-hidden rounded-3xl cursor-pointer
                  ${i === 0 ? 'md:row-span-2' : ''}`}
                style={{ minHeight: i === 0 ? '560px' : '260px' }}
              >
                <Image
                  src={exp.image}
                  alt={exp.title}
                  fill
                  loading="lazy"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                <div className="absolute top-4 left-4">
                  <span className="bg-[#C9A84C] text-[#0B1F3A] text-xs font-bold
                    px-3 py-1.5 rounded-full uppercase tracking-wider">
                    {exp.badge}
                  </span>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <p className="text-[#C9A84C] text-xs uppercase tracking-wider mb-2">
                    {exp.category} · {exp.duration}
                  </p>
                  <h3 className="text-white font-bold text-xl mb-2 leading-tight">{exp.title}</h3>
                  <p className="text-white/60 text-sm mb-4 leading-relaxed
                    opacity-0 group-hover:opacity-100 transition-opacity duration-300
                    max-h-0 group-hover:max-h-20 overflow-hidden">
                    {exp.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/40 text-xs flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {exp.location}
                      </p>
                      <p className="text-[#C9A84C] font-bold text-lg">{exp.price}</p>
                    </div>
                    <button className="bg-white/10 backdrop-blur-sm border border-white/20
                      text-white text-xs px-4 py-2 rounded-full
                      hover:bg-[#C9A84C] hover:text-[#0B1F3A] hover:border-[#C9A84C]
                      transition-all duration-300 font-semibold">
                      Explore →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── QUOTE BREAK ── */}
      <section className="relative py-32 overflow-hidden">
        <Image
          src="https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1920&q=80"
          alt="Journey"
          fill
          loading="lazy"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[#0B1F3A]/80 backdrop-blur-[2px]" />
        <div className="relative z-10 text-center px-4 max-w-3xl mx-auto">
          <p className="text-[#C9A84C] text-xs uppercase tracking-[6px] mb-6">A thought</p>
          <blockquote
            className="text-white font-bold leading-tight mb-8"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)' }}
          >
            &ldquo;Travel is the only thing you buy that makes you richer.&rdquo;
          </blockquote>
          <p className="text-white/40 text-sm">— Unknown</p>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-[#C9A84C] text-xs uppercase tracking-[4px] mb-4">Ready?</p>
          <h2
            className="text-white font-bold mb-6"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
          >
            Your next story<br />starts here
          </h2>
          <p className="text-white/40 text-base mb-10 leading-relaxed">
            Tell Jade where you want to go. We&apos;ll handle visa, flights,
            hotels, and the experience — everything in one booking.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://wa.me/447398753797?text=Hi%2C%20I%20want%20to%20book%20an%20activity%20or%20experience"
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 bg-[#C9A84C] text-[#0B1F3A]
                font-bold px-8 py-4 rounded-full hover:bg-white transition-all duration-300
                text-sm uppercase tracking-widest"
            >
              Chat with Jade
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <button
              onClick={() => document.getElementById('search-form')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-2 border border-[#C9A84C]/40 text-[#C9A84C]
                px-8 py-4 rounded-full hover:border-[#C9A84C] transition-all duration-300
                text-sm uppercase tracking-widest"
            >
              Search activities
            </button>
          </div>
        </div>
      </section>

    </div>
  )
}
