'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import Script from 'next/script'
import { ArrowRight, Check, Mail, Gift, Rss } from 'lucide-react'

// ── Above-fold — always in the initial bundle ─────────────────────────────────
import { MultiSlideHero } from '@/components/home/MultiSlideHero'
import { MarqueeStrip }   from '@/components/home/MarqueeStrip'
import TrustBox           from '@/components/trustpilot/TrustBox'

// ── Below-fold — code-split into separate lazy chunks ─────────────────────────
const dyn = <T extends Record<string, React.ComponentType>>(
  loader: () => Promise<T>,
  key: keyof T,
) => dynamic(() => loader().then(m => ({ default: m[key] as React.ComponentType })))

const StatsStrip              = dyn(() => import('@/components/home/StatsStrip'),              'StatsStrip')
const ToursHighlight          = dyn(() => import('@/components/home/ToursHighlight'),          'ToursHighlight')
const VisaIntelligenceSection = dyn(() => import('@/components/home/VisaIntelligenceSection'), 'VisaIntelligenceSection')
const EsimBanner              = dyn(() => import('@/components/home/EsimBanner'),              'EsimBanner')
const JadePlannerSection      = dyn(() => import('@/components/home/JadePlannerSection'),      'JadePlannerSection')
const TestimonialsSection     = dyn(() => import('@/components/home/TestimonialsSection'),     'TestimonialsSection')
const JadeSection             = dyn(() => import('@/components/home/JadeSection'),             'JadeSection')
const TopSellers              = dynamic(() => import('@/components/home/TopSellers'),           { ssr: false })
const FinalCTA                = dyn(() => import('@/components/home/FinalCTA'),                'FinalCTA')

// ── Types ─────────────────────────────────────────────────────────────────────

interface SoroArticle { id: string; title: string; slug: string; date: string }

interface FeaturedDestination {
  city: string
  country: string
  tag: string
  image: string
  flightFrom: string
  hotelFrom: string
  visaFrom?: string
}

const FALLBACK_DESTINATIONS: FeaturedDestination[] = [
  { city: 'London',   country: 'UK',       tag: 'MOST VISITED', image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&auto=format&fit=crop', flightFrom: '£89',  hotelFrom: '£120/night', visaFrom: '£120' },
  { city: 'Dubai',    country: 'UAE',      tag: 'HOT DEAL',     image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&auto=format&fit=crop', flightFrom: '£280', hotelFrom: '£89/night',  visaFrom: '£80'  },
  { city: 'Toronto',  country: 'Canada',   tag: 'POPULAR',      image: 'https://images.unsplash.com/photo-1517090504586-fde19ea6066f?w=800&auto=format&fit=crop', flightFrom: '£380', hotelFrom: '£95/night',  visaFrom: '£150' },
  { city: 'New York', country: 'USA',      tag: 'POPULAR',      image: 'https://images.unsplash.com/photo-1522083165195-3424ed129620?w=800&auto=format&fit=crop', flightFrom: '£420', hotelFrom: '£180/night', visaFrom: '£160' },
  { city: 'Lagos',    country: 'Nigeria',  tag: 'BEST VALUE',   image: 'https://images.unsplash.com/photo-1555990793-da11153b2473?w=800&auto=format&fit=crop', flightFrom: '£580', hotelFrom: '£65/night',  visaFrom: '£60'  },
  { city: 'Accra',    country: 'Ghana',    tag: 'NEW ROUTE',    image: 'https://images.unsplash.com/photo-1597149374936-796cb7d85a06?w=800&auto=format&fit=crop', flightFrom: '£620', hotelFrom: '£55/night',  visaFrom: '£60'  },
]

const BLOG_FALLBACKS: Record<string, string> = {
  'VISA GUIDE':        'https://images.unsplash.com/photo-1529400971008-f566de0e6dfc?w=800&auto=format&fit=crop',
  'DESTINATION GUIDE': 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&auto=format&fit=crop',
  'TOUR GUIDE':        'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&auto=format&fit=crop',
  default:             'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&auto=format&fit=crop',
}

const ARTICLE_KEYWORD_IMAGES: [string, string][] = [
  ['flight',    'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80&fit=crop'],
  ['solo',      'https://images.unsplash.com/photo-1501426026826-31c667bdf23d?w=800&q=80&fit=crop'],
  ['interview', 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&q=80&fit=crop'],
  ['canada',    'https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=800&q=80&fit=crop'],
  ['dubai',     'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=80&fit=crop'],
  ['schengen',  'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&q=80&fit=crop'],
  ['uk',        'https://images.unsplash.com/photo-1548013146-72479768bada?w=800&q=80&fit=crop'],
  ['refusal',   'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&q=80&fit=crop'],
  ['hotel',     'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80&fit=crop'],
  ['europe',    'https://images.unsplash.com/photo-1515859005217-8a1f08870f59?w=800&q=80&fit=crop'],
  ['visa',      'https://images.unsplash.com/photo-1529400971008-f566de0e6dfc?w=800&q=80&fit=crop'],
  ['travel',    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80&fit=crop'],
]

const ARTICLE_FALLBACK_POOL = [
  'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1503220317375-aaad61436b1b?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1548013146-72479768bada?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=800&q=80&fit=crop',
]

function getArticleImage(title: string, idx: number): string {
  const t = title.toLowerCase()
  for (const [keyword, url] of ARTICLE_KEYWORD_IMAGES) {
    if (t.includes(keyword)) return url
  }
  return ARTICLE_FALLBACK_POOL[idx % ARTICLE_FALLBACK_POOL.length]
}

function getArticleCategory(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('flight') || t.includes('airline') || t.includes('book'))   return 'FLIGHTS'
  if (t.includes('hotel') || t.includes('stay') || t.includes('accommod'))   return 'HOTELS'
  if (t.includes('canada'))   return 'CANADA VISA'
  if (t.includes('dubai') || t.includes('uae'))  return 'DUBAI'
  if (t.includes('schengen')) return 'SCHENGEN'
  if (t.includes('uk') || t.includes('britain')) return 'UK VISA'
  if (t.includes('solo'))     return 'TRAVEL TIPS'
  if (t.includes('itinerar') || t.includes('guide') || t.includes('days'))  return 'DESTINATION'
  return 'VISA GUIDE'
}

export default function HomePage() {
  const [articles,     setArticles]     = useState<SoroArticle[]>([])
  const [nlEmail,      setNlEmail]      = useState('')
  const [nlStatus,     setNlStatus]     = useState<'idle' | 'loading' | 'success' | 'error' | 'exists'>('idle')
  const [destinations, setDestinations] = useState<FeaturedDestination[]>(FALLBACK_DESTINATIONS)

  useEffect(() => {
    fetch('/api/destinations')
      .then(r => r.json())
      .then((dest: unknown) => {
        if (Array.isArray(dest) && dest.length > 0) setDestinations(dest as FeaturedDestination[])
      })
      .catch(() => {})
  }, [])

  async function handleNewsletterSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nlEmail) return
    setNlStatus('loading')
    try {
      const res  = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: nlEmail }),
      })
      const data = await res.json()
      if (!res.ok) { setNlStatus('error'); return }
      setNlStatus(data.alreadySubscribed ? 'exists' : 'success')
    } catch {
      setNlStatus('error')
    }
  }

  useEffect(() => {
    fetch('/api/soro-articles')
      .then(r => r.json())
      .then(d => setArticles(d.articles ?? []))
      .catch(() => {})
  }, [])

  return (
    <>
      <Script
        id="org-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": ["TravelAgency", "Organization"],
                "@id": "https://www.walztravels.com/#organization",
                "name": "Walz Travels",
                "url": "https://www.walztravels.com",
                "logo": {
                  "@type": "ImageObject",
                  "url": "https://www.walztravels.com/logo.png",
                  "width": 400,
                  "height": 100
                },
                "description": "Expert visa processing, flight bookings, hotels and private tours across UK, Canada, UAE, Nigeria and Ghana.",
                "telephone": "+12317902336",
                "email": "contact@walztravels.com",
                "areaServed": ["GB", "CA", "AE", "NG", "GH"],
                "serviceType": ["Visa Processing", "Flight Booking", "Hotel Booking", "Private Tours"],
                "sameAs": [
                  "https://www.facebook.com/walztravels",
                  "https://www.instagram.com/walztravels",
                  "https://www.linkedin.com/company/walztravels",
                  "https://twitter.com/walztravels"
                ],
                "contactPoint": {
                  "@type": "ContactPoint",
                  "telephone": "+12317902336",
                  "contactType": "customer service",
                  "availableLanguage": ["English"]
                }
              },
              {
                "@type": "WebSite",
                "@id": "https://www.walztravels.com/#website",
                "url": "https://www.walztravels.com",
                "name": "Walz Travels",
                "publisher": { "@id": "https://www.walztravels.com/#organization" },
                "potentialAction": {
                  "@type": "SearchAction",
                  "target": {
                    "@type": "EntryPoint",
                    "urlTemplate": "https://www.walztravels.com/flights/search?from={from}&to={to}&depart={date}"
                  },
                  "query-input": "required name=from required name=to required name=date"
                }
              }
            ]
          })
        }}
      />

      {/* 1 — Fullscreen 3-scene rotating hero */}
      <MultiSlideHero />

      {/* 2 — Scrolling marquee strip */}
      <MarqueeStrip />

      {/* 4 — Animated statistics */}
      <StatsStrip />

      {/* 5 — Featured destination showcase */}
      <section className="py-16 md:py-20 px-4 md:px-6 bg-[#060f1e]">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-8 md:mb-10">
            <div>
              <p className="text-amber-400 text-xs uppercase tracking-[0.2em] font-medium mb-3">
                FEATURED DESTINATIONS
              </p>
              <h2 className="text-white text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
                Where will you go next?
              </h2>
            </div>
            <Link
              href="/flights"
              className="hidden md:flex items-center gap-2 text-white/40 text-sm hover:text-amber-400 transition-colors group"
            >
              Explore all
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
            {destinations.map((dest) => (
              <div
                key={dest.city}
                className="relative rounded-2xl overflow-hidden aspect-[3/4] sm:aspect-square group cursor-pointer"
              >
                <Image
                  src={dest.image}
                  alt={dest.city}
                  fill
                  sizes="(max-width: 640px) 50vw, 33vw"
                  className="object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)',
                  }}
                />

                {/* Tag */}
                <div className="absolute top-4 left-4 bg-amber-500 text-black text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
                  {dest.tag}
                </div>

                {/* Content */}
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-5">
                  <p className="text-white/50 text-xs uppercase tracking-widest mb-1">{dest.country}</p>
                  <h3 className="text-white font-bold text-lg sm:text-2xl mb-2 sm:mb-3 leading-tight">{dest.city}</h3>
                  <div className="flex gap-3 mb-3">
                    <span className="text-amber-400 text-xs font-medium">✈ from {dest.flightFrom}</span>
                    <span className="text-white/40 text-xs">🏨 {dest.hotelFrom}</span>
                  </div>
                  {/* Action buttons — appear on hover */}
                  <div className="flex gap-2 opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                    <Link
                      href={`/flights?to=${encodeURIComponent(dest.city)}`}
                      className="flex-1 text-center py-2.5 rounded-xl text-xs font-semibold
                        bg-white/15 backdrop-blur-sm hover:bg-amber-500 hover:text-black
                        text-white transition-all"
                    >
                      ✈ Flights
                    </Link>
                    <Link
                      href={`/hotels?destination=${encodeURIComponent(dest.city)}`}
                      className="flex-1 text-center py-2.5 rounded-xl text-xs font-semibold
                        bg-white/15 backdrop-blur-sm hover:bg-amber-500 hover:text-black
                        text-white transition-all"
                    >
                      🏨 Hotels
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8 md:hidden">
            <Link
              href="/flights"
              className="inline-flex items-center gap-2 text-amber-400 text-sm border border-amber-500/30 px-6 py-3 rounded-xl hover:bg-amber-500/10 transition-all"
            >
              Explore all destinations →
            </Link>
          </div>
        </div>
      </section>

      {/* 6 — Tours highlight */}
      <ToursHighlight />

      {/* 7 — Visa intelligence */}
      <VisaIntelligenceSection />

      {/* 8 — Jade Connect eSIM banner */}
      <EsimBanner />

      {/* 9 — Jade AI Trip Planner */}
      <JadePlannerSection />

      {/* 10 — Testimonials */}
      <TestimonialsSection />

      {/* Trustpilot widget — follows testimonials as verified social proof */}
      <section className="py-10 bg-[#060f1e] border-t border-white/5">
        <div className="max-w-2xl mx-auto px-5 flex flex-col items-center gap-4">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Verified reviews on Trustpilot</p>
          <TrustBox variant="collector" theme="light" className="w-full" />
          <a
            href="https://www.trustpilot.com/review/walztravels.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-[#C9A84C] transition-colors"
          >
            Review us on Trustpilot ↗
          </a>
        </div>
      </section>

      {/* 12 — Jade AI introduction */}
      <JadeSection />

      {/* 13 — Top selling packages */}
      <TopSellers />

      {/* 15 — Blog preview */}
      <section className="py-16 lg:py-20 bg-[#060f1e] border-t border-white/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Rss className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="text-amber-400 text-[11px] font-semibold tracking-[0.2em] uppercase">
                  Travel Blog
                </span>
              </div>
              <h2 className="font-display text-2xl lg:text-3xl font-bold text-white">
                Travel Tips &amp; Visa Guides
              </h2>
            </div>
            <Link
              href="/blog"
              className="hidden md:flex items-center gap-2 text-sm font-semibold text-white/50 hover:text-amber-400 transition-colors"
            >
              View All Articles →
            </Link>
          </div>

          {(() => {
            const posts = articles.length > 0 ? articles.map((a, i) => ({
              id: a.id, title: a.title, slug: a.slug, date: a.date,
              image: getArticleImage(a.title, i),
              category: getArticleCategory(a.title),
            })) : [
              { id: 'p1', title: 'UK Visa Guide 2026 — Everything You Need to Know',  slug: 'uk-visa-tips',       date: 'Jun 2026', image: getArticleImage('uk visa guide', 0),    category: 'UK VISA'    },
              { id: 'p2', title: 'Canada Visitor Visa & eTA Guide 2026',              slug: 'canada-visitor-visa', date: 'Jun 2026', image: getArticleImage('canada visitor', 1),   category: 'CANADA VISA' },
              { id: 'p3', title: 'Dubai in 5 Days — The Ultimate Itinerary',          slug: 'dubai-5-days',        date: 'May 2026', image: getArticleImage('dubai days itinerary', 2), category: 'DESTINATION' },
            ]
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {posts.slice(0, 3).map((a, i) => (
                  <Link
                    key={a.id}
                    href={`/blog?post=${a.slug}`}
                    className="group relative rounded-2xl overflow-hidden block h-64 md:h-72"
                  >
                    <Image
                      src={a.image}
                      alt={a.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <span className="inline-block bg-amber-500 text-black text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full mb-2">
                        {a.category}
                      </span>
                      <h3 className="text-white font-bold text-sm md:text-base leading-tight line-clamp-2 group-hover:text-amber-300 transition-colors">
                        {a.title}
                      </h3>
                      <p className="text-white/50 text-xs mt-1.5 font-medium">{a.date}</p>
                    </div>
                    <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-amber-400/50 transition-colors pointer-events-none" />
                  </Link>
                ))}
              </div>
            )
          })()}

          <div className="mt-6 md:hidden">
            <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-white/60 border border-white/15 px-5 py-2.5 rounded-lg hover:border-amber-500/40 hover:text-amber-400 transition-colors">
              View All Articles <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 16 — Gift voucher banner */}
      <section className="bg-[#C9A84C] py-12 lg:py-16">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-5">
              <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-[#0B1F3A]/20 items-center justify-center flex-shrink-0">
                <Gift className="w-7 h-7 text-[#0B1F3A]" />
              </div>
              <div>
                <h2 className="font-display text-2xl lg:text-3xl font-bold text-[#0B1F3A] mb-1">
                  Give the Gift of Travel
                </h2>
                <p className="text-[#0B1F3A]/70 text-base max-w-md leading-relaxed">
                  Flights, visas and tours — the perfect gift for any occasion
                </p>
              </div>
            </div>
            <Link href="/gift" className="flex-shrink-0">
              <button className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-[#0B1F3A] hover:bg-[#0d2345] text-white font-semibold text-sm rounded-full transition-colors shadow-lg">
                <Gift className="w-4 h-4" />
                Shop Gift Vouchers
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* 17 — Newsletter */}
      <section className="py-16 bg-[#0a1628] border-t border-white/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-amber-500/20">
              <Mail className="w-6 h-6 text-black" />
            </div>
            <h2 className="font-display text-2xl lg:text-3xl font-bold text-white mb-3">
              Get Exclusive Travel Deals
            </h2>
            <p className="text-white/40 mb-6">
              Subscribe to receive hand-picked deals, travel inspiration and exclusive offers.
            </p>
            {nlStatus === 'success' ? (
              <div className="max-w-md mx-auto py-3 px-5 bg-green-900/30 border border-green-500/30 rounded-full text-green-400 text-sm font-medium">
                Thank you — you are on the list.
              </div>
            ) : nlStatus === 'exists' ? (
              <div className="max-w-md mx-auto py-3 px-5 bg-white/5 border border-amber-500/20 rounded-full text-white/50 text-sm">
                You are already on the list — we&apos;ll keep the deals coming!
              </div>
            ) : (
              <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto" onSubmit={handleNewsletterSubmit}>
                <input
                  type="email"
                  value={nlEmail}
                  onChange={e => setNlEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 h-11 px-4 border border-white/10 rounded-full text-sm outline-none focus:border-amber-500/50 bg-white/5 text-white placeholder:text-white/25"
                  required
                  disabled={nlStatus === 'loading'}
                />
                <button
                  type="submit"
                  disabled={nlStatus === 'loading'}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-full transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {nlStatus === 'loading' ? 'Subscribing…' : 'Subscribe'}
                </button>
              </form>
            )}
            {nlStatus === 'error' && (
              <p className="text-red-400 text-xs mt-2 text-center">Something went wrong. Please try again.</p>
            )}
            <div className="flex items-center justify-center gap-4 mt-5 text-xs text-white/25">
              {['Join our travel community', 'Weekly deals', 'Exclusive offers'].map(item => (
                <div key={item} className="flex items-center gap-1">
                  <Check className="w-3 h-3 text-amber-400" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 19 — New dark CTA */}
      <section className="py-24 px-4 bg-gradient-to-br from-[#0d1e35] to-[#0a1628] border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-amber-400 text-xs uppercase tracking-[0.2em] mb-4">READY TO TRAVEL?</p>
          <h2 className="text-white text-3xl md:text-4xl lg:text-5xl font-bold mb-5 leading-tight">
            Let&apos;s plan your <span className="text-amber-400">perfect trip.</span>
          </h2>
          <p className="text-white/45 text-base leading-relaxed mb-10 max-w-lg mx-auto">
            Flights, visas, hotels and tours — all handled by our expert team.
            Speak to a real person, today.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/visa"
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm
                px-8 py-4 rounded-xl transition-all shadow-xl shadow-amber-500/25 active:scale-[0.97]"
            >
              Apply for Visa →
            </Link>
            <Link
              href="/flights"
              className="bg-white/8 hover:bg-white/12 text-white font-semibold text-sm
                px-8 py-4 rounded-xl transition-all border border-white/12 active:scale-[0.97]"
            >
              Search Flights
            </Link>
            <Link
              href="/hotels"
              className="bg-white/8 hover:bg-white/12 text-white font-semibold text-sm
                px-8 py-4 rounded-xl transition-all border border-white/12 active:scale-[0.97]"
            >
              Find Hotels
            </Link>
          </div>
          <p className="text-white/20 text-xs mt-6">Or chat with Jade — available 24/7 ↓</p>
        </div>
      </section>

      {/* 20 — Final cinematic CTA */}
      <FinalCTA />
    </>
  )
}
