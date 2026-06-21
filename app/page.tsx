'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowRight, Check, Mail, Gift, Rss } from 'lucide-react'

// ── Above-fold — always in the initial bundle ─────────────────────────────────
import { HeroSection }  from '@/components/home/HeroSection'
import { MarqueeStrip } from '@/components/home/MarqueeStrip'

// ── Below-fold — code-split into separate lazy chunks ─────────────────────────
// Chunks download as the user scrolls; initial JS is drastically smaller.
const dyn = <T extends Record<string, React.ComponentType>>(
  loader: () => Promise<T>,
  key: keyof T,
) => dynamic(() => loader().then(m => ({ default: m[key] as React.ComponentType })))

// OffersSection removed — replaced by TopSellers (cinematic package cards)
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

interface SoroArticle { id: string; title: string; slug: string; date: string }

export default function HomePage() {
  const [articles,  setArticles]  = useState<SoroArticle[]>([])
  const [nlEmail,   setNlEmail]   = useState('')
  const [nlStatus,  setNlStatus]  = useState<'idle' | 'loading' | 'success' | 'error' | 'exists'>('idle')
  const [heroBg,    setHeroBg]    = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/media/home_hero_bg')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.url) setHeroBg(d.url) })
      .catch(() => {})
  }, [])

  async function handleNewsletterSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nlEmail) return
    setNlStatus('loading')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
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
      {/* 1 — Fullscreen cinematic hero */}
      <HeroSection bgUrl={heroBg} />

      {/* 2 — Scrolling marquee strip */}
      <MarqueeStrip />

      {/* 4 — Animated statistics */}
      <StatsStrip />

      {/* 5 — Tours highlight (existing, kept intact) */}
      <ToursHighlight />

      {/* 6 — Visa intelligence horizontal scroll */}
      <VisaIntelligenceSection />

      {/* 6.25 — Jade Connect eSIM banner */}
      <EsimBanner />

      {/* 6.5 — Jade AI Trip Planner cinematic section */}
      <JadePlannerSection />

      {/* 7 — Testimonials */}
      <TestimonialsSection />

      {/* 8 — Why Walz alternating sections */}
      <WhyWalzSection />

      {/* 9 — Jade AI introduction */}
      <JadeSection />

      {/* 10 — Top selling packages */}
      <TopSellers />

      {/* 11 — Blog preview */}
      <section className="py-16 lg:py-20 bg-[#F5F2EE]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">

          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Rss className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
                <span className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.2em] uppercase">
                  Travel Blog
                </span>
              </div>
              <h2 className="font-display text-2xl lg:text-3xl font-bold text-[#0B1F3A]">
                Travel Tips &amp; Visa Guides
              </h2>
            </div>
            <Link href="/blog" className="hidden md:flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] border-b border-[#0B1F3A]/20 hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors pb-0.5">
              View All Articles
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
                className="group block rounded-2xl overflow-hidden bg-white border border-[#E2D9CC] hover:border-[#C9A84C] hover:shadow-lg transition-all duration-300"
              >
                <div className="relative aspect-[3/2] overflow-hidden bg-[#0B1F3A]/10">
                  <img
                    src={a.image}
                    alt={a.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="text-[10px] font-bold tracking-widest uppercase bg-[#C9A84C] text-[#0B1F3A] px-2.5 py-1 rounded-full">
                      {a.category}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-xs text-[#0B1F3A]/40 mb-2 flex items-center gap-2">
                    <span>{a.date}</span>
                    <span>·</span>
                    <span>{a.readTime}</span>
                  </p>
                  <h3 className="text-sm font-bold text-[#0B1F3A] leading-snug line-clamp-2 group-hover:text-[#C9A84C] transition-colors">
                    {a.title}
                  </h3>
                  <p className="text-xs text-[#0B1F3A]/50 mt-2 flex items-center gap-1 font-medium">
                    Read More <ArrowRight className="w-3 h-3" />
                  </p>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-6 md:hidden">
            <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] border border-[#0B1F3A] px-5 py-2.5 rounded-lg hover:bg-[#0B1F3A] hover:text-white transition-colors">
              View All Articles <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 12 — Gift voucher banner (kept intact) */}
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

      {/* 13 — Newsletter (kept intact) */}
      <section className="py-16 bg-white border-t border-[#E2D9CC]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-12 h-12 rounded-xl bg-[#C9A84C] flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Mail className="w-6 h-6 text-[#0B1F3A]" />
            </div>
            <h2 className="font-display text-2xl lg:text-3xl font-bold text-[#0B1F3A] mb-3">
              Get Exclusive Travel Deals
            </h2>
            <p className="text-[#0B1F3A]/50 mb-6">
              Subscribe to receive hand-picked deals, travel inspiration and exclusive offers.
            </p>
            {nlStatus === 'success' ? (
              <div className="max-w-md mx-auto py-3 px-5 bg-green-50 border border-green-200 rounded-full text-green-700 text-sm font-medium">
                Thank you — you are on the list.
              </div>
            ) : nlStatus === 'exists' ? (
              <div className="max-w-md mx-auto py-3 px-5 bg-[#F5F2EE] border border-[#C9A84C]/30 rounded-full text-[#0B1F3A]/60 text-sm">
                You are already on the list — we&apos;ll keep the deals coming!
              </div>
            ) : (
              <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto" onSubmit={handleNewsletterSubmit}>
                <input
                  type="email"
                  value={nlEmail}
                  onChange={e => setNlEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 h-11 px-4 border border-[#E2D9CC] rounded-full text-sm outline-none focus:border-[#C9A84C] bg-[#F5F2EE]"
                  required
                  disabled={nlStatus === 'loading'}
                />
                <button
                  type="submit"
                  disabled={nlStatus === 'loading'}
                  className="px-6 py-2.5 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-full transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {nlStatus === 'loading' ? 'Subscribing…' : 'Subscribe'}
                </button>
              </form>
            )}
            {nlStatus === 'error' && (
              <p className="text-red-500 text-xs mt-2 text-center">Something went wrong. Please try again.</p>
            )}
            <div className="flex items-center justify-center gap-4 mt-5 text-xs text-[#0B1F3A]/40">
              {['Join our travel community', 'Weekly deals', 'Exclusive offers'].map(item => (
                <div key={item} className="flex items-center gap-1">
                  <Check className="w-3 h-3 text-[#C9A84C]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 14 — SEO content section */}
      <section className="bg-[#F5F0E8] py-20 px-4">
        <div className="max-w-5xl mx-auto">

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-16">
            <div className="space-y-6">
              <h2 className="text-3xl font-bold text-[#0B1F3A]">
                Your Trusted Travel Partner Across Six Markets
              </h2>
              <p className="text-gray-600 leading-relaxed">
                Walz Travels is a certified travel and visa consultancy serving clients across
                the United Kingdom, Canada, the United Arab Emirates, the United States,
                Nigeria, and Ghana. Since our founding, we have helped thousands of
                travellers secure visas, book flights, arrange hotels, and plan complete
                itineraries — all through a single, expert team.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Our clients are global citizens — professionals, families, and students
                navigating the world between continents. Many are African diaspora
                travellers who need more than a booking engine. They need a partner who
                understands the routes, the visa requirements, and the nuances of travelling
                between Africa, the UK, and North America.
              </p>
              <p className="text-gray-600 leading-relaxed">
                That is exactly what we provide. Walz Travels combines certified travel
                expertise, live GDS flight search through Sabre, hotel access through
                Hotelbeds, and AI-powered support through our assistant, Jade — all in one
                platform built for modern travellers.
              </p>
            </div>

            <div className="space-y-6">
              <h2 className="text-3xl font-bold text-[#0B1F3A]">
                Visa Processing with a 90% Approval Rate
              </h2>
              <p className="text-gray-600 leading-relaxed">
                Visa applications are among the most stressful parts of international travel.
                Documents, timelines, embassy requirements, and changing immigration rules
                can overwhelm even experienced travellers. Walz Travels takes this weight off
                your shoulders.
              </p>
              <p className="text-gray-600 leading-relaxed">
                We process visas for over 199 countries, with specialist expertise in
                UK visitor visas, Canadian visitor and student permits, UAE tourist and
                business visas, Schengen Area visas, and US B1/B2 visas. Our team
                prepares every document, reviews every application, and tracks every
                submission through to decision — with a 90%+ approval rate maintained
                across all categories.
              </p>
              <p className="text-gray-600 leading-relaxed">
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
              <div key={item.title} className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="font-bold text-[#0B1F3A] text-lg mb-3">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="bg-[#0B1F3A] rounded-2xl p-10 text-center">
            <h2 className="text-white font-bold text-3xl mb-4">
              Serving the African Diaspora Since Day One
            </h2>
            <p className="text-white/60 leading-relaxed max-w-3xl mx-auto mb-4">
              Walz Travels was founded with a clear purpose: to be the travel agency that
              African diaspora communities could trust. We know these routes. We understand
              the documentation challenges that come with Nigerian and Ghanaian passports.
              We know the seasonal demand patterns between Lagos and London, between Accra
              and Amsterdam.
            </p>
            <p className="text-white/60 leading-relaxed max-w-3xl mx-auto">
              Our offices span Nigeria, Ghana, the United Kingdom, Canada, and the UAE —
              meaning there is always a Walz Travels team member in your time zone,
              speaking your language, ready to help when you need it most. Whether you
              are booking a family visit, a business trip, or your child&apos;s first journey
              abroad, we handle every detail so you can focus on what matters.
            </p>
          </div>

        </div>
      </section>

      {/* 15 — Final cinematic CTA */}
      <FinalCTA />
    </>
  )
}
