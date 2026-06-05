'use client'

import { SearchTabs } from '@/components/search/SearchTabs'
import { Shield, Star, Award, MessageCircle, Clock, Phone } from 'lucide-react'
import Link from 'next/link'

const stats = [
  { icon: Star, value: '15,000+', label: 'Trips Booked' },
  { icon: Shield, value: '90%+', label: 'Visa Approval Rate' },
  { icon: Award, value: 'IATA', label: 'Certified Agency' },
  { icon: MessageCircle, value: '24/7', label: 'WhatsApp Support' },
]

const popularServices = [
  {
    title: 'UK Visit Visa Support',
    description: 'Document guidance and expert processing.',
    cta: 'Apply for UK Visa',
    href: '/visa/uk',
    color: 'bg-blue-500/20',
    icon: '🇬🇧',
  },
  {
    title: 'Canada Visa Assistance',
    description: 'Structured support for visitor and travel applications.',
    cta: 'Start Canada Process',
    href: '/visa/canada',
    color: 'bg-red-500/20',
    icon: '🇨🇦',
  },
  {
    title: 'Holiday Packages',
    description: 'Flights, hotels, transfers and tours arranged in one place.',
    cta: 'Build My Package',
    href: '/tours',
    color: 'bg-walz-gold/20',
    icon: '✈️',
  },
  {
    title: 'Corporate & Group Travel',
    description: 'Travel coordination for businesses, student groups, church trips and events.',
    cta: 'Get Group Quote',
    href: 'https://wa.me/447398753797',
    external: true,
    color: 'bg-green-500/20',
    icon: '👥',
  },
]

export function HeroSection() {
  return (
    <section className="relative min-h-[85vh] flex flex-col items-center justify-center overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1800&q=80')",
        }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-walz-deep-navy/95 via-walz-deep-navy/80 to-walz-deep-navy/98" />
      <div className="absolute inset-0 bg-gradient-to-r from-walz-deep-navy/50 via-transparent to-walz-deep-navy/50" />

      {/* Decorative elements */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-walz-gold/50 to-transparent" />
      <div className="absolute top-20 left-10 w-64 h-64 bg-walz-gold/5 rounded-full blur-3xl" />
      <div className="absolute bottom-40 right-10 w-96 h-96 bg-walz-gold/5 rounded-full blur-3xl" />

      {/* Content */}
      <div className="relative z-10 w-full container-walz py-16 flex flex-col items-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-walz-gold/10 border border-walz-gold/30 mb-6 backdrop-blur-sm">
          <Award className="w-4 h-4 text-walz-gold" />
          <span className="text-walz-gold text-sm font-medium tracking-wide">
            IATA Certified Travel Agency
          </span>
        </div>

        {/* Headline */}
        <h1 className="font-display text-center text-walz-white mb-5 leading-[1.15] max-w-4xl">
          <span className="block text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-2">
            Flights, visas, hotels and tours —
          </span>
          <span className="block text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold walz-text-gradient">
            handled by travel experts who get it right the first time.
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-walz-muted text-center text-base lg:text-lg max-w-2xl mb-8 leading-relaxed text-pretty">
          Book flights, secure visa support, reserve hotels, and plan private tours with one trusted team. Walz Travels helps individuals, families, and businesses travel with confidence.
        </p>

        {/* Primary CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
          <Link href="/flights">
            <button className="btn-gold px-8 py-4 text-base rounded-xl font-semibold">
              Start Your Travel Plan
            </button>
          </Link>
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-4 rounded-xl border-2 border-green-500 text-green-400 hover:bg-green-500/10 transition-colors font-semibold"
          >
            <MessageCircle className="w-5 h-5" />
            Chat on WhatsApp
          </a>
        </div>

        {/* Trust Line */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-walz-muted mb-10">
          <span className="flex items-center gap-1.5">
            <Award className="w-4 h-4 text-walz-gold" />
            IATA certified
          </span>
          <span className="text-walz-slate">·</span>
          <span className="flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-walz-gold" />
            Stripe-secured payments
          </span>
          <span className="text-walz-slate">·</span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-walz-gold" />
            24/7 support
          </span>
          <span className="text-walz-slate">·</span>
          <span className="flex items-center gap-1.5">
            <Phone className="w-4 h-4 text-walz-gold" />
            Trusted for visas, tours & travel
          </span>
        </div>

        {/* Search Tabs */}
        <div className="w-full max-w-5xl">
          <p className="text-center text-walz-muted text-sm mb-4">
            Search your trip or speak to an expert for help with visas, group travel, and custom packages.
          </p>
          <SearchTabs />
        </div>
      </div>

      {/* Bottom Wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
          <path
            d="M0 80V30C180 10 360 0 540 10C720 20 900 40 1080 35C1260 30 1380 20 1440 15V80H0Z"
            fill="#FDFBF7"
          />
        </svg>
      </div>
    </section>
  )
}

// Export popular services for use in the offers strip
export { popularServices }
