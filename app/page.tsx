'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowRight, Check, Mail, Gift, BookOpen, Rss } from 'lucide-react'

// ── Above-fold — always in the initial bundle ─────────────────────────────────
import { HeroSection }  from '@/components/home/HeroSection'
import { MarqueeStrip } from '@/components/home/MarqueeStrip'

// ── Below-fold — code-split into separate lazy chunks ─────────────────────────
// Chunks download as the user scrolls; initial JS is drastically smaller.
const dyn = <T extends Record<string, React.ComponentType>>(
  loader: () => Promise<T>,
  key: keyof T,
) => dynamic(() => loader().then(m => ({ default: m[key] as React.ComponentType })))

const OffersSection           = dyn(() => import('@/components/home/OffersSection'),           'OffersSection')
const StatsStrip              = dyn(() => import('@/components/home/StatsStrip'),              'StatsStrip')
const ToursHighlight          = dyn(() => import('@/components/home/ToursHighlight'),          'ToursHighlight')
const VisaIntelligenceSection = dyn(() => import('@/components/home/VisaIntelligenceSection'), 'VisaIntelligenceSection')
const EsimBanner              = dyn(() => import('@/components/home/EsimBanner'),              'EsimBanner')
const JadePlannerSection      = dyn(() => import('@/components/home/JadePlannerSection'),      'JadePlannerSection')
const TestimonialsSection     = dyn(() => import('@/components/home/TestimonialsSection'),     'TestimonialsSection')
const WhyWalzSection          = dyn(() => import('@/components/home/WhyWalzSection'),          'WhyWalzSection')
const JadeSection             = dyn(() => import('@/components/home/JadeSection'),             'JadeSection')
const DestinationsGrid        = dyn(() => import('@/components/home/DestinationsGrid'),        'DestinationsGrid')
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

      {/* 3 — Featured destination offer cards */}
      <OffersSection />

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

      {/* 10 — Destinations grid */}
      <DestinationsGrid />

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

          <ul className="divide-y divide-[#0B1F3A]/8 max-w-2xl">
            {(articles.length > 0 ? articles.map(a => ({
              id: a.id, title: a.title, slug: a.slug, date: a.date, isPlaceholder: false,
            })) : [
              { id: 'p1', title: '10 Things to Know Before Applying for a UK Visa', slug: 'uk-visa-tips', date: 'Jun 2025', isPlaceholder: true },
              { id: 'p2', title: 'Dubai in 5 Days: The Ultimate First-Time Itinerary', slug: 'dubai-5-days', date: 'May 2025', isPlaceholder: true },
              { id: 'p3', title: 'Canada Visitor Visa: Documents That Actually Get Approved', slug: 'canada-visitor-visa', date: 'Apr 2025', isPlaceholder: true },
            ]).map(a => (
              <li key={a.id} className="py-4 group">
                <Link href={`/blog?post=${a.slug}`} className="flex items-start justify-between gap-4">
                  <span className="text-[#0B1F3A] font-medium text-sm leading-snug group-hover:text-[#C9A84C] transition-colors">
                    {a.title}
                  </span>
                  <span className="text-[#0B1F3A]/40 text-xs whitespace-nowrap mt-0.5 flex-shrink-0 flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {a.date}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

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

      {/* 14 — Final cinematic CTA */}
      <FinalCTA />
    </>
  )
}
