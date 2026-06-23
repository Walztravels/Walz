'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowRight, Check, Mail, Gift, Rss } from 'lucide-react'
import { FlightPriceAlert } from '@/components/FlightPriceAlert'
import { cn } from '@/lib/utils'

// ── Above-fold — always in the initial bundle ─────────────────────────────────
import { MultiSlideHero } from '@/components/home/MultiSlideHero'
import { MarqueeStrip }   from '@/components/home/MarqueeStrip'

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
const WhyWalzSection          = dyn(() => import('@/components/home/WhyWalzSection'),          'WhyWalzSection')
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
  { city: 'London',   country: 'UK',       tag: 'MOST VISITED', image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800', flightFrom: '£89',  hotelFrom: '£120/night', visaFrom: '£120' },
  { city: 'Dubai',    country: 'UAE',      tag: 'HOT DEAL',     image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800', flightFrom: '£280', hotelFrom: '£89/night',  visaFrom: '£80'  },
  { city: 'Toronto',  country: 'Canada',   tag: 'POPULAR',      image: 'https://images.unsplash.com/photo-1517090504586-fde19ea6066f?w=800', flightFrom: '£380', hotelFrom: '£95/night',  visaFrom: '£150' },
  { city: 'New York', country: 'USA',      tag: 'POPULAR',      image: 'https://images.unsplash.com/photo-1522083165195-3424ed129620?w=800', flightFrom: '£420', hotelFrom: '£180/night', visaFrom: '£160' },
  { city: 'Lagos',    country: 'Nigeria',  tag: 'BEST VALUE',   image: 'https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=800', flightFrom: '£580', hotelFrom: '£65/night',  visaFrom: '£60'  },
  { city: 'Accra',    country: 'Ghana',    tag: 'NEW ROUTE',    image: 'https://images.unsplash.com/photo-1569930784967-359c1a5ae0dc?w=800', flightFrom: '£620', hotelFrom: '£55/night',  visaFrom: '£60'  },
]

const SERVICE_PILLS = [
  { label: '✈ Flights',       sub: '900+ airlines',   href: '/flights'  },
  { label: '📋 Visas',        sub: '199 countries',   href: '/visa'     },
  { label: '🏨 Hotels',       sub: '500K+ hotels',    href: '/hotels'   },
  { label: '🗺 Experiences',  sub: 'Private & group', href: '/tours'    },
  { label: '📱 eSIM',         sub: '150+ countries',  href: '/esim'     },
  { label: '🎁 Gift Vouchers', sub: 'For loved ones', href: '/gift'     },
]

export default function HomePage() {
  const [articles,     setArticles]     = useState<SoroArticle[]>([])
  const [nlEmail,      setNlEmail]      = useState('')
  const [nlStatus,     setNlStatus]     = useState<'idle' | 'loading' | 'success' | 'error' | 'exists'>('idle')
  const [destinations, setDestinations] = useState<FeaturedDestination[]>(FALLBACK_DESTINATIONS)

  useEffect(() => {
    fetch('/api/public/homepage')
      .then(r => r.json())
      .then((d: { content?: { destinations?: FeaturedDestination[] } }) => {
        const dest = d.content?.destinations
        if (Array.isArray(dest) && dest.length > 0) setDestinations(dest)
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
      {/* 1 — Fullscreen 3-scene rotating hero */}
      <MultiSlideHero />

      {/* 2 — Service pills */}
      <section className="py-8 bg-[#060f1e] border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-wrap gap-3 justify-center">
            {SERVICE_PILLS.map(s => (
              <Link
                key={s.href}
                href={s.href}
                className="group flex items-center gap-3
                  bg-[#0d1e35] hover:bg-[#112240]
                  border border-white/6 hover:border-amber-500/25
                  rounded-2xl px-5 py-3.5 transition-all duration-200"
              >
                <div>
                  <p className="text-white text-sm font-medium leading-tight group-hover:text-amber-400 transition-colors">
                    {s.label}
                  </p>
                  <p className="text-white/35 text-xs mt-0.5">{s.sub}</p>
                </div>
                <span className="text-white/15 group-hover:text-amber-400/40 group-hover:translate-x-0.5 transition-all text-sm ml-1">
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 3 — Scrolling marquee strip */}
      <MarqueeStrip />

      {/* 4 — Animated statistics */}
      <StatsStrip />

      {/* 5 — Featured destination showcase */}
      <section className="py-20 bg-[#060f1e]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-amber-400 text-xs uppercase tracking-[0.2em] font-medium mb-3">
                FEATURED DESTINATIONS
              </p>
              <h2 className="text-white text-4xl md:text-5xl font-bold leading-tight">
                Where will<br />you go next?
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

          {/* 3-column grid — first card taller on desktop */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {destinations.map((dest, i) => (
              <div
                key={dest.city}
                className={cn(
                  'group relative rounded-3xl overflow-hidden cursor-pointer',
                  i === 0 ? 'aspect-[3/4] md:row-span-2 md:aspect-auto' : 'aspect-[3/4]',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={dest.image}
                  alt={dest.city}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                  loading="lazy"
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
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <p className="text-white/50 text-xs uppercase tracking-widest mb-1">{dest.country}</p>
                  <h3 className="text-white font-bold text-2xl mb-3 leading-tight">{dest.city}</h3>
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

      {/* 11 — Why Walz alternating sections */}
      <WhyWalzSection />

      {/* 12 — Jade AI introduction */}
      <JadeSection />

      {/* 13 — Top selling packages */}
      <TopSellers />

      {/* 14 — Flight price alerts */}
      <section className="py-12 px-4 max-w-2xl mx-auto">
        <FlightPriceAlert />
      </section>

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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {(articles.length > 0 ? articles.map(a => ({
              id: a.id, title: a.title, slug: a.slug, date: a.date,
              image: (a as { imageUrl?: string }).imageUrl ?? 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=600&q=80&auto=format&fit=crop',
              category: (a as { category?: string }).category ?? 'VISA GUIDE',
              readTime: (a as { readTime?: string }).readTime ?? '5 min read',
            })) : [
              { id: 'p1', title: 'UK Visa Guide 2026 — Everything You Need to Know', slug: 'uk-visa-tips', date: 'Jun 2026', image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&q=80&auto=format&fit=crop', category: 'VISA GUIDE', readTime: '8 min read' },
              { id: 'p2', title: 'Canada Visitor Visa & eTA Guide 2026', slug: 'canada-visitor-visa', date: 'Jun 2026', image: 'https://images.unsplash.com/photo-1503549207964-47dfe6cef5d0?w=600&q=80&auto=format&fit=crop', category: 'VISA GUIDE', readTime: '7 min read' },
              { id: 'p3', title: 'Dubai in 5 Days — The Ultimate Itinerary', slug: 'dubai-5-days', date: 'May 2026', image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600&q=80&auto=format&fit=crop', category: 'DESTINATION GUIDE', readTime: '10 min read' },
            ]).map(a => (
              <Link
                key={a.id}
                href={`/blog?post=${a.slug}`}
                className="group block rounded-2xl overflow-hidden bg-[#0d1e35] border border-white/8 hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/5 transition-all duration-300"
              >
                <div className="relative aspect-[3/2] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.image}
                    alt={a.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="text-[10px] font-bold tracking-widest uppercase bg-amber-500 text-black px-2.5 py-1 rounded-full">
                      {a.category}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-xs text-white/30 mb-2 flex items-center gap-2">
                    <span>{a.date}</span>
                    <span>·</span>
                    <span>{a.readTime}</span>
                  </p>
                  <h3 className="text-sm font-bold text-white leading-snug line-clamp-2 group-hover:text-amber-400 transition-colors">
                    {a.title}
                  </h3>
                  <p className="text-xs text-white/35 mt-2 flex items-center gap-1 font-medium">
                    Read More <ArrowRight className="w-3 h-3" />
                  </p>
                </div>
              </Link>
            ))}
          </div>

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

      {/* 18 — SEO content section */}
      <section className="bg-[#060f1e] py-20 px-4 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-16">
            <div className="space-y-6">
              <h2 className="text-3xl font-bold text-white">
                Your Trusted Travel Partner Across Six Markets
              </h2>
              <p className="text-white/50 leading-relaxed">
                Walz Travels is a certified travel and visa consultancy serving clients across
                the United Kingdom, Canada, the United Arab Emirates, the United States,
                Nigeria, and Ghana. Since our founding, we have helped thousands of
                travellers secure visas, book flights, arrange hotels, and plan complete
                itineraries — all through a single, expert team.
              </p>
              <p className="text-white/50 leading-relaxed">
                Our clients are global citizens — professionals, families, and students
                navigating the world between continents. Many are African diaspora
                travellers who need more than a booking engine. They need a partner who
                understands the routes, the visa requirements, and the nuances of travelling
                between Africa, the UK, and North America.
              </p>
              <p className="text-white/50 leading-relaxed">
                That is exactly what we provide. Walz Travels combines certified travel
                expertise, live GDS flight search through Sabre, hotel access through
                Hotelbeds, and AI-powered support through our assistant, Jade — all in one
                platform built for modern travellers.
              </p>
            </div>

            <div className="space-y-6">
              <h2 className="text-3xl font-bold text-white">
                Visa Processing with a 90% Approval Rate
              </h2>
              <p className="text-white/50 leading-relaxed">
                Visa applications are among the most stressful parts of international travel.
                Documents, timelines, embassy requirements, and changing immigration rules
                can overwhelm even experienced travellers. Walz Travels takes this weight off
                your shoulders.
              </p>
              <p className="text-white/50 leading-relaxed">
                We process visas for over 199 countries, with specialist expertise in
                UK visitor visas, Canadian visitor and student permits, UAE tourist and
                business visas, Schengen Area visas, and US B1/B2 visas. Our team
                prepares every document, reviews every application, and tracks every
                submission through to decision — with a 90%+ approval rate maintained
                across all categories.
              </p>
              <p className="text-white/50 leading-relaxed">
                We are also one of the few agencies in the market with a fully digital
                client portal. You can submit your documents, track your application
                status, and receive your visa confirmation — all online, from any device,
                in any of our six operating countries.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
            {[
              {
                title: 'Flights on 400+ Airlines',
                body: 'We search live fares across more than 400 airlines through the Sabre Global Distribution System — the same technology used by major travel agencies worldwide. Economy, business, and first class across every major route including Lagos–London, Accra–Toronto, Dubai–New York, and hundreds more.',
              },
              {
                title: 'Hotels Worldwide',
                body: "Our hotel inventory is powered by Hotelbeds, one of the world's largest B2B accommodation providers with access to over 180,000 properties globally. From boutique guesthouses in Zanzibar to five-star towers in Dubai, we source competitive rates with free cancellation options and real-time availability.",
              },
              {
                title: 'Tours & Private Experiences',
                body: 'Beyond flights and hotels, we arrange complete experiences — safari packages in Tanzania, private city tours in London, desert evenings in Dubai, and cultural immersions across Africa. Our tour partnerships give you access to 300,000+ curated experiences in 2,500 destinations worldwide.',
              },
            ].map(item => (
              <div key={item.title} className="bg-[#0d1e35] rounded-2xl p-6 border border-white/8">
                <h3 className="font-bold text-white text-lg mb-3">{item.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="bg-[#0d1e35] border border-white/8 rounded-2xl p-10 text-center">
            <h2 className="text-white font-bold text-3xl mb-4">
              Serving the African Diaspora Since Day One
            </h2>
            <p className="text-white/50 leading-relaxed max-w-3xl mx-auto mb-4">
              Walz Travels was founded with a clear purpose: to be the travel agency that
              African diaspora communities could trust. We know these routes. We understand
              the documentation challenges that come with Nigerian and Ghanaian passports.
              We know the seasonal demand patterns between Lagos and London, between Accra
              and Amsterdam.
            </p>
            <p className="text-white/50 leading-relaxed max-w-3xl mx-auto">
              Our offices span Nigeria, Ghana, the United Kingdom, Canada, and the UAE —
              meaning there is always a Walz Travels team member in your time zone,
              speaking your language, ready to help when you need it most. Whether you
              are booking a family visit, a business trip, or your child&apos;s first journey
              abroad, we handle every detail so you can focus on what matters.
            </p>
          </div>
        </div>
      </section>

      {/* 19 — New dark CTA */}
      <section className="py-24 px-4 bg-gradient-to-br from-[#0d1e35] to-[#0a1628] border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-amber-400 text-xs uppercase tracking-[0.2em] mb-4">READY TO TRAVEL?</p>
          <h2 className="text-white text-4xl md:text-5xl font-bold mb-5 leading-tight">
            Let&apos;s plan your<br />
            <span className="text-amber-400">perfect trip.</span>
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
