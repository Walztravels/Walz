'use client'

export const dynamic = 'force-dynamic'

import { HeroSection } from '@/components/home/HeroSection'
import { TrendingDestinations } from '@/components/home/TrendingDestinations'
import { WhyWalzSection } from '@/components/home/WhyWalzSection'
import { ToursHighlight } from '@/components/home/ToursHighlight'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Star, Quote, FileText, Mail, ArrowRight, Check, Rss, Gift, BookOpen } from 'lucide-react'

interface SoroArticle { id: string; title: string; slug: string; date: string }

const testimonials = [
  {
    name: 'Amara Osei',
    location: 'London, UK',
    rating: 5,
    text: "Walz Travels made our Dubai honeymoon absolutely perfect. From the business class flights to the Burj Al Arab stay, every detail was flawless. The WhatsApp support was incredible — they were available even at 2am when I had a question!",
    trip: 'Dubai Honeymoon',
    initials: 'AO',
  },
  {
    name: 'Patrick Brennan',
    location: 'Dublin, Ireland',
    rating: 5,
    text: "Booked the private Dublin tour for my parents' anniversary and they were blown away. The guide was so knowledgeable and the whole day was seamlessly organised. Already planning to use Walz Travels for our New York trip.",
    trip: 'Dublin Private Tour',
    initials: 'PB',
  },
  {
    name: 'Priya Sharma',
    location: 'Manchester, UK',
    rating: 5,
    text: "Getting a US visa seemed impossible until Walz Travels stepped in. They guided us through every single document, followed up with the embassy, and we had our visas within 3 weeks. Worth every penny.",
    trip: 'US Visa Assistance',
    initials: 'PS',
  },
]

const visaCountries = [
  { name: 'United Arab Emirates', code: 'uae', flag: '🇦🇪', processingTime: '3–5 days', from: 85 },
  { name: 'United States', code: 'usa', flag: '🇺🇸', processingTime: '15–30 days', from: 185 },
  { name: 'Canada', code: 'canada', flag: '🇨🇦', processingTime: '10–20 days', from: 100 },
  { name: 'Schengen Area', code: 'schengen', flag: '🇪🇺', processingTime: '10–15 days', from: 90 },
  { name: 'Australia', code: 'australia', flag: '🇦🇺', processingTime: '20–30 days', from: 145 },
  { name: 'China', code: 'china', flag: '🇨🇳', processingTime: '4–5 days', from: 151 },
]

export default function HomePage() {
  const [articles, setArticles] = useState<SoroArticle[]>([])

  useEffect(() => {
    fetch('/api/soro-articles')
      .then(r => r.json())
      .then(d => setArticles(d.articles ?? []))
      .catch(() => {})
  }, [])

  return (
    <>
      {/* Hero */}
      <HeroSection />

      {/* Trending Destinations */}
      <TrendingDestinations />

      {/* Why Walz */}
      <WhyWalzSection />

      {/* Tours Highlight */}
      <ToursHighlight />

      {/* Testimonials */}
      <section className="py-16 lg:py-24 bg-walz-deep-navy">
        <div className="container-walz">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-8 h-0.5 bg-walz-gold" />
              <span className="text-walz-gold text-sm font-semibold tracking-wider uppercase">
                Client Stories
              </span>
              <div className="w-8 h-0.5 bg-walz-gold" />
            </div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-walz-white mb-3">
              Journeys That Changed Lives
            </h2>
            <p className="text-walz-muted max-w-xl mx-auto">
              Don&apos;t just take our word for it — hear from the travellers we&apos;ve had the privilege of serving.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial) => (
              <div
                key={testimonial.name}
                className="bg-walz-slate/40 rounded-2xl p-6 border border-walz-slate hover:border-walz-gold/30 transition-colors"
              >
                <Quote className="w-8 h-8 text-walz-gold/40 mb-4" />

                <p className="text-walz-off-white/90 text-sm leading-relaxed mb-5 italic">
                  &ldquo;{testimonial.text}&rdquo;
                </p>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full walz-gold-gradient flex items-center justify-center text-walz-deep-navy font-bold text-sm flex-shrink-0">
                    {testimonial.initials}
                  </div>
                  <div>
                    <div className="text-walz-white font-semibold text-sm">{testimonial.name}</div>
                    <div className="text-walz-muted text-xs">{testimonial.location}</div>
                    <div className="flex mt-0.5">
                      {Array.from({ length: testimonial.rating }).map((_, i) => (
                        <Star key={i} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      ))}
                    </div>
                  </div>
                  <div className="ml-auto">
                    <span className="badge-gold text-[10px]">{testimonial.trip}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Visa Services */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="container-walz">
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-2 mb-3">
              <FileText className="w-5 h-5 text-walz-gold" />
              <span className="text-walz-gold text-sm font-semibold tracking-wider uppercase">
                Visa Services
              </span>
            </div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-walz-deep-navy mb-3">
              Expert Visa Assistance
            </h2>
            <p className="text-walz-muted max-w-xl mx-auto">
              Our visa specialists handle everything from document preparation to application submission,
              giving you the best chance of approval.
            </p>
            <div className="divider-gold mx-auto mt-4" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4 mb-10">
            {visaCountries.map((country) => (
              <Link
                key={country.code}
                href={`/visa/${country.code}`}
                className="group p-4 rounded-2xl border border-walz-border hover:border-walz-gold hover:shadow-card transition-all text-center"
              >
                <div className="text-3xl mb-2">{country.flag}</div>
                <div className="text-xs font-semibold text-walz-deep-navy leading-tight mb-1">
                  {country.name}
                </div>
                <div className="text-xs text-walz-muted">{country.processingTime}</div>
                <div className="text-xs font-bold text-walz-gold mt-1">From £{country.from}</div>
              </Link>
            ))}
          </div>

          <div className="text-center">
            <Link href="/visa">
              <button className="btn-gold inline-flex items-center gap-2">
                <span>All Visa Services</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Gift Voucher Banner */}
      <section className="bg-[#C9A84C] py-12 lg:py-16">
        <div className="container-walz">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-5">
              <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-[#0B1F3A]/20 items-center justify-center flex-shrink-0">
                <Gift className="w-7 h-7 text-[#0B1F3A]" />
              </div>
              <div>
                <h2 className="font-display text-2xl lg:text-3xl font-bold text-[#0B1F3A] mb-1">
                  Give the Gift of Travel
                </h2>
                <p className="text-[#0B1F3A]/75 text-base max-w-md leading-relaxed">
                  Flights, visas and tours — the perfect gift for any occasion
                </p>
              </div>
            </div>
            <Link href="/gift" className="flex-shrink-0">
              <button className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-[#0B1F3A] hover:bg-[#0d2345] text-white font-semibold text-sm rounded-xl transition-colors whitespace-nowrap shadow-lg">
                <Gift className="w-4 h-4" />
                Shop Gift Vouchers
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Latest Articles */}
      <section className="py-14 lg:py-20 bg-[#F7F8FA]">
        <div className="container-walz">
          <div className="max-w-2xl mx-auto">

            {/* Heading */}
            <div className="flex items-center gap-2 mb-2">
              <Rss className="w-4 h-4 text-walz-gold flex-shrink-0" />
              <span className="text-walz-gold text-xs font-semibold tracking-widest uppercase">
                Travel Blog
              </span>
            </div>
            <h2 className="font-display text-2xl lg:text-3xl font-bold text-walz-deep-navy mb-6">
              Travel Tips &amp; Visa Guides
            </h2>

            {/* Article list */}
            <ul className="divide-y divide-walz-border">
              {articles.length === 0
                ? [1, 2, 3].map(i => (
                    <li key={i} className="py-4">
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-1/4 mt-2" />
                    </li>
                  ))
                : articles.map(a => (
                    <li key={a.id} className="py-4 group">
                      <Link
                        href={`/blog?post=${a.slug}`}
                        className="flex items-start justify-between gap-4"
                      >
                        <span className="text-walz-deep-navy font-medium text-sm leading-snug group-hover:text-walz-gold transition-colors">
                          {a.title}
                        </span>
                        <span className="text-walz-muted text-xs whitespace-nowrap mt-0.5 flex-shrink-0 flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          {a.date}
                        </span>
                      </Link>
                    </li>
                  ))
              }
            </ul>

            {/* View all */}
            <div className="mt-6">
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 text-sm font-semibold text-walz-deep-navy border border-walz-deep-navy px-5 py-2.5 rounded-lg hover:bg-walz-deep-navy hover:text-white transition-colors"
              >
                View All Articles
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-16 bg-walz-off-white border-t border-walz-border">
        <div className="container-walz">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-12 h-12 rounded-xl walz-gold-gradient flex items-center justify-center mx-auto mb-5 shadow-gold-glow">
              <Mail className="w-6 h-6 text-walz-deep-navy" />
            </div>
            <h2 className="font-display text-2xl lg:text-3xl font-bold text-walz-deep-navy mb-3">
              Get Exclusive Travel Deals
            </h2>
            <p className="text-walz-muted mb-6">
              Subscribe to receive hand-picked deals, travel inspiration and exclusive offers
              from Walz Travels — straight to your inbox.
            </p>
            <form
              className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
              onSubmit={(e) => e.preventDefault()}
            >
              <input
                type="email"
                placeholder="your@email.com"
                className="input-walz flex-1"
                required
              />
              <button type="submit" className="btn-gold whitespace-nowrap px-6 py-3 rounded-lg text-sm font-semibold">
                Subscribe
              </button>
            </form>
            <p className="text-xs text-walz-muted mt-3">
              No spam. Unsubscribe at any time. We respect your privacy.
            </p>
            <div className="flex items-center justify-center gap-4 mt-5 text-xs text-walz-muted">
              {['5,000+ subscribers', 'Weekly deals', 'Exclusive offers'].map((item) => (
                <div key={item} className="flex items-center gap-1">
                  <Check className="w-3 h-3 text-walz-gold" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
