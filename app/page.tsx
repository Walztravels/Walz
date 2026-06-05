'use client'

// Design enhanced by v0
export const dynamic = 'force-dynamic'

import { HeroSection } from '@/components/home/HeroSection'
import { TrendingDestinations } from '@/components/home/TrendingDestinations'
import { WhyWalzSection } from '@/components/home/WhyWalzSection'
import { ToursHighlight } from '@/components/home/ToursHighlight'
import Link from 'next/link'
import { Star, Quote, FileText, Mail, ArrowRight, Check, Gift, BookOpen, Sparkles } from 'lucide-react'

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

      {/* Trending Destinations */}
      <TrendingDestinations />

      {/* Why Walz */}
      <WhyWalzSection />

      {/* Tours Highlight */}
      <ToursHighlight />

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
              Journeys That Changed Lives
            </h2>
            <p className="text-walz-muted max-w-xl mx-auto">
              Don&apos;t just take our word for it — hear from the travellers we&apos;ve had the privilege of serving.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-7">
            {testimonials.map((testimonial) => (
              <div
                key={testimonial.name}
                className="card-glass p-7 hover:bg-white/10 transition-all duration-300 group"
              >
                <Quote className="w-10 h-10 text-walz-gold/30 mb-5" />

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
                  <div className="flex-shrink-0">
                    <span className="inline-flex px-3 py-1.5 rounded-full bg-walz-gold/20 text-walz-gold text-[10px] font-semibold">
                      {testimonial.trip}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Visa Services */}
      <section className="py-20 lg:py-28 bg-white relative">
        <div className="container-walz">
          <div className="text-center mb-12">
            <div className="section-label justify-center mb-4">
              <FileText className="w-4 h-4" />
              <span>Visa Services</span>
            </div>
            <h2 className="section-title text-balance mb-4">
              Expert Visa Assistance
            </h2>
            <p className="text-walz-muted max-w-xl mx-auto">
              Our visa specialists handle everything from document preparation to application submission,
              giving you the best chance of approval.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-5 mb-12">
            {visaCountries.map((country) => (
              <Link
                key={country.code}
                href={`/visa/${country.code}`}
                className="group card-elevated p-5 text-center hover:border-walz-gold/30"
              >
                <div className="text-4xl mb-3">{country.flag}</div>
                <div className="text-sm font-semibold text-walz-deep-navy leading-tight mb-1.5">
                  {country.name}
                </div>
                <div className="text-xs text-walz-muted mb-2">{country.processingTime}</div>
                <div className="text-sm font-bold text-walz-gold">From £{country.from}</div>
              </Link>
            ))}
          </div>

          <div className="text-center">
            <Link href="/visa">
              <button className="btn-gold inline-flex items-center gap-2 px-8 py-3.5 rounded-xl">
                <span>All Visa Services</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Gift Vouchers */}
      <section className="py-14 lg:py-20 bg-luxury-dark relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-walz-gold/5 via-transparent to-walz-gold/5" />
        <div className="container-walz relative">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl walz-gold-gradient flex items-center justify-center shadow-gold-glow animate-float">
                <Gift className="w-8 h-8 text-walz-deep-navy" />
              </div>
              <div>
                <h3 className="font-display text-2xl lg:text-3xl font-bold text-walz-white mb-1">
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
      <section className="py-20 lg:py-24 bg-walz-cream">
        <div className="container-walz">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl walz-gold-gradient flex items-center justify-center mx-auto mb-6 shadow-gold-glow">
              <Mail className="w-8 h-8 text-walz-deep-navy" />
            </div>
            <h2 className="section-title mb-4">
              Get Exclusive Travel Deals
            </h2>
            <p className="text-walz-muted mb-8 text-lg">
              Subscribe to receive hand-picked deals, travel inspiration and exclusive offers
              from Walz Travels — straight to your inbox.
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
