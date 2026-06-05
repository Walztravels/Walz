'use client'

export const dynamic = 'force-dynamic'

import { HeroSection } from '@/components/home/HeroSection'
import { HeroOffersStrip } from '@/components/home/HeroOffersStrip'
import { TrustStrip } from '@/components/home/TrustStrip'
import { VisaConversionSection } from '@/components/home/VisaConversionSection'
import { PackageGroupSection } from '@/components/home/PackageGroupSection'
import { WhyWalzSection } from '@/components/home/WhyWalzSection'
import { FAQSection } from '@/components/home/FAQSection'
import { LeadCaptureSection } from '@/components/home/LeadCaptureSection'
import Link from 'next/link'
import { Star, Quote, Mail, ArrowRight, Check, Gift, BookOpen, Sparkles, MessageCircle } from 'lucide-react'

const testimonials = [
  {
    name: 'Adaeze N.',
    location: 'Lagos',
    rating: 5,
    text: "Walz Travels got my UK visa approved in 3 weeks after two previous refusals. The team handled everything for me.",
    service: 'Visa Support',
    initials: 'AN',
  },
  {
    name: 'Kwame A.',
    location: 'Accra',
    rating: 5,
    text: "First attempt Canada visa approval. The document checklist was perfect and the team guided me every step of the way.",
    service: 'Canada Visa',
    initials: 'KA',
  },
  {
    name: 'Blessing O.',
    location: 'London',
    rating: 5,
    text: "Dubai business trip sorted in 48 hours. Visa, flights and hotel all handled. Outstanding service.",
    service: 'UAE Business Travel',
    initials: 'BO',
  },
]

const blogArticles = [
  { title: '10 Best Airlines for Africa Flights', slug: 'best-airlines-africa', date: 'Jun 3, 2025' },
  { title: 'UK Visit Visa Requirements Explained', slug: 'uk-visit-visa-requirements', date: 'May 28, 2025' },
  { title: 'How to Book Multi-City Flights Smartly', slug: 'multi-city-flights-guide', date: 'May 15, 2025' },
]

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <HeroSection />

      {/* Popular Services Strip */}
      <HeroOffersStrip />

      {/* Trust & Proof Strip */}
      <TrustStrip />

      {/* Visa Conversion Section */}
      <VisaConversionSection />

      {/* Package & Group Travel */}
      <PackageGroupSection />

      {/* Why Walz Travels */}
      <WhyWalzSection />

      {/* Testimonials */}
      <section className="py-20 lg:py-28 bg-luxury-dark relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-20 left-10 w-64 h-64 bg-walz-gold/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-walz-gold/5 rounded-full blur-3xl" />
        
        <div className="container-walz relative">
          <div className="text-center mb-14">
            <div className="section-label justify-center mb-4">
              <Sparkles className="w-4 h-4" />
              <span>Client Stories</span>
            </div>
            <h2 className="section-title-light text-balance mb-4">
              What clients say about Walz Travels
            </h2>
            <p className="text-walz-muted max-w-xl mx-auto">
              From honeymoon planning to visa support, our clients trust us because we stay involved until the journey is complete.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-7">
            {testimonials.map((testimonial) => (
              <div
                key={testimonial.name}
                className="card-glass p-7 hover:bg-white/10 transition-all duration-300 group"
              >
                {/* Service Label */}
                <div className="inline-flex px-3 py-1.5 rounded-full bg-walz-gold/20 text-walz-gold text-xs font-semibold mb-5">
                  {testimonial.service}
                </div>

                <Quote className="w-8 h-8 text-walz-gold/30 mb-4" />

                <p className="text-walz-white/90 text-sm leading-relaxed mb-6">
                  &ldquo;{testimonial.text}&rdquo;
                </p>

                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full walz-gold-gradient flex items-center justify-center text-walz-deep-navy font-bold text-sm flex-shrink-0 shadow-gold-glow">
                    {testimonial.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-walz-white font-semibold">{testimonial.name}</div>
                    <div className="text-walz-muted text-sm">{testimonial.location}</div>
                    <div className="flex mt-1">
                      {Array.from({ length: testimonial.rating }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 text-walz-gold fill-walz-gold" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <FAQSection />

      {/* Lead Capture Section */}
      <LeadCaptureSection />

      {/* Gift Vouchers */}
      <section className="py-14 lg:py-20 bg-walz-cream relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-walz-gold/5 via-transparent to-walz-gold/5" />
        <div className="container-walz relative">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl walz-gold-gradient flex items-center justify-center shadow-gold-glow animate-float">
                <Gift className="w-8 h-8 text-walz-deep-navy" />
              </div>
              <div>
                <h3 className="font-display text-2xl lg:text-3xl font-bold text-walz-deep-navy mb-1">
                  Give the Gift of Travel
                </h3>
                <p className="text-walz-muted text-sm lg:text-base">
                  Flights, tours and more — the perfect gift for any occasion
                </p>
              </div>
            </div>
            <Link href="/gift-vouchers">
              <button className="btn-gold whitespace-nowrap px-8 py-3.5 rounded-xl">
                Shop Gift Vouchers
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Travel Blog */}
      <section className="py-20 lg:py-24 bg-walz-off-white">
        <div className="container-walz">
          <div className="text-center mb-12">
            <div className="section-label justify-center mb-4">
              <BookOpen className="w-4 h-4" />
              <span>Travel Tips & Visa Guides</span>
            </div>
          </div>

          <div className="max-w-2xl mx-auto space-y-4">
            {blogArticles.map((article) => (
              <Link
                key={article.slug}
                href={`/blog/${article.slug}`}
                className="flex items-center justify-between p-5 card-elevated group"
              >
                <span className="text-walz-deep-navy font-medium group-hover:text-walz-gold transition-colors">
                  {article.title}
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-walz-muted text-sm">{article.date}</span>
                  <div className="w-8 h-8 rounded-full bg-walz-off-white group-hover:bg-walz-gold/10 flex items-center justify-center transition-colors">
                    <ArrowRight className="w-4 h-4 text-walz-muted group-hover:text-walz-gold transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* WhatsApp CTA under articles */}
          <div className="text-center mt-8">
            <p className="text-walz-muted text-sm mb-3">Need help with any of these routes?</p>
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-green-600 hover:text-green-500 font-semibold text-sm"
            >
              <MessageCircle className="w-4 h-4" />
              Talk to Walz Travels
            </a>
          </div>

          <div className="text-center mt-10">
            <Link href="/blog">
              <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-walz-border text-walz-deep-navy hover:bg-walz-deep-navy hover:text-walz-white hover:border-walz-deep-navy transition-all text-sm font-semibold">
                <span>View All Articles</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-20 lg:py-24 bg-white">
        <div className="container-walz">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl walz-gold-gradient flex items-center justify-center mx-auto mb-6 shadow-gold-glow">
              <Mail className="w-8 h-8 text-walz-deep-navy" />
            </div>
            <h2 className="section-title mb-4">
              Get travel deals, visa updates, and smarter travel tips
            </h2>
            <p className="text-walz-muted mb-8 text-lg">
              Subscribe to receive hand-picked deals, visa guides and exclusive offers from Walz Travels — straight to your inbox.
            </p>
            <form
              className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto"
              onSubmit={(e) => e.preventDefault()}
            >
              <input
                type="email"
                placeholder="your@email.com"
                className="input-walz flex-1 py-4 px-5 rounded-xl"
                required
              />
              <button type="submit" className="btn-gold whitespace-nowrap px-8 py-4 rounded-xl text-sm font-semibold">
                Subscribe
              </button>
            </form>
            <p className="text-xs text-walz-muted mt-4">
              No spam. Unsubscribe at any time. We respect your privacy.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 mt-6 text-sm text-walz-muted">
              {['5,000+ subscribers', 'Weekly deals', 'Exclusive offers'].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-walz-gold/10 flex items-center justify-center">
                    <Check className="w-3 h-3 text-walz-gold" />
                  </div>
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
